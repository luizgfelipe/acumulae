import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PlatformAuditInterceptor } from './platform-audit.interceptor';
import { PlatformKeyGuard } from './platform-key.guard';
import {
  PlatformService,
  createTenantSchema,
  inviteSchema,
  storeInputSchema,
  updateTenantSchema,
} from './platform.service';

/** API administrativa da plataforma (seção 5.10). Autenticada por X-Platform-Key. */
@Controller('api/platform')
@UseGuards(PlatformKeyGuard)
@UseInterceptors(PlatformAuditInterceptor)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Post('tenants')
  create(@Body(new ZodPipe(createTenantSchema)) body: z.infer<typeof createTenantSchema>) {
    return this.platform.createTenant(body);
  }

  @Get('tenants')
  list() {
    return this.platform.list();
  }

  @Get('tenants/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.get(id);
  }

  @Patch('tenants/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateTenantSchema)) body: z.infer<typeof updateTenantSchema>,
  ) {
    return this.platform.update(id, body);
  }

  @Post('tenants/:id/suspend')
  @HttpCode(200)
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.setStatus(id, 'SUSPENDED');
  }

  @Post('tenants/:id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.setStatus(id, 'ACTIVE');
  }

  @Post('tenants/:id/stores')
  addStore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(storeInputSchema)) body: z.infer<typeof storeInputSchema>,
  ) {
    return this.platform.addStore(id, body);
  }

  @Post('tenants/:id/invites')
  invite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(inviteSchema)) body: z.infer<typeof inviteSchema>,
  ) {
    return this.platform.invite(id, body);
  }
}
