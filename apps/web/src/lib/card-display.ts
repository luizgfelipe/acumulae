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

/** Aviso da recompensa pendente ("Você tem 1 recompensa para usar"). */
export function rewardsLabel(n: number) {
  return n === 1 ? 'Você tem 1 recompensa para usar' : `Você tem ${n} recompensas para usar`;
}
