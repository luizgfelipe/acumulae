import { LoginRateLimiter } from './rate-limiter.service';

/** RN-13: 5 erros em 15 minutos bloqueiam por 15 minutos, por identificador + IP. */
describe('LoginRateLimiter (RN-13)', () => {
  let limiter: LoginRateLimiter;
  const IP = '10.0.0.1';

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-18T12:00:00Z') });
    limiter = new LoginRateLimiter();
  });

  afterEach(() => jest.useRealTimers());

  const failTimes = (n: number, id = 'maria@example.com', ip = IP) => {
    for (let i = 0; i < n; i++) limiter.fail('customer', id, ip);
  };

  it('permite até 4 erros', () => {
    failTimes(4);
    expect(() => limiter.assertAllowed('customer', 'maria@example.com', IP)).not.toThrow();
  });

  it('bloqueia no 5º erro, com status 429', () => {
    failTimes(5);
    try {
      limiter.assertAllowed('customer', 'maria@example.com', IP);
      fail('deveria bloquear');
    } catch (e) {
      expect((e as { getStatus(): number }).getStatus()).toBe(429);
      expect((e as Error).message).toMatch(/15 minuto/);
    }
  });

  it('o bloqueio dura 15 minutos', () => {
    failTimes(5);
    jest.advanceTimersByTime(14 * 60_000);
    expect(() => limiter.assertAllowed('customer', 'maria@example.com', IP)).toThrow();
    jest.advanceTimersByTime(60_000 + 1);
    expect(() => limiter.assertAllowed('customer', 'maria@example.com', IP)).not.toThrow();
  });

  it('erros fora da janela de 15 minutos não contam', () => {
    failTimes(4);
    jest.advanceTimersByTime(15 * 60_000 + 1);
    failTimes(1);
    expect(() => limiter.assertAllowed('customer', 'maria@example.com', IP)).not.toThrow();
  });

  it('o identificador não diferencia maiúsculas', () => {
    failTimes(5, 'Maria@Example.com');
    expect(() => limiter.assertAllowed('customer', 'maria@example.com', IP)).toThrow();
  });

  it('o bloqueio é por identificador + IP', () => {
    failTimes(5);
    expect(() => limiter.assertAllowed('customer', 'maria@example.com', '10.0.0.2')).not.toThrow();
    expect(() => limiter.assertAllowed('customer', 'joao@example.com', IP)).not.toThrow();
  });

  it('cliente e funcionário têm contadores separados', () => {
    failTimes(5);
    expect(() => limiter.assertAllowed('staff', 'maria@example.com', IP)).not.toThrow();
  });

  it('um login certo zera os erros', () => {
    failTimes(4);
    limiter.succeed('customer', 'maria@example.com', IP);
    failTimes(4);
    expect(() => limiter.assertAllowed('customer', 'maria@example.com', IP)).not.toThrow();
  });
});
