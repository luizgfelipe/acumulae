'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useLoggedCustomer } from '@/components/customer-context';
import { Alert, Button, Card, FullPageSpinner, TenantAvatar, cx } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { AppNotification, NotificationKind, NotificationPage, timeAgo } from '@/lib/notifications';
import { usePush } from '@/lib/push';

const KIND_ICON: Record<NotificationKind, { path: ReactNode; className: string }> = {
  CREDITO: { path: <path d="M12 5v14M5 12h14" />, className: 'bg-brand-100 text-brand-700' },
  RECOMPENSA_LIBERADA: {
    path: <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" />,
    className: 'bg-green-100 text-green-700',
  },
  RESGATE: { path: <path d="M20 6 9 17l-5-5" />, className: 'bg-green-100 text-green-700' },
  ESTORNO: { path: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />, className: 'bg-amber-100 text-amber-700' },
  AVISO: { path: <path d="m3 11 18-5v12L3 14v-3ZM11.6 16.8a3 3 0 1 1-5.8-1.6" />, className: 'bg-sky-100 text-sky-700' },
};

/** Notificações: movimentações nos cartões e avisos dos estabelecimentos. */
export default function NotificationsPage() {
  const router = useRouter();
  const { unread, setUnread } = useLoggedCustomer();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (after?: string) => {
      try {
        const p = await api<NotificationPage>('/api/me/notifications', { query: { cursor: after } });
        setItems((cur) => (after && cur ? [...cur, ...p.items] : p.items));
        setCursor(p.nextCursor);
        setUnread(p.unread);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [setUnread],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    if (!cursor) return;
    setMore(true);
    await load(cursor);
    setMore(false);
  }

  async function markAll() {
    setItems((cur) => cur?.map((n) => ({ ...n, read: true })) ?? cur);
    setUnread(0);
    await api('/api/me/notifications/read-all', { method: 'POST' }).catch(() => undefined);
  }

  async function open(n: AppNotification) {
    if (!n.read) {
      setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? cur);
      setUnread(Math.max(0, unread - 1));
      api(`/api/me/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
    }
    if (n.membershipId) router.push(`/cartao/${n.membershipId}`);
  }

  if (error && !items) return <Alert>{error}</Alert>;
  if (!items) return <FullPageSpinner />;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Notificações</h1>
        {unread > 0 && (
          <button onClick={markAll} className="rounded-lg px-2 py-1.5 text-sm font-medium text-accent-600 transition-colors hover:bg-accent-100">
            Marcar todas como lidas
          </button>
        )}
      </div>

      <PushInvite />

      {items.length === 0 ? (
        <Card className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-100 text-brand-700">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </div>
          <h2 className="font-semibold">Nada por aqui ainda</h2>
          <p className="mt-1 text-sm text-stone-600">
            Quando você ganhar selos, liberar ou resgatar uma recompensa, avisamos aqui. Os estabelecimentos que você autorizar também podem mandar
            novidades.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-stone-100">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} onOpen={() => open(n)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <Alert>{error}</Alert>}
      {cursor && (
        <Button variant="secondary" className="w-full" loading={more} onClick={loadMore}>
          Ver mais antigas
        </Button>
      )}
    </div>
  );
}

function NotificationRow({ n, onOpen }: { n: AppNotification; onOpen: () => void }) {
  const icon = KIND_ICON[n.kind];
  return (
    <button
      onClick={onOpen}
      className={cx(
        'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-stone-50 first:rounded-t-2xl last:rounded-b-2xl',
        !n.read && 'bg-brand-50/60',
      )}
    >
      <span className="relative shrink-0">
        {n.tenant ? (
          <TenantAvatar name={n.tenant.name} logoUrl={n.tenant.logoUrl} color={n.tenant.primaryColor} size={40} />
        ) : (
          <span className="block h-10 w-10 rounded-xl bg-stone-200" />
        )}
        <span className={cx('absolute -right-1.5 -bottom-1.5 grid h-5 w-5 place-items-center rounded-full ring-2 ring-white', icon.className)}>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {icon.path}
          </svg>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cx('min-w-0 text-sm', n.read ? 'font-medium text-stone-800' : 'font-semibold text-stone-900')}>{n.title}</span>
          <span className="shrink-0 text-xs text-stone-500">{timeAgo(n.createdAt)}</span>
        </span>
        <span className="mt-0.5 block text-sm whitespace-pre-line text-stone-600">{n.body}</span>
      </span>
      {!n.read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" aria-label="não lida" />}
    </button>
  );
}

const INVITE_KEY = 'acu_push_invite_dismissed';

/** Convite para receber no celular (some depois de ativar ou fechar). */
function PushInvite() {
  const { state, busy, enable } = usePush();
  const [dismissed, setDismissed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(INVITE_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed || (state !== 'off' && state !== 'needs-install')) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(INVITE_KEY, '1');
    } catch {
      /* armazenamento bloqueado: o convite volta na próxima visita */
    }
  }

  async function activate() {
    setError(null);
    try {
      await enable();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card className="relative border-secondary-300 bg-secondary-100">
      <button onClick={dismiss} aria-label="Fechar" className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-secondary-300/60">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <h2 className="pr-8 font-semibold">Receba no celular</h2>
      {state === 'off' ? (
        <>
          <p className="mt-1 text-sm text-stone-600">Avisamos na hora quando você ganhar selos ou liberar uma recompensa, mesmo com o app fechado.</p>
          {error && (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          )}
          <Button className="mt-3 w-full" loading={busy} onClick={activate}>
            Ativar notificações
          </Button>
        </>
      ) : (
        <p className="mt-1 text-sm text-stone-600">
          No iPhone, adicione o Acumulaê à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá para receber as notificações.
        </p>
      )}
    </Card>
  );
}
