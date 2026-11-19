import { Injectable } from '@nestjs/common';
import { LoyaltyProgram } from '@prisma/client';
import { z } from 'zod';
import { AppError, conflict } from '../common/errors';
import { weekdaysSchema } from '../common/schemas';
import { describeWeekdays } from '../common/time';
import { LoyaltyService, pluralize } from '../loyalty/loyalty.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { effectivePlan, withinLimit } from '../plans/plans';
import type { AdminCtx } from './admin.service';

export const programInputSchema = z.object({
  name: z.string().trim().min(2, 'informe o nome do programa').max(60),
  unitLabel: z.string().trim().min(1).max(30),
  unitLabelPlural: z.string().trim().max(30).nullish(),
  goal: z.number().int().min(2).max(50),
  rewardDescription: z.string().trim().min(1).max(120),
  maxPerEntry: z.number().int().min(1).max(100),
  redeemWeekdays: weekdaysSchema,
  carryOverExcess: z.boolean(),
});
export const programCreateSchema = programInputSchema.extend({ active: z.boolean().default(true) });

/** Limite de programas ativos vem do plano vigente do estabelecimento (`null` = ilimitado). */
export async function programLimit(tx: Tx, tenantId: string) {
  const eff = await effectivePlan(tx, tenantId);
  const active = await tx.loyaltyProgram.count({ where: { tenantId, active: true } });
  return { plan: eff.plan.code, planName: eff.plan.name, maxActive: eff.plan.maxActivePrograms, active };
}

function limitError(max: number) {
  return new AppError(
    409,
    'PROGRAM_LIMIT_REACHED',
    max === 1
      ? 'Seu plano permite 1 programa ativo. Desative o atual antes de ativar outro.'
      : `Seu plano permite até ${max} programas ativos. Desative um antes de ativar outro.`,
    { maxActive: max },
  );
}

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  private view(p: LoyaltyProgram, stats?: { members: number; rewardsAvailable: number }) {
    return {
      id: p.id,
      name: p.name,
      active: p.active,
      goal: p.goal,
      rewardDescription: p.rewardDescription,
      unitLabel: p.unitLabel,
      unitLabelPlural: p.unitLabelPlural,
      unitLabelPluralResolved: pluralize(p.unitLabel, p.unitLabelPlural),
      maxPerEntry: p.maxPerEntry,
      redeemWeekdays: p.redeemWeekdays,
      redeemWeekdaysText: p.redeemWeekdays.length ? describeWeekdays(p.redeemWeekdays) : null,
      carryOverExcess: p.carryOverExcess,
      createdAt: p.createdAt,
      members: stats?.members ?? 0,
      rewardsAvailable: stats?.rewardsAvailable ?? 0,
    };
  }

  async list(ctx: AdminCtx) {
    const [programs, stats, limit] = await Promise.all([
      this.prisma.loyaltyProgram.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] }),
      this.prisma.membership.groupBy({
        by: ['programId'],
        where: { tenantId: ctx.tenantId },
        _count: { _all: true },
        _sum: { cachedRewardsAvailable: true },
      }),
      programLimit(this.prisma, ctx.tenantId),
    ]);
    const byProgram = new Map(stats.map((s) => [s.programId, { members: s._count._all, rewardsAvailable: s._sum.cachedRewardsAvailable ?? 0 }]));
    return { limit, items: programs.map((p) => this.view(p, byProgram.get(p.id))) };
  }

  async get(ctx: AdminCtx, id: string) {
    return this.view(await this.loyalty.programOf(this.prisma, ctx.tenantId, id));
  }

  private data(input: z.infer<typeof programInputSchema>) {
    return {
      name: input.name,
      unitLabel: input.unitLabel,
      unitLabelPlural: input.unitLabelPlural || null,
      goal: input.goal,
      rewardDescription: input.rewardDescription,
      maxPerEntry: input.maxPerEntry,
      redeemWeekdays: [...new Set(input.redeemWeekdays)].sort(),
      carryOverExcess: input.carryOverExcess,
    };
  }

  async create(ctx: AdminCtx, input: z.infer<typeof programCreateSchema>) {
    await this.prisma.$transaction(async (tx) => {
      if (input.active) {
        const limit = await programLimit(tx, ctx.tenantId);
        if (!withinLimit(limit.active, limit.maxActive)) throw limitError(limit.maxActive!);
      }
      await tx.loyaltyProgram.create({ data: { tenantId: ctx.tenantId, active: input.active, ...this.data(input) } });
    });
    return this.list(ctx);
  }

  /** RN-24: alterar a meta não afeta recompensas já liberadas (o custo fica gravado na recompensa). */
  async update(ctx: AdminCtx, id: string, input: z.infer<typeof programInputSchema>) {
    await this.loyalty.programOf(this.prisma, ctx.tenantId, id);
    await this.prisma.loyaltyProgram.update({ where: { id }, data: this.data(input) });
    return this.list(ctx);
  }

  async setActive(ctx: AdminCtx, id: string, active: boolean) {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.loyalty.programOf(tx, ctx.tenantId, id);
      if (p.active === active) return;
      if (active) {
        // Trava a linha do estabelecimento para dois "ativar" simultâneos não furarem o limite.
        await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId}::uuid FOR UPDATE`;
        const limit = await programLimit(tx, ctx.tenantId);
        if (!withinLimit(limit.active, limit.maxActive)) throw limitError(limit.maxActive!);
      }
      await tx.loyaltyProgram.update({ where: { id }, data: { active } });
    });
    return this.list(ctx);
  }

  /** Só exclui programa que nunca teve cliente; os demais podem ser desativados. */
  async remove(ctx: AdminCtx, id: string) {
    await this.loyalty.programOf(this.prisma, ctx.tenantId, id);
    const members = await this.prisma.membership.count({ where: { programId: id } });
    if (members > 0) {
      throw conflict('PROGRAM_IN_USE', 'Este programa já tem clientes. Desative-o em vez de excluir, para manter o histórico.');
    }
    await this.prisma.$transaction([
      this.prisma.checkoutToken.deleteMany({ where: { programId: id } }),
      this.prisma.loyaltyProgram.delete({ where: { id } }),
    ]);
    return this.list(ctx);
  }
}
