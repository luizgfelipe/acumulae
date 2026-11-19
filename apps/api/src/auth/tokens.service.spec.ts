import { SignJWT } from 'jose';
import { TokensService } from './tokens.service';

describe('TokensService', () => {
  const tokens = new TokensService();
  const key = (s: string) => new TextEncoder().encode(s);

  it('assina e valida o access token', async () => {
    const t = await tokens.signAccess({ sub: 'c1', typ: 'customer', sid: 's1' });
    await expect(tokens.verifyAccess(t)).resolves.toEqual({ sub: 'c1', typ: 'customer', sid: 's1' });
  });

  it('recusa token adulterado, vazio ou assinado com outro segredo', async () => {
    const t = await tokens.signAccess({ sub: 'c1', typ: 'customer', sid: 's1' });
    await expect(tokens.verifyAccess(t.slice(0, -2) + 'xx')).resolves.toBeNull();
    await expect(tokens.verifyAccess('')).resolves.toBeNull();
    const other = await new SignJWT({ typ: 'customer', sid: 's1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('c1')
      .setAudience('acumulae:access')
      .setExpirationTime('5m')
      .sign(key('outro-segredo'));
    await expect(tokens.verifyAccess(other)).resolves.toBeNull();
  });

  it('access token expira em 15 minutos', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-18T12:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const t = await tokens.signAccess({ sub: 'c1', typ: 'staff', sid: 's1' });
      jest.setSystemTime(new Date('2026-11-18T12:14:00Z'));
      await expect(tokens.verifyAccess(t)).resolves.not.toBeNull();
      jest.setSystemTime(new Date('2026-11-18T12:16:00Z'));
      await expect(tokens.verifyAccess(t)).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('um token curto (outra audiência) não serve como access token', async () => {
    const t = await tokens.signShort('pos-customer', { sub: 'c1', typ: 'customer', sid: 's1' }, 60);
    await expect(tokens.verifyAccess(t)).resolves.toBeNull();
  });

  it('recusa tipo de principal desconhecido', async () => {
    const t = await new SignJWT({ typ: 'admin', sid: 's1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('c1')
      .setAudience('acumulae:access')
      .setExpirationTime('5m')
      .sign(key(process.env.JWT_SECRET!));
    await expect(tokens.verifyAccess(t)).resolves.toBeNull();
  });

  it('signShort/verifyShort conferem a audiência', async () => {
    const t = await tokens.signShort('oauth', { state: 'x' }, 60);
    await expect(tokens.verifyShort<{ state: string }>('oauth', t)).resolves.toMatchObject({ state: 'x' });
    await expect(tokens.verifyShort('link', t)).resolves.toBeNull();
    await expect(tokens.verifyShort('oauth', undefined)).resolves.toBeNull();
  });
});
