import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { CurrentStaff, Staff, TenantStaff } from '../auth/staff-auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import { CepService } from '../cep/cep.service';
import {
  AdminCtx,
  AdminService,
  brandingUpdateSchema,
  customersQuerySchema,
  ledgerQuerySchema,
  logoUploadSchema,
  stampImageUploadSchema,
  profileUpdateSchema,
  reverseSchema,
  staffInviteSchema,
  staffUpdateSchema,
  storeCreateSchema,
  storeUpdateSchema,
} from './admin.service';
import { ProgramsService, programCreateSchema, programInputSchema } from './programs.service';
import { ReportsService, birthdaysQuerySchema, inactiveQuerySchema, staffReportQuerySchema } from './reports.service';

function ctxOf(s: TenantStaff): AdminCtx {
  return { tenantId: s.context.tenantId, staffUserId: s.userId, membershipId: s.context.membershipId };
}

/** Painel do gestor. Só perfil MANAGER do estabelecimento selecionado. */
@Controller('api/admin')
@Staff({ tenant: true, roles: ['MANAGER'] })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly programsSvc: ProgramsService,
    private readonly reports: ReportsService,
    private readonly cep: CepService,
  ) {}

  /** Endereço pelo CEP, para preencher o cadastro da unidade. */
  @Get('cep/:cep')
  lookupCep(@Param('cep') cep: string) {
    return this.cep.lookup(cep);
  }

  @Get('dashboard')
  dashboard(@CurrentStaff() s: TenantStaff) {
    return this.admin.dashboard(ctxOf(s));
  }

  // ───────────── Programas (limite de ativos definido pelo plano) ─────────────

  @Get('programs')
  programs(@CurrentStaff() s: TenantStaff) {
    return this.programsSvc.list(ctxOf(s));
  }

  @Get('programs/:id')
  program(@CurrentStaff() s: TenantStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.programsSvc.get(ctxOf(s), id);
  }

  @Post('programs')
  createProgram(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(programCreateSchema)) b: z.infer<typeof programCreateSchema>) {
    return this.programsSvc.create(ctxOf(s), b);
  }

  @Put('programs/:id')
  updateProgram(
    @CurrentStaff() s: TenantStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(programInputSchema)) b: z.infer<typeof programInputSchema>,
  ) {
    return this.programsSvc.update(ctxOf(s), id, b);
  }

  @Post('programs/:id/activate')
  @HttpCode(200)
  activateProgram(@CurrentStaff() s: TenantStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.programsSvc.setActive(ctxOf(s), id, true);
  }

  @Post('programs/:id/deactivate')
  @HttpCode(200)
  deactivateProgram(@CurrentStaff() s: TenantStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.programsSvc.setActive(ctxOf(s), id, false);
  }

  @Delete('programs/:id')
  removeProgram(@CurrentStaff() s: TenantStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.programsSvc.remove(ctxOf(s), id);
  }

  @Put('branding')
  updateBranding(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(brandingUpdateSchema)) b: z.infer<typeof brandingUpdateSchema>) {
    return this.admin.updateBranding(ctxOf(s), b);
  }

  @Put('branding/logo')
  setLogo(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(logoUploadSchema)) b: z.infer<typeof logoUploadSchema>) {
    return this.admin.setLogo(ctxOf(s), b.image);
  }

  @Delete('branding/logo')
  removeLogo(@CurrentStaff() s: TenantStaff) {
    return this.admin.setLogo(ctxOf(s), null);
  }

  @Put('branding/stamp-image')
  setStampImage(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(stampImageUploadSchema)) b: z.infer<typeof stampImageUploadSchema>) {
    return this.admin.setStampImage(ctxOf(s), b.image);
  }

  @Delete('branding/stamp-image')
  removeStampImage(@CurrentStaff() s: TenantStaff) {
    return this.admin.setStampImage(ctxOf(s), null);
  }

  // ───────────── Relatórios (Profissional e Rede) ─────────────

  @Get('reports/birthdays')
  birthdays(@CurrentStaff() s: TenantStaff, @Query(new ZodPipe(birthdaysQuerySchema)) q: z.infer<typeof birthdaysQuerySchema>) {
    return this.reports.birthdays(ctxOf(s), q);
  }

  @Get('reports/inactive')
  inactive(@CurrentStaff() s: TenantStaff, @Query(new ZodPipe(inactiveQuerySchema)) q: z.infer<typeof inactiveQuerySchema>) {
    return this.reports.inactive(ctxOf(s), q);
  }

  @Get('reports/staff')
  staffReport(@CurrentStaff() s: TenantStaff, @Query(new ZodPipe(staffReportQuerySchema)) q: z.infer<typeof staffReportQuerySchema>) {
    return this.reports.staff(ctxOf(s), q);
  }

  @Get('network')
  network(@CurrentStaff() s: TenantStaff) {
    return this.reports.network(ctxOf(s));
  }

  @Get('customers/export.csv')
  async exportCustomers(@CurrentStaff() s: TenantStaff, @Res() res: Response) {
    const { csv, filename } = await this.reports.exportCustomers(ctxOf(s));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('plan')
  plan(@CurrentStaff() s: TenantStaff) {
    return this.admin.planInfo(ctxOf(s));
  }

  @Get('profile')
  profile(@CurrentStaff() s: TenantStaff) {
    return this.admin.profile(ctxOf(s));
  }

  @Put('profile')
  updateProfile(@CurrentStaff() s: TenantStaff, @Body(new ZodPipe(profileUpdateSchema)) b: z.infer<typeof profileUpdateSchema>) {
    return this.admin.updateProfile(ctxOf(s), b);
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
