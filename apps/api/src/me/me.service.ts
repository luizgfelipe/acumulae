import { Injectable } from '@nestjs/common';
import { LedgerType } from '@prisma/client';
import { z } from 'zod';
import { CustomerPrincipal } from '../auth/customer-auth.guard';
import { CustomerAuthService, birthDateSchema, publicCustomer, toDate } from '../auth/customer-auth.service';
import { SessionsService } from '../auth/sessions.service';
import { BRANDING_SELECT, brandStyle, logoUrlOf } from '../common/branding';
import { resolvePlan, visualAllowance } from '../plans/plans';
import { AppError, badRequest, forbidden, notFound, unauthorized } from '../common/errors';
import { normalizePhone } from '../common/phone';
import { hashPassword, passwordProblem, verifyPassword } from '../common/password';
import { describeWeekdays } from '../common/time';
import { LoyaltyService, pluralize, redeemRestriction, summarize } from '../loyalty/loyalty.service';
import { PersonalQrService } from '../loyalty/personal-qr.service';
import { PrismaService } from '../prisma/prisma.service';
import { TERMS_VERSION } from '../common/terms';

export const acceptTermsSchema = z.object({
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'é preciso aceitar os termos' }) }),
});

export const completeProfileSchema = z.object({
  phone: z.string().trim().min(8).max(30),
  birthDate: birthDateSchema.nullish(),
  name: z.string().trim().min(2).max(120).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'é preciso aceitar os termos' }) }),
});
export const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  birthDate: birthDateSchema.nullish(),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(1).max(128),
});
export const joinSchema = z.object({
  slug: z.string().trim().min(2).max(60),
  /** Unidade do QR do balcão (`?u=` do link). Desconhecida ou inativa é ignorada. */
  store: z.string().trim().max(60).nullish(),
});
export const consentSchema = z.object({ marketingConsent: z.boolean() });
export const deleteMeSchema = z.object({
  password: z.string().max(128).optional(),
  confirm: z.literal('EXCLUIR', { errorMap: () => ({ message: 'digite EXCLUIR para confirmar' }) }),
});

