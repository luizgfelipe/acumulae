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

/** Query da prévia (GET /api/admin/announcements/preview); `storeId` = só os clientes daquela unidade. */
export function segmentQuery(s: Segment, storeId?: string | null): Record<string, string | number> {
  const q: Record<string, string | number> =
    s.type === 'birthdays' ? { type: s.type, month: s.month } : s.type === 'inactive' ? { type: s.type, days: s.days } : { type: 'all' };
  if (storeId) q.storeId = storeId;
  return q;
}

export const segmentKeyOf = (s: Segment) => (s.type === 'all' ? 'all' : s.type === 'birthdays' ? `birthdays:${s.month}` : `inactive:${s.days}`);

/** Unidade ativa que pode ser escolhida no envio. */
export type StoreOption = { id: string; name: string };

/** Público com a unidade: "Inativos há mais de 30 dias · Joinville". */
export const audienceLabel = (key: string, store?: StoreOption | null) => `${segmentLabel(key)}${store ? ` · ${store.name}` : ''}`;

export const STORE_HINT = 'Clientes que se cadastraram pelo QR da unidade ou já tiveram algum lançamento nela.';
