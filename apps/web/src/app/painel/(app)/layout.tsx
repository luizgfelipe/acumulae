'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { PanelContext } from '@/components/panel-context';
import { Alert, FullPageSpinner, Logo, TenantAvatar, cx } from '@/components/ui';
import { staffLogout, useStaff } from '@/lib/staff';

const NAV = [
  { href: '/painel', label: 'Indicadores' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/movimentacoes', label: 'Movimentações' },
  { href: '/painel/programas', label: 'Programas' },
  { href: '/painel/perfil', label: 'Perfil' },
  { href: '/painel/funcionarios', label: 'Funcionários' },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, reload } = useStaff('painel');
  const [menuOpen, setMenuOpen] = useState(false);

  // Fecha o menu mobile ao navegar.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Trava a rolagem da página com o menu aberto.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  if (!me?.context || me.context.role !== 'MANAGER') return <FullPageSpinner />;
  const ctx = me.context;

  const brand = (
    <div className="flex items-center gap-2">
      <Logo />
      <span className="text-stone-300">·</span>
      <TenantAvatar name={ctx.tenantName} logoUrl={ctx.logoUrl} color={ctx.primaryColor} size={32} />
    </div>
  );

  return (
    <PanelContext.Provider value={{ me, reload }}>
      <div className="min-h-dvh bg-stone-100 md:flex">
        {/* Mobile: barra superior com hambúrguer */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 md:hidden">
          {brand}
          <button
            onClick={() => setMenuOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-xl text-stone-700 hover:bg-stone-100 transition-colors"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </header>

        {/* Mobile: gaveta */}
        {menuOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
            <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                {brand}
                <button
                  onClick={() => setMenuOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-xl text-2xl leading-none text-stone-600 hover:bg-stone-100 transition-colors"
                  aria-label="Fechar menu"
                >
                  ×
                </button>
              </div>
              <SideMenu pathname={pathname} hasManyWorkplaces={me.workplaces.length > 1} userName={me.user.name} />
            </div>
          </div>
        )}

        {/* Desktop: barra lateral */}
        <aside className="no-print hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-stone-200 md:bg-white">
          <div className="px-4 py-4">{brand}</div>
          <SideMenu pathname={pathname} hasManyWorkplaces={me.workplaces.length > 1} userName={me.user.name} />
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

function SideMenu({ pathname, hasManyWorkplaces, userName }: { pathname: string; hasManyWorkplaces: boolean; userName: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <nav className="flex flex-col gap-1 px-3 py-2">
        {NAV.map((n) => {
          const active = n.href === '/painel' ? pathname === '/painel' : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'relative rounded-lg px-3 py-2.5 text-sm font-medium transition duration-150',
                active
                  ? 'bg-brand-50 text-brand-700 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-brand-600'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 motion-safe:hover:translate-x-0.5',
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-1 border-t border-stone-100 px-3 py-3 text-sm">
        <Link href="/caixa" className="block rounded-lg px-3 py-2.5 font-semibold text-brand-700 hover:bg-brand-50 transition-colors">
          Abrir o caixa →
        </Link>
        {hasManyWorkplaces && (
          <Link href="/caixa/unidade?next=/painel" className="block rounded-lg px-3 py-2.5 text-stone-600 hover:bg-stone-100 transition-colors">
            Trocar estabelecimento
          </Link>
        )}
        <button
          onClick={async () => {
            await staffLogout();
            router.replace('/painel/entrar');
          }}
          className="block w-full rounded-lg px-3 py-2.5 text-left text-stone-600 hover:bg-stone-100 transition-colors"
        >
          Sair ({userName.split(' ')[0]})
        </button>
      </div>
    </div>
  );
}
