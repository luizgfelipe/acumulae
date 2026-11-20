import { Module } from '@nestjs/common';
import { AnnouncementsController, MeNotificationsController, MePushController } from './notifications.controller';
import { AnnouncementsService, NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@Module({
  controllers: [MeNotificationsController, MePushController, AnnouncementsController],
  providers: [NotificationsService, AnnouncementsService, PushService],
})
export class NotificationsModule {}
