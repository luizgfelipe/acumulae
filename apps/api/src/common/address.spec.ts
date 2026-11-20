import { addressData, addressSchema, addressView, formatAddress } from './address';

const base = { cep: '89201-000', street: 'Rua do Príncipe', number: '330', complement: 'sala 2', district: 'Centro', city: 'Joinville', state: 'sc' };

describe('endereço', () => {
  it('normaliza CEP e UF e monta a linha', () => {
    const a = addressSchema.parse(base);
    expect(a).toMatchObject({ cep: '89201000', state: 'SC' });
    expect(formatAddress(a)).toBe('Rua do Príncipe, 330, sala 2 - Centro, Joinville/SC');
  });

  it('sem número vira S/N e campos vazios viram null', () => {
    const a = addressSchema.parse({ ...base, number: '', complement: '  ', district: null });
    expect(a).toMatchObject({ number: null, complement: null, district: null });
    expect(formatAddress(a)).toBe('Rua do Príncipe, S/N - Joinville/SC');
  });

  it('recusa CEP incompleto e UF inexistente', () => {
    expect(addressSchema.safeParse({ ...base, cep: '8920100' }).success).toBe(false);
    expect(addressSchema.safeParse({ ...base, state: 'XX' }).success).toBe(false);
  });

  it('texto livre e null limpam os campos estruturados; ausente não mexe', () => {
    expect(addressData(undefined)).toBeUndefined();
    expect(addressData(null)).toMatchObject({ address: null, cep: null, city: null });
    expect(addressData('Rua A, 1')).toMatchObject({ address: 'Rua A, 1', cep: null, city: null });
    expect(addressData(addressSchema.parse(base))).toMatchObject({ cep: '89201000', city: 'Joinville', state: 'SC' });
  });

  it('a resposta só traz os campos quando o endereço é estruturado', () => {
    const empty = { cep: null, street: null, number: null, complement: null, district: null, city: null, state: null };
    expect(addressView({ address: 'Rua A, 1', ...empty })).toEqual({ address: 'Rua A, 1', addressFields: null });
    const full = addressData(addressSchema.parse(base))!;
    expect(addressView(full).addressFields).toMatchObject({ cep: '89201000', city: 'Joinville' });
  });
});
