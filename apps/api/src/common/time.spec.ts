import { describeWeekdays, isoWeekdaySaoPaulo, startOfMonthSaoPaulo } from './time';

describe('isoWeekdaySaoPaulo', () => {
  it('segunda = 1 e domingo = 7', () => {
    expect(isoWeekdaySaoPaulo(new Date('2026-11-16T12:00:00-03:00'))).toBe(1);
    expect(isoWeekdaySaoPaulo(new Date('2026-11-22T12:00:00-03:00'))).toBe(7);
  });

  it('usa o fuso de São Paulo, não o UTC', () => {
    // 01:00 UTC de terça = 22:00 de segunda em São Paulo.
    expect(isoWeekdaySaoPaulo(new Date('2026-11-17T01:00:00Z'))).toBe(1);
    expect(isoWeekdaySaoPaulo(new Date('2026-11-17T03:00:00Z'))).toBe(2);
  });
});

describe('startOfMonthSaoPaulo', () => {
  it('devolve 00:00 do dia 1 em São Paulo', () => {
    expect(startOfMonthSaoPaulo(new Date('2026-11-18T15:00:00-03:00')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('na virada do mês, considera o horário local', () => {
    // 01:00 UTC de 1º/dez ainda é 30/nov em São Paulo.
    expect(startOfMonthSaoPaulo(new Date('2026-12-01T01:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
});

describe('describeWeekdays', () => {
  it('ordena e escreve os dias por extenso', () => {
    expect(describeWeekdays([4, 1, 3, 2])).toBe('segunda, terça, quarta, quinta');
  });

  it('não altera o array recebido', () => {
    const days = [7, 6];
    describeWeekdays(days);
    expect(days).toEqual([7, 6]);
  });
});
