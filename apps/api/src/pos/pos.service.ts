import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TokensService } from '../auth/tokens.service';
import { config } from '../common/config';
import { randomToken, sha256 } from '../common/crypto';
import { AppError, badRequest, notFound } from '../common/errors';
import { maskName, shortName } from '../common/names';
import { normalizePhone } from '../common/phone';
import { LoyaltyService, assertAmount, redeemRestriction, summarize } from '../loyalty/loyalty.service';
import { PersonalQrService } from '../loyalty/personal-qr.service';
import { PrismaService } from '../prisma/prisma.service';

export const CHECKOUT_TTL_MINUTES = 10;
const REF_AUDIENCE = 'pos-customer';
const REF_TTL_SECONDS = 10 * 60;
/** Janela para confirmar um resgate depois de identificar o cliente. */
const REDEEM_WINDOW_SECONDS = 5 * 60;

export const resolveQrSchema = z.object({ qr: z.string().trim().min(10).max(300) });
/** Selos (programa por selo) ou valor da compra em centavos (programa por valor); o programa decide qual vale. */
const creditAmountFields = {
  quantity: z.number().int().min(1).max(100).nullish(),
  amountCents: z.number().int().min(1).max(100_000_000).nullish(),
};
const hasAmount = (b: { quantity?: number | null; amountCents?: number | null }) => b.quantity != null || b.amountCents != null;
const amountMissing = { message: 'informe a quantidade ou o valor da compra', path: ['quantity'] };

export const creditSchema = z
  .object({
    customerRef: z.string().min(10).max(2000),
    /** Obrigatório quando o estabelecimento tem mais de um programa ativo. */
    programId: z.string().uuid().nullish(),
    ...creditAmountFields,
  })
  .refine(hasAmount, amountMissing);
export const redeemSchema = z.object({
  customerRef: z.string().min(10).max(2000),
  programId: z.string().uuid().nullish(),
  rewardId: z.string().uuid().nullish(),
  /** Quantas recompensas disponíveis usar agora (padrão 1). */
  quantity: z.number().int().min(1).max(50).default(1),
});
export const checkoutCreateSchema = z
  .object({
    programId: z.string().uuid().nullish(),
    ...creditAmountFields,
  })
  .refine(hasAmount, amountMissing);
export const idempotencyKeySchema = z
  .string({ required_error: 'header Idempotency-Key obrigatório' })
  .min(8, 'header Idempotency-Key obrigatório')
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);

type RefSource = 'QR_PESSOAL' | 'TELEFONE';
interface CustomerRef {
  cid: string;
  tid: string;
  src: RefSource;
  iat: number;
}

