import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { unauthorized } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { COOKIE_NAMES } from './cookies';
import { SessionsService } from './sessions.service';
import { TokensService } from './tokens.service';

export interface CustomerPrincipal {
  id: string;
  sessionId: string;
  name: string;
  email: string | null;
  phoneE164: string | null;
  birthDate: Date | null;
  hasPassword: boolean;
}

declare module 'express' {
  interface Request {
    customer?: CustomerPrincipal;
  }
}

export function bearerOrCookie(req: Request, cookieName: string): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return req.cookies?.[cookieName];
}

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const claims = await this.tokens.verifyAccess(bearerOrCookie(req, COOKIE_NAMES.customer.access) ?? '');
    if (!claims || claims.typ !== 'customer') throw unauthorized();
    const session = await this.sessions.findActive('customer', claims.sid);
    if (!session) throw unauthorized('Sessão expirada.', 'SESSION_EXPIRED');
    const c = await this.prisma.customer.findUnique({ where: { id: claims.sub } });
    if (!c || c.status !== 'ACTIVE') throw unauthorized();
    req.customer = {
      id: c.id,
      sessionId: claims.sid,
      name: c.name,
      email: c.email,
      phoneE164: c.phoneE164,
      birthDate: c.birthDate,
      hasPassword: !!c.passwordHash,
    };
    return true;
  }
}

export const CurrentCustomer = createParamDecorator((_: unknown, ctx: ExecutionContext): CustomerPrincipal => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.customer) throw unauthorized();
  return req.customer;
});
