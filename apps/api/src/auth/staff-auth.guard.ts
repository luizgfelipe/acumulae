import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole, TenantStatus } from '@prisma/client';
import { Request } from 'express';
import { AppError, forbidden, unauthorized } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { bearerOrCookie } from './customer-auth.guard';
import { COOKIE_NAMES } from './cookies';
import { SessionsService } from './sessions.service';
import { TokensService } from './tokens.service';

export interface StaffContext {
  tenantId: string;
  tenantName: string;
  tenantStatus: TenantStatus;
  membershipId: string;
  role: StaffRole;
  /** null = todas as unidades (gestor). */
  allowedStoreIds: string[] | null;
  storeId: string | null;
}

export interface StaffPrincipal {
  userId: string;
  sessionId: string;
  name: string;
  email: string;
  context: StaffContext | null;
}

/** Contexto garantido nos endpoints com tenant obrigatório. */
export type TenantStaff = StaffPrincipal & { context: StaffContext };
export type StoreStaff = StaffPrincipal & { context: StaffContext & { storeId: string } };

declare module 'express' {
  interface Request {
    staff?: StaffPrincipal;
  }
}

export interface StaffGuardOptions {
  /** Exige estabelecimento selecionado e ativo. Padrão: true. */
  tenant?: boolean;
  /** Exige unidade selecionada (caixa). */
  store?: boolean;
  roles?: StaffRole[];
}

const STAFF_OPTIONS = 'acumulae:staff-options';

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts: StaffGuardOptions = {
      tenant: true,
      ...(this.reflector.getAllAndOverride<StaffGuardOptions>(STAFF_OPTIONS, [ctx.getHandler(), ctx.getClass()]) ?? {}),
    };
    const req = ctx.switchToHttp().getRequest<Request>();
    const claims = await this.tokens.verifyAccess(bearerOrCookie(req, COOKIE_NAMES.staff.access) ?? '');
    if (!claims || claims.typ !== 'staff') throw unauthorized();
    const session = await this.sessions.findActive('staff', claims.sid);
    if (!session) throw unauthorized('Sessão expirada.', 'SESSION_EXPIRED');
    const user = await this.prisma.staffUser.findUnique({ where: { id: claims.sub } });
    if (!user || user.status !== 'ACTIVE') throw unauthorized();

    let context: StaffContext | null = null;
    if (session.tenantId) {
      const m = await this.prisma.staffMembership.findUnique({
        where: { staffUserId_tenantId: { staffUserId: user.id, tenantId: session.tenantId } },
        include: { tenant: true, storeAccess: true },
      });
      if (m && m.status === 'ACTIVE') {
        const allowed = m.role === 'MANAGER' ? null : m.storeAccess.map((a) => a.storeId);
        const storeOk = session.storeId && (allowed === null || allowed.includes(session.storeId));
        context = {
          tenantId: m.tenantId,
          tenantName: m.tenant.name,
          tenantStatus: m.tenant.status,
          membershipId: m.id,
          role: m.role,
          allowedStoreIds: allowed,
          storeId: storeOk ? session.storeId! : null,
        };
      }
    }

    req.staff = { userId: user.id, sessionId: claims.sid, name: user.name, email: user.email, context };

    if (opts.tenant) {
      if (!context) throw forbidden('Selecione o estabelecimento.', 'NO_TENANT_CONTEXT');
      if (context.tenantStatus !== 'ACTIVE') {
        throw new AppError(403, 'TENANT_SUSPENDED', 'Este estabelecimento está suspenso. Fale com o suporte do Acumulae.');
      }
      if (opts.roles?.length && !opts.roles.includes(context.role)) throw forbidden('Seu perfil não tem acesso a esta área.');
      if (opts.store) {
        if (!context.storeId) throw forbidden('Selecione a unidade.', 'NO_STORE_CONTEXT');
        const store = await this.prisma.store.findUnique({ where: { id: context.storeId } });
        if (!store || store.tenantId !== context.tenantId || store.status !== 'ACTIVE') {
          throw forbidden('Unidade inativa.', 'STORE_INACTIVE');
        }
      }
    }
    return true;
  }
}

/** Protege um controller/rota para funcionários. */
export function Staff(options: StaffGuardOptions = {}) {
  return applyDecorators(SetMetadata(STAFF_OPTIONS, options), UseGuards(StaffGuard));
}

export const CurrentStaff = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.staff) throw unauthorized();
  return req.staff;
});
