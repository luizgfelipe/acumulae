import { Plan, Prisma, SupportChannel } from '@prisma/client';
import { AppError } from '../common/errors';
import { allowedStampIcons } from '../common/stamps';
import type { Tx } from '../prisma/prisma.service';

/** Plano que passa a valer quando a validade do plano contratado acaba. */
export const FALLBACK_PLAN = 'ESSENCIAL';

/** Janela que define "cliente ativo" (visita nos últimos N dias). */
export const ACTIVE_CUSTOMER_DAYS = 90;

type PlanFields = Omit<Plan, 'createdAt' | 'updatedAt'>;

/**
 * Grade padrão. A migration 20261120090000_plans_grid semeia os mesmos valores, e os testes recriam
 * a grade a partir daqui. Limites `null` = ilimitado. Preços em centavos, só informativos.
 */
export const DEFAULT_PLANS: PlanFields[] = [
  {
    code: 'PILOTO',
    name: 'Piloto',
    priceCents: 0,
    maxActiveCustomers: 300,
    maxActivePrograms: 1,
    includedStores: 1,
    extraStorePriceCents: null,
    maxStaff: 3,
    maxStampIcons: 5,
    customStampImage: false,
    cardCustomization: false,
    reports: false,
    customerExport: false,
    networkDashboard: false,
    supportChannel: SupportChannel.EMAIL,
  },
  {
    code: 'ESSENCIAL',
    name: 'Essencial',
    priceCents: 6990,
    maxActiveCustomers: 300,
    maxActivePrograms: 1,
    includedStores: 1,
    extraStorePriceCents: null,
    maxStaff: 3,
    maxStampIcons: 5,
    customStampImage: false,
    cardCustomization: false,
    reports: false,
    customerExport: false,
    networkDashboard: false,
    supportChannel: SupportChannel.EMAIL,
  },
  {
    code: 'PROFISSIONAL',
    name: 'Profissional',
    priceCents: 7990,
    maxActiveCustomers: 1500,
    maxActivePrograms: 3,
    includedStores: 1,
    extraStorePriceCents: 3990,
    maxStaff: null,
    maxStampIcons: 15,
    customStampImage: true,
    cardCustomization: true,
    reports: true,
    customerExport: true,
    networkDashboard: false,
    supportChannel: SupportChannel.WHATSAPP,
  },
  {
    code: 'REDE',
    name: 'Rede',
    priceCents: 19990,
    maxActiveCustomers: null,
    maxActivePrograms: null,
    includedStores: 3,
    extraStorePriceCents: 4990,
    maxStaff: null,
    maxStampIcons: 15,
    customStampImage: true,
    cardCustomization: true,
    reports: true,
    customerExport: true,
    networkDashboard: true,
    supportChannel: SupportChannel.WHATSAPP_PRIORITARIO,
  },
];

/** Campos do estabelecimento necessários para resolver o plano vigente. */
export const TENANT_PLAN_SELECT = { plan: true, planExpiresAt: true, extraStores: true, planRef: true } as const;
type TenantPlanRow = Prisma.TenantGetPayload<{ select: typeof TENANT_PLAN_SELECT }>;

export interface EffectivePlan {
  /** Plano que vale agora (o contratado, ou o ESSENCIAL se a validade acabou). */
  plan: Plan;
  /** Plano contratado, mesmo vencido. */
  contracted: { code: string; name: string };
  expiresAt: Date | null;
  expired: boolean;
  /** Unidades permitidas: inclusas + extras contratadas (extras não valem com o plano vencido). */
  maxStores: number;
}

type Db = Tx | Prisma.TransactionClient;

// O plano de reserva quase nunca muda: guarda por 1 minuto para não consultar a cada cartão listado.
let fallbackCache: { plan: Plan; at: number } | null = null;
async function fallbackPlan(db: Db): Promise<Plan | null> {
  if (fallbackCache && Date.now() - fallbackCache.at < 60_000) return fallbackCache.plan;
  const plan = await db.plan.findUnique({ where: { code: FALLBACK_PLAN } });
  if (plan) fallbackCache = { plan, at: Date.now() };
  return plan;
}
/** Para testes que alteram o plano de reserva. */
export function clearPlanCache() {
  fallbackCache = null;
}

export async function resolvePlan(db: Db, t: TenantPlanRow, now = new Date()): Promise<EffectivePlan> {
  const expired = !!t.planExpiresAt && t.planExpiresAt <= now;
  const plan = expired ? ((await fallbackPlan(db)) ?? t.planRef) : t.planRef;
  return {
    plan,
    contracted: { code: t.plan, name: t.planRef.name },
    expiresAt: t.planExpiresAt,
    expired,
    maxStores: plan.includedStores + (expired ? 0 : t.extraStores),
  };
}

export async function effectivePlan(db: Db, tenantId: string, now = new Date()): Promise<EffectivePlan> {
  const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: TENANT_PLAN_SELECT });
  return resolvePlan(db, t, now);
}

/** O que o plano libera no visual do cartão (aplicado ao montar a identidade visual para o cliente). */
export interface VisualAllowance {
  cardCustomization: boolean;
  allowedStampIcons: string[];
  customStampImage: boolean;
}
export function visualAllowance(plan: Plan): VisualAllowance {
  return {
    cardCustomization: plan.cardCustomization,
    allowedStampIcons: allowedStampIcons(plan.maxStampIcons),
    customStampImage: plan.customStampImage,
  };
}

/** `null` = ilimitado. */
export const withinLimit = (used: number, max: number | null) => max === null || used < max;

/** Recurso fora do plano vigente. */
export function planFeatureError(message: string) {
  return new AppError(403, 'PLAN_FEATURE_UNAVAILABLE', message);
}
