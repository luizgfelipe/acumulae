'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { usePanel } from '@/components/panel-context';
import { NotificationPreview } from '@/components/send-notification';
import { Alert, Button, Card, Field, FullPageSpinner, Input, Modal, Textarea } from '@/components/ui';
import { BODY_MAX, TITLE_MAX, clients, notifications, segmentLabel } from '@/lib/announcements';
import { errorMessage, staffApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useLoad } from '@/lib/use-load';

type Sent = { id: string; title: string; body: string; recipients: number; segment: string; createdAt: string; sentBy: string };

interface Overview {
  usage: { used: number; max: number | null };
  /** Clientes que aceitaram receber promoções. */
  audience: number;
  /** Histórico paginado no servidor (mais recentes primeiro). */
  total: number;
  page: number;
  pageSize: number;
  items: Sent[];
}

const HISTORY_PAGE = 20;

/** Notificações: o gestor escreve uma mensagem que chega no sino do app (e no celular) de quem aceitou promoções. */
export default function AnnouncementsPage() {
  const { me, plan, reload: reloadPanel } = usePanel();
  const { data, error, reload } = useLoad(() => staffApi<Overview>('/api/admin/announcements', { query: { pageSize: HISTORY_PAGE } }), []);
  /** Páginas seguintes do histórico, carregadas no "Ver mais". */
  const [older, setOlder] = useState<{ page: number; items: Sent[] }>({ page: 1, items: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  const ctx = me.context!;
  const { used, max } = data.usage;
  const left = max === null ? null : Math.max(0, max - used);
  const blocked = left === 0;
  const valid = title.trim().length >= 3 && body.trim().length >= 3;

  const history = [...data.items, ...older.items];
  const hasMore = history.length < data.total;

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = older.page + 1;
      const r = await staffApi<Overview>('/api/admin/announcements', { query: { page: next, pageSize: HISTORY_PAGE } });
      setOlder((cur) => ({ page: next, items: [...cur.items, ...r.items] }));
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setLoadingMore(false);
    }
  }

  function ask(e: FormEvent) {
    e.preventDefault();
    if (!valid || blocked || data!.audience === 0) return;
    setMsg(null);
    setConfirmOpen(true);
  }

  async function send() {
    setSending(true);
    try {
      const r = await staffApi<{ recipients: number }>('/api/admin/announcements', { method: 'POST', body: { title: title.trim(), body: body.trim() } });
      setTitle('');
      setBody('');
      setMsg({ kind: 'success', text: `Notificação enviada para ${clients(r.recipients)}.` });
      setOlder({ page: 1, items: [] });
      reload();
      reloadPanel();
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notificações aos clientes</h1>
        <p className="mt-1 text-stone-600">
          Mande novidades e promoções para o app dos clientes. A notificação aparece no sino do app (e no celular, para quem ativou) de quem
          aceitou receber promoções do {ctx.tenantName}.
        </p>
        {plan?.features.reports && (
          <p className="mt-1 text-sm text-stone-500">
            Para mandar só aos aniversariantes ou aos inativos, use o botão &quot;Enviar notificação&quot; em{' '}
            <Link href="/painel/relatorios" className="font-medium text-accent-600 underline">
              Relatórios
            </Link>
            .
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-stone-500">Quem vai receber</p>
          <p className="text-2xl font-extrabold">{clients(data.audience)}</p>
          <p className="text-sm text-stone-500">{data.audience === 1 ? 'aceitou' : 'aceitaram'} receber promoções</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-500">Notificações neste mês</p>
          <p className="text-2xl font-extrabold">
            {used}
            {max !== null && <span className="text-base font-semibold text-stone-500"> de {max}</span>}
          </p>
          <p className="text-sm text-stone-500">{max === null ? 'Sem limite no seu plano' : 'O limite renova no dia 1º'}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Nova notificação</h2>
          <form onSubmit={ask} className="space-y-4">
            <Field label="Título" hint={`${title.length}/${TITLE_MAX}`}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} placeholder="Ex.: Rodízio em dobro nesta terça" required />
            </Field>
            <Field label="Mensagem" hint={`${body.length}/${BODY_MAX}`}>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX} rows={5} required placeholder="Conte a novidade em poucas linhas." />
            </Field>
            {blocked && (
              <Alert kind="warning">
                Você já usou as {max} notificações do mês no seu plano.{' '}
                <Link href="/painel/plano" className="font-semibold underline">
                  Ver meu plano
                </Link>
              </Alert>
            )}
            {!blocked && data.audience === 0 && (
              <Alert kind="info">
                Ainda nenhum cliente aceitou receber promoções. O app pergunta isso a cada cliente no cartão do {ctx.tenantName}.
              </Alert>
            )}
            {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
            <Button type="submit" className="w-full" disabled={!valid || blocked || data.audience === 0}>
              Enviar notificação
            </Button>
          </form>
        </Card>

        <div className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-stone-500">Como o cliente vê</h2>
          <NotificationPreview title={title} body={body} />
        </div>
      </div>

      <Card className="p-0">
        <h2 className="px-5 pt-5 pb-3 font-semibold">
          Enviadas {data.total > 0 && <span className="font-normal text-stone-500">({data.total})</span>}
        </h2>
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-stone-500">Nenhuma notificação enviada ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {history.map((a) => (
              <li key={a.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-stone-500">
                    {formatDateTime(a.createdAt)} · {a.sentBy} · {clients(a.recipients)}
                  </p>
                </div>
                <p className="mt-0.5 text-sm whitespace-pre-line text-stone-600">{a.body}</p>
                <p className="mt-1 text-xs text-stone-500">Para: {segmentLabel(a.segment)}</p>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="border-t border-stone-100 p-4">
            <Button variant="secondary" className="w-full" loading={loadingMore} onClick={loadMore}>
              Ver mais antigas
            </Button>
          </div>
        )}
      </Card>

      <Modal open={confirmOpen} onClose={() => !sending && setConfirmOpen(false)} title="Enviar notificação?">
        <div className="space-y-4">
          <p className="text-stone-700">
            A notificação &quot;{title.trim()}&quot; vai para {clients(data.audience)}. Depois de enviada, não dá para desfazer.
            {left !== null && ` ${left - 1 === 1 ? 'Fica' : 'Ficam'} ${notifications(left - 1)} neste mês.`}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmOpen(false)} disabled={sending}>
              Voltar
            </Button>
            <Button className="flex-1" loading={sending} onClick={send}>
              Enviar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
