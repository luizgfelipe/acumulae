import { hmac, randomToken, safeEqual, sha256 } from './crypto';

describe('randomToken (RN-43: token opaco em base62)', () => {
  it('tem 22 caracteres base62 por padrão', () => {
    const t = randomToken();
    expect(t).toHaveLength(22);
    expect(t).toMatch(/^[0-9A-Za-z]+$/);
  });

  it('respeita o tamanho pedido', () => {
    expect(randomToken(48)).toHaveLength(48);
    expect(randomToken(1)).toHaveLength(1);
  });

  it('não se repete', () => {
    const set = new Set(Array.from({ length: 1000 }, () => randomToken()));
    expect(set.size).toBe(1000);
  });

  it('usa todo o alfabeto (sem viés grosseiro)', () => {
    const chars = new Set(Array.from({ length: 300 }, () => randomToken(22)).join(''));
    expect(chars.size).toBe(62);
  });
});

describe('sha256 / hmac', () => {
  it('sha256 em hex', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hmac depende do segredo', () => {
    expect(hmac('a', 'msg').equals(hmac('a', 'msg'))).toBe(true);
    expect(hmac('a', 'msg').equals(hmac('b', 'msg'))).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compara strings de tamanhos diferentes sem lançar erro', () => {
    expect(safeEqual('chave', 'chave')).toBe(true);
    expect(safeEqual('chave', 'chave-maior')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});
