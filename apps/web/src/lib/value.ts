/**
 * Programa por valor (mesma conta da API, em apps/api/src/loyalty/value.ts): a compra soma à sobra
 * do cliente; cada `stampValueCents` vira 1 selo e o resto continua guardado. Usado na prévia do caixa.
 */
export function convertAmount(amountCents: number, leftoverCents: number, stampValueCents: number) {
  const pool = leftoverCents + amountCents;
  return { stamps: Math.floor(pool / stampValueCents), leftover: pool % stampValueCents };
}
