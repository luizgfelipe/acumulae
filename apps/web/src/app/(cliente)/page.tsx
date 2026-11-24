'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCustomer } from '@/components/customer-context';
import { Landing } from '@/components/landing';
import { InstallBanner } from '@/components/install-prompt';
import { CardWallet } from '@/components/card-wallet';
import { Alert, Card, FullPageSpinner, LinkButton } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { MembershipCard } from '@/lib/customer';

/** Home: cartões do cliente (o layout põe o cabeçalho e o menu) ou a landing, sem login. */
export default function HomePage() {
  const { me } = useCustomer();
  if (!me) return <Landing />;
  return <Cards firstName={me.name.split(' ')[0]} />;
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
        <div className="flex gap-2">
          <LinkButton href="/ler" variant="secondary" className="h-10 text-sm">
            Ler QR
          </LinkButton>
          <LinkButton href="/qr" variant="dark" className="h-10 text-sm">
            Meu QR
          </LinkButton>
        </div>
      </div>
      <InstallBanner />

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

      {cards.length > 0 && <CardWallet cards={cards} />}
    </div>
  );
}
