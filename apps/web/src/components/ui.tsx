'use client';

import Link from 'next/link';
import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef, useEffect } from 'react';

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark' | 'success';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-md hover:shadow-brand-600/30 disabled:bg-brand-200',
  secondary: 'bg-white text-stone-800 border border-stone-300 hover:border-stone-400 hover:bg-stone-50 disabled:text-stone-400',
  ghost: 'bg-transparent text-stone-700 hover:bg-stone-100 hover:text-stone-900',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md hover:shadow-red-600/30 disabled:bg-red-300',
  dark: 'bg-stone-900 text-white shadow-sm hover:bg-stone-800 hover:shadow-md hover:shadow-stone-900/25 disabled:bg-stone-400',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:shadow-md hover:shadow-emerald-600/30 disabled:bg-emerald-300',
};

/** Transição, "afundar" ao clicar e nada disso quando desabilitado. */
const INTERACTIVE =
  'transition duration-150 ease-out motion-safe:active:scale-[0.98] disabled:shadow-none disabled:active:scale-100';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl'; loading?: boolean }) {
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4', lg: 'h-13 px-5 text-lg', xl: 'h-20 px-6 text-xl' };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold disabled:cursor-not-allowed',
        INTERACTIVE,
        VARIANTS[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx('inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold', INTERACTIVE, VARIANTS[variant], className)}
    >
      {children}
    </Link>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={cx(
        'h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base outline-none placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
        className,
      )}
    />
  );
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cx(
        'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base outline-none placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
        className,
      )}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cx('h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-base outline-none focus:border-brand-500', className)}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-stone-500">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

/** Padding passado em `className` (p-0, p-4, px-…) substitui o padrão: no Tailwind as duas classes juntas não se sobrepõem pela ordem. */
const HAS_PADDING = /(^|\s)p[xytrbl]?-\S+/;

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-2xl border border-stone-200 bg-white shadow-sm', !HAS_PADDING.test(className ?? '') && 'p-5', className)}>
      {children}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  const styles = {
    error: 'bg-red-50 text-red-800 border-red-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
  };
  return <div className={cx('rounded-xl border px-4 py-3 text-sm', styles[kind])}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className ?? 'h-6 w-6')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-brand-600">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-extrabold tracking-tight text-stone-900', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/marca.png" alt="" width={45} height={32} className="h-8 w-auto" />
      Acumulaê
    </span>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="safe-bottom max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Badge({ children, color = 'stone' }: { children: ReactNode; color?: 'stone' | 'green' | 'red' | 'amber' | 'brand' }) {
  const c = {
    stone: 'bg-stone-100 text-stone-700',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-900',
    brand: 'bg-brand-100 text-brand-900',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', c[color])}>{children}</span>;
}

export function TenantAvatar({ name, logoUrl, color, size = 48 }: { name: string; logoUrl?: string | null; color?: string | null; size?: number }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name} width={size} height={size} className="rounded-xl bg-white object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="grid place-items-center rounded-xl font-bold text-white"
      style={{ width: size, height: size, background: color ?? '#E85D04', fontSize: size / 2.4 }}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-stone-300')}
    >
      <span
        className={cx('absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')}
      />
    </button>
  );
}
