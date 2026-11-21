import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { maskPhone } from '../common/phone';
import { pageSchema } from '../common/schemas';
import { TERMS_DATA_SHARING_SINCE } from '../common/terms';
import { startOfMonthSaoPaulo } from '../common/time';
import { ACTIVE_CUSTOMER_DAYS, activeCustomers, effectivePlan, planFeatureError } from '../plans/plans';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminCtx } from './admin.service';

export const birthdaysQuerySchema = pageSchema.extend({ month: z.coerce.number().int().min(1).max(12).optional() });
export const inactiveQuerySchema = pageSchema.extend({ days: z.coerce.number().int().refine((d) => [30, 60, 90].includes(d), 'use 30, 60 ou 90') });
export const staffReportQuerySchema = z.object({ from: z.string().date().optional(), to: z.string().date().optional() });

/** Lançamentos por telefone acima de N vezes a média da equipe chamam atenção (antifraude). */
const PHONE_SHARE_ALERT = 2;
const MIN_CREDITS_FOR_ALERT = 5;

const dayStart = (d: string) => new Date(`${d}T00:00:00-03:00`);

@Injectable()
export class ReportsService {
  private readonly log = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async require(ctx: AdminCtx, feature: 'reports' | 'customerExport' | 'networkDashboard') {
    const { plan } = await effectivePlan(this.prisma, ctx.tenantId);
    if (!plan[feature]) {
      const messages = {
        reports: 'Relatórios estão disponíveis a partir do plano Profissional.',
        customerExport: 'Exportar clientes está disponível a partir do plano Profissional.',
        networkDashboard: 'O painel consolidado da rede está disponível no plano Rede.',
      };
      throw planFeatureError(messages[feature]);
    }
  }

