import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PlatformAuditInterceptor } from './platform-audit.interceptor';
import { PlatformKeyGuard } from './platform-key.guard';
import {
  PlatformService,
  createTenantSchema,
  inviteSchema,
  planCodeSchema,
  planSchema,
  storeInputSchema,
  updateTenantSchema,
} from './platform.service';

/** API administrativa da plataforma (seção 5.10). Autenticada por X-Platform-Key. */
@Controller('api/platform')
@UseGuards(PlatformKeyGuard)
@UseInterceptors(PlatformAuditInterceptor)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly loyalty: LoyaltyService,
  ) {}

  @Post('tenants')
  create(@Body(new ZodPipe(createTenantSchema)) body: z.infer<typeof createTenantSchema>) {
    return this.platform.createTenant(body);
  }

  /** Planos de contratação e o limite de programas ativos de cada um. */
  @Get('plans')
  plans() {
    return this.platform.listPlans();
  }

  @Put('plans/:code')
  upsertPlan(@Param('code') code: string, @Body(new ZodPipe(planSchema)) body: z.infer<typeof planSchema>) {
    return this.platform.upsertPlan(planCodeSchema.parse(code), body);
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

  /** RN-72: confere os saldos em cache com a soma do ledger. `?fix=true` corrige divergências. */
  @Post('reconcile')
  @HttpCode(200)
  reconcile(@Query('tenantId') tenantId?: string, @Query('fix') fix?: string) {
    return this.loyalty.reconcile({ tenantId: tenantId || undefined, fix: fix === 'true' });
  }

  @Post('tenants/:id/invites')
  invite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(inviteSchema)) body: z.infer<typeof inviteSchema>,
  ) {
    return this.platform.invite(id, body);
  }
}
