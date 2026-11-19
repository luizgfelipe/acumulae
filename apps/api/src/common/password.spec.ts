import { hashPassword, passwordProblem, verifyPassword } from './password';

/** RN-08: mínimo 6 caracteres; bloqueia sequências óbvias, a data de nascimento e o telefone. */
describe('passwordProblem (RN-08)', () => {
  it.each(['', '12345', 'abc'])('recusa senha com menos de 6 caracteres: "%s"', (pw) => {
    expect(passwordProblem(pw)).toMatch(/pelo menos 6/);
  });

  it('recusa senha com mais de 128 caracteres', () => {
    expect(passwordProblem('a1'.repeat(65))).toMatch(/longa demais/);
  });

  it.each(['123456', '654321', 'abcdef', 'FEDCBA', '111111', 'aaaaaaa', '0123456789'])(
    'recusa sequência óbvia: "%s"',
    (pw) => {
      expect(passwordProblem(pw)).toMatch(/menos óbvia/);
    },
  );

  it.each(['senha123', 'PASSWORD', 'qwerty', 'abc123', '102030', 'Acumulae'])('recusa senha comum: "%s"', (pw) => {
    expect(passwordProblem(pw)).toMatch(/menos óbvia/);
  });

  describe('data de nascimento', () => {
    const birthDate = new Date('1990-03-07T00:00:00Z');

    it.each(['07031990', '070390', '19900307'])('recusa a data no formato "%s"', (pw) => {
      expect(passwordProblem(pw, { birthDate })).toMatch(/data de nascimento/);
    });

    it('aceita a mesma sequência quando não há data informada', () => {
      expect(passwordProblem('07031990')).toBeNull();
    });

    it('aceita senha que mistura letras com a data', () => {
      expect(passwordProblem('Maria07031990', { birthDate })).toBeNull();
    });
  });

  describe('telefone', () => {
    const phoneE164 = '+5547999123456';

    it.each(['47999123456', '999123456', '123456'])('recusa trecho do telefone: "%s"', (pw) => {
      // "123456" é sequência e cai antes; o importante é não ser aceito.
      expect(passwordProblem(pw, { phoneE164 })).not.toBeNull();
    });

    it('recusa os 8 últimos dígitos do telefone', () => {
      expect(passwordProblem('99123456', { phoneE164 })).toMatch(/telefone/);
    });

    it('aceita números que não fazem parte do telefone', () => {
      expect(passwordProblem('80417263', { phoneE164 })).toBeNull();
    });
  });

  it.each(['Senha#Forte1', 'Gestor#2026', 'rodizio-de-sexta', '8x7c6v'])('aceita senha razoável: "%s"', (pw) => {
    expect(passwordProblem(pw)).toBeNull();
  });
});

describe('hashPassword / verifyPassword', () => {
  it('gera hash bcrypt verificável e diferente da senha', async () => {
    const hash = await hashPassword('Senha#Forte1');
    expect(hash).not.toContain('Senha#Forte1');
    expect(hash).toMatch(/^\$2[aby]\$11\$/);
    await expect(verifyPassword('Senha#Forte1', hash)).resolves.toBe(true);
    await expect(verifyPassword('senha#forte1', hash)).resolves.toBe(false);
  });

  it('sem hash (conta só com login social) nunca confere', async () => {
    await expect(verifyPassword('qualquer', null)).resolves.toBe(false);
    await expect(verifyPassword('qualquer', undefined)).resolves.toBe(false);
  });
});
