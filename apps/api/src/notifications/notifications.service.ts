import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AdminCtx } from '../admin/admin.service';
import { logoUrlOf } from '../common/branding';
import { AppError } from '../common/errors';
import { pageSchema } from '../common/schemas';
import { startOfMonthSaoPaulo } from '../common/time';
import { effectivePlan, lockTenant, planFeatureError, withinLimit } from '../plans/plans';
import { PrismaService } from '../prisma/prisma.service';

export const notificationsQuerySchema = z.object({
  /** Id da última notificação da página anterior. */
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Para quem vai a notificação do estabelecimento. Sempre só quem aceitou promoções; os filtros
 * (aniversariantes do mês, inativos há N dias) são os mesmos dos relatórios e exigem o plano com relatórios.
 */
export const segmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('birthdays'), month: z.coerce.number().int().min(1).max(12) }),
  z.object({ type: z.literal('inactive'), days: z.coerce.number().int().refine((d) => [30, 60, 90].includes(d), 'use 30, 60 ou 90') }),
]);
export type Segment = z.infer<typeof segmentSchema>;

export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(3).max(500),
  segment: segmentSchema.default({ type: 'all' }),
});

export function segmentKey(s: Segment) {
  return s.type === 'all' ? 'all' : s.type === 'birthdays' ? `birthdays:${s.month}` : `inactive:${s.days}`;
}

/** Condição extra do filtro sobre memberships (m) e customers (c). */
function segmentWhere(s: Segment, now = new Date()): Prisma.Sql {
  if (s.type === 'birthdays') return Prisma.sql`AND c.birth_date IS NOT NULL AND EXTRACT(MONTH FROM c.birth_date) = ${s.month}`;
  if (s.type === 'inactive') return Prisma.sql`AND m.last_visit_at < ${new Date(now.getTime() - s.days * 86_400_000)}`;
  return Prisma.empty;
}

/** Notificações do cliente (sino do app). */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string, q: z.infer<typeof notificationsQuerySchema>) {
    const rows = await this.prisma.notification.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        tenant: { select: { name: true, slug: true, branding: { select: { primaryColor: true, logoMime: true, version: true } } } },
      },
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        read: !!n.readAt,
        membershipId: n.membershipId,
        tenant: n.tenant
          ? {
              name: n.tenant.name,
              slug: n.tenant.slug,
              logoUrl: logoUrlOf(n.tenant.slug, n.tenant.branding),
              primaryColor: n.tenant.branding?.primaryColor ?? null,
            }
          : null,
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1].id : null,
      unread: await this.unreadCount(customerId),
    };
  }

  unreadCount(customerId: string) {
    return this.prisma.notification.count({ where: { customerId, readAt: null } });
  }

  async markRead(customerId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, customerId, readAt: null }, data: { readAt: new Date() } });
    return { unread: await this.unreadCount(customerId) };
  }

  async markAllRead(customerId: string) {
    await this.prisma.notification.updateMany({ where: { customerId, readAt: null }, data: { readAt: new Date() } });
    return { unread: 0 };
  }
}

