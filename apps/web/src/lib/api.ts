/**
 * Cliente HTTP do app. Todas as chamadas vão para /api/* (mesmo domínio; o Next repassa
 * para a API). A sessão fica em cookies httpOnly: quando o access token vence (401),
 * renova uma vez via refresh e repete a chamada.
 */

import { tr } from './region';

export type Realm = 'customer' | 'staff';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const REFRESH_PATH: Record<Realm, string> = {
  customer: '/api/auth/refresh',
  staff: '/api/staff/auth/refresh',
};

const refreshing: Partial<Record<Realm, Promise<boolean>>> = {};

function refresh(realm: Realm): Promise<boolean> {
  if (!refreshing[realm]) {
    refreshing[realm] = fetch(REFRESH_PATH[realm], { method: 'POST', credentials: 'same-origin' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => delete refreshing[realm], 0);
      });
  }
  return refreshing[realm]!;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  headers?: Record<string, string>;
  realm?: Realm;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const realm = opts.realm ?? 'customer';
  let url = path;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };

  let res = await fetch(url, init);
  if (res.status === 401 && !path.includes('/auth/')) {
    if (await refresh(realm)) res = await fetch(url, init);
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, d.code ?? 'HTTP_ERROR', d.message ?? tr('Algo deu errado. Tente novamente.', 'Algo correu mal. Tente novamente.'), d.details);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export const staffApi = <T = unknown>(path: string, opts: Omit<RequestOptions, 'realm'> = {}) =>
  api<T>(path, { ...opts, realm: 'staff' });

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message === 'Failed to fetch') return tr('Sem conexão. Verifique sua internet.', 'Sem ligação. Verifique a sua ligação à internet.');
  return tr('Algo deu errado. Tente novamente.', 'Algo correu mal. Tente novamente.');
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