/** Movimentações exibidas ao cliente. */
const CUSTOMER_VISIBLE: LedgerType[] = [
  'CREDITO',
  'ESTORNO_CREDITO',
  'RECOMPENSA_LIBERADA',
  'RECOMPENSA_CANCELADA',
  'RESGATE',
  'ESTORNO_RESGATE',
  'EXPIRACAO',
];

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: CustomerAuthService,
    private readonly sessions: SessionsService,
    private readonly loyalty: LoyaltyService,
    private readonly qr: PersonalQrService,
  ) {}

  async me(id: string) {
    const c = await this.prisma.customer.findUniqueOrThrow({ where: { id } });
    const pendingConsents = await this.prisma.membership.count({ where: { customerId: id, marketingConsent: null } });
    return { ...publicCustomer(c), pendingConsents };
  }

  async completeProfile(me: CustomerPrincipal, input: z.infer<typeof completeProfileSchema>) {
    const phoneE164 = normalizePhone(input.phone);
    if (!phoneE164) throw badRequest('INVALID_PHONE', 'Telefone inválido. Informe DDD + número.');
    await this.auth.assertAvailable(phoneE164, null, me.id);
    const c = await this.prisma.customer.update({
      where: { id: me.id },
      data: {
        phoneE164,
        birthDate: input.birthDate === undefined ? undefined : toDate(input.birthDate),
        name: input.name,
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
      },
    });
    return publicCustomer(c);
  }

  /** Aceite da versão atual dos Termos de Uso e da Política de Privacidade. */
  async acceptTerms(me: CustomerPrincipal) {
    const c = await this.prisma.customer.update({ where: { id: me.id }, data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION } });
    return publicCustomer(c);
  }

  async update(me: CustomerPrincipal, input: z.infer<typeof updateMeSchema>) {
    const c = await this.prisma.customer.update({
      where: { id: me.id },
      data: { name: input.name, birthDate: input.birthDate === undefined ? undefined : toDate(input.birthDate) },
    });
    return publicCustomer(c);
  }

  async changePassword(me: CustomerPrincipal, input: z.infer<typeof changePasswordSchema>) {
    const c = await this.prisma.customer.findUniqueOrThrow({ where: { id: me.id } });
    if (c.passwordHash && !(await verifyPassword(input.currentPassword ?? '', c.passwordHash))) {
      throw unauthorized('Senha atual incorreta.', 'INVALID_CREDENTIALS');
    }
    const problem = passwordProblem(input.newPassword, { birthDate: c.birthDate, phoneE164: c.phoneE164 });
    if (problem) throw badRequest('WEAK_PASSWORD', problem);
    await this.prisma.customer.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
    // Encerra as outras sessões; mantém a atual.
    await this.prisma.customerSession.updateMany({
      where: { customerId: me.id, revokedAt: null, NOT: { id: me.sessionId } },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  qrPayload(me: CustomerPrincipal) {
    if (!me.phoneE164) throw new AppError(409, 'PROFILE_INCOMPLETE', 'Complete seu cadastro para continuar.');
    return { ...this.qr.issue(me.id), name: me.name };
  }

  /** RN-81 / Q-03: apenas os estabelecimentos onde o cliente tem vínculo. */
  async memberships(me: CustomerPrincipal) {
    const ms = await this.prisma.membership.findMany({
      where: { customerId: me.id },
      include: { tenant: { include: { planRef: true, branding: { select: BRANDING_SELECT } } }, program: true },
      orderBy: [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    // Visual do cartão conforme o plano vigente de cada estabelecimento (um cálculo por estabelecimento).
    const allowance = new Map<string, ReturnType<typeof visualAllowance>>();
    for (const m of ms) {
      if (!allowance.has(m.tenantId)) allowance.set(m.tenantId, visualAllowance((await resolvePlan(this.prisma, m.tenant)).plan));
    }
    // Programas desativados só continuam aparecendo enquanto houver saldo ou recompensa a usar.
    return ms
      .filter((m) => m.program.active || m.cachedBalance > 0 || m.cachedRewardsAvailable > 0)
      .map((m) => ({
      ...summarize(m, m.program),
      tenant: {
        name: m.tenant.name,
        slug: m.tenant.slug,
        logoUrl: logoUrlOf(m.tenant.slug, m.tenant.branding),
        ...brandStyle(m.tenant.slug, m.tenant.branding, allowance.get(m.tenantId)),
        active: m.tenant.status === 'ACTIVE',
      },
      marketingConsent: m.marketingConsent,
      lastVisitAt: m.lastVisitAt,
    }));
  }

  /** Q-04: vínculo criado já no cadastro pelo QR do balcão (0/meta). */
  async join(me: CustomerPrincipal, slug: string, storeSlug?: string | null) {
    if (!me.phoneE164) throw new AppError(409, 'PROFILE_INCOMPLETE', 'Complete seu cadastro para continuar.');
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw notFound('Estabelecimento não encontrado.');
    if (tenant.status !== 'ACTIVE') throw forbidden('Este estabelecimento não está aceitando novos participantes.', 'TENANT_SUSPENDED');
    const programs = await this.loyalty.activePrograms(this.prisma, tenant.id);
    if (!programs.length) throw new AppError(409, 'NO_ACTIVE_PROGRAM', 'Este estabelecimento não tem programa ativo no momento.');
    // Unidade de entrada: a do QR; sem ela (ou inválida), a única unidade ativa, se só houver uma.
    const stores = await this.prisma.store.findMany({ where: { tenantId: tenant.id, status: 'ACTIVE' }, select: { id: true, slug: true } });
    const signupStoreId = stores.find((s) => s.slug === storeSlug)?.id ?? (stores.length === 1 ? stores[0].id : null);
    // Um cartão para cada programa ativo do estabelecimento.
    const ids: string[] = [];
    for (const p of programs) ids.push((await this.loyalty.ensureMembership(this.prisma, tenant.id, me.id, p.id, signupStoreId)).id);
    return { membershipId: ids[0], membershipIds: ids };
  }

  private async ownMembership(me: CustomerPrincipal, id: string) {
    const m = await this.prisma.membership.findFirst({
      where: { id, customerId: me.id },
      include: { tenant: { include: { planRef: true, branding: { select: BRANDING_SELECT } } }, program: true },
    });
    if (!m) throw notFound('Cartão não encontrado.');
    return m;
  }

  async membershipDetail(me: CustomerPrincipal, id: string) {
    const m = await this.ownMembership(me, id);
    const [entries, rewards, stores] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { membershipId: m.id, type: { in: CUSTOMER_VISIBLE } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, type: true, quantity: true, amountCents: true, createdAt: true, storeId: true, reason: true },
      }),
      this.prisma.reward.findMany({ where: { membershipId: m.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.store.findMany({ where: { tenantId: m.tenantId }, select: { id: true, name: true } }),
    ]);
    const storeName = new Map(stores.map((s) => [s.id, s.name]));
    const p = m.program;
    return {
      ...summarize(m, p),
      tenant: {
        name: m.tenant.name,
        slug: m.tenant.slug,
        logoUrl: logoUrlOf(m.tenant.slug, m.tenant.branding),
        ...brandStyle(m.tenant.slug, m.tenant.branding, visualAllowance((await resolvePlan(this.prisma, m.tenant)).plan)),
        active: m.tenant.status === 'ACTIVE',
      },
      rules: {
        goal: p.goal,
        rewardDescription: p.rewardDescription,
        redeemWeekdays: p.redeemWeekdays,
        redeemWeekdaysText: p.redeemWeekdays.length ? describeWeekdays(p.redeemWeekdays) : null,
        redeemBlockedToday: redeemRestriction(p),
      },
      marketingConsent: m.marketingConsent,
      firstVisitAt: m.firstVisitAt,
      lastVisitAt: m.lastVisitAt,
      rewards: rewards.map((r) => ({
        id: r.id,
        description: r.description,
        status: r.status,
        unlockedAt: r.createdAt,
        redeemedAt: r.redeemedAt,
        redeemedStore: r.redeemedStoreId ? (storeName.get(r.redeemedStoreId) ?? null) : null,
      })),
      history: entries.map((e) => ({
        id: e.id,
        type: e.type,
        quantity: e.quantity,
        amountCents: e.amountCents,
        createdAt: e.createdAt,
        storeName: e.storeId ? (storeName.get(e.storeId) ?? null) : null,
      })),
    };
  }

  /** Consentimento é por estabelecimento (seção 10): vale para todos os cartões do cliente nele. */
  async setConsent(me: CustomerPrincipal, id: string, consent: boolean) {
    const m = await this.ownMembership(me, id);
    await this.prisma.membership.updateMany({
      where: { tenantId: m.tenantId, customerId: me.id },
      data: { marketingConsent: consent, marketingConsentAt: new Date() },
    });
    return { membershipId: id, marketingConsent: consent };
  }

  /**
   * Atalho "todos de uma vez": aplica a mesma escolha a todos os estabelecimentos onde o cliente já
   * tem cartão. Não vale para os próximos: estabelecimento novo continua perguntando (consentimento
   * é por estabelecimento, seção 10).
   */
  async setConsentAll(me: CustomerPrincipal, consent: boolean) {
    const r = await this.prisma.membership.updateMany({
      where: { customerId: me.id },
      data: { marketingConsent: consent, marketingConsentAt: new Date() },
    });
    return { marketingConsent: consent, updated: r.count };
  }

  /** Fluxo 6.8: anonimiza os dados pessoais; o ledger permanece sem identificar a pessoa. */
  async deleteAccount(me: CustomerPrincipal, input: z.infer<typeof deleteMeSchema>) {
    const c = await this.prisma.customer.findUniqueOrThrow({ where: { id: me.id } });
    if (c.passwordHash && !(await verifyPassword(input.password ?? '', c.passwordHash))) {
      throw unauthorized('Senha incorreta.', 'INVALID_CREDENTIALS');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.customerIdentity.deleteMany({ where: { customerId: me.id } });
      await tx.passwordResetToken.deleteMany({ where: { customerId: me.id } });
      await tx.notification.deleteMany({ where: { customerId: me.id } });
      await tx.pushSubscription.deleteMany({ where: { customerId: me.id } });
      await tx.membership.updateMany({
        where: { customerId: me.id },
        data: { marketingConsent: false, marketingConsentAt: now },
      });
      await tx.customer.update({
        where: { id: me.id },
        data: {
          name: 'Cliente excluído',
          email: null,
          phoneE164: null,
          birthDate: null,
          passwordHash: null,
          status: 'DELETED',
          deletedAt: now,
        },
      });
    });
    await this.sessions.revokeAll('customer', me.id);
    return { ok: true };
  }

  /** Bytes do logo do estabelecimento (servidos com cache longo; a URL leva a versão). */
  async logo(slug: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { branding: { select: { logoData: true, logoMime: true } } },
    });
    if (!t?.branding?.logoData || !t.branding.logoMime) throw notFound('Logo não encontrado.');
    return { data: Buffer.from(t.branding.logoData), mime: t.branding.logoMime };
  }

  /** Bytes da imagem própria do selo (mesmo esquema de cache do logo). */
  async stampImage(slug: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { branding: { select: { stampImageData: true, stampImageMime: true } } },
    });
    if (!t?.branding?.stampImageData || !t.branding.stampImageMime) throw notFound('Imagem do selo não encontrada.');
    return { data: Buffer.from(t.branding.stampImageData), mime: t.branding.stampImageMime };
  }

  /** Página pública do estabelecimento (QR do balcão, fluxo 6.1). */
  async publicTenant(slug: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { planRef: true, branding: { select: BRANDING_SELECT }, programs: { where: { active: true }, orderBy: { createdAt: 'asc' } }, stores: { where: { status: 'ACTIVE' }, select: { name: true, address: true, city: true, state: true } } },
    });
    if (!t) throw notFound('Estabelecimento não encontrado.');
    const toPublic = (p: (typeof t.programs)[number]) => ({
      id: p.id,
      name: p.name,
      goal: p.goal,
      unitLabel: p.unitLabel,
      unitLabelPlural: pluralize(p.unitLabel, p.unitLabelPlural),
      rewardDescription: p.rewardDescription,
      redeemWeekdaysText: p.redeemWeekdays.length ? describeWeekdays(p.redeemWeekdays) : null,
    });
    return {
      name: t.name,
      slug: t.slug,
      active: t.status === 'ACTIVE',
      logoUrl: logoUrlOf(t.slug, t.branding),
      ...brandStyle(t.slug, t.branding, visualAllowance((await resolvePlan(this.prisma, t)).plan)),
      stores: t.stores,
      programs: t.programs.map(toPublic),
    };
  }
}
