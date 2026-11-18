import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, MailModule],
  controllers: [HealthController],
})
export class AppModule {}
