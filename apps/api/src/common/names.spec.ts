import { maskName, shortName } from './names';

describe('maskName (fluxo 6.4: conferência na busca por telefone)', () => {
  it('mostra o primeiro nome e a inicial do último sobrenome', () => {
    expect(maskName('Maria Silva Souza')).toBe('Maria S****');
  });

  it('ignora espaços extras', () => {
    expect(maskName('  Maria   Souza ')).toBe('Maria S****');
  });

  it('nome único fica como está', () => {
    expect(maskName('Maria')).toBe('Maria');
  });
});

describe('shortName (RN-45: "Creditado para Maria S.")', () => {
  it('abrevia o último sobrenome', () => {
    expect(shortName('Maria Silva Souza')).toBe('Maria S.');
  });

  it('nome único fica como está', () => {
    expect(shortName('Maria')).toBe('Maria');
  });
});
