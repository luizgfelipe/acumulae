import { convertAmount, formatBRL, reverseAmount } from './value';

describe('convertAmount (programa por valor)', () => {
  // R$ 10,00 = 1 selo
  const V = 1000;

  it('R$ 15 sem sobra: 1 selo e R$ 5 guardados', () => {
    expect(convertAmount(1500, 0, V)).toEqual({ stamps: 1, leftover: 500 });
  });

  it('a sobra da compra anterior entra na conta: R$ 20 + R$ 5 → 2 selos, sobra R$ 5', () => {
    expect(convertAmount(2000, 500, V)).toEqual({ stamps: 2, leftover: 500 });
  });

  it('compra menor que um selo só aumenta a sobra', () => {
    expect(convertAmount(700, 0, V)).toEqual({ stamps: 0, leftover: 700 });
  });

  it('a sobra que completa um selo vira selo', () => {
    expect(convertAmount(300, 700, V)).toEqual({ stamps: 1, leftover: 0 });
  });

  it('valores quebrados, em centavos', () => {
    expect(convertAmount(4599, 0, 1550)).toEqual({ stamps: 2, leftover: 1499 });
  });
});

describe('reverseAmount (estorno no programa por valor)', () => {
  const V = 1000;

  it('estorna a última compra: volta ao saldo e à sobra de antes', () => {
    // Antes: 0 selos, R$ 5. Compra de R$ 20 → 2 selos, R$ 5.
    expect(reverseAmount({ balance: 2, leftoverCents: 500, amountCents: 2000, stampValueCents: V, rewardCosts: [] })).toEqual({
      cancel: 0,
      balance: 0,
      leftover: 500,
    });
  });

  it('estorna uma compra antiga depois de outra que usou a sobra dela', () => {
    // R$ 15 → 1 selo + R$ 5; depois R$ 5 → +1 selo, R$ 0. Saldo 2, sobra 0. Estornar os R$ 15
    // deixa só os R$ 5 da segunda compra: 0 selos, R$ 5.
    expect(reverseAmount({ balance: 2, leftoverCents: 0, amountCents: 1500, stampValueCents: V, rewardCosts: [] })).toEqual({
      cancel: 0,
      balance: 0,
      leftover: 500,
    });
  });

  it('sem selos que cubram o estorno, cancela recompensa disponível', () => {
    // Meta 10: a compra de R$ 100 liberou a recompensa e zerou o cartão.
    expect(reverseAmount({ balance: 0, leftoverCents: 0, amountCents: 10_000, stampValueCents: V, rewardCosts: [10] })).toEqual({
      cancel: 1,
      balance: 0,
      leftover: 0,
    });
  });

  it('cancela só o necessário e devolve o que sobra da recompensa', () => {
    // Saldo 3, cartão de 10 com recompensa. Estornar R$ 50: 3×10 + 10×10 − 50 = 80 → 8 selos.
    expect(reverseAmount({ balance: 3, leftoverCents: 0, amountCents: 5000, stampValueCents: V, rewardCosts: [10, 10] })).toEqual({
      cancel: 1,
      balance: 8,
      leftover: 0,
    });
  });

  it('sem recompensa disponível para cancelar, não é possível estornar', () => {
    expect(reverseAmount({ balance: 0, leftoverCents: 0, amountCents: 10_000, stampValueCents: V, rewardCosts: [] })).toBeNull();
  });
});

describe('formatBRL', () => {
  it.each([
    [0, 'R$ 0,00'],
    [500, 'R$ 5,00'],
    [123456, 'R$ 1.234,56'],
  ])('%p → %s', (cents, text) => {
    expect(formatBRL(cents)).toBe(text);
  });
});
