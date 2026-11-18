import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { TokensService } from '../auth/tokens.service';
import { config } from '../common/config';
import { randomToken, sha256 } from '../common/crypto';
import { AppError, badRequest, forbidden, notFound } from '../common/errors';
import { maskName, shortName } from '../common/names';
import { normalizePhone } from '../common/phone';
import { LoyaltyService, pluralize, redeemRestriction, summarize } from '../loyalty/loyalty.service';
import { PersonalQrService } from '../loyalty/personal-qr.service';
import { PrismaService } from '../prisma/prisma.service';

export const CHECKOUT_TTL_MINUTES = 10;
const REF_AUDIENCE = 'pos-customer';
const REF_TTL_SECONDS = 10 * 60;
/** Janela para confirmar um resgate após ler o QR pessoal. */
const REDEEM_WINDOW_SECONDS = 120;

export const resolveQrSchema = z.object({ qr: z.string().trim().min(10).max(300) });
export const creditSchema = z.object({
  customerRef: z.string().min(10).max(2000),
  quantity: z.number().int().min(1).max(100),
});
export const redeemSchema = z.object({
  customerRef: z.string().min(10).max(2000),
  rewardId: z.string().uuid().nullish(),
});
export const checkoutCreateSchema = z.object({ quantity: z.number().int().min(1).max(100) });
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

  /** O que o caixa vê sobre o cliente: apenas dados deste estabelecimento (RN-82). */
  private async customerView(ctx: PosCtx, customerId: string, src: RefSource) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.status !== 'ACTIVE') throw notFound('Cliente não encontrado.', 'CUSTOMER_NOT_FOUND');
    const program = await this.loyalty.activeProgram(this.prisma, ctx.tenantId);
    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_customerId: { tenantId: ctx.tenantId, customerId } },
      include: { rewards: { where: { status: 'DISPONIVEL' }, orderBy: { createdAt: 'asc' } } },
    });
    const restriction = redeemRestriction(program);
    return {
      customerRef: await this.signRef(ctx.tenantId, customerId, src),
      source: src,
      name: src === 'TELEFONE' ? maskName(customer.name) : customer.name,
      firstVisit: !membership?.firstVisitAt,
      card: membership
        ? summarize(membership, program)
        : {
            membershipId: null,
            balance: 0,
            goal: program.goal,
            rewardsAvailable: 0,
            unitLabel: program.unitLabel,
            unitLabelPlural: pluralize(program.unitLabel, program.unitLabelPlural),
            rewardDescription: program.rewardDescription,
          },
      rewards: (membership?.rewards ?? []).map((r) => ({ id: r.id, description: r.description, unlockedAt: r.createdAt })),
      maxPerEntry: program.maxPerEntry,
      redeem: {
        // RN-52 / RN-61: busca por telefone nunca permite resgate.
        allowed: src === 'QR_PESSOAL' && !restriction,
        reason: src !== 'QR_PESSOAL' ? 'Para resgatar, leia o QR pessoal do cliente.' : restriction,
      },
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
      quantity: body.quantity,
      source: ref.src,
      idempotencyKey: `pos:${idempotencyKey}`,
    });
    return { entryId: r.entry.id, replay: r.replay, rewardsUnlocked: r.rewardsUnlocked, card: r.card };
  }

  async redeem(ctx: PosCtx, body: z.infer<typeof redeemSchema>, idempotencyKey: string) {
    const ref = await this.readRef(ctx, body.customerRef);
    if (ref.src !== 'QR_PESSOAL') {
      throw forbidden('Resgate só com o QR pessoal do cliente.', 'REDEEM_REQUIRES_QR');
    }
    if (Date.now() / 1000 - ref.iat > REDEEM_WINDOW_SECONDS) {
      throw new AppError(409, 'QR_READ_EXPIRED', 'A leitura expirou. Leia o QR pessoal do cliente novamente.');
    }
    const r = await this.loyalty.redeem({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      staffUserId: ctx.staffUserId,
      customerId: ref.cid,
      rewardId: body.rewardId,
      idempotencyKey: `pos:${idempotencyKey}`,
    });
    return {
      entryId: r.entry.id,
      replay: r.replay,
      reward: r.reward && { id: r.reward.id, description: r.reward.description, redeemedAt: r.reward.redeemedAt },
      card: r.card,
    };
  }

  // ───────────── QR temporário (RN-40 a RN-46) ─────────────

  async createCheckout(ctx: PosCtx, quantity: number) {
    const program = await this.loyalty.activeProgram(this.prisma, ctx.tenantId);
    if (quantity > program.maxPerEntry) {
      throw badRequest('QUANTITY_ABOVE_LIMIT', `O máximo por lançamento é ${program.maxPerEntry}.`);
    }
    const token = randomToken(22);
    const t = await this.prisma.checkoutToken.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        staffUserId: ctx.staffUserId,
        tokenHash: sha256(token),
        quantity,
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MINUTES * 60_000),
      },
    });
    return { id: t.id, url: `${config.publicUrl}/c/${token}`, quantity, expiresAt: t.expiresAt };
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
        membership: { include: { customer: { select: { name: true } } } },
        staffUser: { select: { name: true } },
        reversedBy: { select: { id: true } },
      },
    });
    return entries.map((e) => ({
      id: e.id,
      type: e.type,
      quantity: e.quantity,
      source: e.source,
      createdAt: e.createdAt,
      customerName: shortName(e.membership.customer.name),
      staffName: e.staffUser?.name ?? null,
      reversed: !!e.reversedBy,
    }));
  }
}
