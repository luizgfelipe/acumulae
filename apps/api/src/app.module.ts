import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { MailModule } from './mail/mail.module';
import { MeModule } from './me/me.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { StaffModule } from './staff/staff.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RateLimitModule,
    MailModule,
    StaffModule,
    AuthModule,
    LoyaltyModule,
    MeModule,
    NotificationsModule,
    AdminModule,
    PlatformModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
