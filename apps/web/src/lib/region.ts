/**
 * País da instância, fixado no build (NEXT_PUBLIC_REGION, vem do REGION do deploy).
 * BR (padrão): pt-BR, reais, fuso de São Paulo. PT: pt-PT, euro, fuso de Lisboa.
 */
export type Region = 'BR' | 'PT';

export const REGION: Region = process.env.NEXT_PUBLIC_REGION?.trim().toUpperCase() === 'PT' ? 'PT' : 'BR';
export const IS_PT = REGION === 'PT';

export const LOCALE = IS_PT ? 'pt-PT' : 'pt-BR';
export const CURRENCY = IS_PT ? 'EUR' : 'BRL';
export const CURRENCY_SYMBOL = IS_PT ? '€' : 'R$';
export const TZ = IS_PT ? 'Europe/Lisbon' : 'America/Sao_Paulo';
export const DOMAIN = IS_PT ? 'acumulae.com' : 'acumulae.com.br';

/** Texto (ou JSX, ou qualquer valor) conforme o país: `tr('Senha', 'Palavra-passe')`. */
export function tr<T>(br: T, pt: T): T {
  return IS_PT ? pt : br;
}
