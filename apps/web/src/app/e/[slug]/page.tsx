'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { PublicShell } from '@/components/customer-shell';
import { StampGrid } from '@/components/stamps';
import { Alert, Button, FullPageSpinner, LinkButton, TenantAvatar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { BrandColors, cardTheme } from '@/lib/card-theme';
import type { StampStyle } from '@/lib/stamp-icons';
import { useMe } from '@/lib/customer';

interface PublicTenant extends BrandColors, StampStyle {
  name: string;
  slug: string;
  active: boolean;
  logoUrl: string | null;
  programs: Array<{ id: string; name: string; goal: number; unitLabel: string; unitLabelPlural: string; rewardDescription: string; redeemWeekdaysText: string | null }>;
}

export default function Page() {
  return (
    <Suspense>
      <StoreLanding />
    </Suspense>
  );
}

/** Fluxo 6.1: cadastro pelo QR fixo do balcão. */
function StoreLanding() {
  const { slug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { me, loading } = useMe();
  const [tenant, setTenant] = useState<PublicTenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const autoJoined = useRef(false);

  useEffect(() => {
    api<PublicTenant>(`/api/public/tenants/${slug}`).then(setTenant).catch((e) => setError(errorMessage(e)));
  }, [slug]);

  const join = useCallback(async () => {
    setJoining(true);
    try {
      const r = await api<{ membershipId: string }>('/api/me/memberships', { method: 'POST', body: { slug } });
      router.replace(`/cartao/${r.membershipId}?novo=1`);
    } catch (e) {
      setError(errorMessage(e));
      setJoining(false);
    }
  }, [slug, router]);

  // Voltando do cadastro/login com ?join=1, já cria o vínculo (Q-04).
  useEffect(() => {
    if (me?.profileComplete && params.get('join') === '1' && tenant?.active && !autoJoined.current) {
      autoJoined.current = true;
      join();
    }
  }, [me, params, tenant, join]);

  if (error && !tenant) {
    return (
      <PublicShell>
        <Alert>{error}</Alert>
      </PublicShell>
    );
  }
  if (!tenant || loading) return <FullPageSpinner />;

  const programs = tenant.programs;
  const th = cardTheme(tenant);
  const back = encodeURIComponent(`/e/${slug}?join=1`);

  return (
    <PublicShell>
      <div className="overflow-hidden rounded-3xl border-2 bg-white shadow-sm" style={{ borderColor: th.border }}>
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-6 text-center" style={th.header}>
          <TenantAvatar name={tenant.name} logoUrl={tenant.logoUrl} color="rgba(255,255,255,0.25)" size={72} />
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
        </div>
        {programs.length === 0 && (
          <p className="p-6 text-center text-stone-600">O programa de fidelidade deste estabelecimento está sendo preparado. Volte em breve!</p>
        )}
        {programs.length === 1 && (
          <div className="space-y-5 p-6">
            <p className="text-center text-lg">
              Participe do programa de fidelidade: a cada <strong>{programs[0].goal} {programs[0].unitLabelPlural}</strong>, ganhe{' '}
              <strong>{programs[0].rewardDescription}</strong>.
            </p>
            <StampGrid filled={0} goal={programs[0].goal} color={th.accent} checkColor={th.accentFg} size={programs[0].goal > 15 ? 'sm' : 'md'} />
            {programs[0].redeemWeekdaysText && <p className="text-center text-sm text-stone-500">Resgate: {programs[0].redeemWeekdaysText}.</p>}
          </div>
        )}
        {programs.length > 1 && (
          <div className="space-y-3 p-6">
            <p className="text-center text-lg">Participe dos nossos programas de fidelidade:</p>
            {programs.map((p) => (
              <div key={p.id} className="rounded-2xl border border-stone-200 px-4 py-3">
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-stone-600">
                  A cada {p.goal} {p.unitLabelPlural}, ganhe {p.rewardDescription}.
                  {p.redeemWeekdaysText ? ` Resgate: ${p.redeemWeekdaysText}.` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {!tenant.active && <Alert kind="warning">Este estabelecimento está com o programa pausado no momento.</Alert>}
        {error && <Alert>{error}</Alert>}
        {programs.length === 0 ? null : me ? (
          <Button size="lg" className="w-full" onClick={join} loading={joining} disabled={!tenant.active}>
            Participar com minha conta
          </Button>
        ) : (
          <>
            <LinkButton href={`/cadastro?next=${back}`} className="h-13 w-full text-lg">
              Criar conta e participar
            </LinkButton>
            <LinkButton href={`/entrar?next=${back}`} variant="secondary" className="h-13 w-full text-lg">
              Já tenho conta
            </LinkButton>
          </>
        )}
      </div>
    </PublicShell>
  );
}
