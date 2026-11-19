import { cx } from './ui';

/** Grade de selos: `filled` de `goal` preenchidos com a cor do estabelecimento. */
export function StampGrid({
  filled,
  goal,
  color,
  checkColor = '#ffffff',
  size = 'md',
}: {
  filled: number;
  goal: number;
  color: string;
  /** Cor do ✓ dentro do selo cheio; use o texto legível sobre `color`. */
  checkColor?: string;
  size?: 'sm' | 'md';
}) {
  const cols = goal <= 10 ? 5 : goal <= 20 ? 10 : 10;
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-9 w-9';
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(cols, goal)}, minmax(0, 1fr))` }}>
      {Array.from({ length: goal }, (_, i) => {
        const on = i < filled;
        return (
          <span key={i} className="flex justify-center">
            <span
              className={cx('grid place-items-center rounded-full border-2 transition-all', dim, on ? 'border-transparent' : 'border-dashed border-stone-300')}
              style={on ? { background: color } : undefined}
            >
              {on && (
                <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" style={{ color: checkColor }} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              )}
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
