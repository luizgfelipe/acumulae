import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { clientIp, deviceLabel } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { COOKIE_NAMES, clearAuthCookies, setAuthCookies } from './cookies';
import { SessionsService } from './sessions.service';
import { CurrentStaff, Staff, StaffPrincipal } from './staff-auth.guard';
import {
  StaffAuthService,
  acceptInviteSchema,
  staffContextSchema,
  staffForgotSchema,
  staffLoginSchema,
  staffResetSchema,
} from './staff-auth.service';

/** Autenticação de atendentes e gestores (caixa e painel). */
@Controller('api/staff')
export class StaffAuthController {
  constructor(
    private readonly staffAuth: StaffAuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(staffLoginSchema)) body: z.infer<typeof staffLoginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, session } = await this.staffAuth.login(body, clientIp(req), deviceLabel(req));
    setAuthCookies(res, 'staff', session.accessToken, session.refreshToken);
    return this.staffAuth.me(user.id, session.sessionId);
  }

  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const s = await this.sessions.refresh('staff', req.cookies?.[COOKIE_NAMES.staff.refresh]);
      setAuthCookies(res, 'staff', s.accessToken, s.refreshToken);
      return { ok: true };
    } catch (e) {
      clearAuthCookies(res, 'staff');
      throw e;
    }
  }

  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revokeByToken('staff', req.cookies?.[COOKIE_NAMES.staff.refresh]);
    clearAuthCookies(res, 'staff');
    return { ok: true };
  }

  @Get('auth/me')
  @Staff({ tenant: false })
  me(@CurrentStaff() staff: StaffPrincipal) {
    return this.staffAuth.me(staff.userId, staff.sessionId);
  }

  /** Seleção do estabelecimento/unidade (tela de caixa, seção 7.2). */
  @Post('auth/context')
  @HttpCode(200)
  @Staff({ tenant: false })
  async context(
    @CurrentStaff() staff: StaffPrincipal,
    @Body(new ZodPipe(staffContextSchema)) body: z.infer<typeof staffContextSchema>,
  ) {
    await this.staffAuth.setContext(staff.userId, staff.sessionId, body.tenantId, body.storeId);
    return this.staffAuth.me(staff.userId, staff.sessionId);
  }

  @Post('auth/password/forgot')
  @HttpCode(200)
  async forgot(@Body(new ZodPipe(staffForgotSchema)) body: z.infer<typeof staffForgotSchema>) {
    await this.staffAuth.forgot(body.email);
    return { message: 'Se houver uma conta, enviamos um link para o e-mail.' };
  }

  @Post('auth/password/reset')
  @HttpCode(200)
  async reset(@Body(new ZodPipe(staffResetSchema)) body: z.infer<typeof staffResetSchema>) {
    await this.staffAuth.reset(body.token, body.password);
    return { ok: true };
  }

  @Get('invites/:token')
  inviteInfo(@Param('token') token: string) {
    return this.staffAuth.inviteInfo(token);
  }

  @Post('invites/:token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body(new ZodPipe(acceptInviteSchema)) body: z.infer<typeof acceptInviteSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, session } = await this.staffAuth.acceptInvite(token, body, deviceLabel(req));
    setAuthCookies(res, 'staff', session.accessToken, session.refreshToken);
    return this.staffAuth.me(user.id, session.sessionId);
  }
}
