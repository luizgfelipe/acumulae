import { RateLimitStore } from '../rate-limit/rate-limit.store';
import { identifierKey } from './customer-auth.service';
import { LoginRateLimiter } from './rate-limiter.service';

const MIN = 60_000;

/** RN-13: limite de tentativas de login. */
describe('LoginRateLimiter (RN-13)', () => {
  let limiter: LoginRateLimiter;
  const IP = '10.0.0.1';

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-18T12:00:00Z') });
    limiter = new LoginRateLimiter(new RateLimitStore());
  });

  afterEach(() => jest.useRealTimers());

  const failTimes = (n: number, id = 'maria@example.com', ip = IP) => {
    for (let i = 0; i < n; i++) limiter.fail('customer', id, ip);
  };
  const allowed = (id = 'maria@example.com', ip = IP) => () => limiter.assertAllowed('customer', id, ip);

  describe('identificador + IP: 5 erros em 15 minutos', () => {
    it('permite até 4 erros', () => {
      failTimes(4);
      expect(allowed()).not.toThrow();
    });

    it('bloqueia no 5º erro, com status 429 e o tempo de espera', () => {
      failTimes(5);
      try {
        allowed()();
        fail('deveria bloquear');
      } catch (e) {
        expect((e as { getStatus(): number }).getStatus()).toBe(429);
        expect((e as Error).message).toMatch(/15 minuto/);
        expect((e as { getResponse(): { details: unknown } }).getResponse().details).toEqual({ retryAfterSeconds: 900 });
      }
    });

    it('o 1º bloqueio dura 15 minutos', () => {
      failTimes(5);
      jest.advanceTimersByTime(14 * MIN);
      expect(allowed()).toThrow();
      jest.advanceTimersByTime(MIN + 1);
      expect(allowed()).not.toThrow();
    });

    it('erros fora da janela de 15 minutos não contam', () => {
      failTimes(4);
      jest.advanceTimersByTime(15 * MIN + 1);
      failTimes(1);
      expect(allowed()).not.toThrow();
    });

    it('o bloqueio é por identificador + IP', () => {
      failTimes(5);
      expect(allowed('maria@example.com', '10.0.0.2')).not.toThrow();
      expect(allowed('joao@example.com', IP)).not.toThrow();
    });

    it('cliente e funcionário têm contadores separados', () => {
      failTimes(5);
      expect(() => limiter.assertAllowed('staff', 'maria@example.com', IP)).not.toThrow();
    });

    it('um login certo zera os erros', () => {
      failTimes(4);
      limiter.succeed('customer', 'maria@example.com', IP);
      failTimes(4);
      expect(allowed()).not.toThrow();
    });
  });

  describe('bloqueio progressivo', () => {
    it('cada reincidência dobra o bloqueio: 15 min, 30 min, 1 h', () => {
      failTimes(5);
      jest.advanceTimersByTime(15 * MIN + 1);
      failTimes(5);
      expect(allowed()).toThrow(/30 minuto/);
      jest.advanceTimersByTime(30 * MIN + 1);
      failTimes(5);
      expect(allowed()).toThrow(/60 minuto/);
    });

    it('não passa de 24 horas', () => {
      // 15 min, 30, 1 h, 2 h, 4 h, 8 h, 16 h, 24 h, 24 h…
      for (let i = 0; i < 9; i++) {
        failTimes(5);
        jest.advanceTimersByTime(24 * 60 * MIN + 1);
      }
      failTimes(5);
      expect(allowed()).toThrow(/24 hora/);
    });

    it('24 horas depois do fim do último bloqueio, volta aos 15 minutos', () => {
      failTimes(5);
      jest.advanceTimersByTime(15 * MIN + 24 * 60 * MIN + 1);
      failTimes(5);
      expect(allowed()).toThrow(/15 minuto/);
    });
  });

  describe('por IP, somando todas as contas: 30 erros em 1 hora', () => {
    const spray = (n: number, ip = IP) => {
      for (let i = 0; i < n; i++) limiter.fail('customer', `conta${i}@example.com`, ip);
    };

    it('uma senha testada em muitas contas bloqueia o IP', () => {
      spray(29);
      expect(allowed('nova@example.com')).not.toThrow();
      spray(1);
      expect(allowed('nova@example.com')).toThrow(/60 minuto/);
      expect(() => limiter.assertAllowed('staff', 'gestor@example.com', IP)).toThrow();
    });

    it('não afeta outros IPs', () => {
      spray(30);
      expect(allowed('nova@example.com', '10.0.0.2')).not.toThrow();
    });

    it('um login certo não zera o contador do IP', () => {
      spray(29);
      limiter.succeed('customer', 'minha@example.com', IP);
      spray(1);
      expect(allowed('nova@example.com')).toThrow();
    });
  });
});

describe('identifierKey', () => {
  it('e-mail sem diferença de maiúsculas e espaços', () => {
    expect(identifierKey('  Maria@Example.com ')).toBe('maria@example.com');
  });

  it('o mesmo telefone escrito de jeitos diferentes vira uma chave só', () => {
    const k = identifierKey('(47) 99999-1234');
    expect(k).toBe('+5547999991234');
    expect(identifierKey('47999991234')).toBe(k);
    expect(identifierKey('+55 47 99999 1234')).toBe(k);
  });
});