export interface PosCtx {
  tenantId: string;
  storeId: string;
  staffUserId: string;
}

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly qr: PersonalQrService,
    private readonly tokens: TokensService,
  ) {}

  private signRef(tenantId: string, customerId: string, src: RefSource) {
    return this.tokens.signShort(REF_AUDIENCE, { cid: customerId, tid: tenantId, src }, REF_TTL_SECONDS);
  }

  private async readRef(ctx: PosCtx, ref: string): Promise<CustomerRef> {
    const r = await this.tokens.verifyShort<CustomerRef>(REF_AUDIENCE, ref);
    if (!r || r.tid !== ctx.tenantId) throw badRequest('INVALID_CUSTOMER_REF', 'Leia o cliente novamente.');
    return r;
  }

  /** Programas ativos do estabelecimento (para escolher no caixa). */
  async programs(ctx: PosCtx) {
    const ps = await this.loyalty.activePrograms(this.prisma, ctx.tenantId);
    return ps.map((p) => ({ ...summarize(null, p), maxPerEntry: p.maxPerEntry, maxAmountPerEntryCents: p.maxAmountPerEntryCents }));
  }

  /**
   * O que o caixa vê sobre o cliente: apenas dados deste estabelecimento (RN-82).
   * Um item por programa ativo, mais os programas desativados em que ainda há recompensa a usar.
   */
  private async customerView(ctx: PosCtx, customerId: string, src: RefSource) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.status !== 'ACTIVE') throw notFound('Cliente não encontrado.', 'CUSTOMER_NOT_FOUND');
    const [active, memberships] = await Promise.all([
      this.loyalty.activePrograms(this.prisma, ctx.tenantId),
      this.prisma.membership.findMany({
        where: { tenantId: ctx.tenantId, customerId },
        include: { program: true, rewards: { where: { status: 'DISPONIVEL' }, orderBy: { createdAt: 'asc' } } },
      }),
    ]);
    const byProgram = new Map(memberships.map((m) => [m.programId, m]));
    const programs = [
      ...active,
      ...memberships.filter((m) => !m.program.active && m.cachedRewardsAvailable > 0).map((m) => m.program),
    ];
    return {
      customerRef: await this.signRef(ctx.tenantId, customerId, src),
      source: src,
      name: src === 'TELEFONE' ? maskName(customer.name) : customer.name,
      firstVisit: !memberships.some((m) => m.firstVisitAt),
      programs: programs.map((p) => {
        const m = byProgram.get(p.id) ?? null;
        const restriction = redeemRestriction(p);
        return {
          ...summarize(m, p),
          maxPerEntry: p.maxPerEntry,
          maxAmountPerEntryCents: p.maxAmountPerEntryCents,
          rewards: (m?.rewards ?? []).map((r) => ({ id: r.id, description: r.description, unlockedAt: r.createdAt })),
          redeem: {
            // RN-61 (revisada): resgate com o cliente identificado pelo QR pessoal ou pelo telefone.
            allowed: !restriction,
            reason: restriction,
          },
        };
      }),
    };
  }

  async resolveQr(ctx: PosCtx, payload: string) {
    const customerId = this.qr.verify(payload);
    if (!customerId) {
      throw badRequest('INVALID_QR', 'QR inválido ou expirado. Peça para o cliente abrir o "Meu QR" de novo.');
    }
    return this.customerView(ctx, customerId, 'QR_PESSOAL');
  }

  async findByPhone(ctx: PosCtx, phone: string) {
    const e164 = normalizePhone(phone);
    if (!e164) throw badRequest('INVALID_PHONE', 'Telefone inválido.');
    const c = await this.prisma.customer.findUnique({ where: { phoneE164: e164 } });
    if (!c || c.status !== 'ACTIVE') {
      throw notFound('Nenhuma conta com este telefone. Gere um QR temporário para o cliente se cadastrar.', 'CUSTOMER_NOT_FOUND');
    }
    return this.customerView(ctx, c.id, 'TELEFONE');
  }

  async credit(ctx: PosCtx, body: z.infer<typeof creditSchema>, idempotencyKey: string) {
    const ref = await this.readRef(ctx, body.customerRef);
    const r = await this.loyalty.credit({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      staffUserId: ctx.staffUserId,
      customerId: ref.cid,
      programId: body.programId,
      quantity: body.quantity,
      amountCents: body.amountCents,
      source: ref.src,
      idempotencyKey: `pos:${idempotencyKey}`,
    });
    return {
      entryId: r.entry.id,
      replay: r.replay,
      /** Selos que entraram (no programa por valor, os que a compra fechou). */
      stamps: r.stamps,
      amountCents: r.amountCents,
      rewardsUnlocked: r.rewardsUnlocked,
      discarded: r.discarded,
      card: r.card,
    };
  }

  async redeem(ctx: PosCtx, body: z.infer<typeof redeemSchema>, idempotencyKey: string) {
    const ref = await this.readRef(ctx, body.customerRef);
    if (Date.now() / 1000 - ref.iat > REDEEM_WINDOW_SECONDS) {
      throw new AppError(409, 'CUSTOMER_READ_EXPIRED', 'A identificação expirou. Busque o cliente novamente.');
    }
    const r = await this.loyalty.redeem({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      staffUserId: ctx.staffUserId,
      customerId: ref.cid,
      programId: body.programId,
      rewardId: body.rewardId,
      quantity: body.quantity,
      source: ref.src,
      idempotencyKey: `pos:${idempotencyKey}`,
    });
    return {
      entryIds: r.entries.map((e) => e.id),
      replay: r.replay,
      redeemed: r.rewards.length,
      rewards: r.rewards.map((w) => ({ id: w.id, description: w.description, redeemedAt: w.redeemedAt })),
      card: r.card,
    };
  }

  // ───────────── QR temporário (RN-40 a RN-46) ─────────────

  async createCheckout(ctx: PosCtx, body: z.infer<typeof checkoutCreateSchema>) {
    const program = await this.loyalty.programForCredit(this.prisma, ctx.tenantId, body.programId);
    // Por valor, o token guarda o valor; os selos saem na hora do uso, somados à sobra do cliente.
    const byValue = program.kind === 'VALOR';
    let quantity = 0;
    let amountCents: number | null = null;
    if (byValue) {
      assertAmount(program, body.amountCents);
      amountCents = body.amountCents;
    } else {
      if (body.quantity == null) throw badRequest('INVALID_QUANTITY', 'A quantidade deve ser um inteiro maior ou igual a 1.');
      if (body.quantity > program.maxPerEntry) {
        throw badRequest('QUANTITY_ABOVE_LIMIT', `O máximo por lançamento é ${program.maxPerEntry}.`);
      }
      quantity = body.quantity;
    }
    const token = randomToken(22);
    const t = await this.prisma.checkoutToken.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        programId: program.id,
        staffUserId: ctx.staffUserId,
        tokenHash: sha256(token),
        quantity,
        amountCents,
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MINUTES * 60_000),
      },
    });
    return { id: t.id, url: `${config.publicUrl}/c/${token}`, quantity, amountCents, expiresAt: t.expiresAt, programName: program.name };
  }

  async checkoutStatus(ctx: PosCtx, id: string) {
    const t = await this.prisma.checkoutToken.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { usedBy: { select: { name: true } } },
    });
    if (!t) throw notFound('QR temporário não encontrado.');
    const status = t.usedAt ? 'USED' : t.cancelledAt ? 'CANCELLED' : t.expiresAt < new Date() ? 'EXPIRED' : 'PENDING';
    return {
      id: t.id,
      status,
      quantity: t.quantity,
      amountCents: t.amountCents,
      expiresAt: t.expiresAt,
      usedAt: t.usedAt,
      customerName: t.usedBy ? shortName(t.usedBy.name) : null,
    };
  }

  async cancelCheckout(ctx: PosCtx, id: string) {
    const r = await this.prisma.checkoutToken.updateMany({
      where: { id, tenantId: ctx.tenantId, usedAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    if (!r.count) {
      const exists = await this.prisma.checkoutToken.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!exists) throw notFound('QR temporário não encontrado.');
    }
    return this.checkoutStatus(ctx, id);
  }

  /** Últimos lançamentos da unidade, para conferência rápida (seção 7.2). */
  async recent(ctx: PosCtx) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { tenantId: ctx.tenantId, storeId: ctx.storeId, type: { in: ['CREDITO', 'RESGATE'] } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: {
        membership: { include: { customer: { select: { name: true } }, program: { select: { name: true } } } },
        staffUser: { select: { name: true } },
        reversedBy: { select: { id: true } },
      },
    });
    return entries.map((e) => ({
      programName: e.membership.program.name,
      id: e.id,
      type: e.type,
      quantity: e.quantity,
      amountCents: e.amountCents,
      source: e.source,
      createdAt: e.createdAt,
      customerName: shortName(e.membership.customer.name),
      staffName: e.staffUser?.name ?? null,
      reversed: !!e.reversedBy,
    }));
  }
}
