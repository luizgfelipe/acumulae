import {
  Beer,
  CakeSlice,
  Check,
  Coffee,
  Croissant,
  Crown,
  Fish,
  Gift,
  Hamburger,
  Heart,
  IceCreamCone,
  type LucideIcon,
  Pizza,
  Star,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';

/**
 * Ícones do selo. As chaves e a ORDEM espelham o catálogo da API (apps/api/src/common/stamps.ts):
 * o plano libera os primeiros N. Chave desconhecida cai no ✓.
 */
export const STAMP_ICONS: Record<string, { Icon: LucideIcon; label: string }> = {
  check: { Icon: Check, label: 'Visto' },
  star: { Icon: Star, label: 'Estrela' },
  heart: { Icon: Heart, label: 'Coração' },
  coffee: { Icon: Coffee, label: 'Café' },
  utensils: { Icon: UtensilsCrossed, label: 'Talheres' },
  pizza: { Icon: Pizza, label: 'Pizza' },
  fish: { Icon: Fish, label: 'Peixe' },
  hamburger: { Icon: Hamburger, label: 'Hambúrguer' },
  'ice-cream': { Icon: IceCreamCone, label: 'Sorvete' },
  cake: { Icon: CakeSlice, label: 'Bolo' },
  croissant: { Icon: Croissant, label: 'Croissant' },
  beer: { Icon: Beer, label: 'Cerveja' },
  wine: { Icon: Wine, label: 'Vinho' },
  gift: { Icon: Gift, label: 'Presente' },
  crown: { Icon: Crown, label: 'Coroa' },
};

/** Selo do estabelecimento: ícone do catálogo ou imagem própria (que tem prioridade). */
export interface StampStyle {
  stampIcon: string;
  stampImageUrl: string | null;
}

export function stampIconOf(key: string | null | undefined): LucideIcon {
  return (key && STAMP_ICONS[key]?.Icon) || Check;
}
