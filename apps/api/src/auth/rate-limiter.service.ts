import { Injectable } from '@nestjs/common';
import { tooMany } from '../common/errors';

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const BLOCK_MS = 15 * 60_000;

interface Entry {
  failures: number[];
  blockedUntil?: number;
}

/**
 * RN-13: 5 erros de login em 15 minutos bloqueiam por 15 minutos (por identificador + IP).
 * Em memória: suficiente para uma instância única. Com várias instâncias, mover para Redis.
 */
@Injectable()
export class LoginRateLimiter {
  private readonly entries = new Map<string, Entry>();

  private key(scope: string, identifier: string, ip: string) {
    return `${scope}|${identifier.toLowerCase()}|${ip}`;
  }

  assertAllowed(scope: string, identifier: string, ip: string) {
    const e = this.entries.get(this.key(scope, identifier, ip));
    if (e?.blockedUntil && e.blockedUntil > Date.now()) {
      const minutes = Math.ceil((e.blockedUntil - Date.now()) / 60_000);
      throw tooMany(`Muitas tentativas. Tente novamente em ${minutes} minuto(s).`);
    }
  }

  fail(scope: string, identifier: string, ip: string) {
    const k = this.key(scope, identifier, ip);
    const now = Date.now();
    const e = this.entries.get(k) ?? { failures: [] };
    e.failures = e.failures.filter((t) => now - t < WINDOW_MS);
    e.failures.push(now);
    if (e.failures.length >= MAX_FAILURES) {
      e.blockedUntil = now + BLOCK_MS;
      e.failures = [];
    }
    this.entries.set(k, e);
    if (this.entries.size > 50_000) this.gc();
  }

  succeed(scope: string, identifier: string, ip: string) {
    this.entries.delete(this.key(scope, identifier, ip));
  }

  reset() {
    this.entries.clear();
  }

  private gc() {
    const now = Date.now();
    for (const [k, e] of this.entries) {
      if ((!e.blockedUntil || e.blockedUntil < now) && e.failures.every((t) => now - t > WINDOW_MS)) {
        this.entries.delete(k);
      }
    }
  }
}
