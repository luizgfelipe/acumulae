import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentStaff, Staff, TenantStaff } from '../auth/staff-auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import {
  AdminCtx,
  AdminService,
  brandingUpdateSchema,
  customersQuerySchema,
  ledgerQuerySchema,
  programUpdateSchema,
  reverseSchema,
  staffInviteSchema,
  staffUpdateSchema,
  storeCreateSchema,
  storeUpdateSchema,
} from './admin.service';

function ctxOf(s: TenantStaff): AdminCtx {
  return { tenantId: s.context.tenantId, staffUserId: s.userId, membershipId: s.context.membershipId };
}

/** Painel do gestor. Só perfil MANAGER do estabelecimento selecionado. */
@Controller('api/admin')
@Staff({ tenant: true, roles: ['MANAGER'] })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  dashboard(@CurrentStaff() s: TenantStaff) {
    return this.admin.dashboard(ctxOf(s));
  }

  @Get('program')
  program(@CurrentStaff() s: TenantStaff) {
    return this.admin.getProgram(ctxOf(s));
  }

  @Put('program')
  updateProgram(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(programUpdateSchema)) b: z.infer<typeof programUpdateSchema>) {
    return this.admin.updateProgram(ctxOf(s), b);
  }

  @Put('branding')
  updateBranding(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(brandingUpdateSchema)) b: z.infer<typeof brandingUpdateSchema>) {
    return this.admin.updateBranding(ctxOf(s), b);
  }

  @Get('stores')
  stores(@CurrentStaff() s: TenantStaff) {
    return this.admin.stores(ctxOf(s));
  }

  @Post('stores')
  createStore(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(storeCreateSchema)) b: z.infer<typeof storeCreateSchema>) {
    return this.admin.createStore(ctxOf(s), b);
  }

  @Patch('stores/:id')
  updateStore(
    @CurrentStaff() s: TenantStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(storeUpdateSchema)) b: z.infer<typeof storeUpdateSchema>,
  ) {
    return this.admin.updateStore(ctxOf(s), id, b);
  }

  @Get('staff')
  staff(@CurrentStaff() s: TenantStaff) {
    return this.admin.staff(ctxOf(s));
  }

  @Post('staff')
  invite(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(staffInviteSchema)) b: z.infer<typeof staffInviteSchema>) {
    return this.admin.inviteStaff(ctxOf(s), b);
  }

  @Patch('staff/:membershipId')
  updateStaff(
    @CurrentStaff() s: TenantStaff,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(staffUpdateSchema)) b: z.infer<typeof staffUpdateSchema>,
  ) {
    return this.admin.updateStaff(ctxOf(s), id, b);
  }

  @Get('customers')
  customers(@CurrentStaff() s: TenantStaff, @Query(new ZodPipe(customersQuerySchema)) q: z.infer<typeof customersQuerySchema>) {
    return this.admin.customers(ctxOf(s), q);
  }

  @Get('customers/:membershipId')
  customer(@CurrentStaff() s: TenantStaff, @Param('membershipId', ParseUUIDPipe) id: string) {
    return this.admin.customer(ctxOf(s), id);
  }

  @Get('ledger')
  ledger(@CurrentStaff() s: TenantStaff, @Query(new ZodPipe(ledgerQuerySchema)) q: z.infer<typeof ledgerQuerySchema>) {
    return this.admin.ledger(ctxOf(s), q);
  }

  @Post('ledger/:entryId/reverse')
  @HttpCode(200)
  reverse(
    @CurrentStaff() s: TenantStaff,
    @Param('entryId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reverseSchema)) b: z.infer<typeof reverseSchema>,
  ) {
    return this.admin.reverse(ctxOf(s), id, b.reason);
  }
}
