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

/** Moldura das telas logadas do cliente: cabeçalho + navegação inferior. */
export function CustomerShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-stone-50/90 px-5 pt-5 pb-3 backdrop-blur">
        <Link href="/">
          <Logo />
        </Link>
        {title && <span className="text-sm font-medium text-stone-500">{title}</span>}
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
