'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, staffApi } from './api';

export interface Workplace {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: 'ACTIVE' | 'SUSPENDED';
  logoUrl: string | null;
  primaryColor: string | null;
  role: 'MANAGER' | 'ATTENDANT';
  stores: { id: string; name: string }[];
}

export interface StaffMe {
  user: { id: string; name: string; email: string };
  workplaces: Workplace[];
  context: {
    tenantId: string;
    tenantName: string;
    tenantStatus: 'ACTIVE' | 'SUSPENDED';
    role: 'MANAGER' | 'ATTENDANT';
    logoUrl: string | null;
    primaryColor: string | null;
    storeId: string | null;
    storeName: string | null;
  } | null;
}

export type StaffArea = 'caixa' | 'painel';

/**
 * Carrega o funcionário logado. Sem sessão → /{area}/entrar.
 * Sem contexto (estabelecimento/unidade) → /caixa/unidade.
 */
export function useStaff(area: StaffArea, { needStore = false } = {}) {
  const router = useRouter();
  const [me, setMe] = useState<StaffMe | null>(null);

  const load = useCallback(async () => {
    try {
      const m = await staffApi<StaffMe>('/api/staff/auth/me');
      setMe(m);
      const next = encodeURIComponent(window.location.pathname);
      if (!m.context || (needStore && !m.context.storeId)) {
        router.replace(`/caixa/unidade?next=${next}`);
      } else if (area === 'painel' && m.context.role !== 'MANAGER') {
        router.replace('/caixa');
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace(`/${area}/entrar?next=${encodeURIComponent(window.location.pathname)}`);
      }
    }
  }, [area, needStore, router]);

  useEffect(() => {
    load();
  }, [load]);

  return { me, reload: load };
}

export async function staffLogout() {
  await staffApi('/api/staff/auth/logout', { method: 'POST' }).catch(() => undefined);
}
