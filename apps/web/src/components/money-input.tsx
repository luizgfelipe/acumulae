'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { cx } from './ui';

/** Até R$ 999.999,99: o bastante para qualquer compra e evita número gigante por engano. */
const MAX_DIGITS = 8;

/** "1500" → "15,00"; "5" → "0,05"; com milhar: "1.234,56". */
function display(cents: number | null) {
  if (cents == null) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/**
 * Campo de valor em reais no jeito de máquina de cartão: cada dígito entra pela direita
 * (1 → 0,01; 15 → 0,15; 1500 → 15,00). Trabalha em centavos; vazio = null.
 */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { cents: number | null; onCents: (cents: number | null) => void }
>(function MoneyInput({ cents, onCents, className, ...rest }, ref) {
  return (
    <div className={cx('relative h-11', className)}>
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-semibold text-stone-500">R$</span>
      <input
        ref={ref}
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display(cents)}
        placeholder={rest.placeholder ?? '0,00'}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS);
          onCents(digits ? Number(digits) : null);
        }}
        className="h-full w-full rounded-xl border border-stone-300 bg-white pr-4 pl-12 text-right tabular-nums outline-none placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-100 disabled:text-stone-500"
      />
    </div>
  );
});
