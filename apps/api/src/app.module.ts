import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { StaffModule } from './staff/staff.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, MailModule, StaffModule, PlatformModule],
  controllers: [HealthController],
})
export class AppModule {}
