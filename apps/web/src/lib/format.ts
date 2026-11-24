const TZ = 'America/Sao_Paulo';

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
}

export function formatShortDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(d));
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d));
}

export function formatTime(d: string | Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

/** Máscara de digitação de telefone brasileiro: (47) 9 9999-9999 */
export function maskPhoneInput(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

/** +5547999998888 → (47) 9 9999-8888 */
export function formatE164(e164: string | null | undefined) {
  if (!e164) return '—';
  const d = e164.replace(/\D/g, '').replace(/^55/, '');
  return maskPhoneInput(d);
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
  const h = (hex ?? '#FC3B7F').replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#1c1917' : '#ffffff';
}
