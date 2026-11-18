'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Alert, Badge, FullPageSpinner, Logo, TenantAvatar } from '@/components/ui';
import { ApiError, errorMessage, staffApi } from '@/lib/api';
import { StaffMe, Workplace } from '@/lib/staff';

export default function Page() {
  return (
    <Suspense>
      <ChooseStore />
    </Suspense>
  );
}

/** Seleção do estabelecimento e da unidade ao entrar (seção 7.2). */
function ChooseStore() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/caixa';
  const [me, setMe] = useState<StaffMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    staffApi<StaffMe>('/api/staff/auth/me')
      .then(setMe)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/caixa/entrar');
        else setError(errorMessage(e));
      });
  }, [router]);

  async function choose(w: Workplace, storeId: string | null) {
    setBusy(true);
    try {
      await staffApi('/api/staff/auth/context', { method: 'POST', body: { tenantId: w.tenantId, storeId } });
      router.replace(next.startsWith('/painel') && w.role === 'MANAGER' ? next : storeId ? '/caixa' : '/painel');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  if (!me) return error ? <div className="p-6"><Alert>{error}</Alert></div> : <FullPageSpinner />;

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-5 py-6">
      <Logo />
      <h1 className="mt-6 mb-1 text-xl font-bold">Olá, {me.user.name.split(' ')[0]}!</h1>
      <p className="mb-6 text-stone-600">Escolha onde você está trabalhando agora.</p>
      {error && <Alert>{error}</Alert>}
      <div className="space-y-4">
        {me.workplaces.map((w) => (
          <div key={w.tenantId} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-3">
              <TenantAvatar name={w.tenantName} logoUrl={w.logoUrl} color={w.primaryColor} size={40} />
              <div className="flex-1">
                <p className="font-semibold">{w.tenantName}</p>
                <p className="text-xs text-stone-500">{w.role === 'MANAGER' ? 'Gestor' : 'Atendente'}</p>
              </div>
              {w.tenantStatus === 'SUSPENDED' && <Badge color="red">Suspenso</Badge>}
            </div>
            <div className="grid gap-2">
              {w.stores.map((s) => (
                <button
                  key={s.id}
                  disabled={busy}
                  onClick={() => choose(w, s.id)}
                  className="flex h-12 items-center justify-between rounded-xl border border-stone-200 px-4 text-left font-medium hover:border-brand-500 hover:bg-brand-50"
                >
                  {s.name}
                  <span className="text-stone-400">→</span>
                </button>
              ))}
              {w.stores.length === 0 && <p className="text-sm text-stone-500">Nenhuma unidade ativa liberada para você.</p>}
              {w.role === 'MANAGER' && (
                <button disabled={busy} onClick={() => choose(w, null)} className="h-10 rounded-xl text-sm font-semibold text-brand-700 hover:bg-brand-50">
                  Só o painel (sem caixa)
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
