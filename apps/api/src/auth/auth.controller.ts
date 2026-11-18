import { Body, Controller, Get, HttpCode, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../common/config';
import { clientIp, deviceLabel } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { COOKIE_NAMES, clearAuthCookies, oauthCookieOptions, setAuthCookies } from './cookies';
import {
  CustomerAuthService,
  forgotSchema,
  loginSchema,
  publicCustomer,
  registerSchema,
  resetSchema,
} from './customer-auth.service';
import { OAuthService, ProviderKey } from './oauth.service';
import { SessionsService } from './sessions.service';
import { TokensService } from './tokens.service';

const OAUTH_COOKIE = 'acu_oauth';
const LINK_COOKIE = 'acu_link';

/** Aceita apenas caminhos relativos do próprio app (evita open redirect). */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next.slice(0, 300);
}

interface OAuthState {
  state: string;
  nonce: string;
  next: string;
  provider: ProviderKey;
}

interface PendingLink {
  provider: 'GOOGLE' | 'APPLE';
  subject: string;
  email: string;
}

/** Autenticação do cliente (seção 5.2). */
@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly auth: CustomerAuthService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokensService,
    private readonly oauth: OAuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('providers')
  providers() {
    return { google: this.oauth.enabled('google'), apple: this.oauth.enabled('apple') };
  }

  @Post('register')
  async register(
    @Body(new ZodPipe(registerSchema)) body: z.infer<typeof registerSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { customer, session } = await this.auth.register(body, deviceLabel(req));
    setAuthCookies(res, 'customer', session.accessToken, session.refreshToken);
    return { customer: publicCustomer(customer) };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { customer, session } = await this.auth.login(body, clientIp(req), deviceLabel(req));
    const pending = await this.tokens.verifyShort<PendingLink>('link', req.cookies?.[LINK_COOKIE]);
    if (pending) {
      await this.auth.linkPendingIdentity(customer, pending);
      res.clearCookie(LINK_COOKIE, { path: '/api/auth' });
    }
    setAuthCookies(res, 'customer', session.accessToken, session.refreshToken);
    return { customer: publicCustomer(customer) };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const s = await this.sessions.refresh('customer', req.cookies?.[COOKIE_NAMES.customer.refresh]);
      setAuthCookies(res, 'customer', s.accessToken, s.refreshToken);
      return { ok: true };
    } catch (e) {
      clearAuthCookies(res, 'customer');
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revokeByToken('customer', req.cookies?.[COOKIE_NAMES.customer.refresh]);
    clearAuthCookies(res, 'customer');
    return { ok: true };
  }

  @Post('password/forgot')
  @HttpCode(200)
  async forgot(@Body(new ZodPipe(forgotSchema)) body: z.infer<typeof forgotSchema>) {
    await this.auth.forgot(body.identifier);
    return { message: 'Se houver uma conta, enviamos um link para o e-mail cadastrado.' };
  }

  @Post('password/reset')
  @HttpCode(200)
  async reset(@Body(new ZodPipe(resetSchema)) body: z.infer<typeof resetSchema>, @Res({ passthrough: true }) res: Response) {
    await this.auth.reset(body.token, body.password);
    clearAuthCookies(res, 'customer');
    return { ok: true };
  }

  // ───────────── Login social ─────────────

  @Get('oauth2/:provider')
  async start(@Param('provider') provider: string, @Query('next') next: string, @Res() res: Response) {
    this.oauth.assertEnabled(provider);
    const { state, nonce } = this.oauth.newStateAndNonce();
    const cookie = await this.tokens.signShort('oauth', { state, nonce, next: safeNext(next), provider }, 600);
    res.cookie(OAUTH_COOKIE, cookie, oauthCookieOptions());
    res.redirect(302, this.oauth.authorizationUrl(provider, state, nonce));
  }

  @Get('oauth2/google/callback')
  googleCallback(@Query() q: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    return this.finish('google', q, req, res);
  }

  /** A Apple usa response_mode=form_post. */
  @Post('oauth2/apple/callback')
  appleCallback(@Body() body: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    return this.finish('apple', body, req, res);
  }

  private async finish(provider: ProviderKey, params: Record<string, string>, req: Request, res: Response) {
    const app = config.publicUrl;
    const st = await this.tokens.verifyShort<OAuthState>('oauth', req.cookies?.[OAUTH_COOKIE]);
    res.clearCookie(OAUTH_COOKIE, { ...oauthCookieOptions(), maxAge: undefined });
    if (!st || st.provider !== provider || !params.state || st.state !== params.state || !params.code) {
      return res.redirect(302, `${app}/entrar?erro=oauth`);
    }
    try {
      const profile = await this.oauth.exchange(provider, params.code, st.nonce, params.user);
      const result = await this.auth.resolveSocial(profile);
      if (result.kind === 'needs-password-link') {
        const link = await this.tokens.signShort(
          'link',
          { provider: profile.provider, subject: profile.subject, email: result.email },
          900,
        );
        res.cookie(LINK_COOKIE, link, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/api/auth', maxAge: 900_000 });
        const qs = new URLSearchParams({ vincular: '1', email: result.email, next: st.next });
        return res.redirect(302, `${app}/entrar?${qs}`);
      }
      const session = await this.sessions.create('customer', result.customer.id, deviceLabel(req));
      setAuthCookies(res, 'customer', session.accessToken, session.refreshToken);
      const complete = publicCustomer(result.customer).profileComplete;
      const target = complete ? st.next : `/completar-perfil?next=${encodeURIComponent(st.next)}`;
      return res.redirect(302, `${app}${target}`);
    } catch (e) {
      this.logger.warn(`Login social (${provider}) falhou: ${(e as Error).message}`);
      return res.redirect(302, `${app}/entrar?erro=oauth`);
    }
  }
}
