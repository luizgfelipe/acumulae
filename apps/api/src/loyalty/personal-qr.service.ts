import { Injectable } from '@nestjs/common';
import { config } from '../common/config';
import { hmac } from '../common/crypto';

export const QR_PERIOD_SECONDS = 30;
/** Tolerância após a virada do período (tempo entre a tela do cliente e a leitura). */
const GRACE_SECONDS = 5;
const PREFIX = 'AC1';

/**
 * QR pessoal dinâmico (RN-51): `AC1.{customerId}.{período}.{assinatura}`.
 * Muda a cada 30 s e é assinado com HMAC pelo servidor; um print deixa de valer em até ~35 s.
 */
@Injectable()
export class PersonalQrService {
  private sign(customerId: string, step: number) {
    return hmac(config.qrSecret, `${PREFIX}.${customerId}.${step}`).subarray(0, 12).toString('base64url');
  }

  issue(customerId: string, now = Date.now()) {
    const step = Math.floor(now / 1000 / QR_PERIOD_SECONDS);
    const expiresAtMs = (step + 1) * QR_PERIOD_SECONDS * 1000;
    return {
      payload: `${PREFIX}.${customerId}.${step}.${this.sign(customerId, step)}`,
      expiresAt: new Date(expiresAtMs).toISOString(),
      periodSeconds: QR_PERIOD_SECONDS,
    };
  }

  /** Devolve o customerId se o QR for válido agora; senão null. */
  verify(payload: string, now = Date.now()): string | null {
    const parts = payload.trim().split('.');
    if (parts.length !== 4 || parts[0] !== PREFIX) return null;
    const [, customerId, stepStr, sig] = parts;
    const step = Number(stepStr);
    if (!/^[0-9a-f-]{36}$/i.test(customerId) || !Number.isInteger(step)) return null;
    const validFrom = step * QR_PERIOD_SECONDS * 1000;
    const validUntil = (step + 1) * QR_PERIOD_SECONDS * 1000 + GRACE_SECONDS * 1000;
    if (now < validFrom - GRACE_SECONDS * 1000 || now > validUntil) return null;
    const expected = this.sign(customerId, step);
    if (expected.length !== sig.length) return null;
    // comparação em tempo constante
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0 ? customerId : null;
  }
}
