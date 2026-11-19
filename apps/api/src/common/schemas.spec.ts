import { hexColorSchema, pageSchema, programFieldsSchema, slugSchema, weekdaysSchema } from './schemas';

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

describe('programFieldsSchema (RN-23)', () => {
  const ok = { rewardDescription: '1 rodízio grátis' };

  it('só a descrição da recompensa é obrigatória (o resto tem padrão)', () => {
    expect(programFieldsSchema.safeParse(ok).success).toBe(true);
    expect(programFieldsSchema.safeParse({}).success).toBe(false);
  });

  it('meta é um inteiro de 2 a 50', () => {
    expect(programFieldsSchema.safeParse({ ...ok, goal: 2 }).success).toBe(true);
    expect(programFieldsSchema.safeParse({ ...ok, goal: 50 }).success).toBe(true);
    expect(programFieldsSchema.safeParse({ ...ok, goal: 1 }).success).toBe(false);
    expect(programFieldsSchema.safeParse({ ...ok, goal: 51 }).success).toBe(false);
    expect(programFieldsSchema.safeParse({ ...ok, goal: 9.5 }).success).toBe(false);
  });

  it('máximo por lançamento é de 1 a 100', () => {
    expect(programFieldsSchema.safeParse({ ...ok, maxPerEntry: 0 }).success).toBe(false);
    expect(programFieldsSchema.safeParse({ ...ok, maxPerEntry: 101 }).success).toBe(false);
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
