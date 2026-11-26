import { Injectable } from '@nestjs/common';
import { LimitRule, RateLimitStore } from '../rate-limit/rate-limit.store';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** RN-13: 5 erros em 15 min bloqueiam aquele identificador naquele IP. O bloqueio dobra a cada reincidência. */
export const LOGIN_PAIR: LimitRule = { name: 'login:pair', windowMs: 15 * MIN, max: 5, blockMs: 15 * MIN, maxBlockMs: 24 * HOUR };

/** RN-13: 30 erros em 1 h vindos de um IP, somando todas as contas (tentar uma senha em muitas contas). */
export const LOGIN_IP: LimitRule = { name: 'login:ip', windowMs: HOUR, max: 30, blockMs: HOUR, maxBlockMs: 24 * HOUR };

/**
 * RN-13: 20 erros em 1 h numa conta, somando todos os IPs (ataque distribuído). Não bloqueia a conta,
 * senão qualquer um travaria a conta dos outros: pausa o login só a partir de IPs onde ela nunca entrou.
 */
export const LOGIN_ACCOUNT: LimitRule = { name: 'login:account', windowMs: HOUR, max: 20, blockMs: HOUR, maxBlockMs: 24 * HOUR };

/** "Esqueci minha senha": 3 pedidos por identificador em 1 h (evita encher a caixa de e-mail de alguém). */
export const FORGOT_ID: LimitRule = { name: 'forgot:id', windowMs: HOUR, max: 3, blockMs: HOUR };

/** "Esqueci minha senha": 10 pedidos por IP em 1 h, somando todas as contas (protege o envio de e-mails). */
export const FORGOT_IP: LimitRule = { name: 'forgot:ip', windowMs: HOUR, max: 10, blockMs: HOUR, maxBlockMs: 24 * HOUR };

const FORGOT_MESSAGE = (wait: string) =>
  `Muitos pedidos de redefinição de senha. Confira seu e-mail (inclusive o spam) ou tente de novo em ${wait}.`;

/** IPs onde cada conta já entrou, guardados para a pausa do LOGIN_ACCOUNT. */
const KNOWN_IPS_PER_ACCOUNT = 10;
const MAX_KNOWN_ACCOUNTS = 100_000;

export type LoginScope = 'customer' | 'staff';

/**
 * Limite de tentativas de login (RN-13). O `identifier` já deve vir normalizado (e-mail em minúsculas,
 * telefone em E.164), senão variações de escrita do mesmo identificador ganhariam contadores novos.
 * Em memória, como o RateLimitStore: os IPs conhecidos se perdem quando a API reinicia.
 */
@Injectable()
export class LoginRateLimiter {
  private readonly knownIps = new Map<string, string[]>();

  constructor(private readonly store: RateLimitStore) {}

  private pair(scope: LoginScope, identifier: string, ip: string) {
    return `${scope}|${identifier}|${ip}`;
  }

  private account(scope: LoginScope, identifier: string) {
    return `${scope}|${identifier}`;
  }

  assertAllowed(scope: LoginScope, identifier: string, ip: string) {
    this.store.assert(LOGIN_IP, ip);
    this.store.assert(LOGIN_PAIR, this.pair(scope, identifier, ip));
    const acc = this.account(scope, identifier);
    if (!this.knownIps.get(acc)?.includes(ip)) {
      this.store.assert(
        LOGIN_ACCOUNT,
        acc,
        (wait) =>
          `Por segurança, depois de muitas tentativas erradas, esta conta está com o login pausado em novos aparelhos e redes. ` +
          `Tente de novo em ${wait} ou redefina a senha em "Esqueci minha senha".`,
      );
    }
  }

  /** Registra o erro. `accountPausedMs` > 0 quando este erro acabou de pausar a conta: hora de avisar o dono. */
  fail(scope: LoginScope, identifier: string, ip: string): { accountPausedMs: number } {
    this.store.hit(LOGIN_IP, ip);
    this.store.hit(LOGIN_PAIR, this.pair(scope, identifier, ip));
    const acc = this.account(scope, identifier);
    const paused = this.store.hit(LOGIN_ACCOUNT, acc);
    return { accountPausedMs: paused ? this.store.blockedFor(LOGIN_ACCOUNT, acc) : 0 };
  }

  /**
   * Login certo zera os erros daquele identificador naquele IP e guarda o IP como conhecido. O contador do IP
   * continua: senão quem tem uma conta válida a usaria para zerá-lo entre as tentativas nas outras.
   */
  succeed(scope: LoginScope, identifier: string, ip: string) {
    this.store.clear(LOGIN_PAIR, this.pair(scope, identifier, ip));
    const acc = this.account(scope, identifier);
    const ips = (this.knownIps.get(acc) ?? []).filter((i) => i !== ip);
    ips.push(ip);
    this.knownIps.delete(acc); // reinsere no fim: o Map fica em ordem de uso
    this.knownIps.set(acc, ips.slice(-KNOWN_IPS_PER_ACCOUNT));
    if (this.knownIps.size > MAX_KNOWN_ACCOUNTS) this.knownIps.delete(this.knownIps.keys().next().value!);
  }

  /**
   * Pedido de "esqueci minha senha". Conta todos os pedidos, existindo a conta ou não:
   * o limite não revela quais contas existem.
   */
  forgot(scope: LoginScope, identifier: string, ip: string) {
    const key = this.account(scope, identifier);
    this.store.assert(FORGOT_IP, ip, FORGOT_MESSAGE);
    this.store.assert(FORGOT_ID, key, FORGOT_MESSAGE);
    this.store.hit(FORGOT_IP, ip);
    this.store.hit(FORGOT_ID, key);
  }

  /** Senha redefinida: o dono provou o acesso ao e-mail, então a pausa da conta acaba. */
  clearAccount(scope: LoginScope, identifiers: (string | null | undefined)[]) {
    for (const id of identifiers) if (id) this.store.clear(LOGIN_ACCOUNT, this.account(scope, id));
  }

  reset() {
    this.store.reset();
    this.knownIps.clear();
  }
}
