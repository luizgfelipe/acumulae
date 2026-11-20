import { z } from 'zod';

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/** CEP com ou sem máscara; guarda só os 8 dígitos. */
export const cepSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 8, 'CEP deve ter 8 dígitos');

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

/** Endereço estruturado (o painel preenche pelo CEP). */
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
    .pipe(z.enum(UFS)),
});
export type AddressInput = z.infer<typeof addressSchema>;

/**
 * Endereço na entrada da API: estruturado, texto livre (legado, sem cidade/UF para o guia)
 * ou `null` para apagar. Ausente = mantém.
 */
export const addressInputSchema = z.union([addressSchema, z.string().trim().max(300)]).nullish();

const EMPTY = { cep: null, street: null, number: null, complement: null, district: null, city: null, state: null };

export const formatCep = (cep: string) => `${cep.slice(0, 5)}-${cep.slice(5)}`;

/** "Rua X, 123, sala 2 - Centro, Joinville/SC" */
export function formatAddress(a: AddressInput): string {
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
  return {
    address: s.address,
    addressFields:
      s.cep && s.street && s.city && s.state
        ? { cep: s.cep, street: s.street, number: s.number, complement: s.complement, district: s.district, city: s.city, state: s.state }
        : null,
  };
}
