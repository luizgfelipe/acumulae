import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentCustomer, CustomerAuthGuard, CustomerPrincipal } from '../auth/customer-auth.guard';
import { CurrentStaff, Staff, TenantStaff } from '../auth/staff-auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import { AnnouncementsService, NotificationsService, announcementSchema, notificationsQuerySchema } from './notifications.service';

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

/** Avisos do estabelecimento aos clientes (painel do gestor). */
@Controller('api/admin/announcements')
@Staff({ tenant: true, roles: ['MANAGER'] })
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@CurrentStaff() s: TenantStaff) {
    return this.announcements.overview({ tenantId: s.context.tenantId, staffUserId: s.userId, membershipId: s.context.membershipId });
  }

  @Post()
  send(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(announcementSchema)) b: z.infer<typeof announcementSchema>) {
    return this.announcements.send({ tenantId: s.context.tenantId, staffUserId: s.userId, membershipId: s.context.membershipId }, b);
  }
}
