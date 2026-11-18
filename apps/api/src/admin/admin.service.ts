import { Injectable } from '@nestjs/common';
import { LedgerType, Prisma, StaffRole } from '@prisma/client';
import { z } from 'zod';
import { config } from '../common/config';
import { badRequest, conflict, notFound } from '../common/errors';
import { maskPhone } from '../common/phone';
import { brandingFieldsSchema, emailSchema, pageSchema, slugSchema, weekdaysSchema } from '../common/schemas';
import { startOfMonthSaoPaulo } from '../common/time';
import { LoyaltyService, pluralize, summarize } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvitesService } from '../staff/invites.service';

export const programUpdateSchema = z.object({
  unitLabel: z.string().trim().min(1).max(30),
  unitLabelPlural: z.string().trim().max(30).nullish(),
  goal: z.number().int().min(2).max(50),
  rewardDescription: z.string().trim().min(1).max(120),
  maxPerEntry: z.number().int().min(1).max(100),
  redeemWeekdays: weekdaysSchema,
});
export const brandingUpdateSchema = brandingFieldsSchema;
export const storeCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  address: z.string().trim().max(300).nullish(),
});
export const storeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().max(300).nullish(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export const staffInviteSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120).nullish(),
  role: z.nativeEnum(StaffRole),
  storeIds: z.array(z.string().uuid()).default([]),
});
export const staffUpdateSchema = z.object({
  role: z.nativeEnum(StaffRole).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  storeIds: z.array(z.string().uuid()).optional(),
});
export const customersQuerySchema = pageSchema.extend({ search: z.string().trim().max(100).optional() });
export const ledgerQuerySchema = pageSchema.extend({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  storeId: z.string().uuid().optional(),
  staffUserId: z.string().uuid().optional(),
  type: z.nativeEnum(LedgerType).optional(),
  membershipId: z.string().uuid().optional(),
});
export const reverseSchema = z.object({ reason: z.string().trim().min(3, 'informe o motivo').max(300) });

export interface AdminCtx {
  tenantId: string;
  staffUserId: string;
  membershipId: string;
}

