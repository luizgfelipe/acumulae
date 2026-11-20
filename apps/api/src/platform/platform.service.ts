import { Injectable } from '@nestjs/common';
import { Plan, Prisma, StaffRole, SupportChannel } from '@prisma/client';
import { z } from 'zod';
import { BRANDING_SELECT, brandStyle, logoUrlOf, parseLogo } from '../common/branding';
import { config } from '../common/config';
import { badRequest, conflict, notFound } from '../common/errors';
import { STAMP_ICONS } from '../common/stamps';
import { DEFAULT_PLANS, FALLBACK_PLAN, PILOT_MONTHS, PILOT_PLAN, clearPlanCache, expiryAfterMonths, resolvePlan } from '../plans/plans';
import {
  brandingFieldsSchema,
  emailSchema,
  programFieldsSchema,
  slugSchema,
} from '../common/schemas';
import { PrismaService } from '../prisma/prisma.service';
import { InvitesService } from '../staff/invites.service';

export const storeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  address: z.string().trim().max(300).nullish(),
});

/**
 * Fim da validade do plano: data (vale até o fim do dia, horário de Brasília) ou data e hora ISO.
 * `null` remove a validade. Ausente ao entrar no PILOTO: vale por PILOT_MONTHS meses.
 */
const planExpiresAtSchema = z
  .union([z.string().date(), z.string().datetime({ offset: true })])
  .transform((v) => new Date(v.length === 10 ? `${v}T23:59:59.999-03:00` : v))
  .nullable()
  .optional();

/** Validade quando a plataforma não informa: o PILOTO vale por PILOT_MONTHS meses; os demais, sem validade. */
const defaultExpiry = (plan: string) => (plan === PILOT_PLAN ? expiryAfterMonths(PILOT_MONTHS) : null);

export const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  plan: z.string().trim().min(1).max(40).default('PILOTO'),
  planExpiresAt: planExpiresAtSchema,
  extraStores: z.number().int().min(0).max(200).optional(),
  branding: brandingFieldsSchema.optional(),
  store: storeInputSchema,
  program: programFieldsSchema,
  manager: z.object({ name: z.string().trim().min(1).max(120), email: emailSchema }),
});

export const planCodeSchema = z.string().regex(/^[A-Z0-9_]{2,40}$/, 'use letras maiúsculas, números e _');
/** Limite numérico: `null` = ilimitado; ausente = mantém (na criação, vale o do Essencial). */
const limit = (max: number) => z.number().int().min(1).max(max).nullable().optional();

export const planSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Preço mensal em centavos (informativo). */
  priceCents: z.number().int().min(0).max(10_000_000).optional(),
  maxActiveCustomers: limit(10_000_000),
  maxActivePrograms: limit(50),
  includedStores: z.number().int().min(1).max(1000).optional(),
  /** Preço de cada unidade extra em centavos; `null` = o plano não vende unidade extra. */
  extraStorePriceCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  maxStaff: limit(10_000),
  /** Quantos ícones do catálogo o plano libera (os primeiros N). */
  maxStampIcons: z.number().int().min(1).max(STAMP_ICONS.length).optional(),
  customStampImage: z.boolean().optional(),
  cardCustomization: z.boolean().optional(),
  reports: z.boolean().optional(),
  customerExport: z.boolean().optional(),
  networkDashboard: z.boolean().optional(),
  supportChannel: z.nativeEnum(SupportChannel).optional(),
});

function planView(p: Plan) {
  const { createdAt: _c, updatedAt: _u, ...fields } = p;
  return fields;
}

export const updateTenantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  plan: z.string().trim().min(1).max(40).optional(),
  planExpiresAt: planExpiresAtSchema,
  /** Unidades extras contratadas, além das inclusas no plano. */
  extraStores: z.number().int().min(0).max(200).optional(),
  branding: brandingFieldsSchema.optional(),
});

