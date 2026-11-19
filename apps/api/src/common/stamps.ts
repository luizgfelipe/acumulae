/**
 * Catálogo de ícones do selo. A ORDEM importa: o plano libera os primeiros `maxStampIcons`
 * (básico = 5, catálogo completo = 15). O app mapeia cada chave para um ícone do lucide
 * (apps/web/src/lib/stamp-icons.tsx); acrescentar um ícone aqui exige acrescentá-lo lá.
 */
export const STAMP_ICONS = [
  // Básico
  'check',
  'star',
  'heart',
  'coffee',
  'utensils',
  // Planos acima
  'pizza',
  'fish',
  'hamburger',
  'ice-cream',
  'cake',
  'croissant',
  'beer',
  'wine',
  'gift',
  'crown',
] as const;

export type StampIcon = (typeof STAMP_ICONS)[number];

export const DEFAULT_STAMP_ICON: StampIcon = 'check';

/** Tamanho máximo da imagem do selo já decodificada. O navegador reduz para 128 px antes de enviar. */
export const MAX_STAMP_IMAGE_BYTES = 64 * 1024;

export function isStampIcon(v: string): v is StampIcon {
  return (STAMP_ICONS as readonly string[]).includes(v);
}

/** Ícones liberados pelo plano (os primeiros N do catálogo). */
export function allowedStampIcons(maxStampIcons: number): StampIcon[] {
  return STAMP_ICONS.slice(0, Math.max(1, maxStampIcons));
}