/** Painel do gestor (seção 7.3). Tudo filtrado pelo tenant do funcionário autenticado (RN-82). */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
    private readonly invites: InvitesService,
  ) {}

  async dashboard(ctx: AdminCtx) {
    const t = ctx.tenantId;
    const since = startOfMonthSaoPaulo();
    const [members, newMembers, credits, reversedCredits, visits, unlocked, redeemed, available] = await Promise.all([
      this.prisma.membership.count({ where: { tenantId: t } }),
      this.prisma.membership.count({ where: { tenantId: t, createdAt: { gte: since } } }),
      this.prisma.ledgerEntry.aggregate({ where: { tenantId: t, type: 'CREDITO', createdAt: { gte: since } }, _sum: { quantity: true } }),
      this.prisma.ledgerEntry.aggregate({ where: { tenantId: t, type: 'ESTORNO_CREDITO', createdAt: { gte: since } }, _sum: { quantity: true } }),
      this.prisma.ledgerEntry.count({ where: { tenantId: t, type: 'CREDITO', createdAt: { gte: since }, reversedBy: { is: null } } }),
      this.prisma.reward.count({ where: { tenantId: t, createdAt: { gte: since }, status: { not: 'ESTORNADA' } } }),
      this.prisma.reward.count({ where: { tenantId: t, status: 'RESGATADA', redeemedAt: { gte: since } } }),
      this.prisma.reward.count({ where: { tenantId: t, status: 'DISPONIVEL' } }),
    ]);
    const program = await this.loyalty.activeProgram(this.prisma, t);
    return {
      since,
      members,
      newMembersThisMonth: newMembers,
      stampsThisMonth: (credits._sum.quantity ?? 0) + (reversedCredits._sum.quantity ?? 0),
      visitsThisMonth: visits,
      rewardsUnlockedThisMonth: unlocked,
      rewardsRedeemedThisMonth: redeemed,
      rewardsAvailableNow: available,
      unitLabelPlural: pluralize(program.unitLabel, program.unitLabelPlural),
    };
  }

  // ───────────── Programa e identidade visual ─────────────

  async getProgram(ctx: AdminCtx) {
    const [p, branding, tenant] = await Promise.all([
      this.loyalty.activeProgram(this.prisma, ctx.tenantId),
      this.prisma.tenantBranding.findUnique({ where: { tenantId: ctx.tenantId } }),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    ]);
    return {
      program: {
        id: p.id,
        unitLabel: p.unitLabel,
        unitLabelPlural: p.unitLabelPlural,
        goal: p.goal,
        rewardDescription: p.rewardDescription,
        maxPerEntry: p.maxPerEntry,
        redeemWeekdays: p.redeemWeekdays,
        scope: p.scope,
      },
      branding: { logoUrl: branding?.logoUrl ?? null, primaryColor: branding?.primaryColor ?? '#E85D04', version: branding?.version ?? 1 },
      tenant: { name: tenant.name, slug: tenant.slug, signupUrl: `${config.publicUrl}/e/${tenant.slug}` },
    };
  }

  /** RN-24: um programa ativo; alterar a meta não afeta recompensas já liberadas (custo gravado na recompensa). */
  async updateProgram(ctx: AdminCtx, input: z.infer<typeof programUpdateSchema>) {
    const p = await this.loyalty.activeProgram(this.prisma, ctx.tenantId);
    await this.prisma.loyaltyProgram.update({
      where: { id: p.id },
      data: {
        unitLabel: input.unitLabel,
        unitLabelPlural: input.unitLabelPlural || null,
        goal: input.goal,
        rewardDescription: input.rewardDescription,
        maxPerEntry: input.maxPerEntry,
        redeemWeekdays: [...new Set(input.redeemWeekdays)].sort(),
      },
    });
    return this.getProgram(ctx);
  }

  async updateBranding(ctx: AdminCtx, input: z.infer<typeof brandingUpdateSchema>) {
    await this.prisma.tenantBranding.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, logoUrl: input.logoUrl ?? null, primaryColor: input.primaryColor },
      update: {
        logoUrl: input.logoUrl === undefined ? undefined : input.logoUrl,
        primaryColor: input.primaryColor,
        version: { increment: 1 },
      },
    });
    return this.getProgram(ctx);
  }

  // ───────────── Unidades ─────────────

  async stores(ctx: AdminCtx) {
    const [tenant, stores] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
      this.prisma.store.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return stores.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      address: s.address,
      status: s.status,
      signupUrl: `${config.publicUrl}/e/${tenant.slug}?u=${s.slug}`,
    }));
  }

  async createStore(ctx: AdminCtx, input: z.infer<typeof storeCreateSchema>) {
    const dup = await this.prisma.store.findUnique({ where: { tenantId_slug: { tenantId: ctx.tenantId, slug: input.slug } } });
    if (dup) throw conflict('STORE_SLUG_EXISTS', 'Já existe uma unidade com este identificador.');
    await this.prisma.store.create({ data: { tenantId: ctx.tenantId, name: input.name, slug: input.slug, address: input.address ?? null } });
    return this.stores(ctx);
  }

  async updateStore(ctx: AdminCtx, id: string, input: z.infer<typeof storeUpdateSchema>) {
    const s = await this.prisma.store.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!s) throw notFound('Unidade não encontrada.');
    if (input.status === 'INACTIVE') {
      const active = await this.prisma.store.count({ where: { tenantId: ctx.tenantId, status: 'ACTIVE' } });
      if (active <= 1 && s.status === 'ACTIVE') throw badRequest('LAST_STORE', 'O estabelecimento precisa de pelo menos uma unidade ativa.');
    }
    await this.prisma.store.update({ where: { id }, data: { name: input.name, address: input.address, status: input.status } });
    return this.stores(ctx);
  }

  // ───────────── Funcionários ─────────────

  async staff(ctx: AdminCtx) {
    const [members, invites] = await Promise.all([
      this.prisma.staffMembership.findMany({
        where: { tenantId: ctx.tenantId },
        include: { staffUser: true, storeAccess: { include: { store: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.staffInvite.findMany({
        where: { tenantId: ctx.tenantId, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      members: members.map((m) => ({
        membershipId: m.id,
        userId: m.staffUserId,
        name: m.staffUser.name,
        email: m.staffUser.email,
        role: m.role,
        status: m.status,
        isMe: m.id === ctx.membershipId,
        stores: m.storeAccess.map((a) => a.store),
      })),
      pendingInvites: invites.map((i) => ({ id: i.id, email: i.email, name: i.name, role: i.role, expiresAt: i.expiresAt })),
    };
  }

  async inviteStaff(ctx: AdminCtx, input: z.infer<typeof staffInviteSchema>) {
    if (input.role === 'ATTENDANT' && !input.storeIds.length) {
      throw badRequest('STORES_REQUIRED', 'Selecione pelo menos uma unidade para o atendente.');
    }
    const valid = await this.prisma.store.count({ where: { tenantId: ctx.tenantId, id: { in: input.storeIds } } });
    if (valid !== input.storeIds.length) throw badRequest('INVALID_STORE', 'Unidade inválida.');
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
    const { url, expiresAt } = await this.invites.create({ tenantId: ctx.tenantId, ...input });
    await this.invites.sendEmail({ email: input.email, name: input.name, tenantName: tenant.name, role: input.role, url });
    return { inviteUrl: url, expiresAt };
  }

  async updateStaff(ctx: AdminCtx, membershipId: string, input: z.infer<typeof staffUpdateSchema>) {
    const m = await this.prisma.staffMembership.findFirst({ where: { id: membershipId, tenantId: ctx.tenantId } });
    if (!m) throw notFound('Funcionário não encontrado.');
    if (m.id === ctx.membershipId && (input.status === 'INACTIVE' || input.role === 'ATTENDANT')) {
      throw badRequest('CANNOT_DEMOTE_SELF', 'Você não pode desativar nem rebaixar o próprio acesso.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.staffMembership.update({ where: { id: m.id }, data: { role: input.role, status: input.status } });
      if (input.storeIds) {
        const stores = await tx.store.findMany({ where: { tenantId: ctx.tenantId, id: { in: input.storeIds } }, select: { id: true } });
        await tx.staffStoreAccess.deleteMany({ where: { staffMembershipId: m.id } });
        await tx.staffStoreAccess.createMany({ data: stores.map((s) => ({ staffMembershipId: m.id, storeId: s.id })) });
      }
      if (input.status === 'INACTIVE') {
        // Encerra as sessões que estavam neste estabelecimento.
        await tx.staffSession.updateMany({
          where: { staffUserId: m.staffUserId, tenantId: ctx.tenantId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });
    return this.staff(ctx);
  }

  // ───────────── Clientes ─────────────

  /** Telefone só aparece por completo com consentimento de marketing (seção 10). */
  private contact(consent: boolean | null, phone: string | null) {
    return consent ? phone : maskPhone(phone);
  }

  async customers(ctx: AdminCtx, q: z.infer<typeof customersQuerySchema>) {
    const where: Prisma.MembershipWhereInput = { tenantId: ctx.tenantId };
    if (q.search) {
      const digits = q.search.replace(/\D/g, '');
      where.customer = {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ phoneE164: { contains: digits } }] : []),
        ],
      };
    }
    const [total, rows] = await Promise.all([
      this.prisma.membership.count({ where }),
      this.prisma.membership.findMany({
        where,
        include: { customer: true, program: true },
        orderBy: [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const visits = await this.loyalty.visitCounts(ctx.tenantId, rows.map((r) => r.id));
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((m) => ({
        membershipId: m.id,
        name: m.customer.name,
        phone: this.contact(m.marketingConsent, m.customer.phoneE164),
        marketingConsent: m.marketingConsent,
        balance: m.cachedBalance,
        goal: m.program.goal,
        rewardsAvailable: m.cachedRewardsAvailable,
        lastVisitAt: m.lastVisitAt,
        joinedAt: m.createdAt,
        visits: visits.get(m.id) ?? 0,
        deleted: m.customer.status === 'DELETED',
      })),
    };
  }

  async customer(ctx: AdminCtx, membershipId: string) {
    const m = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId: ctx.tenantId },
      include: { customer: true, program: true, rewards: { orderBy: { createdAt: 'desc' } } },
    });
    if (!m) throw notFound('Cliente não encontrado.');
    const visits = await this.loyalty.visitCounts(ctx.tenantId, [m.id]);
    const ledger = await this.ledger(ctx, { page: 1, pageSize: 100, membershipId: m.id });
    return {
      membershipId: m.id,
      name: m.customer.name,
      phone: this.contact(m.marketingConsent, m.customer.phoneE164),
      email: m.marketingConsent ? m.customer.email : null,
      birthDate: m.marketingConsent && m.customer.birthDate ? m.customer.birthDate.toISOString().slice(0, 10) : null,
      marketingConsent: m.marketingConsent,
      joinedAt: m.createdAt,
      firstVisitAt: m.firstVisitAt,
      lastVisitAt: m.lastVisitAt,
      visits: visits.get(m.id) ?? 0,
      card: summarize(m, m.program),
      rewards: m.rewards.map((r) => ({ id: r.id, description: r.description, status: r.status, unlockedAt: r.createdAt, redeemedAt: r.redeemedAt })),
      ledger: ledger.items,
    };
  }

  // ───────────── Movimentações (RN-73) ─────────────

  async ledger(ctx: AdminCtx, q: z.infer<typeof ledgerQuerySchema>) {
    const where: Prisma.LedgerEntryWhereInput = {
      tenantId: ctx.tenantId,
      storeId: q.storeId,
      staffUserId: q.staffUserId,
      type: q.type,
      membershipId: q.membershipId,
    };
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(`${q.from}T00:00:00-03:00`) } : {}),
        ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00-03:00`).getTime() + 86400_000) } : {}),
      };
    }
    const [total, rows] = await Promise.all([
      this.prisma.ledgerEntry.count({ where }),
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          membership: { include: { customer: { select: { name: true } } } },
          staffUser: { select: { name: true } },
          store: { select: { name: true } },
          reversedBy: { select: { id: true, createdAt: true, reason: true } },
        },
      }),
    ]);
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((e) => ({
        id: e.id,
        type: e.type,
        quantity: e.quantity,
        rewardsDelta: e.rewardsDelta,
        source: e.source,
        createdAt: e.createdAt,
        membershipId: e.membershipId,
        customerName: e.membership.customer.name,
        staffName: e.staffUser?.name ?? null,
        storeName: e.store?.name ?? null,
        reason: e.reason,
        reversesEntryId: e.reversesEntryId,
        reversedBy: e.reversedBy,
        reversible: (e.type === 'CREDITO' || e.type === 'RESGATE') && !e.reversedBy,
      })),
    };
  }

  async reverse(ctx: AdminCtx, entryId: string, reason: string) {
    const r = await this.loyalty.reverse({ tenantId: ctx.tenantId, entryId, staffUserId: ctx.staffUserId, reason });
    return { reversalId: r.reversal.id, cancelledRewards: r.cancelledRewards };
  }
}
