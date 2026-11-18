import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { config } from '../common/config';
import { safeEqual } from '../common/crypto';
import { AppError, forbidden, unauthorized } from '../common/errors';
import { clientIp } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';

/**
 * RN-91: /api/platform/** só aceita a chave da plataforma no header X-Platform-Key
 * (comparada em tempo constante). Não aceita sessão de cliente nem de funcionário.
 * Tentativas recusadas também vão para o log de auditoria (RN-96).
 */
@Injectable()
export class PlatformKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const expected = config.platformApiKey;
    const given = req.header('x-platform-key') ?? '';

    let error: AppError | null = null;
    if (!expected || !given || !safeEqual(given, expected)) {
      error = unauthorized('Chave da plataforma inválida.', 'INVALID_PLATFORM_KEY');
    } else {
      const allowed = config.platformAllowedIps;
      if (allowed.length && !allowed.includes(clientIp(req))) {
        error = forbidden('IP de origem não autorizado.', 'IP_NOT_ALLOWED');
      }
    }

    if (error) {
      await this.prisma.platformAuditLog
        .create({
          data: {
            action: `${req.method} ${req.path} [recusado]`,
            statusCode: error.getStatus(),
            sourceIp: clientIp(req),
          },
        })
        .catch(() => undefined);
      throw error;
    }
    return true;
  }
}
