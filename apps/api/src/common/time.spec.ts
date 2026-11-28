import { addDays, describeWeekdays, isoWeekdayLocal, localToUtc, startOfMonthLocal } from './time';

describe('isoWeekdayLocal', () => {
  it('segunda = 1 e domingo = 7', () => {
    expect(isoWeekdayLocal(new Date('2026-11-16T12:00:00-03:00'))).toBe(1);
    expect(isoWeekdayLocal(new Date('2026-11-22T12:00:00-03:00'))).toBe(7);
  });

  it('usa o fuso de São Paulo, não o UTC', () => {
    // 01:00 UTC de terça = 22:00 de segunda em São Paulo.
    expect(isoWeekdayLocal(new Date('2026-11-17T01:00:00Z'))).toBe(1);
    expect(isoWeekdayLocal(new Date('2026-11-17T03:00:00Z'))).toBe(2);
  });
});

describe('startOfMonthLocal', () => {
  it('devolve 00:00 do dia 1 em São Paulo', () => {
    expect(startOfMonthLocal(new Date('2026-11-18T15:00:00-03:00')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('na virada do mês, considera o horário local', () => {
    // 01:00 UTC de 1º/dez ainda é 30/nov em São Paulo.
    expect(startOfMonthLocal(new Date('2026-12-01T01:00:00Z')).toISOString()).toBe('2026-11-01T03:00:00.000Z');
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

describe('instância em Portugal (REGION=PT)', () => {
  const before = process.env.REGION;
  beforeAll(() => (process.env.REGION = 'PT'));
  afterAll(() => (before === undefined ? delete process.env.REGION : (process.env.REGION = before)));

  it('usa o fuso de Lisboa no inverno (UTC+0) e no verão (UTC+1)', () => {
    expect(localToUtc('2026-11-01').toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(localToUtc('2026-07-01').toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(localToUtc('2026-07-01', '23:59:59.999').toISOString()).toBe('2026-07-01T22:59:59.999Z');
  });

  it('início do mês e dia da semana no horário de Lisboa', () => {
    // 23:30 UTC de 31/jul = 00:30 de 1º/ago em Lisboa (horário de verão).
    expect(startOfMonthLocal(new Date('2026-07-31T23:30:00Z')).toISOString()).toBe('2026-07-31T23:00:00.000Z');
    expect(isoWeekdayLocal(new Date('2026-11-16T23:30:00Z'))).toBe(1);
  });
});

describe('localToUtc e addDays (BR)', () => {
  it('meia-noite em São Paulo e aritmética de calendário', () => {
    expect(localToUtc('2026-11-01').toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
