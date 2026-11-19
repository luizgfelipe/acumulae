import { PersonalQrService, QR_PERIOD_SECONDS } from './personal-qr.service';

/** RN-51: QR pessoal dinâmico, muda a cada 30 s, assinado pelo servidor. */
describe('PersonalQrService (RN-51)', () => {
  const qr = new PersonalQrService();
  const id = '6f1c2a4e-1b2c-4d5e-8f90-123456789abc';
  // Início exato de um período de 30 s.
  const t0 = Math.floor(Date.UTC(2026, 10, 18, 12) / 30_000) * 30_000;

  it('emite AC1.{id}.{período}.{assinatura} com validade até o fim do período', () => {
    const r = qr.issue(id, t0 + 10_000);
    expect(r.payload).toMatch(new RegExp(`^AC1\\.${id}\\.\\d+\\.[A-Za-z0-9_-]{16}$`));
    expect(new Date(r.expiresAt).getTime()).toBe(t0 + 30_000);
    expect(r.periodSeconds).toBe(QR_PERIOD_SECONDS);
  });

  it('muda a cada período', () => {
    expect(qr.issue(id, t0).payload).toBe(qr.issue(id, t0 + 29_999).payload);
    expect(qr.issue(id, t0).payload).not.toBe(qr.issue(id, t0 + 30_000).payload);
  });

  it('é válido dentro do período', () => {
    const { payload } = qr.issue(id, t0);
    expect(qr.verify(payload, t0)).toBe(id);
    expect(qr.verify(payload, t0 + 29_000)).toBe(id);
  });

  it('tem 5 s de tolerância depois da virada', () => {
    const { payload } = qr.issue(id, t0);
    expect(qr.verify(payload, t0 + 35_000)).toBe(id);
    expect(qr.verify(payload, t0 + 35_001)).toBeNull();
  });

  it('um print não vale depois de ~35 segundos', () => {
    const { payload } = qr.issue(id, t0);
    expect(qr.verify(payload, t0 + 60_000)).toBeNull();
    expect(qr.verify(payload, t0 + 24 * 3600_000)).toBeNull();
  });

  it('não aceita QR "do futuro" além da tolerância', () => {
    const { payload } = qr.issue(id, t0 + 60_000);
    expect(qr.verify(payload, t0 + 55_000)).toBe(id);
    expect(qr.verify(payload, t0 + 54_999)).toBeNull();
  });

  it('recusa assinatura adulterada', () => {
    const { payload } = qr.issue(id, t0);
    const forged = payload.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    expect(qr.verify(forged, t0)).toBeNull();
  });

  it('recusa trocar o cliente mantendo a assinatura', () => {
    const { payload } = qr.issue(id, t0);
    const other = '00000000-0000-4000-8000-000000000000';
    expect(qr.verify(payload.replace(id, other), t0)).toBeNull();
  });

  it('recusa trocar o período mantendo a assinatura', () => {
    const { payload } = qr.issue(id, t0);
    const [p, c, step, sig] = payload.split('.');
    expect(qr.verify([p, c, Number(step) + 1, sig].join('.'), t0 + 30_000)).toBeNull();
  });

  it.each(['', 'lixo', `AC2.${id}.1.abc`, `AC1.nao-uuid.1.abc`, `AC1.${id}.x.abc`, `AC1.${id}.1`])(
    'recusa formato inválido: "%s"',
    (payload) => {
      expect(qr.verify(payload, t0)).toBeNull();
    },
  );

  it('aceita espaços em volta (leitores de QR às vezes adicionam)', () => {
    const { payload } = qr.issue(id, t0);
    expect(qr.verify(`  ${payload}\n`, t0)).toBe(id);
  });
});
