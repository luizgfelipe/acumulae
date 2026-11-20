import { creditMessage, creditReversedMessage, redeemReversedMessage, redeemedMessage } from './messages';

const units = { one: 'rodízio', many: 'rodízios' };

describe('textos das notificações', () => {
  it('crédito no singular: "Falta 1"', () => {
    expect(creditMessage({ tenant: 'Sushi X', quantity: 1, balance: 9, goal: 10, units, reward: '1 rodízio grátis' })).toEqual({
      kind: 'CREDITO',
      title: '+1 rodízio no Sushi X',
      body: 'Seu cartão está com 9 de 10. Falta 1 rodízio para: 1 rodízio grátis.',
    });
  });

  it('resgate de uma e de várias recompensas', () => {
    expect(redeemedMessage({ tenant: 'Sushi X', count: 1, reward: '1 rodízio grátis' }).title).toBe('Recompensa resgatada no Sushi X');
    expect(redeemedMessage({ tenant: 'Sushi X', count: 2, reward: '1 rodízio grátis' }).title).toBe('2 recompensas resgatadas no Sushi X');
  });

  it('estorno de consumo informa recompensas canceladas e o saldo', () => {
    const m = creditReversedMessage({ tenant: 'Sushi X', quantity: 3, cancelledRewards: 1, balance: 6, goal: 10, units });
    expect(m).toEqual({
      kind: 'ESTORNO',
      title: 'Lançamento estornado no Sushi X',
      body: 'O estabelecimento estornou 3 rodízios. 1 recompensa foi cancelada. Seu cartão está com 6 de 10.',
    });
    expect(creditReversedMessage({ tenant: 'Sushi X', quantity: 1, cancelledRewards: 0, balance: 0, goal: 10, units }).body).toBe(
      'O estabelecimento estornou 1 rodízio. Seu cartão está com 0 de 10.',
    );
  });

  it('estorno de resgate devolve a recompensa', () => {
    expect(redeemReversedMessage({ tenant: 'Sushi X', reward: '1 rodízio grátis' }).body).toBe('A recompensa "1 rodízio grátis" voltou para o seu cartão.');
  });
});
