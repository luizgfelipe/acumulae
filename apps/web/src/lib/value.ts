/** Teto de proteção de uma compra num lançamento (o mesmo da API): R$ 10.000,00. */
export const MAX_AMOUNT_PER_ENTRY_CENTS = 1_000_000;

/** Limite que vale no caixa: o do programa, sem passar do teto. */
export function amountLimit(maxAmountPerEntryCents: number | null | undefined) {
  return Math.min(maxAmountPerEntryCents ?? MAX_AMOUNT_PER_ENTRY_CENTS, MAX_AMOUNT_PER_ENTRY_CENTS);
}

/**
 * Programa por valor (mesma conta da API, em apps/api/src/loyalty/value.ts): a compra soma à sobra
 * do cliente; cada `stampValueCents` vira 1 selo e o resto continua guardado. Usado na prévia do caixa.
 */
export function convertAmount(amountCents: number, leftoverCents: number, stampValueCents: number) {
  const pool = leftoverCents + amountCents;
  return { stamps: Math.floor(pool / stampValueCents), leftover: pool % stampValueCents };
}
