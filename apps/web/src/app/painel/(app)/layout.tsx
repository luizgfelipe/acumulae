'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { PanelContext } from '@/components/panel-context';
import { Alert, FullPageSpinner, Logo, TenantAvatar, cx } from '@/components/ui';
import { staffLogout, useStaff } from '@/lib/staff';

const NAV = [
  { href: '/painel', label: 'Indicadores' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/movimentacoes', label: 'Movimentações' },
  { href: '/painel/programa', label: 'Programa' },
  { href: '/painel/unidades', label: 'Unidades' },
  { href: '/painel/funcionarios', label: 'Funcionários' },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, reload } = useStaff('painel');

  if (!me?.context || me.context.role !== 'MANAGER') return <FullPageSpinner />;
  const ctx = me.context;

  return (
    <PanelContext.Provider value={{ me, reload }}>
      <div className="min-h-dvh bg-stone-100 md:flex">
        <aside className="no-print border-b border-stone-200 bg-white md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0">
          <div className="flex items-center justify-between px-4 py-4 md:block">
            <Logo />
            <div className="flex items-center gap-2 md:mt-5">
              <TenantAvatar name={ctx.tenantName} logoUrl={ctx.logoUrl} color={ctx.primaryColor} size={32} />
              <span className="max-w-40 truncate text-sm font-semibold">{ctx.tenantName}</span>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3">
            {NAV.map((n) => {
              const active = n.href === '/painel' ? pathname === '/painel' : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx(
                    'shrink-0 rounded-lg px-3 py-2 text-sm font-medium',
                    active ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:bg-stone-100',
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden space-y-1 border-t border-stone-100 px-3 py-3 text-sm md:block">
            <Link href="/caixa" className="block rounded-lg px-3 py-2 font-semibold text-brand-700 hover:bg-brand-50">
              Abrir o caixa →
            </Link>
            {me.workplaces.length > 1 && (
              <Link href="/caixa/unidade?next=/painel" className="block rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100">
                Trocar estabelecimento
              </Link>
            )}
            <button
              onClick={async () => {
                await staffLogout();
                router.replace('/painel/entrar');
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-stone-600 hover:bg-stone-100"
            >
              Sair ({me.user.name.split(' ')[0]})
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          {ctx.tenantStatus !== 'ACTIVE' && (
            <div className="mb-4">
              <Alert>Este estabelecimento está suspenso: o caixa e o painel estão bloqueados. Fale com o suporte do Acumulae.</Alert>
            </div>
          )}
          {children}
        </main>
      </div>
    </PanelContext.Provider>
  );
}
