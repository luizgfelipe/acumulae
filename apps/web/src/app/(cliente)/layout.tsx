'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { CustomerContext } from '@/components/customer-context';
import { CustomerShell } from '@/components/customer-shell';
import { FullPageSpinner } from '@/components/ui';
import { useMe } from '@/lib/customer';

/**
 * Layout das telas do cliente (Cartões, Meu QR, Ler QR, Conta, cartão). O cliente é carregado uma vez
 * e o cabeçalho e o menu inferior ficam montados entre as trocas de tela: só o conteúdo muda.
 * Na home sem login, a própria página mostra a landing (sem o menu).
 */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === '/';
  const { me, loading, reload } = useMe();

  useEffect(() => {
    if (loading) return;
    const here = encodeURIComponent(window.location.pathname + window.location.search);
    if (!me && !isHome) router.replace(`/entrar?next=${here}`);
    else if (me && !me.profileComplete) router.replace(isHome ? '/completar-perfil' : `/completar-perfil?next=${here}`);
  }, [loading, me, isHome, router]);

  if (loading) return <FullPageSpinner />;
  if (!me) {
    if (!isHome) return <FullPageSpinner />;
    return <CustomerContext.Provider value={{ me: null, reload }}>{children}</CustomerContext.Provider>;
  }
  if (!me.profileComplete) return <FullPageSpinner />;

  return (
    <CustomerContext.Provider value={{ me, reload }}>
      <CustomerShell>{children}</CustomerShell>
    </CustomerContext.Provider>
  );
}
