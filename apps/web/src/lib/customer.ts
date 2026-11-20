'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from './api';
import { forgetPushDevice } from './push';
import type { BrandColors } from './card-theme';
import type { StampStyle } from './stamp-icons';

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

export interface TenantBrief extends BrandColors, StampStyle {
  name: string;
  slug: string;
  logoUrl: string | null;
  active: boolean;
}

export interface MembershipCard {
  membershipId: string;
  programId: string;
  programName: string;
  programActive: boolean;
  carryOverExcess: boolean;
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
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const m = await api<Me>('/api/me');
      setMe(m);
      if (required && !allowIncomplete && !m.profileComplete) {
        router.replace(`/completar-perfil?next=${encodeURIComponent(currentPath())}`);
      }
    } catch (e) {
      setMe(null);
      if (required && e instanceof ApiError && e.status === 401) {
        router.replace(`/entrar?next=${encodeURIComponent(currentPath())}`);
      }
    } finally {
      setLoading(false);
    }
    // O caminho atual é lido na hora (currentPath): trocar de tela não recarrega o cliente.
  }, [required, allowIncomplete, router]);

  useEffect(() => {
    load();
  }, [load]);

  return { me, loading, reload: load };
}

function currentPath() {
  return window.location.pathname + window.location.search;
}

export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export async function logout() {
  await forgetPushDevice();
  await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
}
