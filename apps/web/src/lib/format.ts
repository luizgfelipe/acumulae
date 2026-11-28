import { CURRENCY, IS_PT, LOCALE, TZ } from './region';

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
}

export function formatShortDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(d));
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d));
}

export function formatTime(d: string | Date) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

/** Máscara de digitação de telefone: BR (47) 9 9999-9999; PT 912 345 678. Com "+" na frente não mascara (número de fora). */
export function maskPhoneInput(v: string) {
  if (v.trim().startsWith('+')) return '+' + v.replace(/[^\d ]/g, '').trimStart();
  if (IS_PT) {
    const p = v.replace(/\D/g, '').slice(0, 9);
    return [p.slice(0, 3), p.slice(3, 6), p.slice(6)].filter(Boolean).join(' ');
  }
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

/** +5547999998888 → (47) 9 9999-8888 (instância BR); +351912345678 → 912 345 678 (instância PT); de outro país fica em E.164. */
export function formatE164(e164: string | null | undefined) {
  if (!e164) return '—';
  const home = IS_PT ? '351' : '55';
  const d = e164.replace(/\D/g, '');
  return d.startsWith(home) ? maskPhoneInput(d.slice(home.length)) : e164;
}

export function plural(n: number, singular: string, pluralForm: string) {
  return `${n} ${Math.abs(n) === 1 ? singular : pluralForm}`;
}

export const WEEKDAYS = [
  { value: 1, short: 'Seg', label: 'segunda' },
  { value: 2, short: 'Ter', label: 'terça' },
  { value: 3, short: 'Qua', label: 'quarta' },
  { value: 4, short: 'Qui', label: 'quinta' },
  { value: 5, short: 'Sex', label: 'sexta' },
  { value: 6, short: 'Sáb', label: 'sábado' },
  { value: 7, short: 'Dom', label: 'domingo' },
];

export const LEDGER_LABELS: Record<string, string> = {
  CREDITO: 'Consumo',
  ESTORNO_CREDITO: 'Estorno de consumo',
  RECOMPENSA_LIBERADA: 'Recompensa liberada',
  RECOMPENSA_CANCELADA: 'Recompensa cancelada',
  RESGATE: 'Resgate',
  ESTORNO_RESGATE: 'Estorno de resgate',
  EXPIRACAO: 'Expiração',
  EXCEDENTE_DESCARTADO: 'Excedente descartado',
  ESTORNO_EXCEDENTE: 'Excedente devolvido',
};

export const SOURCE_LABELS: Record<string, string> = {
  QR_PESSOAL: 'QR do cliente',
  TELEFONE: 'Telefone',
  QR_TEMPORARIO: 'QR temporário',
  SISTEMA: 'Sistema',
  PAINEL: 'Painel',
};

/** Garante legibilidade do texto sobre a cor da marca. */
export function readableOn(hex: string | null | undefined): '#ffffff' | '#1c1917' {
  const h = (hex ?? '#F26419').replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#1c1917' : '#ffffff';
}

/** "R$ 1.234,50" ou "1234,50 €" a partir de centavos (cêntimos). */
export function formatMoney(cents: number) {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY }).format(cents / 100).replace(/\s/g, ' ');
}

/** Regra do programa por valor, para exibir: "R$ 10,00 = 1 selo". */
export function valueRule(stampValueCents: number, unitLabel: string) {
  return `${formatMoney(stampValueCents)} = 1 ${unitLabel}`;
}
