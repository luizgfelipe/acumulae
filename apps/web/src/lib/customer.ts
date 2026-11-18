'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from './api';

export interface Me {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  hasPassword: boolean;
  profileComplete: boolean;
  pendingConsents: number;
}

export interface TenantBrief {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  active: boolean;
}

export interface MembershipCard {
  membershipId: string;
  balance: number;
  goal: number;
  rewardsAvailable: number;
  unitLabel: string;
  unitLabelPlural: string;
  rewardDescription: string;
  tenant: TenantBrief;
  marketingConsent: boolean | null;
  lastVisitAt: string | null;
}

/**
 * Carrega o cliente logado. Com `required`, manda para /entrar (ou /completar-perfil)
 * preservando a página atual em `next`.
 */
export function useMe({ required = false, allowIncomplete = false } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const m = await api<Me>('/api/me');
      setMe(m);
      if (required && !allowIncomplete && !m.profileComplete) {
        router.replace(`/completar-perfil?next=${encodeURIComponent(currentPath(pathname))}`);
      }
    } catch (e) {
      setMe(null);
      if (required && e instanceof ApiError && e.status === 401) {
        router.replace(`/entrar?next=${encodeURIComponent(currentPath(pathname))}`);
      }
    } finally {
      setLoading(false);
    }
  }, [required, allowIncomplete, router, pathname]);

  useEffect(() => {
    load();
  }, [load]);

  return { me, loading, reload: load };
}

function currentPath(pathname: string) {
  if (typeof window === 'undefined') return pathname;
  return window.location.pathname + window.location.search;
}

export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
}
