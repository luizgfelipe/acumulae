import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Normaliza um telefone brasileiro (ou internacional com +) para E.164. Retorna null se inválido. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(input.trim(), 'BR');
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** +5547999998888 → (47) 9****-8888 */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length < 10) return '****';
  return `(${national.slice(0, 2)}) ${national.slice(2, 3)}****-${national.slice(-4)}`;
}

/** +5547999998888 → (47) 99999-8888 */
export function formatPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatNational() : e164;
}
