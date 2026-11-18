import { ReactNode } from 'react';
import { Logo } from './ui';

/** Moldura das telas públicas do painel (convite, senha). */
export function StaffCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-100 px-5 py-8">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 mb-5 text-sm text-stone-600">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
