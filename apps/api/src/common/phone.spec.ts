import { formatPhone, maskPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['(47) 99912-3456', '+5547999123456'],
    ['47999123456', '+5547999123456'],
    ['  47 9 9912 3456 ', '+5547999123456'],
    ['+55 47 99912-3456', '+5547999123456'],
    ['(11) 3333-4444', '+551133334444'],
  ])('normaliza "%s" para E.164', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('aceita número internacional com +', () => {
    expect(normalizePhone('+1 202 555 0143')).toBe('+12025550143');
  });

  it.each([null, undefined, '', '123', '9999-9999', 'abc'])('devolve null para entrada inválida: %p', (input) => {
    expect(normalizePhone(input as string)).toBeNull();
  });
});

describe('maskPhone (seção 10: sem consentimento o telefone aparece mascarado)', () => {
  it('mostra DDD, primeiro dígito e os 4 últimos', () => {
    expect(maskPhone('+5547999123456')).toBe('(47) 9****-3456');
  });

  it('funciona com fixo', () => {
    expect(maskPhone('+551133334444')).toBe('(11) 3****-4444');
  });

  it('não vaza número curto ou estranho', () => {
    expect(maskPhone('+123')).toBe('****');
  });

  it('devolve null sem telefone (cliente excluído)', () => {
    expect(maskPhone(null)).toBeNull();
  });
});

describe('formatPhone', () => {
  it('formata no padrão nacional', () => {
    expect(formatPhone('+5547999123456')).toBe('(47) 99912-3456');
  });

  it('devolve null sem telefone', () => {
    expect(formatPhone(undefined)).toBeNull();
  });
});

describe('telefones em Portugal (REGION=PT)', () => {
  const before = process.env.REGION;
  beforeAll(() => (process.env.REGION = 'PT'));
  afterAll(() => (before === undefined ? delete process.env.REGION : (process.env.REGION = before)));

  it('normaliza telemóvel português sem indicativo', () => {
    expect(normalizePhone('912 345 678')).toBe('+351912345678');
    expect(normalizePhone('+351 912 345 678')).toBe('+351912345678');
  });

  it('continua a aceitar número brasileiro com +55', () => {
    expect(normalizePhone('+55 47 99912-3456')).toBe('+5547999123456');
  });

  it('mascara e formata no padrão português', () => {
    expect(maskPhone('+351912345678')).toBe('912 *** 678');
    expect(formatPhone('+351912345678')).toBe('912 345 678');
    expect(formatPhone('+5547999123456')).toBe('+55 47 99912 3456');
  });
});
