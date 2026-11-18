import { CookieOptions, Response } from 'express';
import { config } from '../common/config';
import { ACCESS_TTL_SECONDS, PrincipalType } from './tokens.service';

export const REFRESH_TTL_DAYS = 180;

export const COOKIE_NAMES = {
  customer: { access: 'acu_at', refresh: 'acu_rt', refreshPath: '/api/auth' },
  staff: { access: 'acu_sat', refresh: 'acu_srt', refreshPath: '/api/staff/auth' },
} as const;

function base(): CookieOptions {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax' };
}

export function setAuthCookies(res: Response, kind: PrincipalType, access: string, refresh?: string) {
  const n = COOKIE_NAMES[kind];
  res.cookie(n.access, access, { ...base(), path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 });
  if (refresh) {
    res.cookie(n.refresh, refresh, { ...base(), path: n.refreshPath, maxAge: REFRESH_TTL_DAYS * 86400_000 });
  }
}

export function clearAuthCookies(res: Response, kind: PrincipalType) {
  const n = COOKIE_NAMES[kind];
  res.clearCookie(n.access, { ...base(), path: '/' });
  res.clearCookie(n.refresh, { ...base(), path: n.refreshPath });
}

/** Cookie de estado do OAuth. A Apple devolve via POST cross-site, então precisa de SameSite=None (com HTTPS). */
export function oauthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSecure ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: 10 * 60_000,
  };
}
