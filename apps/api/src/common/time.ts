export const TZ = 'America/Sao_Paulo';

/** Dia da semana ISO (1 = segunda … 7 = domingo) no fuso de São Paulo. */
export function isoWeekdaySaoPaulo(date = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name) + 1;
}

/** Início do mês corrente em São Paulo (UTC-3; sem horário de verão desde 2019). */
export function startOfMonthSaoPaulo(date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(date);
  const [y, m] = parts.split('-');
  return new Date(`${y}-${m}-01T00:00:00-03:00`);
}

export const WEEKDAY_NAMES = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

export function describeWeekdays(days: number[]): string {
  return [...days]
    .sort()
    .map((d) => WEEKDAY_NAMES[d])
    .join(', ');
}
