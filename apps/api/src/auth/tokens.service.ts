import { Injectable } from '@nestjs/common';
import { JWTPayload, SignJWT, jwtVerify } from 'jose';
import { config } from '../common/config';

export type PrincipalType = 'customer' | 'staff';

export interface AccessClaims {
  sub: string;
  typ: PrincipalType;
  sid: string;
}

export const ACCESS_TTL_SECONDS = 15 * 60;

/** JWTs de curta duração (HS256). */
@Injectable()
export class TokensService {
  private key() {
    return new TextEncoder().encode(config.jwtSecret);
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ typ: claims.typ, sid: claims.sid })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
      .setAudience('acumulae:access')
      .sign(this.key());
  }

  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key(), { audience: 'acumulae:access', algorithms: ['HS256'] });
      if (!payload.sub || (payload.typ !== 'customer' && payload.typ !== 'staff') || typeof payload.sid !== 'string') {
        return null;
      }
      return { sub: payload.sub, typ: payload.typ, sid: payload.sid };
    } catch {
      return null;
    }
  }

  /** JWT genérico de curta duração para estados intermediários (OAuth, tickets de resgate etc.). */
  async signShort(audience: string, payload: JWTPayload, ttlSeconds: number): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .setAudience(audience)
      .sign(this.key());
  }

  async verifyShort<T>(audience: string, token: string | undefined | null): Promise<T | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key(), { audience, algorithms: ['HS256'] });
      return payload as unknown as T;
    } catch {
      return null;
    }
  }
}
