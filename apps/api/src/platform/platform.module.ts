import { Module } from '@nestjs/common';
import { PlatformAuditInterceptor } from './platform-audit.interceptor';
import { PlatformController } from './platform.controller';
import { PlatformKeyGuard } from './platform-key.guard';
import { PlatformService } from './platform.service';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, PlatformKeyGuard, PlatformAuditInterceptor],
})
export class PlatformModule {}
