'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { InstallAfterSignup } from './install-prompt';
import { Logo, cx } from './ui';

const NAV = [
  {
    href: '/',
    label: 'Cartões',
    icon: <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 3h18" />,
  },
  {
    href: '/qr',
    label: 'Meu QR',
    icon: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />,
  },
  {
    href: '/ler',
    label: 'Ler QR',
    icon: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />,
  },
  {
    href: '/conta',
    label: 'Conta',
    icon: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />,
  },
];

/** Moldura das telas logadas do cliente: cabeçalho (com o sino) + navegação inferior. */
export function CustomerShell({ children, unread = 0 }: { children: ReactNode; unread?: number }) {
  const pathname = usePathname();
  const bellActive = pathname.startsWith('/notificacoes');
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-stone-50/90 px-5 pt-5 pb-3 backdrop-blur">
        <Link href="/">
          <Logo />
        </Link>
        <Link
          href="/notificacoes"
          aria-current={bellActive ? 'page' : undefined}
          aria-label={unread ? `Notificações: ${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : 'Notificações'}
          className={cx(
            'relative grid h-10 w-10 place-items-center rounded-xl transition duration-150 motion-safe:active:scale-95',
            bellActive ? 'bg-brand-50 text-brand-600' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
          )}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-stone-50">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>
      </header>
      <main className="flex-1 px-5 pb-28">{children}</main>
      <InstallAfterSignup />
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg justify-around pt-2">
          {NAV.map((n) => {
            const active = n.href === '/' ? pathname === '/' || pathname.startsWith('/cartao') : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex w-20 flex-col items-center gap-1 rounded-xl py-1 text-xs font-medium transition duration-150 motion-safe:active:scale-95',
                  active ? 'text-brand-600' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800',
                )}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {n.icon}
                </svg>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Moldura das telas públicas (entrar, cadastro etc.). */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <header className="mb-6">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-10 flex justify-center gap-4 text-xs text-stone-500">
        <Link href="/termos" className="transition-colors hover:text-stone-800 hover:underline">
          Termos de Uso
        </Link>
        <Link href="/privacidade" className="transition-colors hover:text-stone-800 hover:underline">
          Privacidade
        </Link>
      </footer>
    </div>
  );
}
