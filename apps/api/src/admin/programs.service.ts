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

const programBaseSchema = z.object({
  name: z.string().trim().min(2, 'informe o nome do programa').max(60),
  /** SELO (padrão): o caixa lança selos. VALOR: o caixa informa o valor da compra. */
  kind: z.enum(['SELO', 'VALOR']).default('SELO'),
  /** VALOR: quanto vale 1 selo, em centavos (de R$ 0,01 a R$ 100.000). */
  stampValueCents: z.number().int().min(1).max(10_000_000).nullish(),
  /** VALOR: maior compra aceita num lançamento, em centavos. Vazio = sem limite. */
  maxAmountPerEntryCents: z.number().int().min(1).max(100_000_000).nullish(),
  unitLabel: z.string().trim().min(1).max(30),
  unitLabelPlural: z.string().trim().max(30).nullish(),
  goal: z.number().int().min(2).max(50),
  rewardDescription: z.string().trim().min(1).max(120),
  maxPerEntry: z.number().int().min(1).max(100),
  redeemWeekdays: weekdaysSchema,
  carryOverExcess: z.boolean(),
});

/** Programa por valor precisa do valor do selo, e a compra máxima não pode ser menor que ele. */
function valueRules(p: { kind: 'SELO' | 'VALOR'; stampValueCents?: number | null; maxAmountPerEntryCents?: number | null }, ctx: z.RefinementCtx) {
  if (p.kind !== 'VALOR') return;
  if (!p.stampValueCents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stampValueCents'], message: 'informe quanto vale 1 selo' });
  } else if (p.maxAmountPerEntryCents && p.maxAmountPerEntryCents < p.stampValueCents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxAmountPerEntryCents'], message: 'a compra máxima não pode ser menor que o valor do selo' });
  }
}

export const programInputSchema = programBaseSchema.superRefine(valueRules);
export const programCreateSchema = programBaseSchema.extend({ active: z.boolean().default(true) }).superRefine(valueRules);

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
      kind: p.kind,
      stampValueCents: p.stampValueCents,
      maxAmountPerEntryCents: p.maxAmountPerEntryCents,
      /** Com clientes, o tipo e o valor do selo não mudam (as sobras e os estornos dependem deles). */
      valueLocked: (stats?.members ?? 0) > 0,
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
    const p = await this.loyalty.programOf(this.prisma, ctx.tenantId, id);
    const stats = await this.prisma.membership.aggregate({
      where: { programId: id },
      _count: { _all: true },
      _sum: { cachedRewardsAvailable: true },
    });
    return this.view(p, { members: stats._count._all, rewardsAvailable: stats._sum.cachedRewardsAvailable ?? 0 });
  }

  private data(input: z.infer<typeof programInputSchema>) {
    const byValue = input.kind === 'VALOR';
    return {
      name: input.name,
      kind: input.kind,
      stampValueCents: byValue ? input.stampValueCents! : null,
      maxAmountPerEntryCents: byValue ? (input.maxAmountPerEntryCents ?? null) : null,
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
    const current = await this.loyalty.programOf(this.prisma, ctx.tenantId, id);
    const data = this.data(input);
    // Com clientes, trocar o tipo ou o valor do selo deixaria sobras e estornos antigos inconsistentes.
    if (data.kind !== current.kind || data.stampValueCents !== current.stampValueCents) {
      const members = await this.prisma.membership.count({ where: { programId: id } });
      if (members > 0) {
        throw conflict(
          'PROGRAM_VALUE_LOCKED',
          'Este programa já tem clientes: o tipo e o valor do selo não podem mudar. Para outra regra, crie um programa novo.',
        );
      }
    }
    await this.prisma.loyaltyProgram.update({ where: { id }, data });
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
