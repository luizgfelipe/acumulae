import { safeNext } from './auth.controller';

describe('safeNext (evita open redirect no login social)', () => {
  it.each(['/', '/cartao/123', '/c/abc?x=1'])('aceita caminho do próprio app: %s', (next) => {
    expect(safeNext(next)).toBe(next);
  });

  it.each(['https://malicioso.com', '//malicioso.com', '/\\malicioso.com', 'javascript:alert(1)', '', undefined, 42])(
    'troca destino externo ou inválido por "/": %p',
    (next) => {
      expect(safeNext(next)).toBe('/');
    },
  );

  it('limita o tamanho', () => {
    expect(safeNext(`/${'a'.repeat(500)}`)).toHaveLength(300);
  });
});
