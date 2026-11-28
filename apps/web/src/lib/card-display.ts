/**
 * Como o cartão aparece para o cliente.
 *
 * A API zera o saldo quando o cartão completa e cria a recompensa. Na tela, enquanto a recompensa não é
 * resgatada e nenhum selo novo chegou (saldo 0 com recompensa disponível), o cartão continua cheio, com o
 * efeito de "completo". Com selo novo antes do resgate, volta à contagem normal (ex.: 1/10) e o aviso da
 * recompensa continua. Depois do resgate, 0/10.
 */
export function cardDisplay(c: { balance: number; goal: number; rewardsAvailable: number }) {
  const complete = c.balance === 0 && c.rewardsAvailable > 0;
  return { complete, shown: complete ? c.goal : c.balance };
}

import { formatMoney } from './format';

/**
 * Programa por valor: a sobra guardada e quanto falta para o próximo selo.
 * null nos programas por selo.
 */
export function leftoverLabel(c: { kind?: 'SELO' | 'VALOR'; stampValueCents?: number | null; leftoverCents?: number; unitLabel: string }) {
  if (c.kind !== 'VALOR' || !c.stampValueCents) return null;
  const left = c.leftoverCents ?? 0;
  if (left <= 0) return `Cada ${formatMoney(c.stampValueCents)} em compras vale 1 ${c.unitLabel}`;
  return `${formatMoney(left)} guardados · faltam ${formatMoney(c.stampValueCents - left)} para o próximo ${c.unitLabel}`;
}

/** Aviso da recompensa pendente ("Você tem 1 recompensa para usar"). */
export function rewardsLabel(n: number) {
  return n === 1 ? 'Você tem 1 recompensa para usar' : `Você tem ${n} recompensas para usar`;
}

type Sortable = {
  balance: number;
  goal: number;
  rewardsAvailable: number;
  lastVisitAt: string | null;
  programActive: boolean;
  tenant: { active: boolean };
};

/** Cartão que ainda acumula (estabelecimento ativo e programa não encerrado). */
export function isCardActive(c: Sortable) {
  return c.tenant.active && c.programActive;
}

/** Faltam poucos selos: até 20% da meta (mínimo 1), sem estar completo. */
export function isAlmostThere(c: Sortable) {
  const missing = c.goal - c.balance;
  return !cardDisplay(c).complete && missing > 0 && missing <= Math.max(1, Math.ceil(c.goal * 0.2));
}

export type CardSort = 'reward' | 'recent';

const visitTime = (c: Sortable) => (c.lastVisitAt ? Date.parse(c.lastVisitAt) : 0);

/**
 * `reward`: recompensa para usar primeiro, depois quem está mais perto da meta (proporção), depois a visita mais recente.
 * `recent`: visita mais recente primeiro.
 * Sempre devolve uma cópia; cartões pausados/encerrados ficam por conta de quem chama.
 */
export function sortCards<T extends Sortable>(cards: T[], sort: CardSort): T[] {
  const byVisit = (a: T, b: T) => visitTime(b) - visitTime(a);
  if (sort === 'recent') return [...cards].sort(byVisit);
  const progress = (c: T) => (c.goal > 0 ? cardDisplay(c).shown / c.goal : 0);
  return [...cards].sort(
    (a, b) => Number(b.rewardsAvailable > 0) - Number(a.rewardsAvailable > 0) || progress(b) - progress(a) || byVisit(a, b),
  );
}
