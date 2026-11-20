import { Injectable } from '@nestjs/common';
import { LedgerType, Prisma, StaffRole } from '@prisma/client';
import { z } from 'zod';
import { addressData, addressInputSchema, addressView } from '../common/address';
import { config } from '../common/config';
import { badRequest, conflict, notFound } from '../common/errors';
import { maskPhone } from '../common/phone';
import { BRANDING_SELECT, brandStyle, cardStyleSchema, logoDataUrlSchema, logoUrlOf, parseLogo, stampImageDataUrlSchema } from '../common/branding';
import {
  ACTIVE_CUSTOMER_DAYS,
  activeCustomers,
  activeStores,
  effectivePlan,
  lockTenant,
  planFeatureError,
  staffInUse,
  staffLimitError,
  storeLimitError,
  visualAllowance,
  withinLimit,
} from '../plans/plans';
import { MAX_STAMP_IMAGE_BYTES, STAMP_ICONS, allowedStampIcons } from '../common/stamps';
import { SEGMENTS, SEGMENT_CODES } from '../common/segments';
import { emailSchema, hexColorSchema, pageSchema, slugSchema, weekdaysSchema } from '../common/schemas';
import { startOfMonthSaoPaulo } from '../common/time';
import { LoyaltyService, pluralize, summarize } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvitesService } from '../staff/invites.service';

export const brandingUpdateSchema = z
  .object({
    primaryColor: hexColorSchema.optional(),
    /** null = remove a secundária (a principal faz os dois papéis). */
    secondaryColor: hexColorSchema.nullable().optional(),
    cardStyle: cardStyleSchema.optional(),
    stampIcon: z.enum(STAMP_ICONS).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'informe ao menos um campo' });
export const logoUploadSchema = z.object({ image: logoDataUrlSchema.nullable() });
export const stampImageUploadSchema = z.object({ image: stampImageDataUrlSchema });


