import { stampIconOf } from '@/lib/stamp-icons';
import type React from 'react';
import { cx } from './ui';

/** Máximo de selos por linha (o que cabe com folga num celular). */
const MAX_STAMP_COLUMNS = 6;

/**
 * Colunas da grade com as linhas equilibradas: primeiro quantas linhas são precisas, depois divide por igual.
 * Ex.: 12 → 6+6, 10 → 5+5, 8 → 4+4, 7 → 4+3, 15 → 5+5+5, 20 → 5×4.
 */
export function stampColumns(goal: number) {
  const n = Math.max(1, goal);
  const rows = Math.ceil(n / MAX_STAMP_COLUMNS);
  return Math.ceil(n / rows);
}

/**
 * Grade de selos: `filled` de `goal` preenchidos com a cor do estabelecimento e o ícone escolhido.
 * Com `imageUrl` (imagem própria do selo), a imagem ocupa o selo cheio no lugar do ícone.
 */
export function StampGrid({
  filled,
  goal,
  color,
  checkColor = '#ffffff',
  icon,
  imageUrl,
  size = 'md',
  complete = false,
}: {
  filled: number;
  goal: number;
  color: string;
  /** Cor do ícone dentro do selo cheio; use o texto legível sobre `color`. */
  checkColor?: string;
  /** Chave do catálogo de ícones (padrão: ✓). */
  icon?: string;
  imageUrl?: string | null;
  size?: 'sm' | 'md';
  /** Cartão completo com recompensa a resgatar: os selos pulsam, um depois do outro. */
  complete?: boolean;
}) {
  const cols = stampColumns(goal);
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-9 w-9';
  const Icon = stampIconOf(icon);
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: goal }, (_, i) => {
        const on = i < filled;
        return (
          <span key={i} className="flex justify-center">
            <span
              className={cx(
                'grid place-items-center overflow-hidden rounded-full border-2 transition-all',
                dim,
                on ? 'border-transparent' : 'border-dashed border-stone-300',
                complete && 'stamp-complete',
              )}
              style={
                on
                  ? {
                      ...(imageUrl ? { borderColor: color } : { background: color }),
                      ...(complete ? ({ '--glow': `${color}73`, animationDelay: `${i * 60}ms, ${800 + i * 60}ms` } as React.CSSProperties) : {}),
                    }
                  : undefined
              }
            >
              {on &&
                (imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon className="h-[55%] w-[55%]" style={{ color: checkColor }} strokeWidth={icon && icon !== 'check' ? 2.25 : 3} aria-hidden />
                ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
