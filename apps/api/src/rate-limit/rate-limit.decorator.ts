import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable, catchError, throwError } from 'rxjs';
import { clientIp } from '../common/request';
import { LimitRule, RateLimitStore } from './rate-limit.store';

/** Limite de uma rota, por IP. `all` conta toda chamada; `failure`, só as respostas 4xx (exceto 429). */
export interface RouteLimit {
  rule: LimitRule;
  countOn: 'all' | 'failure';
}

const ROUTE_LIMITS = 'acumulae:route-limits';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const limits = this.reflector.get<RouteLimit[]>(ROUTE_LIMITS, ctx.getHandler()) ?? [];
    const ip = clientIp(ctx.switchToHttp().getRequest<Request>());
    for (const l of limits) this.store.assert(l.rule, ip);
    for (const l of limits) if (l.countOn === 'all') this.store.hit(l.rule, ip);
    return next.handle().pipe(
      catchError((err: unknown) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        if (status >= 400 && status < 500 && status !== 429) {
          for (const l of limits) if (l.countOn === 'failure') this.store.hit(l.rule, ip);
        }
        return throwError(() => err);
      }),
    );
  }
}

/** Aplica limites por IP à rota (ver limits.ts). */
export const RateLimit = (...limits: RouteLimit[]) =>
  applyDecorators(SetMetadata(ROUTE_LIMITS, limits), UseInterceptors(RateLimitInterceptor));
