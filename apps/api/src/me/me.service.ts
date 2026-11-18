import { Injectable } from '@nestjs/common';
import { LedgerType } from '@prisma/client';
import { z } from 'zod';
import { CustomerPrincipal } from '../auth/customer-auth.guard';
import { CustomerAuthService, birthDateSchema, publicCustomer, toDate } from '../auth/customer-auth.service';
import { SessionsService } from '../auth/sessions.service';
import { BRANDING_SELECT, logoUrlOf } from '../common/branding';
import { AppError, badRequest, forbidden, notFound, unauthorized } from '../common/errors';
import { normalizePhone } from '../common/phone';
import { hashPassword, passwordProblem, verifyPassword } from '../common/password';
import { describeWeekdays } from '../common/time';
import { LoyaltyService, pluralize, redeemRestriction, summarize } from '../loyalty/loyalty.service';
import { PersonalQrService } from '../loyalty/personal-qr.service';
import { PrismaService } from '../prisma/prisma.service';

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
export const joinSchema = z.object({ slug: z.string().trim().min(2).max(60) });
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
      },
    });
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
      include: { tenant: { include: { branding: { select: BRANDING_SELECT } } }, program: true },
      orderBy: [{ lastVisitAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return ms.map((m) => ({
      ...summarize(m, m.program),
      tenant: {
        name: m.tenant.name,
        slug: m.tenant.slug,
        logoUrl: logoUrlOf(m.tenant.slug, m.tenant.branding),
        primaryColor: m.tenant.branding?.primaryColor ?? '#E85D04',
        active: m.tenant.status === 'ACTIVE',
      },
      marketingConsent: m.marketingConsent,
      lastVisitAt: m.lastVisitAt,
    }));
  }

  /** Q-04: vínculo criado já no cadastro pelo QR do balcão (0/meta). */
  async join(me: CustomerPrincipal, slug: string) {
    if (!me.phoneE164) throw new AppError(409, 'PROFILE_INCOMPLETE', 'Complete seu cadastro para continuar.');
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw notFound('Estabelecimento não encontrado.');
    if (tenant.status !== 'ACTIVE') throw forbidden('Este estabelecimento não está aceitando novos participantes.', 'TENANT_SUSPENDED');
    const program = await this.loyalty.activeProgram(this.prisma, tenant.id);
    const m = await this.loyalty.ensureMembership(this.prisma, tenant.id, me.id, program.id);
    return { membershipId: m.id };
  }

  private async ownMembership(me: CustomerPrincipal, id: string) {
    const m = await this.prisma.membership.findFirst({
      where: { id, customerId: me.id },
      include: { tenant: { include: { branding: { select: BRANDING_SELECT } } }, program: true },
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
        select: { id: true, type: true, quantity: true, createdAt: true, storeId: true, reason: true },
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
        primaryColor: m.tenant.branding?.primaryColor ?? '#E85D04',
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
        createdAt: e.createdAt,
        storeName: e.storeId ? (storeName.get(e.storeId) ?? null) : null,
      })),
    };
  }

  async setConsent(me: CustomerPrincipal, id: string, consent: boolean) {
    await this.ownMembership(me, id);
    await this.prisma.membership.update({
      where: { id },
      data: { marketingConsent: consent, marketingConsentAt: new Date() },
    });
    return { membershipId: id, marketingConsent: consent };
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

  /** Página pública do estabelecimento (QR do balcão, fluxo 6.1). */
  async publicTenant(slug: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { branding: { select: BRANDING_SELECT }, programs: { where: { active: true } }, stores: { where: { status: 'ACTIVE' }, select: { name: true, address: true } } },
    });
    if (!t) throw notFound('Estabelecimento não encontrado.');
    const p = t.programs[0];
    return {
      name: t.name,
      slug: t.slug,
      active: t.status === 'ACTIVE',
      logoUrl: logoUrlOf(t.slug, t.branding),
      primaryColor: t.branding?.primaryColor ?? '#E85D04',
      stores: t.stores,
      program: p && {
        goal: p.goal,
        unitLabel: p.unitLabel,
        unitLabelPlural: pluralize(p.unitLabel, p.unitLabelPlural),
        rewardDescription: p.rewardDescription,
        redeemWeekdaysText: p.redeemWeekdays.length ? describeWeekdays(p.redeemWeekdays) : null,
      },
    };
  }
}
