/** Notificações que o estabelecimento manda aos clientes (painel → Notificações e Relatórios). */

export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export type Segment = { type: 'all' } | { type: 'birthdays'; month: number } | { type: 'inactive'; days: number };

export const TITLE_MAX = 80;
export const BODY_MAX = 500;

export const clients = (n: number) => (n === 1 ? '1 cliente' : `${n} clientes`);
export const notifications = (n: number) => (n === 1 ? '1 notificação' : `${n} notificações`);

/** Rótulo do público gravado no histórico ("all", "birthdays:11", "inactive:30"). */
export function segmentLabel(key: string): string {
  const [type, value] = key.split(':');
  if (type === 'birthdays') return `Aniversariantes de ${MONTHS[Number(value) - 1] ?? '?'}`;
  if (type === 'inactive') return `Inativos há mais de ${value} dias`;
  return 'Todos que aceitaram promoções';
}

export function segmentQuery(s: Segment): Record<string, string | number> {
  return s.type === 'birthdays' ? { type: s.type, month: s.month } : s.type === 'inactive' ? { type: s.type, days: s.days } : { type: 'all' };
}
