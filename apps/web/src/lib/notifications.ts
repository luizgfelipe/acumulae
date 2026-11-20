export type NotificationKind = 'CREDITO' | 'RECOMPENSA_LIBERADA' | 'RESGATE' | 'ESTORNO' | 'AVISO';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** Cartão relacionado (a notificação abre o cartão). */
  membershipId: string | null;
  tenant: { name: string; slug: string; logoUrl: string | null; primaryColor: string | null } | null;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
  unread: number;
}

/** De quando é a notificação: "agora", "há 5 min", "há 3 h", "ontem" ou a data. */
export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  if (h < 48) return 'ontem';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
