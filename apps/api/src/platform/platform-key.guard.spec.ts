import { ExecutionContext } from '@nestjs/common';
import { PlatformKeyGuard } from './platform-key.guard';

/** RN-91 / RN-96: chave no header, IP opcionalmente restrito, recusas auditadas. */
describe('PlatformKeyGuard (RN-91)', () => {
  const audit = jest.fn(async (_: unknown) => ({}));
  const guard = new PlatformKeyGuard({ platformAuditLog: { create: audit } } as never);
  const env = { ...process.env };

  function ctx(headers: Record<string, string | undefined>, ip = '203.0.113.5'): ExecutionContext {
    const req = {
      method: 'GET',
      path: '/api/platform/tenants',
      ip,
      header: (name: string) => headers[name.toLowerCase()],
    };
    return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  }

  const statusOf = async (p: Promise<unknown>) => {
    try {
      await p;
      return 200;
    } catch (e) {
      return (e as { getStatus(): number }).getStatus();
    }
  };

  beforeEach(() => {
    audit.mockClear();
    process.env.PLATFORM_API_KEY = 'chave-certa';
    process.env.PLATFORM_ALLOWED_IPS = '';
  });

  afterAll(() => {
    process.env = env;
  });

  it('aceita a chave correta', async () => {
    await expect(guard.canActivate(ctx({ 'x-platform-key': 'chave-certa' }))).resolves.toBe(true);
    expect(audit).not.toHaveBeenCalled();
  });

  it.each([{}, { 'x-platform-key': '' }, { 'x-platform-key': 'chave-errada' }, { 'x-platform-key': 'chave-cert' }])(
    'recusa com 401: %p',
    async (headers) => {
      expect(await statusOf(guard.canActivate(ctx(headers)))).toBe(401);
    },
  );

  it('sem chave configurada no servidor, nada passa', async () => {
    process.env.PLATFORM_API_KEY = '';
    expect(await statusOf(guard.canActivate(ctx({ 'x-platform-key': '' })))).toBe(401);
  });

  it('com lista de IPs, recusa IP de fora com 403', async () => {
    process.env.PLATFORM_ALLOWED_IPS = '198.51.100.1, 203.0.113.5';
    await expect(guard.canActivate(ctx({ 'x-platform-key': 'chave-certa' }, '::ffff:203.0.113.5'))).resolves.toBe(true);
    expect(await statusOf(guard.canActivate(ctx({ 'x-platform-key': 'chave-certa' }, '192.0.2.9')))).toBe(403);
  });

  it('registra as tentativas recusadas no log de auditoria (RN-96)', async () => {
    await statusOf(guard.canActivate(ctx({ 'x-platform-key': 'errada' }, '192.0.2.9')));
    expect(audit).toHaveBeenCalledWith({
      data: { action: 'GET /api/platform/tenants [recusado]', statusCode: 401, sourceIp: '192.0.2.9' },
    });
  });
});
