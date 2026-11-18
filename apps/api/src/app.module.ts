import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { StaffModule } from './staff/staff.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, MailModule, StaffModule, AuthModule, LoyaltyModule, PlatformModule],
  controllers: [HealthController],
})
export class AppModule {}
