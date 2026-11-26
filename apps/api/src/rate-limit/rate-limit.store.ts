import { Injectable } from '@nestjs/common';
import { tooMany } from '../common/errors';

/** Regra de limite: `max` eventos dentro de `windowMs` bloqueiam a chave por `blockMs`. */
export interface LimitRule {
  /** Prefixo da chave: separa os contadores de cada regra. */
  name: string;
  windowMs: number;
  max: number;
  /** Duração do 1º bloqueio. */
  blockMs: number;
  /**
   * Bloqueio progressivo (RN-13): um novo bloqueio da mesma chave até 24 h depois do fim do anterior dobra a duração,
   * até este teto. Sem ele, o bloqueio dura sempre `blockMs`.
   */
  maxBlockMs?: number;
}

/** Por quanto tempo, depois de terminar, um bloqueio ainda conta para dobrar o próximo. */
export const STRIKE_MEMORY_MS = 24 * 60 * 60_000;
const MAX_ENTRIES = 100_000;

interface Entry {
  hits: number[];
  blockedUntil: number;
  strikes: number;
  /** Depois disso a entrada não guarda mais nada útil e pode sair da memória. */
  expiresAt: number;
}

/** "15 minutos", "2 horas". */
export function formatWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 120) return `${minutes} minuto(s)`;
  return `${Math.ceil(minutes / 60)} hora(s)`;
}

/**
 * Contadores de limite em memória. Suficiente para uma instância única da API; com várias,
 * mover para o Redis (os contadores de cada instância seriam independentes).
 */
@Injectable()
export class RateLimitStore {
  private readonly entries = new Map<string, Entry>();

  private k(rule: LimitRule, key: string) {
    return `${rule.name}|${key}`;
  }

  /** Milissegundos de bloqueio restantes (0 = liberado). */
  blockedFor(rule: LimitRule, key: string): number {
    const e = this.entries.get(this.k(rule, key));
    return e ? Math.max(0, e.blockedUntil - Date.now()) : 0;
  }

  /** Lança 429 se a chave estiver bloqueada. */
  assert(rule: LimitRule, key: string, message = (wait: string) => `Muitas tentativas. Tente novamente em ${wait}.`) {
    const ms = this.blockedFor(rule, key);
    if (ms > 0) throw tooMany(message(formatWait(ms)), Math.ceil(ms / 1000));
  }

  /**
   * Registra um evento. Devolve true se este evento disparou um bloqueio.
   * Eventos durante um bloqueio não contam (a chave já está bloqueada).
   */
  hit(rule: LimitRule, key: string): boolean {
    const k = this.k(rule, key);
    const now = Date.now();
    const e = this.entries.get(k) ?? { hits: [], blockedUntil: 0, strikes: 0, expiresAt: 0 };
    if (e.blockedUntil > now) return false;
    e.hits = e.hits.filter((t) => now - t < rule.windowMs);
    e.hits.push(now);
    let blocked = false;
    if (e.hits.length >= rule.max) {
      e.strikes = e.blockedUntil && now - e.blockedUntil < STRIKE_MEMORY_MS ? e.strikes + 1 : 1;
      const ms = Math.min(rule.blockMs * 2 ** (e.strikes - 1), rule.maxBlockMs ?? rule.blockMs);
      e.blockedUntil = now + ms;
      e.hits = [];
      blocked = true;
    }
    e.expiresAt = Math.max(
      e.blockedUntil,
      e.hits.length ? now + rule.windowMs : 0,
      e.blockedUntil ? e.blockedUntil + STRIKE_MEMORY_MS : 0,
    );
    this.entries.delete(k); // reinsere no fim: o Map fica em ordem de uso
    this.entries.set(k, e);
    if (this.entries.size > MAX_ENTRIES) this.gc();
    return blocked;
  }

  /** Esquece a chave (contagem, bloqueio e histórico de bloqueios). */
  clear(rule: LimitRule, key: string) {
    this.entries.delete(this.k(rule, key));
  }

  reset() {
    this.entries.clear();
  }

  private gc() {
    const now = Date.now();
    for (const [k, e] of this.entries) if (e.expiresAt < now) this.entries.delete(k);
    // Ainda cheio (ataque com muitas chaves): descarta as menos usadas.
    for (const k of this.entries.keys()) {
      if (this.entries.size <= MAX_ENTRIES * 0.9) break;
      this.entries.delete(k);
    }
  }
}
