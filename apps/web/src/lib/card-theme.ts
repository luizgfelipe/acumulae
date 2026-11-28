import type { CSSProperties } from 'react';
import { tr } from './region';

/** Modelos de cartão que o estabelecimento escolhe no painel. */
export type CardStyle = 'CLASSICO' | 'DEGRADE' | 'MOLDURA';

export interface BrandColors {
  primaryColor: string;
  /** null = a principal faz os dois papéis. */
  secondaryColor: string | null;
  cardStyle: CardStyle;
}

export const CARD_STYLES: Array<{ value: CardStyle; label: string; hint: string }> = tr(
  [
    { value: 'CLASSICO', label: 'Clássico', hint: 'Topo na cor principal; selos e barra na secundária.' },
    { value: 'DEGRADE', label: 'Degradê', hint: 'Topo em degradê da principal para a secundária.' },
    { value: 'MOLDURA', label: 'Moldura', hint: 'Topo e selos na principal; borda na secundária.' },
  ],
  [
    { value: 'CLASSICO', label: 'Clássico', hint: 'Topo na cor principal; carimbos e barra na secundária.' },
    { value: 'DEGRADE', label: 'Degradé', hint: 'Topo em degradé da principal para a secundária.' },
    { value: 'MOLDURA', label: 'Moldura', hint: 'Topo e carimbos na principal; contorno na secundária.' },
  ],
);

const DARK = '#1c1917';
const LIGHT = '#ffffff';

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores #RRGGBB (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Texto branco ou escuro sobre as cores dadas (no degradê, a média das duas pontas).
 * Mesmo limiar do `readableOn`, para cores sólidas o resultado não muda em relação ao que já existia.
 */
function textOn(...bgs: string[]): string {
  const avg = bgs.reduce((sum, c) => sum + luminance(c), 0) / bgs.length;
  return avg > 0.45 ? DARK : LIGHT;
}

export interface CardTheme {
  /** Fundo do topo do cartão (cor sólida ou degradê). */
  header: CSSProperties;
  /** Cor dos selos cheios, da barra de progresso e dos botões. */
  accent: string;
  /** Texto/ícone sobre `accent`. */
  accentFg: string;
  border: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function cardTheme(b: Partial<BrandColors> & { primaryColor?: string | null }): CardTheme {
  const p = b.primaryColor && HEX.test(b.primaryColor) ? b.primaryColor : '#F26419';
  const s = b.secondaryColor && HEX.test(b.secondaryColor) ? b.secondaryColor : p;
  const solid = (c: string): CSSProperties => ({ background: c, color: textOn(c) });
  switch (b.cardStyle) {
    case 'DEGRADE':
      return { header: { background: `linear-gradient(135deg, ${p}, ${s})`, color: textOn(p, s) }, accent: p, accentFg: textOn(p), border: p };
    case 'MOLDURA':
      return { header: solid(p), accent: p, accentFg: textOn(p), border: s };
    default:
      return { header: solid(p), accent: s, accentFg: textOn(s), border: p };
  }
}
