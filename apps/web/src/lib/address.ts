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

export const EMPTY_ADDRESS: AddressDraft = { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' };

export const cepDigits = (v: string) => v.replace(/\D/g, '').slice(0, 8);

export function maskCep(v: string) {
  const d = cepDigits(v);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
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
  if (cepDigits(t.cep).length !== 8) return { ok: false, error: 'Informe o CEP com 8 dígitos.' };
  if (!t.street) return { ok: false, error: 'Informe a rua.' };
  if (!t.city || !UFS.includes(t.state)) return { ok: false, error: 'Informe a cidade e o estado.' };
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
