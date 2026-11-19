import { BrandColors, cardTheme } from '@/lib/card-theme';
import type { StampStyle } from '@/lib/stamp-icons';
import { ProgressBar, StampGrid } from './stamps';
import { TenantAvatar, cx } from './ui';

/** Cartão de exemplo (7/10) com as cores e o modelo dados — usado na pré-visualização e na escolha do modelo. */
export function CardPreview({
  name,
  subtitle,
  logoUrl,
  brand,
  compact = false,
}: {
  name: string;
  subtitle?: string;
  logoUrl: string | null;
  brand: BrandColors & Partial<StampStyle>;
  compact?: boolean;
}) {
  const th = cardTheme(brand);
  return (
    <div className="overflow-hidden rounded-2xl border-2 bg-white text-left shadow-sm" style={{ borderColor: th.border }}>
      <div className={cx('flex items-center gap-2', compact ? 'px-2.5 py-2' : 'gap-3 px-4 py-3')} style={th.header}>
        {!compact && <TenantAvatar name={name} logoUrl={logoUrl} color="rgba(255,255,255,0.25)" size={40} />}
        <div className="min-w-0 flex-1">
          <p className={cx('truncate font-semibold', compact && 'text-xs')}>{name}</p>
          {subtitle && !compact && <p className="truncate text-xs opacity-85">{subtitle}</p>}
        </div>
        <span className={cx('font-extrabold tabular-nums', compact ? 'text-sm' : 'text-2xl')}>
          7<span className={cx('opacity-80', compact ? 'text-xs' : 'text-base')}>/10</span>
        </span>
      </div>
      <div className={cx('space-y-3', compact ? 'px-2.5 py-2' : 'px-4 py-3')}>
        <ProgressBar value={7} max={10} color={th.accent} />
        {!compact && <StampGrid filled={7} goal={10} color={th.accent} checkColor={th.accentFg} icon={brand.stampIcon} imageUrl={brand.stampImageUrl} size="sm" />}
      </div>
    </div>
  );
}
