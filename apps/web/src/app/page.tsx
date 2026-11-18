'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { CustomerShell, PublicShell } from '@/components/customer-shell';
import { ProgressBar } from '@/components/stamps';
import { Alert, Badge, Card, FullPageSpinner, LinkButton, TenantAvatar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { MembershipCard, useMe } from '@/lib/customer';
import { plural, readableOn } from '@/lib/format';

export default function HomePage() {
  const router = useRouter();
  const { me, loading } = useMe();

  useEffect(() => {
    if (me && !me.profileComplete) router.replace('/completar-perfil');
  }, [me, router]);

  if (loading) return <FullPageSpinner />;
  if (!me) return <Landing />;
  return (
    <CustomerShell>
      <Cards firstName={me.name.split(' ')[0]} />
    </CustomerShell>
  );
}

function Landing() {
  return (
    <PublicShell>
      <section className="space-y-6 pt-6">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
          Seu cartão fidelidade,
          <br />
          <span className="text-brand-600">sem papel.</span>
        </h1>
        <p className="text-lg text-stone-600">
          Acumule rodízios, sobremesas e o que mais você ama nos restaurantes participantes. Tudo numa conta só, e você nunca perde o
          progresso.
        </p>
        <div className="grid gap-3 pt-2">
          <LinkButton href="/cadastro" className="h-13 text-lg">
            Criar minha conta
          </LinkButton>
          <LinkButton href="/entrar" variant="secondary" className="h-13 text-lg">
            Já tenho conta
          </LinkButton>
        </div>
        <ol className="grid gap-3 pt-6 text-stone-700">
          {[
            ['1', 'Crie sua conta grátis em menos de 1 minuto.'],
            ['2', 'No caixa, mostre seu QR ou escaneie o QR do atendente.'],
            ['3', 'Bateu a meta? A recompensa aparece aqui na hora.'],
          ].map(([n, t]) => (
            <li key={n} className="flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{n}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
      </section>
    </PublicShell>
  );
}

function Cards({ firstName }: { firstName: string }) {
  const [cards, setCards] = useState<MembershipCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<MembershipCard[]>('/api/me/memberships')
      .then(setCards)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!cards) return <FullPageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between pt-2">
        <div>
          <p className="text-stone-500">Olá, {firstName}!</p>
          <h1 className="text-2xl font-bold">Seus cartões</h1>
        </div>
        <LinkButton href="/qr" variant="dark" className="h-10 text-sm">
          Meu QR
        </LinkButton>
      </div>

      {cards.length === 0 && (
        <Card className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-brand-700">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
            </svg>
          </div>
          <h2 className="font-semibold">Nenhum cartão ainda</h2>
          <p className="mt-1 text-sm text-stone-600">
            No próximo restaurante participante, mostre seu QR no caixa ou escaneie o QR do balcão para começar a acumular.
          </p>
        </Card>
      )}

      {cards.map((c) => (
        <MembershipTile key={c.membershipId} card={c} />
      ))}
    </div>
  );
}

function MembershipTile({ card: c }: { card: MembershipCard }) {
  const color = c.tenant.primaryColor;
  const fg = readableOn(color);
  const missing = Math.max(0, c.goal - c.balance);
  return (
    <Link
      href={`/cartao/${c.membershipId}`}
      className="block overflow-hidden rounded-2xl border-2 bg-white shadow-lg shadow-stone-900/10 transition hover:shadow-xl active:scale-[0.99]"
      style={{ borderColor: color }}
    >
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: color, color: fg }}>
        <TenantAvatar name={c.tenant.name} logoUrl={c.tenant.logoUrl} color="rgba(255,255,255,0.25)" size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{c.tenant.name}</p>
          <p className="truncate text-xs opacity-85">{c.rewardDescription}</p>
        </div>
        <span className="text-2xl font-extrabold tabular-nums">
          {c.balance}
          <span className="text-base font-semibold opacity-80">/{c.goal}</span>
        </span>
      </div>
      <div className="space-y-2 px-4 py-3">
        <ProgressBar value={c.balance} max={c.goal} color={color} />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-stone-600">
            {missing === 0 ? 'Meta atingida!' : `Faltam ${plural(missing, c.unitLabel, c.unitLabelPlural)}`}
          </span>
          {c.rewardsAvailable > 0 && (
            <Badge color="green">{c.rewardsAvailable === 1 ? 'Recompensa disponível' : `${c.rewardsAvailable} recompensas disponíveis`}</Badge>
          )}
          {!c.tenant.active && <Badge color="amber">Pausado</Badge>}
        </div>
      </div>
    </Link>
  );
}
