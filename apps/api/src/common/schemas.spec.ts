import { programInputSchema } from '../admin/programs.service';
import { hexColorSchema, pageSchema, slugSchema, weekdaysSchema } from './schemas';

describe('slugSchema', () => {
  it.each(['sushi-x', 'pizzaria-y-2', 'ab'])('aceita "%s"', (s) => {
    expect(slugSchema.safeParse(s).success).toBe(true);
  });

  it.each(['Sushi-X', 'sushi_x', '-sushi', 'sushi-', 'sushi--x', 'a', 'á-b', 'sushi x'])('recusa "%s"', (s) => {
    expect(slugSchema.safeParse(s).success).toBe(false);
  });
});

describe('hexColorSchema', () => {
  it('aceita #RRGGBB', () => {
    expect(hexColorSchema.safeParse('#D62828').success).toBe(true);
    expect(hexColorSchema.safeParse('#d62828').success).toBe(true);
  });

  it.each(['D62828', '#FFF', '#GGGGGG', 'red'])('recusa "%s"', (s) => {
    expect(hexColorSchema.safeParse(s).success).toBe(false);
  });
});

describe('weekdaysSchema (RN-23: restrição de resgate por dia da semana)', () => {
  it('aceita dias ISO de 1 a 7', () => {
    expect(weekdaysSchema.safeParse([1, 2, 3, 4]).success).toBe(true);
    expect(weekdaysSchema.safeParse([]).success).toBe(true);
  });

  it.each([[[0]], [[8]], [[1.5]], [[1, 2, 3, 4, 5, 6, 7, 1]]])('recusa %p', (days) => {
    expect(weekdaysSchema.safeParse(days).success).toBe(false);
  });
});

describe('programInputSchema (RN-23)', () => {
  const ok = {
    name: 'Cartão Rodízio',
    unitLabel: 'rodízio',
    goal: 10,
    rewardDescription: '1 rodízio grátis',
    maxPerEntry: 20,
    redeemWeekdays: [],
    carryOverExcess: true,
  };

  it('programa por selo é o padrão', () => {
    expect(programInputSchema.parse(ok).kind).toBe('SELO');
  });

  it('meta é um inteiro de 2 a 50', () => {
    expect(programInputSchema.safeParse({ ...ok, goal: 2 }).success).toBe(true);
    expect(programInputSchema.safeParse({ ...ok, goal: 50 }).success).toBe(true);
    expect(programInputSchema.safeParse({ ...ok, goal: 1 }).success).toBe(false);
    expect(programInputSchema.safeParse({ ...ok, goal: 51 }).success).toBe(false);
    expect(programInputSchema.safeParse({ ...ok, goal: 9.5 }).success).toBe(false);
  });

  it('máximo por lançamento é de 1 a 100', () => {
    expect(programInputSchema.safeParse({ ...ok, maxPerEntry: 0 }).success).toBe(false);
    expect(programInputSchema.safeParse({ ...ok, maxPerEntry: 101 }).success).toBe(false);
  });

  it('por valor exige o valor do selo e a compra máxima', () => {
    const v = { ...ok, kind: 'VALOR' };
    expect(programInputSchema.safeParse(v).success).toBe(false);
    expect(programInputSchema.safeParse({ ...v, stampValueCents: 1000 }).success).toBe(false);
    expect(programInputSchema.safeParse({ ...v, stampValueCents: 1000, maxAmountPerEntryCents: 100_000 }).success).toBe(true);
  });
});

describe('pageSchema', () => {
  it('converte texto da query string e aplica padrões', () => {
    expect(pageSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(pageSchema.parse({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('limita o tamanho da página a 100', () => {
    expect(pageSchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(pageSchema.safeParse({ page: '0' }).success).toBe(false);
  });
});
