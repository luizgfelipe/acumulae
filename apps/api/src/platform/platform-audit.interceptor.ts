import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { clientIp } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE = /pass|secret|token|key/i;

function summarize(body: unknown, depth = 0): unknown {
  if (body === null || typeof body !== 'object' || depth > 3) return body;
  if (Array.isArray(body)) return body.slice(0, 10).map((v) => summarize(v, depth + 1));
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE.test(k) ? '[redacted]' : summarize(v, depth + 1),
    ]),
  );
}

/** RN-96: toda chamada à API administrativa vai para o platform_audit_log. */
@Injectable()
export class PlatformAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PlatformAudit');

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const action = `${req.method} ${req.route?.path ?? req.path}`;
    const params = req.params ?? {};

    const write = (statusCode: number, result?: unknown) => {
      const r = (result ?? {}) as Record<string, unknown>;
      const targetId = (params.id as string) ?? (r.tenantId as string) ?? null;
      this.prisma.platformAuditLog
        .create({
          data: {
            action,
            targetType: 'tenant',
            targetId: targetId && /^[0-9a-f-]{36}$/i.test(targetId) ? targetId : null,
            payloadSummary: summarize(req.body ?? null) as object,
            statusCode,
            sourceIp: clientIp(req),
          },
        })
        .catch((e) => this.logger.error(`Falha ao gravar auditoria: ${e.message}`));
    };

    return next.handle().pipe(
      tap((result) => write(res.statusCode, result)),
      catchError((err) => {
        write(err instanceof HttpException ? err.getStatus() : 500);
        return throwError(() => err);
      }),
    );
  }
}
