import bcrypt from 'bcryptjs';

const BCRYPT_COST = 11;

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_COST);
export const verifyPassword = (pw: string, hash: string | null | undefined) =>
  hash ? bcrypt.compare(pw, hash) : Promise.resolve(false);

function isSequence(pw: string): boolean {
  const s = pw.toLowerCase();
  if (/^(.)\1+$/.test(s)) return true;
  let asc = true;
  let desc = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

const COMMON = new Set(['senha123', 'password', 'qwerty', 'abc123', '123123', '112233', '102030', 'acumulae']);

/**
 * RN-08: mínimo 6 caracteres; bloqueia sequências óbvias, a data de nascimento e o telefone.
 * Retorna a mensagem de erro, ou null se a senha for aceitável.
 */
export function passwordProblem(
  pw: string,
  ctx: { birthDate?: Date | null; phoneE164?: string | null } = {},
): string | null {
  if (!pw || pw.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (pw.length > 128) return 'A senha é longa demais.';
  if (isSequence(pw) || COMMON.has(pw.toLowerCase())) return 'Escolha uma senha menos óbvia.';

  const digits = pw.replace(/\D/g, '');
  const onlyDigits = digits.length === pw.length;
  if (ctx.birthDate && onlyDigits) {
    const d = ctx.birthDate;
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getUTCFullYear());
    const forms = [`${dd}${mm}${yyyy}`, `${dd}${mm}${yyyy.slice(2)}`, `${yyyy}${mm}${dd}`];
    if (forms.includes(digits)) return 'Não use sua data de nascimento como senha.';
  }
  if (ctx.phoneE164 && onlyDigits && digits.length >= 6) {
    if (ctx.phoneE164.replace(/\D/g, '').includes(digits)) return 'Não use seu telefone como senha.';
  }
  return null;
}
