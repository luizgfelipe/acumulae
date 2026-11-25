/**
 * Programa por valor: R$ X na compra = 1 selo. O que não fecha um selo vira "sobra" e conta na
 * próxima compra. Tudo em centavos (inteiros), para não haver erro de arredondamento.
 */

/** Soma a compra à sobra do cliente e separa os selos inteiros do que continua sobrando. */
export function convertAmount(amountCents: number, leftoverCents: number, stampValueCents: number) {
  const pool = leftoverCents + amountCents;
  return { stamps: Math.floor(pool / stampValueCents), leftover: pool % stampValueCents };
}

/**
 * Estorno de uma compra num programa por valor. O saldo do cliente é tratado como um "pote" em centavos
 * (selos × valor do selo + sobra): o estorno tira exatamente o valor da compra e o pote é convertido de novo.
 * Assim dá certo mesmo estornando uma compra antiga, depois de outras que usaram a sobra dela.
 *
 * Se o pote ficar negativo, recompensas disponíveis são canceladas (cada uma devolve `stampsCost` selos)
 * até cobrir a diferença. `rewardCosts` vem na ordem em que as recompensas devem ser canceladas.
 * Devolve `null` se nem cancelando todas o pote fecha (alguma já foi resgatada).
 */
export function reverseAmount(p: {
  balance: number;
  leftoverCents: number;
  amountCents: number;
  stampValueCents: number;
  rewardCosts: number[];
}) {
  let pool = p.balance * p.stampValueCents + p.leftoverCents - p.amountCents;
  let cancel = 0;
  while (pool < 0) {
    if (cancel >= p.rewardCosts.length) return null;
    pool += p.rewardCosts[cancel] * p.stampValueCents;
    cancel++;
  }
  return { cancel, balance: Math.floor(pool / p.stampValueCents), leftover: pool % p.stampValueCents };
}

/** "R$ 1.234,50" (espaço comum, para caber em notificação e e-mail). */
export function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100).replace(/\s/g, ' ');
}
