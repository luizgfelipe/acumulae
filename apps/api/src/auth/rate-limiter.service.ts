import { Injectable } from '@nestjs/common';
import { LimitRule, RateLimitStore } from '../rate-limit/rate-limit.store';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** RN-13: 5 erros em 15 min bloqueiam aquele identificador naquele IP. O bloqueio dobra a cada reincidência. */
export const LOGIN_PAIR: LimitRule = { name: 'login:pair', windowMs: 15 * MIN, max: 5, blockMs: 15 * MIN, maxBlockMs: 24 * HOUR };

/** RN-13: 30 erros em 1 h vindos de um IP, somando todas as contas (tentar uma senha em muitas contas). */
export const LOGIN_IP: LimitRule = { name: 'login:ip', windowMs: HOUR, max: 30, blockMs: HOUR, maxBlockMs: 24 * HOUR };

export type LoginScope = 'customer' | 'staff';

/**
 * Limite de tentativas de login (RN-13). O `identifier` já deve vir normalizado (e-mail em minúsculas,
 * telefone em E.164), senão variações de escrita do mesmo identificador ganhariam contadores novos.
 */
@Injectable()
export class LoginRateLimiter {
  constructor(private readonly store: RateLimitStore) {}

  private pair(scope: LoginScope, identifier: string, ip: string) {
    return `${scope}|${identifier}|${ip}`;
  }

  assertAllowed(scope: LoginScope, identifier: string, ip: string) {
    this.store.assert(LOGIN_IP, ip);
    this.store.assert(LOGIN_PAIR, this.pair(scope, identifier, ip));
  }

  fail(scope: LoginScope, identifier: string, ip: string) {
    this.store.hit(LOGIN_IP, ip);
    this.store.hit(LOGIN_PAIR, this.pair(scope, identifier, ip));
  }

  /**
   * Login certo zera os erros daquele identificador naquele IP. O contador do IP continua:
   * senão quem tem uma conta válida a usaria para zerá-lo entre as tentativas nas outras.
   */
  succeed(scope: LoginScope, identifier: string, ip: string) {
    this.store.clear(LOGIN_PAIR, this.pair(scope, identifier, ip));
  }

  reset() {
    this.store.reset();
  }
}
