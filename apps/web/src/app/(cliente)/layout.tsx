'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { CustomerContext } from '@/components/customer-context';
import { CustomerShell } from '@/components/customer-shell';
import { FullPageSpinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/customer';
import { syncPush } from '@/lib/push';

/** De quanto em quanto tempo o sino confere se chegou notificação nova (com o app aberto). */
const UNREAD_POLL_MS = 60_000;

/**
 * Layout das telas do cliente (Cartões, Meu QR, Ler QR, Conta, cartão, notificações). O cliente é
 * carregado uma vez e o cabeçalho e o menu inferior ficam montados entre as trocas de tela: só o
 * conteúdo muda. Na home sem login, a própria página mostra a landing (sem o menu).
 */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === '/';
  const { me, loading, reload } = useMe();
  const [unread, setUnread] = useState(0);
  const logged = !!me?.profileComplete;

  useEffect(() => {
    if (loading) return;
    const here = encodeURIComponent(window.location.pathname + window.location.search);
    if (!me && !isHome) router.replace(`/entrar?next=${here}`);
    else if (me && !me.profileComplete) router.replace(isHome ? '/completar-perfil' : `/completar-perfil?next=${here}`);
  }, [loading, me, isHome, router]);

  const refreshUnread = useCallback(() => {
    api<{ unread: number }>('/api/me/notifications/unread-count')
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
  }, []);

  // Confere ao abrir, ao trocar de tela, ao voltar para o app e a cada minuto.
  useEffect(() => {
    if (logged) refreshUnread();
  }, [logged, pathname, refreshUnread]);
  useEffect(() => {
    if (!logged) return;
    const t = setInterval(() => document.visibilityState === 'visible' && refreshUnread(), UNREAD_POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refreshUnread();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [logged, refreshUnread]);

  // Push: mantém a inscrição deste aparelho em dia e reage às notificações que chegam com o app aberto.
  useEffect(() => {
    if (!logged) return;
    syncPush();
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'push') refreshUnread();
      else if (e.data?.type === 'open' && typeof e.data.url === 'string' && e.data.url.startsWith('/') && !e.data.url.startsWith('//')) router.push(e.data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [logged, refreshUnread, router]);

  if (loading) return <FullPageSpinner />;
  if (!me) {
    if (!isHome) return <FullPageSpinner />;
    return <CustomerContext.Provider value={{ me: null, reload, unread: 0, setUnread }}>{children}</CustomerContext.Provider>;
  }
  if (!me.profileComplete) return <FullPageSpinner />;

  return (
    <CustomerContext.Provider value={{ me, reload, unread, setUnread }}>
      <CustomerShell unread={unread}>{children}</CustomerShell>
    </CustomerContext.Provider>
  );
}
