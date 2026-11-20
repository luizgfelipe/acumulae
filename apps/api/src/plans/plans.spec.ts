import { expiryAfterMonths } from './plans';

describe('expiryAfterMonths', () => {
  it('vence no fim do dia, horário de Brasília, N meses depois', () => {
    expect(expiryAfterMonths(3, new Date('2026-11-19T15:00:00Z')).toISOString()).toBe('2027-02-20T02:59:59.999Z');
  });

  it('usa a data de Brasília, não a UTC', () => {
    // 01:00 UTC do dia 20 ainda é dia 19 em Brasília.
    expect(expiryAfterMonths(3, new Date('2026-11-20T01:00:00Z')).toISOString()).toBe('2027-02-20T02:59:59.999Z');
  });

  it('dia que não existe no mês final cai no último dia', () => {
    expect(expiryAfterMonths(3, new Date('2026-11-30T15:00:00Z')).toISOString()).toBe('2027-03-01T02:59:59.999Z');
  });
});
