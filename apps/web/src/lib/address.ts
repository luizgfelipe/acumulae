import { IS_PT, tr } from './region';

/** Endereço estruturado da unidade (o mesmo formato da API). */
export interface AddressFields {
  cep: string;
  street: string;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string;
  state: string;
}

/** Estado do formulário: tudo texto, para os inputs controlados. */
export type AddressDraft = { [K in keyof AddressFields]: string };

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

/** Distritos e regiões autónomas (código ISO 3166-2:PT, o mesmo que a API guarda em `state`). */
export const PT_DISTRICTS: [code: string, name: string][] = [
  ['01', 'Aveiro'], ['02', 'Beja'], ['03', 'Braga'], ['04', 'Bragança'], ['05', 'Castelo Branco'], ['06', 'Coimbra'],
  ['07', 'Évora'], ['08', 'Faro'], ['09', 'Guarda'], ['10', 'Leiria'], ['11', 'Lisboa'], ['12', 'Portalegre'],
  ['13', 'Porto'], ['14', 'Santarém'], ['15', 'Setúbal'], ['16', 'Viana do Castelo'], ['17', 'Vila Real'], ['18', 'Viseu'],
  ['20', 'Açores'], ['30', 'Madeira'],
];

const STATES = IS_PT ? PT_DISTRICTS.map(([c]) => c) : UFS;

/** Dígitos do código postal: 8 no CEP, 7 no código postal português. */
export const POSTAL_LENGTH = IS_PT ? 7 : 8;

export const EMPTY_ADDRESS: AddressDraft = { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' };

export const cepDigits = (v: string) => v.replace(/\D/g, '').slice(0, POSTAL_LENGTH);

/** 89201-000 (BR) ou 1000-001 (PT). */
export function maskCep(v: string) {
  const d = cepDigits(v);
  const cut = IS_PT ? 4 : 5;
  return d.length > cut ? `${d.slice(0, cut)}-${d.slice(cut)}` : d;
}

export function draftOf(a: AddressFields | null | undefined): AddressDraft {
  if (!a) return EMPTY_ADDRESS;
  return {
    cep: maskCep(a.cep),
    street: a.street,
    number: a.number ?? '',
    complement: a.complement ?? '',
    district: a.district ?? '',
    city: a.city,
    state: a.state,
  };
}

export const sameDraft = (a: AddressDraft, b: AddressDraft) => (Object.keys(a) as (keyof AddressDraft)[]).every((k) => a[k].trim() === b[k].trim());

/** Corpo para a API: `null` quando está tudo vazio; erro quando começou e faltou o essencial. */
export function addressPayload(d: AddressDraft): { ok: true; value: AddressFields | null } | { ok: false; error: string } {
  const t = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim()])) as AddressDraft;
  if (Object.values(t).every((v) => !v)) return { ok: true, value: null };
  if (cepDigits(t.cep).length !== POSTAL_LENGTH) return { ok: false, error: tr('Informe o CEP com 8 dígitos.', 'Indique o código postal completo (0000-000).') };
  if (!t.street) return { ok: false, error: tr('Informe a rua.', 'Indique a rua.') };
  if (!t.city || !STATES.includes(t.state)) return { ok: false, error: tr('Informe a cidade e o estado.', 'Indique a localidade e o distrito.') };
  return {
    ok: true,
    value: {
      cep: cepDigits(t.cep),
      street: t.street,
      number: t.number || null,
      complement: t.complement || null,
      district: t.district || null,
      city: t.city,
      state: t.state,
    },
  };
}
