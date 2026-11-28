import { Injectable, Logger } from '@nestjs/common';
import { IdentityProvider } from '@prisma/client';
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from 'jose';
import { config } from '../common/config';
import { randomToken } from '../common/crypto';
import { badRequest, notFound } from '../common/errors';
import { tr } from '../common/region';

export type ProviderKey = 'google' | 'apple';

export interface SocialProfile {
  provider: IdentityProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/** Login social via OpenID Connect (authorization code flow), sem dependências extras. */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger('OAuth');

  enabled(provider: ProviderKey) {
    return provider === 'google' ? config.google.enabled : config.apple.enabled;
  }

  assertEnabled(provider: string): asserts provider is ProviderKey {
    if ((provider !== 'google' && provider !== 'apple') || !this.enabled(provider)) {
      throw notFound(tr('Login social indisponível.', 'Início de sessão com conta social indisponível.'), 'PROVIDER_DISABLED');
    }
  }

  redirectUri(provider: ProviderKey) {
    return `${config.publicUrl}/api/auth/oauth2/${provider}/callback`;
  }

  newStateAndNonce() {
    return { state: randomToken(24), nonce: randomToken(24) };
  }

  authorizationUrl(provider: ProviderKey, state: string, nonce: string) {
    if (provider === 'google') {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.search = new URLSearchParams({
        client_id: config.google.clientId,
        redirect_uri: this.redirectUri('google'),
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        prompt: 'select_account',
      }).toString();
      return u.toString();
    }
    const u = new URL('https://appleid.apple.com/auth/authorize');
    u.search = new URLSearchParams({
      client_id: config.apple.clientId,
      redirect_uri: this.redirectUri('apple'),
      response_type: 'code',
      response_mode: 'form_post',
      scope: 'name email',
      state,
      nonce,
    }).toString();
    return u.toString();
  }

  async exchange(provider: ProviderKey, code: string, nonce: string, appleUserJson?: string): Promise<SocialProfile> {
    return provider === 'google' ? this.exchangeGoogle(code, nonce) : this.exchangeApple(code, nonce, appleUserJson);
  }

  private async postToken(url: string, params: Record<string, string>) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
    if (!res.ok || !body.id_token) {
      this.logger.warn(`Troca de código falhou (${url}): ${res.status} ${body.error ?? ''}`);
      throw badRequest('OAUTH_FAILED', tr('Não foi possível concluir o login. Tente novamente.', 'Não foi possível iniciar sessão. Tente novamente.'));
    }
    return body.id_token;
  }

  private async exchangeGoogle(code: string, nonce: string): Promise<SocialProfile> {
    const idToken = await this.postToken('https://oauth2.googleapis.com/token', {
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: this.redirectUri('google'),
      grant_type: 'authorization_code',
    });
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: config.google.clientId,
    });
    if (payload.nonce !== nonce) throw badRequest('OAUTH_FAILED', tr('Falha na verificação do login.', 'Falha na verificação do início de sessão.'));
    return {
      provider: 'GOOGLE',
      subject: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  }

  private async appleClientSecret() {
    const key = await importPKCS8(config.apple.privateKey, 'ES256');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.apple.keyId })
      .setIssuer(config.apple.teamId)
      .setSubject(config.apple.clientId)
      .setAudience('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  }

  private async exchangeApple(code: string, nonce: string, userJson?: string): Promise<SocialProfile> {
    const idToken = await this.postToken('https://appleid.apple.com/auth/token', {
      code,
      client_id: config.apple.clientId,
      client_secret: await this.appleClientSecret(),
      redirect_uri: this.redirectUri('apple'),
      grant_type: 'authorization_code',
    });
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: config.apple.clientId,
    });
    if (payload.nonce !== nonce) throw badRequest('OAUTH_FAILED', tr('Falha na verificação do login.', 'Falha na verificação do início de sessão.'));

    // A Apple só envia o nome na PRIMEIRA autorização (campo "user" do form_post): salvar agora.
    let name: string | null = null;
    if (userJson) {
      try {
        const u = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
        name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(' ') || null;
      } catch {
        /* ignora */
      }
    }
    return {
      provider: 'APPLE',
      subject: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name,
    };
  }
}
