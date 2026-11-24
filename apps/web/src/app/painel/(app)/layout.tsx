'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { PanelContext } from '@/components/panel-context';
import { Alert, FullPageSpinner, Logo, TenantAvatar, cx } from '@/components/ui';
import { staffApi } from '@/lib/api';
import { CONTACT_EMAIL, mailtoContact } from '@/lib/contact';
import { PlanInfo, planNotice } from '@/lib/plan';
import { staffLogout, useStaff } from '@/lib/staff';
import { useLoad } from '@/lib/use-load';

/**
 * `feature`: recurso do plano; sem ele o item aparece com cadeado e a tela explica como liberar.
 * `hideWithout`: some do menu quando o plano não tem o recurso (ex.: Rede, que só faz sentido com várias unidades).
 */
const NAV: Array<{ href: string; label: string; feature?: 'reports' | 'networkDashboard'; hideWithout?: boolean }> = [
  { href: '/painel', label: 'Indicadores' },
  { href: '/painel/qr', label: 'QR do balcão' },
  { href: '/painel/clientes', label: 'Clientes' },
  { href: '/painel/movimentacoes', label: 'Movimentações' },
  { href: '/painel/notificacoes', label: 'Notificações' },
  { href: '/painel/relatorios', label: 'Relatórios', feature: 'reports' },
  { href: '/painel/rede', label: 'Rede', feature: 'networkDashboard', hideWithout: true },
  { href: '/painel/programas', label: 'Programas' },
  { href: '/painel/perfil', label: 'Perfil' },
  { href: '/painel/unidades', label: 'Unidades' },
  { href: '/painel/funcionarios', label: 'Funcionários' },
  { href: '/painel/plano', label: 'Meu plano' },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, reload: reloadMe } = useStaff('painel');
  const [menuOpen, setMenuOpen] = useState(false);
  const isManager = me?.context?.role === 'MANAGER';
  const tenantId = me?.context?.tenantId;
  // Plano vigente, limites e uso: carregado uma vez e recarregado quando algo muda no painel.
  const plan = useLoad(() => (isManager ? staffApi<PlanInfo>('/api/admin/plan') : Promise.resolve(null)), [isManager, tenantId]);
  const reloadPlan = plan.reload;
  const reload = useCallback(() => {
    reloadMe();
    reloadPlan();
  }, [reloadMe, reloadPlan]);

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
  const notice = plan.data ? planNotice(plan.data) : null;

  const brand = (
    <div className="flex items-center gap-2">
      <Logo />
      <span className="text-stone-300">·</span>
      <TenantAvatar name={ctx.tenantName} logoUrl={ctx.logoUrl} color={ctx.primaryColor} size={32} />
    </div>
  );

  return (
    <PanelContext.Provider value={{ me, reload, plan: plan.data }}>
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
              <SideMenu pathname={pathname} hasManyWorkplaces={me.workplaces.length > 1} userName={me.user.name} features={plan.data?.features} />
            </div>
          </div>
        )}

        {/* Desktop: barra lateral */}
        <aside className="no-print hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-stone-200 md:bg-white">
          <div className="px-4 py-4">{brand}</div>
          <SideMenu pathname={pathname} hasManyWorkplaces={me.workplaces.length > 1} userName={me.user.name} features={plan.data?.features} />
        </aside>

        <main className="min-w-0 flex-1 p-4 md:p-8">
          {ctx.tenantStatus !== 'ACTIVE' && (
            <div className="mb-4">
              <Alert>
                Este estabelecimento está suspenso: o caixa e o painel estão bloqueados. Fale com o suporte do Acumulaê pelo e-mail{' '}
                <a href={mailtoContact('Estabelecimento suspenso')} className="font-semibold underline">
                  {CONTACT_EMAIL}
                </a>
                .
              </Alert>
            </div>
          )}
          {notice && pathname !== '/painel/plano' && (
            <div className="no-print mb-4">
              <Alert kind={notice.kind}>
                {notice.text}{' '}
                <Link href="/painel/plano" className="font-semibold underline">
                  Ver meu plano
                </Link>
              </Alert>
            </div>
          )}
          {children}
        </main>
      </div>
    </PanelContext.Provider>
  );
}

function SideMenu({
  pathname,
  hasManyWorkplaces,
  userName,
  features,
}: {
  pathname: string;
  hasManyWorkplaces: boolean;
  userName: string;
  features?: PlanInfo['features'];
}) {
  const router = useRouter();
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <nav className="flex flex-col gap-1 px-3 py-2">
        {NAV.filter((n) => !(n.hideWithout && n.feature && !features?.[n.feature])).map((n) => {
          const active = n.href === '/painel' ? pathname === '/painel' : pathname.startsWith(n.href);
          const locked = !!n.feature && !!features && !features[n.feature];
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
              {locked && (
                <span className="ml-1.5 text-xs opacity-70" aria-label="bloqueado no seu plano">
                  🔒
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-1 border-t border-stone-100 px-3 py-3 text-sm">
        <Link href="/caixa" className="block rounded-lg px-3 py-2.5 font-semibold text-accent-600 hover:bg-accent-100 transition-colors">
          Abrir o caixa →
        </Link>
        <a
          href={mailtoContact('Suporte do painel')}
          className="block rounded-lg px-3 py-2.5 text-stone-600 hover:bg-stone-100 transition-colors"
          title="Fale com o suporte do Acumulaê"
        >
          Suporte
          <span className="block break-all text-xs text-stone-500 select-all">{CONTACT_EMAIL}</span>
        </a>
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
