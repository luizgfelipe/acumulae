import { LimitRule, RateLimitStore, formatWait } from './rate-limit.store';

const MIN = 60_000;
const RULE: LimitRule = { name: 't', windowMs: 10 * MIN, max: 3, blockMs: 5 * MIN };

describe('RateLimitStore', () => {
  let store: RateLimitStore;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-18T12:00:00Z') });
    store = new RateLimitStore();
  });

  afterEach(() => jest.useRealTimers());

  it('o evento que atinge o máximo dispara o bloqueio', () => {
    expect(store.hit(RULE, 'a')).toBe(false);
    expect(store.hit(RULE, 'a')).toBe(false);
    expect(store.hit(RULE, 'a')).toBe(true);
    expect(store.blockedFor(RULE, 'a')).toBe(5 * MIN);
  });

  it('eventos durante o bloqueio não contam nem o prolongam', () => {
    for (let i = 0; i < 3; i++) store.hit(RULE, 'a');
    jest.advanceTimersByTime(MIN);
    expect(store.hit(RULE, 'a')).toBe(false);
    expect(store.blockedFor(RULE, 'a')).toBe(4 * MIN);
  });

  it('sem maxBlockMs o bloqueio não cresce', () => {
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) store.hit(RULE, 'a');
      expect(store.blockedFor(RULE, 'a')).toBe(5 * MIN);
      jest.advanceTimersByTime(5 * MIN + 1);
    }
  });

  it('regras e chaves são independentes', () => {
    const other = { ...RULE, name: 'u' };
    for (let i = 0; i < 3; i++) store.hit(RULE, 'a');
    expect(store.blockedFor(RULE, 'b')).toBe(0);
    expect(store.blockedFor(other, 'a')).toBe(0);
  });

  it('assert lança 429 com a mensagem da regra', () => {
    for (let i = 0; i < 3; i++) store.hit(RULE, 'a');
    expect(() => store.assert(RULE, 'a', (w) => `Espere ${w}.`)).toThrow('Espere 5 minuto(s).');
    expect(() => store.assert(RULE, 'b')).not.toThrow();
  });

  it('clear esquece a chave', () => {
    for (let i = 0; i < 3; i++) store.hit(RULE, 'a');
    store.clear(RULE, 'a');
    expect(store.blockedFor(RULE, 'a')).toBe(0);
  });
});

describe('formatWait', () => {
  it.each([
    [30_000, '1 minuto(s)'],
    [15 * MIN, '15 minuto(s)'],
    [119 * MIN, '119 minuto(s)'],
    [120 * MIN, '2 hora(s)'],
    [24 * 60 * MIN, '24 hora(s)'],
  ])('%d ms → %s', (ms, text) => expect(formatWait(ms)).toBe(text));
});