/** Avisos que o gestor manda aos clientes que aceitaram promoções do estabelecimento. */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Clientes ativos do filtro (total) e quantos deles aceitaram promoções (audience, quem recebe).
   * Um cliente com 2 cartões conta 1.
   */
  private async count(tenantId: string, segment: Segment) {
    const [r] = await this.prisma.$queryRaw<{ total: bigint; audience: bigint }[]>`
      SELECT COUNT(DISTINCT m.customer_id) AS total,
        COUNT(DISTINCT m.customer_id) FILTER (WHERE m.marketing_consent = true) AS audience
      FROM memberships m
      JOIN customers c ON c.id = m.customer_id AND c.status = 'ACTIVE'
      WHERE m.tenant_id = ${tenantId}::uuid ${segmentWhere(segment)}`;
    return { total: Number(r.total), audience: Number(r.audience) };
  }

  private async requireSegment(db: Parameters<typeof effectivePlan>[0], tenantId: string, segment: Segment) {
    if (segment.type === 'all') return;
    const { plan } = await effectivePlan(db, tenantId);
    if (!plan.reports) throw planFeatureError('Enviar para os filtros dos relatórios está disponível a partir do plano Profissional.');
  }

  /** Prévia do envio pelos relatórios: quantos estão no filtro, quantos recebem e o uso do mês. */
  async preview(ctx: AdminCtx, segment: Segment) {
    await this.requireSegment(this.prisma, ctx.tenantId, segment);
    const [eff, used, counts] = await Promise.all([
      effectivePlan(this.prisma, ctx.tenantId),
      this.usedThisMonth(this.prisma, ctx.tenantId),
      this.count(ctx.tenantId, segment),
    ]);
    return { ...counts, usage: { used, max: eff.plan.maxAnnouncementsPerMonth } };
  }

  private usedThisMonth(db: Pick<PrismaService, 'announcement'>, tenantId: string, now = new Date()) {
    return db.announcement.count({ where: { tenantId, createdAt: { gte: startOfMonthSaoPaulo(now) } } });
  }

  /** Uso do mês, público e o histórico paginado (mais recentes primeiro). */
  async overview(ctx: AdminCtx, q: z.infer<typeof pageSchema> = { page: 1, pageSize: 20 }) {
    const [eff, used, audience, total, items] = await Promise.all([
      effectivePlan(this.prisma, ctx.tenantId),
      this.usedThisMonth(this.prisma, ctx.tenantId),
      this.count(ctx.tenantId, { type: 'all' }).then((c) => c.audience),
      this.prisma.announcement.count({ where: { tenantId: ctx.tenantId } }),
      this.prisma.announcement.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { staffUser: { select: { name: true } } },
      }),
    ]);
    return {
      usage: { used, max: eff.plan.maxAnnouncementsPerMonth },
      audience,
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: items.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        recipients: a.recipients,
        segment: a.segment,
        createdAt: a.createdAt,
        sentBy: a.staffUser.name,
      })),
    };
  }

  async send(ctx: AdminCtx, input: z.infer<typeof announcementSchema>) {
    return this.prisma.$transaction(
      async (tx) => {
        // Trava o estabelecimento: dois envios simultâneos não furam o limite do mês.
        await lockTenant(tx, ctx.tenantId);
        await this.requireSegment(tx, ctx.tenantId, input.segment);
        const { plan } = await effectivePlan(tx, ctx.tenantId);
        const max = plan.maxAnnouncementsPerMonth;
        if (!withinLimit(await this.usedThisMonth(tx, ctx.tenantId), max)) {
          throw new AppError(
            409,
            'ANNOUNCEMENT_LIMIT_REACHED',
            `Seu plano permite ${max === 1 ? '1 notificação' : `${max} notificações`} por mês. O limite renova no dia 1º.`,
            { max },
          );
        }
        const a = await tx.announcement.create({
          data: {
            tenantId: ctx.tenantId,
            staffUserId: ctx.staffUserId,
            title: input.title,
            body: input.body,
            segment: segmentKey(input.segment),
            recipients: 0,
          },
        });
        // Uma notificação por cliente (não por cartão), ligada ao cartão do filtro com a visita mais recente.
        const recipients = await tx.$executeRaw`
          INSERT INTO notifications (id, customer_id, tenant_id, membership_id, announcement_id, kind, title, body, created_at)
          SELECT gen_random_uuid(), m.customer_id, m.tenant_id, m.id, ${a.id}::uuid, 'AVISO'::"NotificationKind", ${input.title}, ${input.body}, now()
          FROM (
            SELECT DISTINCT ON (m.customer_id) m.id, m.customer_id, m.tenant_id
            FROM memberships m
            JOIN customers c ON c.id = m.customer_id AND c.status = 'ACTIVE'
            WHERE m.tenant_id = ${ctx.tenantId}::uuid AND m.marketing_consent = true ${segmentWhere(input.segment)}
            ORDER BY m.customer_id, m.last_visit_at DESC NULLS LAST, m.created_at DESC
          ) m`;
        if (!recipients) {
          throw new AppError(409, 'NO_RECIPIENTS', input.segment.type === 'all'
              ? 'Nenhum cliente aceitou receber promoções ainda. A notificação não foi enviada.'
              : 'Ninguém neste filtro aceitou receber promoções. A notificação não foi enviada.');
        }
        await tx.announcement.update({ where: { id: a.id }, data: { recipients } });
        return { id: a.id, recipients };
      },
      { timeout: 30_000 },
    );
  }
}
