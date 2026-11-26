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

describe('LoginRateLimiter: conta sob ataque distribuído (RN-13)', () => {
  let limiter: LoginRateLimiter;
  const ID = 'maria@example.com';
  const HOME = '10.0.0.1';

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-18T12:00:00Z') });
    limiter = new LoginRateLimiter(new RateLimitStore());
  });

  afterEach(() => jest.useRealTimers());

  /** n erros na conta, cada um de um IP diferente (nenhum IP chega ao próprio limite). */
  const distributed = (n: number) => {
    let last = { accountPausedMs: 0 };
    for (let i = 0; i < n; i++) last = limiter.fail('customer', ID, `198.51.100.${i}`);
    return last;
  };
  const allowed = (ip: string, id = ID) => () => limiter.assertAllowed('customer', id, ip);

  it('o 20º erro em 1 hora pausa a conta e avisa (accountPausedMs)', () => {
    expect(distributed(19).accountPausedMs).toBe(0);
    expect(limiter.fail('customer', ID, '198.51.100.99').accountPausedMs).toBe(60 * MIN);
  });

  it('pausada, a conta não entra de IPs novos, mas entra de onde já entrou', () => {
    limiter.succeed('customer', ID, HOME);
    distributed(20);
    expect(allowed('203.0.113.1')).toThrow(/pausado em novos aparelhos/);
    expect(allowed(HOME)).not.toThrow();
  });

  it('a pausa não afeta outras contas', () => {
    distributed(20);
    expect(allowed('203.0.113.1', 'joao@example.com')).not.toThrow();
  });

  it('a pausa acaba depois de 1 hora', () => {
    distributed(20);
    jest.advanceTimersByTime(60 * MIN + 1);
    expect(allowed('203.0.113.1')).not.toThrow();
  });

  it('redefinir a senha encerra a pausa', () => {
    distributed(20);
    limiter.clearAccount('customer', [ID, null]);
    expect(allowed('203.0.113.1')).not.toThrow();
  });

  it('guarda só os 10 últimos IPs de cada conta', () => {
    for (let i = 0; i < 11; i++) limiter.succeed('customer', ID, `192.0.2.${i}`);
    distributed(20);
    expect(allowed('192.0.2.0')).toThrow();
    expect(allowed('192.0.2.1')).not.toThrow();
  });
});

describe('LoginRateLimiter: esqueci minha senha', () => {
  let limiter: LoginRateLimiter;
  const IP = '10.0.0.1';

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-18T12:00:00Z') });
    limiter = new LoginRateLimiter(new RateLimitStore());
  });

  afterEach(() => jest.useRealTimers());

  it('3 pedidos por identificador em 1 hora; o 4º é recusado', () => {
    for (let i = 0; i < 3; i++) limiter.forgot('customer', 'maria@example.com', `10.0.1.${i}`);
    expect(() => limiter.forgot('customer', 'maria@example.com', '10.0.2.1')).toThrow(/Confira seu e-mail/);
    expect(() => limiter.forgot('customer', 'joao@example.com', '10.0.2.1')).not.toThrow();
    expect(() => limiter.forgot('staff', 'maria@example.com', '10.0.2.1')).not.toThrow();
  });

  it('libera de novo depois de 1 hora', () => {
    for (let i = 0; i < 3; i++) limiter.forgot('customer', 'maria@example.com', IP);
    jest.advanceTimersByTime(60 * MIN + 1);
    expect(() => limiter.forgot('customer', 'maria@example.com', IP)).not.toThrow();
  });

  it('10 pedidos por IP em 1 hora, somando todas as contas', () => {
    for (let i = 0; i < 10; i++) limiter.forgot('customer', `conta${i}@example.com`, IP);
    expect(() => limiter.forgot('staff', 'outra@example.com', IP)).toThrow(/60 minuto/);
    expect(() => limiter.forgot('customer', 'outra@example.com', '10.0.0.2')).not.toThrow();
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
