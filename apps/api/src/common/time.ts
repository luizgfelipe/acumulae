import { regionSettings } from './region';

/** Fuso da instância (São Paulo ou Lisboa). */
export const timeZone = () => regionSettings().timeZone;

/** "AAAA-MM-DD" no fuso da instância. */
export function localDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone() }).format(date);
}

/** Diferença (ms) entre o relógio local e o UTC naquele instante. Lisboa tem horário de verão, então varia. */
function offsetMs(date: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone(),
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante do horário local `day` + `time` (ex.: "2026-11-01", "00:00:00.000") no fuso da instância. */
export function localToUtc(day: string, time = '00:00:00.000'): Date {
  const naive = new Date(`${day}T${time}Z`).getTime();
  const first = offsetMs(new Date(naive));
  const second = offsetMs(new Date(naive - first));
  return new Date(naive - second);
}

/** "AAAA-MM-DD" + n dias (aritmética de calendário, sem fuso). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dia da semana ISO (1 = segunda … 7 = domingo) no fuso da instância. */
export function isoWeekdayLocal(date = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timeZone(), weekday: 'short' }).format(date);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name) + 1;
}

/** Início do mês corrente no fuso da instância. */
export function startOfMonthLocal(date = new Date()): Date {
  return localToUtc(`${localDay(date).slice(0, 7)}-01`);
}

/** Iguais em pt-BR e pt-PT. */
export const WEEKDAY_NAMES = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

export function describeWeekdays(days: number[]): string {
  return [...days]
    .sort()
    .map((d) => WEEKDAY_NAMES[d])
    .join(', ');
}
