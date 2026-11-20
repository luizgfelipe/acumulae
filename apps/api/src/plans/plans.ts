import { Plan, Prisma, SupportChannel } from '@prisma/client';
import { AppError } from '../common/errors';
import { allowedStampIcons } from '../common/stamps';
import type { Tx } from '../prisma/prisma.service';

/** Plano que passa a valer quando a validade do plano contratado acaba. */
export const FALLBACK_PLAN = 'ESSENCIAL';

/** Janela que define "cliente ativo" (visita nos últimos N dias). */
export const ACTIVE_CUSTOMER_DAYS = 90;

/** Plano dos pilotos e quantos meses de validade ele ganha quando a plataforma não informa outra. */
export const PILOT_PLAN = 'PILOTO';
export const PILOT_MONTHS = 3;

/** Fim do dia (horário de Brasília) daqui a `months` meses; dia inexistente cai no último do mês. */
export function expiryAfterMonths(months: number, from = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(from).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
  return new Date(`${target.toISOString().slice(0, 10)}T23:59:59.999-03:00`);
}

type PlanFields =Omit<Plan, 'createdAt' | 'updatedAt'>;

/**
 * Grade padrão. As migrations 20261120090000_plans_grid e 20261121090000_pilot_professional semeiam os mesmos valores, e os testes recriam
 * a grade a partir daqui. Limites `null` = ilimitado. Preços em centavos, só informativos.
 */
export const DEFAULT_PLANS: PlanFields[] = [
  {
    // Mesmo que o Profissional, de graça, por PILOT_MONTHS meses.
    code: 'PILOTO',
    name: 'Piloto',
    priceCents: 0,
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
    maxAnnouncementsPerMonth: 8,
    supportChannel: SupportChannel.WHATSAPP,
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
    maxAnnouncementsPerMonth: 2,
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
    maxAnnouncementsPerMonth: 8,
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
    maxAnnouncementsPerMonth: 30,
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

/** Clientes distintos com visita nos últimos 90 dias (um cliente com cartão em 2 programas conta 1). */
export async function activeCustomers(db: Db, tenantId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - ACTIVE_CUSTOMER_DAYS * 86_400_000);
  const rows = await db.membership.groupBy({ by: ['customerId'], where: { tenantId, lastVisitAt: { gte: since } } });
  return rows.length;
}

/**
 * Funcionários que ocupam vaga: gestores e atendentes ativos + convites pendentes (por e-mail, sem
 * contar duas vezes quem recebeu o convite de novo ou já faz parte da equipe).
 */
export async function staffInUse(db: Db, tenantId: string, now = new Date()): Promise<number> {
  const [members, invites] = await Promise.all([
    db.staffMembership.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { staffUser: { select: { email: true } } } }),
    db.staffInvite.findMany({ where: { tenantId, usedAt: null, expiresAt: { gt: now } }, select: { email: true } }),
  ]);
  const emails = new Set(members.map((m) => m.staffUser.email.toLowerCase()));
  const pending = new Set(invites.map((i) => i.email.toLowerCase()).filter((e) => !emails.has(e)));
  return members.length + pending.size;
}

export async function activeStores(db: Db, tenantId: string): Promise<number> {
  return db.store.count({ where: { tenantId, status: 'ACTIVE' } });
}

/** Trava a linha do estabelecimento: duas criações simultâneas não furam o limite. */
export async function lockTenant(tx: Tx, tenantId: string) {
  await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
}

/** R$ 39,90 (sem depender do ICU do Node, que põe espaço não separável). */
const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function staffLimitError(max: number) {
  return new AppError(
    409,
    'STAFF_LIMIT_REACHED',
    `Seu plano permite até ${plural(max, 'funcionário', 'funcionários')}, contando os convites pendentes. Desative alguém ou mude de plano.`,
    { max },
  );
}

export function storeLimitError(eff: EffectivePlan) {
  const p = eff.plan;
  const extra =
    p.extraStorePriceCents !== null && !eff.expired
      ? ` Cada unidade extra custa ${brl(p.extraStorePriceCents)} por mês: fale com o suporte do Acumulaê para contratar.`
      : ' Mude de plano para ter mais unidades.';
  return new AppError(409, 'STORE_LIMIT_REACHED', `Seu plano permite ${plural(eff.maxStores, 'unidade ativa', 'unidades ativas')}.${extra}`, {
    max: eff.maxStores,
  });
}

/** Recurso fora do plano vigente. */
export function planFeatureError(message: string) {
  return new AppError(403, 'PLAN_FEATURE_UNAVAILABLE', message);
}