export const inviteSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120).nullish(),
  role: z.nativeEnum(StaffRole).default('MANAGER'),
  storeIds: z.array(z.string().uuid()).optional(),
});

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
  ) {}

  private signupUrl(slug: string) {
    return `${config.publicUrl}/e/${slug}`;
  }

  /** RN-92: tenant + primeira unidade + programa + convite do gestor, numa transação. */
  async createTenant(input: z.infer<typeof createTenantSchema>) {
    await this.ensurePlan(input.plan);
    const existing = await this.prisma.tenant.findUnique({ where: { slug: input.slug } });
    if (existing) {
      // RN-94: idempotente pelo slug.
      throw conflict('TENANT_SLUG_EXISTS', 'Já existe um estabelecimento com este slug.', { tenantId: existing.id });
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: input.name, slug: input.slug, plan: input.plan, planExpiresAt: input.planExpiresAt !== undefined ? input.planExpiresAt : defaultExpiry(input.plan), extraStores: input.extraStores },
        });
        const logo = input.branding?.logo ? parseLogo(input.branding.logo) : null;
        await tx.tenantBranding.create({
          data: {
            tenantId: tenant.id,
            logoData: logo?.data ?? null,
            logoMime: logo?.mime ?? null,
            ...(input.branding?.primaryColor ? { primaryColor: input.branding.primaryColor } : {}),
            secondaryColor: input.branding?.secondaryColor ?? null,
            ...(input.branding?.cardStyle ? { cardStyle: input.branding.cardStyle } : {}),
            ...(input.branding?.stampIcon ? { stampIcon: input.branding.stampIcon } : {}),
          },
        });
        const store = await tx.store.create({
          data: {
            tenantId: tenant.id,
            name: input.store.name,
            slug: input.store.slug,
            address: input.store.address ?? null,
          },
        });
        const p = input.program;
        const program = await tx.loyaltyProgram.create({
          data: {
            tenantId: tenant.id,
            rewardDescription: p.rewardDescription,
            name: p.name ?? 'Programa de fidelidade',
            carryOverExcess: p.carryOverExcess ?? true,
            unitLabel: p.unitLabel ?? 'selo',
            unitLabelPlural: p.unitLabelPlural ?? null,
            goal: p.goal ?? 10,
            maxPerEntry: p.maxPerEntry ?? 20,
            redeemWeekdays: p.redeemWeekdays ?? [],
            stampValidityDays: p.stampValidityDays ?? null,
          },
        });
        const invite = await this.invites.create(
          { tenantId: tenant.id, email: input.manager.email, name: input.manager.name, role: 'MANAGER' },
          tx,
        );
        return { tenant, store, program, invite };
      });

      await this.invites.sendEmail({
        email: input.manager.email,
        name: input.manager.name,
        tenantName: result.tenant.name,
        role: 'MANAGER',
        url: result.invite.url,
      });

      return {
        tenantId: result.tenant.id,
        storeId: result.store.id,
        programId: result.program.id,
        managerInviteUrl: result.invite.url,
        managerInviteExpiresAt: result.invite.expiresAt.toISOString(),
        storeSignupQrUrl: this.signupUrl(result.tenant.slug),
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const t = await this.prisma.tenant.findUnique({ where: { slug: input.slug } });
        throw conflict('TENANT_SLUG_EXISTS', 'Já existe um estabelecimento com este slug.', { tenantId: t?.id });
      }
      throw e;
    }
  }

  async list() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { planRef: true, _count: { select: { stores: true, memberships: true } } },
    });
    const now = new Date();
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      plan: t.plan,
      planExpiresAt: t.planExpiresAt,
      planExpired: !!t.planExpiresAt && t.planExpiresAt <= now,
      createdAt: t.createdAt,
      stores: t._count.stores,
      customers: t._count.memberships,
    }));
  }

  async get(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        planRef: true,
        branding: { select: BRANDING_SELECT },
        stores: { orderBy: { createdAt: 'asc' } },
        programs: { orderBy: { createdAt: 'asc' } },
        staff: { include: { staffUser: { select: { id: true, name: true, email: true } } } },
        invites: { where: { usedAt: null, expiresAt: { gt: new Date() } }, select: { email: true, role: true, expiresAt: true } },
        _count: { select: { memberships: true } },
      },
    });
    if (!t) throw notFound('Estabelecimento não encontrado.');
    const eff = await resolvePlan(this.prisma, t);
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      plan: t.plan,
      planExpiresAt: t.planExpiresAt,
      planExpired: eff.expired,
      /** Plano que vale agora (o contratado, ou o ESSENCIAL depois da validade). */
      effectivePlan: eff.plan.code,
      extraStores: t.extraStores,
      maxStores: eff.maxStores,
      createdAt: t.createdAt,
      branding: t.branding && {
        logoUrl: logoUrlOf(t.slug, t.branding),
        ...brandStyle(t.slug, t.branding),
        version: t.branding.version,
      },
      stores: t.stores.map((s) => ({ id: s.id, name: s.name, slug: s.slug, address: s.address, status: s.status })),
      programs: t.programs,
      staff: t.staff.map((m) => ({ ...m.staffUser, role: m.role, status: m.status })),
      pendingInvites: t.invites,
      customers: t._count.memberships,
      storeSignupQrUrl: this.signupUrl(t.slug),
    };
  }

  async update(id: string, input: z.infer<typeof updateTenantSchema>) {
    const current = await this.ensure(id);
    if (input.plan) await this.ensurePlan(input.plan);
    // Troca de plano sem validade informada: entrar no PILOTO ganha a validade do piloto; sair dele
    // descarta essa validade (o plano novo fica sem validade). Nas demais trocas, a validade continua.
    let planExpiresAt = input.planExpiresAt;
    if (planExpiresAt === undefined && input.plan && input.plan !== current.plan) {
      if (input.plan === PILOT_PLAN || current.plan === PILOT_PLAN) planExpiresAt = defaultExpiry(input.plan);
    }
    await this.prisma.$transaction(async (tx) => {
      if (input.name || input.plan || planExpiresAt !== undefined || input.extraStores !== undefined) {
        await tx.tenant.update({
          where: { id },
          data: { name: input.name, plan: input.plan, planExpiresAt, extraStores: input.extraStores },
        });
      }
      if (input.branding) {
        // logo: data URL = troca; null = remove; ausente = mantém.
        const b = input.branding;
        const logo = b.logo ? parseLogo(b.logo) : null;
        const logoFields =
          b.logo === undefined ? {} : { logoData: logo?.data ?? null, logoMime: logo?.mime ?? null };
        const colors = { primaryColor: b.primaryColor, secondaryColor: b.secondaryColor, cardStyle: b.cardStyle, stampIcon: b.stampIcon };
        await tx.tenantBranding.upsert({
          where: { tenantId: id },
          create: { tenantId: id, ...colors, ...logoFields },
          update: { ...colors, ...logoFields, version: { increment: 1 } },
        });
      }
    });
    return this.get(id);
  }

  // ───────────── Planos de contratação ─────────────

  private async ensurePlan(code: string) {
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    if (!plan) throw badRequest('PLAN_NOT_FOUND', `Plano "${code}" não existe. Cadastre em PUT /api/platform/plans/${code}.`);
    return plan;
  }

  async listPlans() {
    const plans = await this.prisma.plan.findMany({ orderBy: { code: 'asc' }, include: { _count: { select: { tenants: true } } } });
    return plans.map((p) => ({ ...planView(p), tenants: p._count.tenants }));
  }

  /**
   * Cria ou altera um plano. Na criação, o que não for informado vem do Essencial.
   * Reduzir um limite não desativa nada que já existe; só impede criar ou ativar além dele.
   */
  async upsertPlan(code: string, input: z.infer<typeof planSchema>) {
    const { code: _code, ...base } = DEFAULT_PLANS.find((p) => p.code === FALLBACK_PLAN)!;
    const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    const p = await this.prisma.plan.upsert({
      where: { code },
      create: { ...base, ...defined, code, name: input.name },
      update: input,
    });
    clearPlanCache();
    return planView(p);
  }

  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    await this.ensure(id);
    await this.prisma.tenant.update({ where: { id }, data: { status } });
    return { id, status };
  }

  async addStore(tenantId: string, input: z.infer<typeof storeInputSchema>) {
    await this.ensure(tenantId);
    const dup = await this.prisma.store.findUnique({ where: { tenantId_slug: { tenantId, slug: input.slug } } });
    if (dup) throw conflict('STORE_SLUG_EXISTS', 'Já existe uma unidade com este slug.', { storeId: dup.id });
    const store = await this.prisma.store.create({
      data: { tenantId, name: input.name, slug: input.slug, address: input.address ?? null },
    });
    return { storeId: store.id, name: store.name, slug: store.slug };
  }

  async invite(tenantId: string, input: z.infer<typeof inviteSchema>) {
    const tenant = await this.ensure(tenantId);
    const { url, expiresAt } = await this.invites.create({
      tenantId,
      email: input.email,
      name: input.name,
      role: input.role,
      storeIds: input.storeIds,
    });
    await this.invites.sendEmail({ email: input.email, name: input.name, tenantName: tenant.name, role: input.role, url });
    return { inviteUrl: url, expiresAt: expiresAt.toISOString() };
  }

  private async ensure(id: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw notFound('Estabelecimento não encontrado.');
    return t;
  }
}