export const profileUpdateSchema = z.object({
  storeName: z.string().trim().min(1).max(120).optional(),
  address: addressInputSchema,
  /** null = sem segmento. */
  segment: z.enum(SEGMENT_CODES).nullable().optional(),
  /** Aparecer no guia de estabelecimentos do app. */
  showInDirectory: z.boolean().optional(),
});
export const storeCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  address: addressInputSchema,
});
export const storeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  address: addressInputSchema,
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
export const customersQuerySchema = pageSchema.extend({
  search: z.string().trim().max(100).optional(),
  programId: z.string().uuid().optional(),
});
export const ledgerQuerySchema = pageSchema.extend({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  storeId: z.string().uuid().optional(),
  staffUserId: z.string().uuid().optional(),
  type: z.nativeEnum(LedgerType).optional(),
  membershipId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
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
      // Clientes distintos (um cliente pode ter cartão em mais de um programa).
      this.prisma.membership.groupBy({ by: ['customerId'], where: { tenantId: t } }).then((r) => r.length),
      this.prisma.membership.groupBy({ by: ['customerId'], where: { tenantId: t }, _min: { createdAt: true } })
        .then((r) => r.filter((x) => x._min.createdAt && x._min.createdAt >= since).length),
      this.prisma.ledgerEntry.aggregate({ where: { tenantId: t, type: 'CREDITO', createdAt: { gte: since } }, _sum: { quantity: true } }),
      this.prisma.ledgerEntry.aggregate({ where: { tenantId: t, type: 'ESTORNO_CREDITO', createdAt: { gte: since } }, _sum: { quantity: true } }),
      this.prisma.ledgerEntry.count({ where: { tenantId: t, type: 'CREDITO', createdAt: { gte: since }, reversedBy: { is: null } } }),
      this.prisma.reward.count({ where: { tenantId: t, createdAt: { gte: since }, status: { not: 'ESTORNADA' } } }),
      this.prisma.reward.count({ where: { tenantId: t, status: 'RESGATADA', redeemedAt: { gte: since } } }),
      this.prisma.reward.count({ where: { tenantId: t, status: 'DISPONIVEL' } }),
    ]);
    const active = await this.loyalty.activePrograms(this.prisma, t);
    // Com um programa, os selos usam o nome dele ("rodízios"); com vários, o termo genérico.
    const unitLabelPlural = active.length === 1 ? pluralize(active[0].unitLabel, active[0].unitLabelPlural) : 'selos';
    return {
      since,
      members,
      newMembersThisMonth: newMembers,
      stampsThisMonth: (credits._sum.quantity ?? 0) + (reversedCredits._sum.quantity ?? 0),
      visitsThisMonth: visits,
      rewardsUnlockedThisMonth: unlocked,
      rewardsRedeemedThisMonth: redeemed,
      rewardsAvailableNow: available,
      unitLabelPlural,
      activePrograms: active.length,
    };
  }

  // ───────────── Identidade visual ─────────────

  /** Cores e modelo do cartão. A versão do branding sobe para invalidar caches (RN-108). */
  async updateBranding(ctx: AdminCtx, input: z.infer<typeof brandingUpdateSchema>) {
    const plan = await this.plan(ctx.tenantId);
    // Escolhas fora do plano vigente são recusadas; voltar ao padrão (sem secundária, Clássico) sempre pode.
    if (input.stampIcon && !allowedStampIcons(plan.maxStampIcons).includes(input.stampIcon)) {
      throw planFeatureError('Este ícone de selo não está disponível no seu plano.');
    }
    if (!plan.cardCustomization && (input.secondaryColor || (input.cardStyle && input.cardStyle !== 'CLASSICO'))) {
      throw planFeatureError('Cor secundária e modelos de cartão estão disponíveis a partir do plano Profissional.');
    }
    const data = { primaryColor: input.primaryColor, secondaryColor: input.secondaryColor, cardStyle: input.cardStyle, stampIcon: input.stampIcon };
    await this.prisma.tenantBranding.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...data },
      update: { ...data, version: { increment: 1 } },
    });
    return this.profile(ctx);
  }

  /** Logo enviado como data URL; guardado no banco (MVP). `null` remove. */
  async setLogo(ctx: AdminCtx, image: string | null) {
    const logo = image ? parseLogo(image) : null;
    const fields = { logoData: logo?.data ?? null, logoMime: logo?.mime ?? null };
    await this.prisma.tenantBranding.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...fields },
      update: { ...fields, version: { increment: 1 } },
    });
    return this.profile(ctx);
  }

  /** Imagem própria do selo (substitui o ícone); `null` remove e volta para o ícone. */
  async setStampImage(ctx: AdminCtx, image: string | null) {
    if (image) {
      const plan = await this.plan(ctx.tenantId);
      if (!plan.customStampImage) throw planFeatureError('Imagem própria no selo não está disponível no seu plano.');
    }
    const img = image ? parseLogo(image, MAX_STAMP_IMAGE_BYTES) : null;
    const fields = { stampImageData: img?.data ?? null, stampImageMime: img?.mime ?? null };
    await this.prisma.tenantBranding.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...fields },
      update: { ...fields, version: { increment: 1 } },
    });
    return this.profile(ctx);
  }

  /** Plano vigente (o contratado, ou o Essencial depois da validade). */
  private async plan(tenantId: string) {
    return (await effectivePlan(this.prisma, tenantId)).plan;
  }

  // ───────────── Meu plano ─────────────

  /** Plano vigente, validade, recursos e uso de cada limite (`max: null` = ilimitado). */
  async planInfo(ctx: AdminCtx) {
    const eff = await effectivePlan(this.prisma, ctx.tenantId);
    const p = eff.plan;
    const [customers, programs, stores, staff, announcements] = await Promise.all([
      activeCustomers(this.prisma, ctx.tenantId),
      this.prisma.loyaltyProgram.count({ where: { tenantId: ctx.tenantId, active: true } }),
      activeStores(this.prisma, ctx.tenantId),
      staffInUse(this.prisma, ctx.tenantId),
      this.prisma.announcement.count({ where: { tenantId: ctx.tenantId, createdAt: { gte: startOfMonthSaoPaulo() } } }),
    ]);
    return {
      plan: { code: p.code, name: p.name, priceCents: p.priceCents, supportChannel: p.supportChannel },
      contracted: eff.contracted,
      expiresAt: eff.expiresAt,
      expired: eff.expired,
      activeCustomerDays: ACTIVE_CUSTOMER_DAYS,
      limits: {
        activeCustomers: { used: customers, max: p.maxActiveCustomers },
        activePrograms: { used: programs, max: p.maxActivePrograms },
        stores: { used: stores, max: eff.maxStores, included: p.includedStores, extraPriceCents: eff.expired ? null : p.extraStorePriceCents },
        staff: { used: staff, max: p.maxStaff },
        announcementsPerMonth: { used: announcements, max: p.maxAnnouncementsPerMonth },
      },
      features: {
        cardCustomization: p.cardCustomization,
        maxStampIcons: p.maxStampIcons,
        customStampImage: p.customStampImage,
        reports: p.reports,
        customerExport: p.customerExport,
        networkDashboard: p.networkDashboard,
      },
    };
  }

  // ───────────── Perfil (estabelecimento + unidade principal) ─────────────

  /** No MVP cada estabelecimento tem uma unidade; o perfil edita a primeira unidade ativa. */
  private async mainStore(tenantId: string) {
    const s =
      (await this.prisma.store.findFirst({ where: { tenantId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } })) ??
      (await this.prisma.store.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } }));
    if (!s) throw notFound('Unidade não encontrada.');
    return s;
  }

  async profile(ctx: AdminCtx) {
    const [tenant, branding, store, plan] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
      this.prisma.tenantBranding.findUnique({ where: { tenantId: ctx.tenantId }, select: BRANDING_SELECT }),
      this.mainStore(ctx.tenantId),
      this.plan(ctx.tenantId),
    ]);
    return {
      tenant: { name: tenant.name, slug: tenant.slug, segment: tenant.segment, showInDirectory: tenant.showInDirectory, signupUrl: `${config.publicUrl}/e/${tenant.slug}` },
      segments: SEGMENTS,
      // O que o cliente vê hoje: o que o plano vigente não libera aparece no padrão.
      branding: {
        logoUrl: logoUrlOf(tenant.slug, branding),
        ...brandStyle(tenant.slug, branding, visualAllowance(plan)),
        version: branding?.version ?? 1,
      },
      /** O que o plano libera para o selo (o painel mostra os demais ícones bloqueados). */
      stampOptions: {
        icons: STAMP_ICONS,
        allowedIcons: allowedStampIcons(plan.maxStampIcons),
        customImage: plan.customStampImage,
        planName: plan.name,
      },
      store: { id: store.id, name: store.name, ...addressView(store) },
    };
  }

  async updateProfile(ctx: AdminCtx, input: z.infer<typeof profileUpdateSchema>) {
    const store = await this.mainStore(ctx.tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.store.update({ where: { id: store.id }, data: { name: input.storeName, ...addressData(input.address) } });
      if (input.segment !== undefined || input.showInDirectory !== undefined) {
        await tx.tenant.update({ where: { id: ctx.tenantId }, data: { segment: input.segment, showInDirectory: input.showInDirectory } });
      }
    });
    return this.profile(ctx);
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
      ...addressView(s),
      status: s.status,
      signupUrl: `${config.publicUrl}/e/${tenant.slug}?u=${s.slug}`,
    }));
  }

  async createStore(ctx: AdminCtx, input: z.infer<typeof storeCreateSchema>) {
    const dup = await this.prisma.store.findUnique({ where: { tenantId_slug: { tenantId: ctx.tenantId, slug: input.slug } } });
    if (dup) throw conflict('STORE_SLUG_EXISTS', 'Já existe uma unidade com este identificador.');
    await this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, ctx.tenantId);
      const eff = await effectivePlan(tx, ctx.tenantId);
      if (!withinLimit(await activeStores(tx, ctx.tenantId), eff.maxStores)) throw storeLimitError(eff);
      await tx.store.create({ data: { tenantId: ctx.tenantId, name: input.name, slug: input.slug, ...addressData(input.address) } });
    });
    return this.stores(ctx);
  }

  async updateStore(ctx: AdminCtx, id: string, input: z.infer<typeof storeUpdateSchema>) {
    const s = await this.prisma.store.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!s) throw notFound('Unidade não encontrada.');
    if (input.status === 'INACTIVE') {
      const active = await this.prisma.store.count({ where: { tenantId: ctx.tenantId, status: 'ACTIVE' } });
      if (active <= 1 && s.status === 'ACTIVE') throw badRequest('LAST_STORE', 'O estabelecimento precisa de pelo menos uma unidade ativa.');
    }
    await this.prisma.$transaction(async (tx) => {
      if (input.status === 'ACTIVE' && s.status !== 'ACTIVE') {
        await lockTenant(tx, ctx.tenantId);
        const eff = await effectivePlan(tx, ctx.tenantId);
        if (!withinLimit(await activeStores(tx, ctx.tenantId), eff.maxStores)) throw storeLimitError(eff);
      }
      await tx.store.update({ where: { id }, data: { name: input.name, ...addressData(input.address), status: input.status } });
    });
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
    const { url, expiresAt } = await this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, ctx.tenantId);
      const { plan } = await effectivePlan(tx, ctx.tenantId);
      if (!withinLimit(await staffInUse(tx, ctx.tenantId), plan.maxStaff)) throw staffLimitError(plan.maxStaff!);
      return this.invites.create({ tenantId: ctx.tenantId, ...input }, tx);
    });
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
      if (input.status === 'ACTIVE' && m.status !== 'ACTIVE') {
        await lockTenant(tx, ctx.tenantId);
        const { plan } = await effectivePlan(tx, ctx.tenantId);
        if (!withinLimit(await staffInUse(tx, ctx.tenantId), plan.maxStaff)) throw staffLimitError(plan.maxStaff!);
      }
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
    const where: Prisma.MembershipWhereInput = { tenantId: ctx.tenantId, programId: q.programId };
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
        programId: m.programId,
        programName: m.program.name,
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
      ...(q.programId ? { membership: { programId: q.programId } } : {}),
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
          membership: { include: { customer: { select: { name: true } }, program: { select: { name: true } } } },
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
        programName: e.membership.program.name,
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
