import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { regionSettings } from './region';

/** Normaliza um telefone do país da instância (ou internacional com +) para E.164. Retorna null se inválido. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(input.trim(), regionSettings().phoneCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/**
 * Telefone mascarado (cliente sem consentimento de marketing).
 * BR: +5547999998888 → (47) 9****-8888. PT: +351912345678 → 912 *** 678. Outros países: +44 ****5678.
 */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('55')) {
    const national = digits.slice(2);
    if (national.length < 10) return '****';
    return `(${national.slice(0, 2)}) ${national.slice(2, 3)}****-${national.slice(-4)}`;
  }
  if (digits.startsWith('351')) {
    const national = digits.slice(3);
    if (national.length !== 9) return '****';
    return `${national.slice(0, 3)} *** ${national.slice(-3)}`;
  }
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed || digits.length < 8) return '****';
  return `+${parsed.countryCallingCode} ****${digits.slice(-4)}`;
}

/** Formato nacional quando o número é do país da instância; internacional quando é de fora. */
export function formatPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === regionSettings().phoneCountry ? parsed.formatNational() : parsed.formatInternational();
}