  /**
   * Painel consolidado da rede: o mês corrente por unidade (selos, visitas, clientes novos, resgates)
   * e os clientes ativos de cada unidade nos últimos 90 dias. Unidade inativa aparece se teve movimento.
   */
  async network(ctx: AdminCtx) {
    await this.require(ctx, 'networkDashboard');
    const t = ctx.tenantId;
    const since = startOfMonthSaoPaulo();
    const activeSince = new Date(Date.now() - ACTIVE_CUSTOMER_DAYS * 86_400_000);
    const [stores, stamps, visits, redeemed, newCustomers, active] = await Promise.all([
      this.prisma.store.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, status: true } }),
      // Estornos têm quantidade negativa: a soma já desconta.
      this.prisma.ledgerEntry.groupBy({
        by: ['storeId'],
        where: { tenantId: t, type: { in: ['CREDITO', 'ESTORNO_CREDITO'] }, createdAt: { gte: since } },
        _sum: { quantity: true },
      }),
      this.prisma.ledgerEntry.groupBy({
        by: ['storeId'],
        where: { tenantId: t, type: 'CREDITO', createdAt: { gte: since }, reversedBy: { is: null } },
        _count: { _all: true },
      }),
      this.prisma.reward.groupBy({
        by: ['redeemedStoreId'],
        where: { tenantId: t, status: 'RESGATADA', redeemedAt: { gte: since } },
        _count: { _all: true },
      }),
      // Cliente novo = o primeiro selo dele no estabelecimento foi neste mês, nesta unidade.
      this.prisma.$queryRaw<{ storeId: string | null; n: bigint }[]>`
        SELECT f.store_id AS "storeId", COUNT(*) AS n FROM (
          SELECT DISTINCT ON (m.customer_id) e.store_id, e.created_at
          FROM ledger_entries e JOIN memberships m ON m.id = e.membership_id
          WHERE e.tenant_id = ${t}::uuid AND e.type = 'CREDITO'
          ORDER BY m.customer_id, e.created_at
        ) f WHERE f.created_at >= ${since} GROUP BY f.store_id`,
      this.prisma.$queryRaw<{ storeId: string | null; n: bigint }[]>`
        SELECT e.store_id AS "storeId", COUNT(DISTINCT m.customer_id) AS n
        FROM ledger_entries e JOIN memberships m ON m.id = e.membership_id
        WHERE e.tenant_id = ${t}::uuid AND e.type = 'CREDITO' AND e.created_at >= ${activeSince}
        GROUP BY e.store_id`,
    ]);
    const stampsBy = new Map(stamps.map((r) => [r.storeId, r._sum.quantity ?? 0]));
    const visitsBy = new Map(visits.map((r) => [r.storeId, r._count._all]));
    const redeemedBy = new Map(redeemed.map((r) => [r.redeemedStoreId, r._count._all]));
    const newBy = new Map(newCustomers.map((r) => [r.storeId, Number(r.n)]));
    const activeBy = new Map(active.map((r) => [r.storeId, Number(r.n)]));

    const items = stores
      .map((s) => ({
        storeId: s.id,
        name: s.name,
        active: s.status === 'ACTIVE',
        stamps: stampsBy.get(s.id) ?? 0,
        visits: visitsBy.get(s.id) ?? 0,
        newCustomers: newBy.get(s.id) ?? 0,
        rewardsRedeemed: redeemedBy.get(s.id) ?? 0,
        activeCustomers: activeBy.get(s.id) ?? 0,
      }))
      .filter((s) => s.active || s.stamps || s.visits || s.rewardsRedeemed);
    const sum = (k: 'stamps' | 'visits' | 'newCustomers' | 'rewardsRedeemed') => items.reduce((acc, s) => acc + s[k], 0);
    return {
      since,
      activeCustomerDays: ACTIVE_CUSTOMER_DAYS,
      items,
      // Clientes ativos da rede não são a soma das unidades: quem vai a duas conta uma vez.
      totals: {
        stamps: sum('stamps'),
        visits: sum('visits'),
        newCustomers: sum('newCustomers'),
        rewardsRedeemed: sum('rewardsRedeemed'),
        activeCustomers: await activeCustomers(this.prisma, t),
      },
    };
  }

  /** Telefone completo só com consentimento de marketing (seção 10), como na lista de clientes. */
  private contact(consent: boolean | null, phone: string | null) {
    return consent ? phone : maskPhone(phone);
  }

  /**
   * Aniversariantes do mês (padrão: mês atual em São Paulo), por dia e nome, paginados no servidor.
   * Um cliente aparece uma vez, mesmo com vários cartões (o da visita mais recente).
   */
  async birthdays(ctx: AdminCtx, q: z.infer<typeof birthdaysQuerySchema>) {
    await this.require(ctx, 'reports');
    const month = q.month ?? Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', month: '2-digit' }).format(new Date()));
    const base = Prisma.sql`
      SELECT DISTINCT ON (c.id)
        c.id AS "customerId", m.id AS "membershipId", c.name, c.phone_e164 AS phone, c.birth_date AS "birthDate",
        m.marketing_consent AS consent, m.last_visit_at AS "lastVisitAt"
      FROM memberships m
      JOIN customers c ON c.id = m.customer_id
      WHERE m.tenant_id = ${ctx.tenantId}::uuid AND c.status = 'ACTIVE' AND c.birth_date IS NOT NULL
        AND EXTRACT(MONTH FROM c.birth_date) = ${month}
      ORDER BY c.id, m.last_visit_at DESC NULLS LAST`;
    const [[{ total }], rows] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM (${base}) b`,
      this.prisma.$queryRaw<
        { customerId: string; membershipId: string; name: string; phone: string | null; birthDate: Date; consent: boolean | null; lastVisitAt: Date | null }[]
      >`SELECT * FROM (${base}) b ORDER BY EXTRACT(DAY FROM b."birthDate"), b.name, b."customerId"
         LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    ]);
    return {
      month,
      total: Number(total),
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        customerId: r.customerId,
        membershipId: r.membershipId,
        name: r.name,
        day: r.birthDate.getUTCDate(),
        phone: this.contact(r.consent, r.phone),
        marketingConsent: r.consent === true,
        lastVisitAt: r.lastVisitAt,
      })),
    };
  }

  /** Cartões sem visita há N dias (30, 60 ou 90), os mais antigos primeiro. */
  async inactive(ctx: AdminCtx, q: z.infer<typeof inactiveQuerySchema>) {
    await this.require(ctx, 'reports');
    const before = new Date(Date.now() - q.days * 86_400_000);
    const where: Prisma.MembershipWhereInput = { tenantId: ctx.tenantId, lastVisitAt: { lt: before }, customer: { status: 'ACTIVE' } };
    const [total, rows] = await Promise.all([
      this.prisma.membership.count({ where }),
      this.prisma.membership.findMany({
        where,
        orderBy: { lastVisitAt: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { customer: { select: { name: true, phoneE164: true } }, program: { select: { name: true, goal: true } } },
      }),
    ]);
    return {
      days: q.days,
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((m) => ({
        membershipId: m.id,
        name: m.customer.name,
        phone: this.contact(m.marketingConsent, m.customer.phoneE164),
        marketingConsent: m.marketingConsent === true,
        programName: m.program.name,
        balance: m.cachedBalance,
        goal: m.program.goal,
        rewardsAvailable: m.cachedRewardsAvailable,
        lastVisitAt: m.lastVisitAt,
      })),
    };
  }

  /**
   * Relatório por funcionário (antifraude): lançamentos, selos, quanto foi por telefone (sem o QR do cliente),
   * créditos que acabaram estornados e resgates. Padrão: mês atual.
   */
  async staff(ctx: AdminCtx, q: z.infer<typeof staffReportQuerySchema>) {
    await this.require(ctx, 'reports');
    const from = q.from ? dayStart(q.from) : startOfMonthSaoPaulo();
    const to = q.to ? new Date(dayStart(q.to).getTime() + 86_400_000) : new Date();
    const rows = await this.prisma.$queryRaw<
      { staffUserId: string; name: string; credits: bigint; stamps: bigint; phoneCredits: bigint; reversedCredits: bigint; redemptions: bigint; phoneRedemptions: bigint }[]
    >`
      SELECT e.staff_user_id AS "staffUserId", u.name,
        COUNT(*) FILTER (WHERE e.type = 'CREDITO') AS credits,
        COALESCE(SUM(e.quantity) FILTER (WHERE e.type = 'CREDITO'), 0) AS stamps,
        COUNT(*) FILTER (WHERE e.type = 'CREDITO' AND e.source = 'TELEFONE') AS "phoneCredits",
        COUNT(*) FILTER (WHERE e.type = 'CREDITO' AND EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = e.id)) AS "reversedCredits",
        COUNT(*) FILTER (WHERE e.type = 'RESGATE') AS redemptions,
        COUNT(*) FILTER (WHERE e.type = 'RESGATE' AND e.source = 'TELEFONE') AS "phoneRedemptions"
      FROM ledger_entries e
      JOIN staff_users u ON u.id = e.staff_user_id
      WHERE e.tenant_id = ${ctx.tenantId}::uuid AND e.created_at >= ${from} AND e.created_at < ${to}
        AND e.type IN ('CREDITO', 'RESGATE')
      GROUP BY e.staff_user_id, u.name
      ORDER BY credits DESC, u.name`;
    const staff = rows.map((r) => {
      const credits = Number(r.credits);
      const phoneCredits = Number(r.phoneCredits);
      return {
        staffUserId: r.staffUserId,
        name: r.name,
        credits,
        stamps: Number(r.stamps),
        phoneCredits,
        phoneShare: credits ? phoneCredits / credits : 0,
        reversedCredits: Number(r.reversedCredits),
        redemptions: Number(r.redemptions),
        phoneRedemptions: Number(r.phoneRedemptions),
      };
    });
    const totalCredits = staff.reduce((s, x) => s + x.credits, 0);
    const teamPhoneShare = totalCredits ? staff.reduce((s, x) => s + x.phoneCredits, 0) / totalCredits : 0;
    return {
      from,
      to,
      teamPhoneShare,
      items: staff.map((x) => ({
        ...x,
        // Muito acima da média da equipe em lançamentos sem o QR do cliente: vale conferir.
        attention: x.credits >= MIN_CREDITS_FOR_ALERT && teamPhoneShare > 0 && x.phoneShare >= teamPhoneShare * PHONE_SHARE_ALERT,
      })),
    };
  }

  /**
   * CSV com os clientes do estabelecimento que aceitaram os Termos de Uso com o compartilhamento do
   * cadastro (TERMS_DATA_SHARING_SINCE). Quem só aceitou uma versão antiga fica de fora até aceitar a atual.
   * A coluna "Aceita promoções" diz para quem dá para mandar ofertas. Fica no log quem exportou e quantas linhas.
   */
  async exportCustomers(ctx: AdminCtx) {
    await this.require(ctx, 'customerExport');
    const [tenant, rows] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { slug: true } }),
      this.prisma.membership.findMany({
        where: { tenantId: ctx.tenantId, customer: { status: 'ACTIVE', termsVersion: { gte: TERMS_DATA_SHARING_SINCE } } },
        orderBy: [{ customer: { name: 'asc' } }, { program: { name: 'asc' } }],
        include: { customer: { select: { name: true, phoneE164: true, email: true, birthDate: true } }, program: { select: { name: true } } },
      }),
    ]);
    const header = ['Nome', 'Telefone', 'E-mail', 'Aniversário', 'Aceita promoções', 'Programa', 'Saldo', 'Recompensas disponíveis', 'Última visita', 'Cliente desde'];
    const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
    const lines = rows.map((m) =>
      [
        m.customer.name,
        m.customer.phoneE164 ?? '',
        m.customer.email ?? '',
        date(m.customer.birthDate),
        m.marketingConsent ? 'Sim' : 'Não',
        m.program.name,
        m.cachedBalance,
        m.cachedRewardsAvailable,
        date(m.lastVisitAt),
        date(m.createdAt),
      ].map(csvCell),
    );
    this.log.log(`Exportação de clientes: tenant=${ctx.tenantId} staff=${ctx.staffUserId} linhas=${rows.length}`);
    // BOM para o Excel reconhecer UTF-8; ";" é o separador que o Excel em português espera.
    const csv = '﻿' + [header.map(csvCell), ...lines].map((l) => l.join(';')).join('\r\n') + '\r\n';
    return { csv, filename: `clientes-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.csv` };
  }
}

/** Escapa a célula e neutraliza fórmulas (=, +, -, @) para a planilha não executar nada. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
