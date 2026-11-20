import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentCustomer, CustomerAuthGuard, CustomerPrincipal } from '../auth/customer-auth.guard';
import { CurrentStaff, Staff, TenantStaff } from '../auth/staff-auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import { AnnouncementsService, NotificationsService, Segment, announcementSchema, notificationsQuerySchema, segmentSchema } from './notifications.service';
import { PushService, pushSubscriptionSchema, pushUnsubscribeSchema } from './push.service';

/** Notificações do cliente (sino do app). */
@Controller('api/me/notifications')
@UseGuards(CustomerAuthGuard)
export class MeNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentCustomer() c: CustomerPrincipal, @Query(new ZodPipe(notificationsQuerySchema)) q: z.infer<typeof notificationsQuerySchema>) {
    return this.notifications.list(c.id, q);
  }

  @Get('unread-count')
  async unread(@CurrentCustomer() c: CustomerPrincipal) {
    return { unread: await this.notifications.unreadCount(c.id) };
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentCustomer() c: CustomerPrincipal) {
    return this.notifications.markAllRead(c.id);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentCustomer() c: CustomerPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(c.id, id);
  }
}

/** Notificações no celular (Web Push): aparelhos do cliente que ativaram. */
@Controller('api/me/push')
@UseGuards(CustomerAuthGuard)
export class MePushController {
  constructor(private readonly push: PushService) {}

  /** Chave pública VAPID; null quando o push não está configurado no servidor. */
  @Get('config')
  config() {
    return this.push.publicConfig();
  }

  @Post('subscriptions')
  @HttpCode(200)
  subscribe(
    @CurrentCustomer() c: CustomerPrincipal,
    @Body(new ZodPipe(pushSubscriptionSchema)) b: z.infer<typeof pushSubscriptionSchema>,
    @Headers('user-agent') ua?: string,
  ) {
    return this.push.subscribe(c.id, b, ua);
  }

  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(@CurrentCustomer() c: CustomerPrincipal, @Body(new ZodPipe(pushUnsubscribeSchema)) b: z.infer<typeof pushUnsubscribeSchema>) {
    return this.push.unsubscribe(c.id, b.endpoint);
  }
}

/** Avisos do estabelecimento aos clientes (painel do gestor). */
@Controller('api/admin/announcements')
@Staff({ tenant: true, roles: ['MANAGER'] })
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@CurrentStaff() s: TenantStaff) {
    return this.announcements.overview({ tenantId: s.context.tenantId, staffUserId: s.userId, membershipId: s.context.membershipId });
  }

  /** Prévia do envio para um filtro dos relatórios (?type=birthdays&month=11 ou ?type=inactive&days=30). */
  @Get('preview')
  preview(@CurrentStaff() s: TenantStaff, @Query(new ZodPipe(segmentSchema)) q: Segment) {
    return this.announcements.preview({ tenantId: s.context.tenantId, staffUserId: s.userId, membershipId: s.context.membershipId }, q);
  }

  @Post()
  send(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(announcementSchema)) b: z.infer<typeof announcementSchema>) {
    return this.announcements.send({ tenantId: s.context.tenantId, staffUserId: s.userId, membershipId: s.context.membershipId }, b);
  }
}
