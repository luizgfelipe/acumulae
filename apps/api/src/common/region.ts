/**
 * País da instância. Cada país roda a sua própria instância (base de dados e domínio próprios):
 * REGION=BR (padrão) fala pt-BR, cobra em reais e usa o fuso de São Paulo; REGION=PT fala pt-PT,
 * usa euro e o fuso de Lisboa.
 */
export type Region = 'BR' | 'PT';

const SETTINGS = {
  BR: { locale: 'pt-BR', currency: 'BRL', timeZone: 'America/Sao_Paulo', phoneCountry: 'BR', domain: 'acumulae.com.br' },
  PT: { locale: 'pt-PT', currency: 'EUR', timeZone: 'Europe/Lisbon', phoneCountry: 'PT', domain: 'acumulae.com' },
} as const;

/** Lida a cada chamada (barato) para os testes poderem trocar `process.env.REGION`. */
export function region(): Region {
  const v = (process.env.REGION ?? '').trim().toUpperCase();
  if (!v || v === 'BR') return 'BR';
  if (v === 'PT') return 'PT';
  throw new Error(`REGION inválida: "${process.env.REGION}". Use BR ou PT.`);
}

export const regionSettings = () => SETTINGS[region()];

/** Texto (ou valor) conforme o país: `tr('Senha', 'Palavra-passe')`. */
export function tr<T>(br: T, pt: T): T {
  return region() === 'PT' ? pt : br;
}
