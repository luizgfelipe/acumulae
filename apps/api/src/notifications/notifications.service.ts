import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AdminCtx } from '../admin/admin.service';
import { logoUrlOf } from '../common/branding';
import { AppError } from '../common/errors';
import { startOfMonthSaoPaulo } from '../common/time';
import { effectivePlan, lockTenant, withinLimit } from '../plans/plans';
import { PrismaService } from '../prisma/prisma.service';

export const notificationsQuerySchema = z.object({
  /** Id da última notificação da página anterior. */
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(3).max(500),
});

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

  /** Clientes ativos que aceitaram promoções (um cliente com 2 cartões conta 1). */
  private async audience(tenantId: string) {
    const rows = await this.prisma.membership.groupBy({
      by: ['customerId'],
      where: { tenantId, marketingConsent: true, customer: { status: 'ACTIVE' } },
    });
    return rows.length;
  }

  private usedThisMonth(db: Pick<PrismaService, 'announcement'>, tenantId: string, now = new Date()) {
    return db.announcement.count({ where: { tenantId, createdAt: { gte: startOfMonthSaoPaulo(now) } } });
  }

  async overview(ctx: AdminCtx) {
    const [eff, used, audience, items] = await Promise.all([
      effectivePlan(this.prisma, ctx.tenantId),
      this.usedThisMonth(this.prisma, ctx.tenantId),
      this.audience(ctx.tenantId),
      this.prisma.announcement.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { staffUser: { select: { name: true } } },
      }),
    ]);
    return {
      usage: { used, max: eff.plan.maxAnnouncementsPerMonth },
      audience,
      items: items.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        recipients: a.recipients,
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
        const { plan } = await effectivePlan(tx, ctx.tenantId);
        const max = plan.maxAnnouncementsPerMonth;
        if (!withinLimit(await this.usedThisMonth(tx, ctx.tenantId), max)) {
          throw new AppError(
            409,
            'ANNOUNCEMENT_LIMIT_REACHED',
            `Seu plano permite ${max === 1 ? '1 aviso' : `${max} avisos`} por mês. O limite renova no dia 1º.`,
            { max },
          );
        }
        const a = await tx.announcement.create({
          data: { tenantId: ctx.tenantId, staffUserId: ctx.staffUserId, title: input.title, body: input.body, recipients: 0 },
        });
        // Uma notificação por cliente (não por cartão), ligada ao cartão com a visita mais recente.
        const recipients = await tx.$executeRaw`
          INSERT INTO notifications (id, customer_id, tenant_id, membership_id, announcement_id, kind, title, body, created_at)
          SELECT gen_random_uuid(), m.customer_id, m.tenant_id, m.id, ${a.id}::uuid, 'AVISO'::"NotificationKind", ${input.title}, ${input.body}, now()
          FROM (
            SELECT DISTINCT ON (customer_id) id, customer_id, tenant_id
            FROM memberships
            WHERE tenant_id = ${ctx.tenantId}::uuid AND marketing_consent = true
            ORDER BY customer_id, last_visit_at DESC NULLS LAST, created_at DESC
          ) m
          JOIN customers c ON c.id = m.customer_id AND c.status = 'ACTIVE'`;
        if (!recipients) {
          throw new AppError(409, 'NO_RECIPIENTS', 'Nenhum cliente aceitou receber promoções ainda. O aviso não foi enviado.');
        }
        await tx.announcement.update({ where: { id: a.id }, data: { recipients } });
        return { id: a.id, recipients };
      },
      { timeout: 30_000 },
    );
  }
}
