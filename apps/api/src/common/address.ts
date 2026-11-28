import { z } from 'zod';
import { region, tr } from './region';

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/** Distritos e regiões autónomas de Portugal (código ISO 3166-2:PT, cabe no mesmo char(2) da UF). */
export const PT_DISTRICTS: Record<string, string> = {
  '01': 'Aveiro', '02': 'Beja', '03': 'Braga', '04': 'Bragança', '05': 'Castelo Branco', '06': 'Coimbra',
  '07': 'Évora', '08': 'Faro', '09': 'Guarda', '10': 'Leiria', '11': 'Lisboa', '12': 'Portalegre',
  '13': 'Porto', '14': 'Santarém', '15': 'Setúbal', '16': 'Viana do Castelo', '17': 'Vila Real', '18': 'Viseu',
  '20': 'Açores', '30': 'Madeira',
};

/** UFs (BR) ou códigos de distrito (PT). */
export const states = (): readonly string[] => (region() === 'PT' ? Object.keys(PT_DISTRICTS) : UFS);

/** Dígitos do código postal: 8 no CEP, 7 no código postal português (0000-000). */
export const postalLength = () => (region() === 'PT' ? 7 : 8);

/**
 * CEP (BR) ou código postal (PT), com ou sem máscara; guarda só os dígitos.
 * O campo continua a chamar-se `cep` na API e na tabela, nos dois países.
 */
export const cepSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === postalLength(), () => ({
    message: tr('CEP deve ter 8 dígitos', 'O código postal deve ter 7 dígitos (0000-000)'),
  }));

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

/**
 * Endereço estruturado (no Brasil o painel preenche pelo CEP).
 * Em PT: `district` = freguesia, `city` = concelho/localidade, `state` = código do distrito.
 */
export const addressSchema = z.object({
  cep: cepSchema,
  street: text(200),
  /** Número ou "S/N". */
  number: optionalText(20),
  complement: optionalText(80),
  district: optionalText(120),
  city: text(120),
  state: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => states().includes(v), () => ({ message: tr('UF inválida', 'Distrito inválido') })),
});
export type AddressInput = z.infer<typeof addressSchema>;

/**
 * Endereço na entrada da API: estruturado, texto livre (legado, sem cidade/UF para o guia)
 * ou `null` para apagar. Ausente = mantém.
 */
export const addressInputSchema = z.union([addressSchema, z.string().trim().max(300)]).nullish();

const EMPTY = { cep: null, street: null, number: null, complement: null, district: null, city: null, state: null };

/** 89201000 → 89201-000; 1000001 → 1000-001. */
export const formatCep = (cep: string) => (cep.length === 7 ? `${cep.slice(0, 4)}-${cep.slice(4)}` : `${cep.slice(0, 5)}-${cep.slice(5)}`);

/** BR: "Rua X, 123, sala 2 - Centro, Joinville/SC". PT: "Rua X, 12, 3.º Esq. - Arroios, 1000-001 Lisboa". */
export function formatAddress(a: AddressInput): string {
  if (region() === 'PT') {
    const first = [a.street, a.number || 's/n', a.complement].filter(Boolean).join(', ');
    const place = [a.district, `${formatCep(a.cep)} ${a.city}`].filter(Boolean).join(', ');
    return `${first} - ${place}`;
  }
  const first = [a.street, a.number || 'S/N', a.complement].filter(Boolean).join(', ');
  const place = [a.district, `${a.city}/${a.state}`].filter(Boolean).join(', ');
  return `${first} - ${place}`;
}

/** Campos da tabela `stores` para a entrada; `undefined` = não mexe no endereço. */
export function addressData(input: z.infer<typeof addressInputSchema>) {
  if (input === undefined) return undefined;
  if (input === null || input === '') return { address: null, ...EMPTY };
  if (typeof input === 'string') return { address: input, ...EMPTY };
  return { address: formatAddress(input), ...input };
}

type StoreAddressRow = {
  address: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

/** Endereço na resposta: a linha pronta e, quando houver, os campos (para editar). */
export function addressView(s: StoreAddressRow) {
  // A coluna era char(8): tira o espaço de preenchimento de linhas antigas.
  if (s.cep) s = { ...s, cep: s.cep.trim() };
  return {
    address: s.address,
    addressFields:
      s.cep && s.street && s.city && s.state
        ? { cep: s.cep, street: s.street, number: s.number, complement: s.complement, district: s.district, city: s.city, state: s.state }
        : null,
  };
}
