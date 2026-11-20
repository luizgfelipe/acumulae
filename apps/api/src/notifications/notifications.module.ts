import { Module } from '@nestjs/common';
import { AnnouncementsController, MeNotificationsController } from './notifications.controller';
import { AnnouncementsService, NotificationsService } from './notifications.service';

@Module({
  controllers: [MeNotificationsController, AnnouncementsController],
  providers: [NotificationsService, AnnouncementsService],
})
export class NotificationsModule {}
