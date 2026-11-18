import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Token opaco aleatório em base62. 22 caracteres ≈ 131 bits (RN-43). */
export function randomToken(length = 22): string {
  const out: string[] = [];
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      // rejeição para evitar viés de módulo (248 = 4 × 62)
      if (b < 248 && out.length < length) out.push(BASE62[b % 62]);
    }
  }
  return out.join('');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmac(secret: string, value: string): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

/** Comparação em tempo constante (compara os digests para igualar o tamanho). */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}
