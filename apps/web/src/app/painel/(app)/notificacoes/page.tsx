'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { usePanel } from '@/components/panel-context';
import { Alert, Button, Card, Field, FullPageSpinner, Input, Modal, TenantAvatar } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useLoad } from '@/lib/use-load';

interface Overview {
  usage: { used: number; max: number | null };
  /** Clientes que aceitaram receber promoções. */
  audience: number;
  items: Array<{ id: string; title: string; body: string; recipients: number; createdAt: string; sentBy: string }>;
}

const TITLE_MAX = 80;
const BODY_MAX = 500;

/** Avisos: o gestor escreve uma mensagem que chega no sino do app de quem aceitou promoções. */
export default function AnnouncementsPage() {
  const { me, reload: reloadPanel } = usePanel();
  const { data, error, reload } = useLoad(() => staffApi<Overview>('/api/admin/announcements'), []);
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
      setMsg({ kind: 'success', text: `Aviso enviado para ${r.recipients === 1 ? '1 cliente' : `${r.recipients} clientes`}.` });
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
        <h1 className="text-2xl font-bold">Avisos aos clientes</h1>
        <p className="mt-1 text-stone-600">
          Mande novidades e promoções para o app dos clientes. O aviso aparece no sino de notificações de quem aceitou receber promoções do{' '}
          {ctx.tenantName}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-stone-500">Quem vai receber</p>
          <p className="text-2xl font-extrabold">{data.audience === 1 ? '1 cliente' : `${data.audience} clientes`}</p>
          <p className="text-sm text-stone-500">{data.audience === 1 ? 'aceitou' : 'aceitaram'} receber promoções</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-500">Avisos neste mês</p>
          <p className="text-2xl font-extrabold">
            {used}
            {max !== null && <span className="text-base font-semibold text-stone-500"> de {max}</span>}
          </p>
          <p className="text-sm text-stone-500">{max === null ? 'Sem limite no seu plano' : 'O limite renova no dia 1º'}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Novo aviso</h2>
          <form onSubmit={ask} className="space-y-4">
            <Field label="Título" hint={`${title.length}/${TITLE_MAX}`}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} placeholder="Ex.: Rodízio em dobro nesta terça" required />
            </Field>
            <Field label="Mensagem" hint={`${body.length}/${BODY_MAX}`}>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={BODY_MAX}
                rows={5}
                required
                placeholder="Conte a novidade em poucas linhas."
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base outline-none placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </Field>
            {blocked && (
              <Alert kind="warning">
                Você já usou os {max} avisos do mês no seu plano.{' '}
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
              Enviar aviso
            </Button>
          </form>
        </Card>

        <div className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-stone-500">Como o cliente vê</h2>
          <Card className="p-0">
            <div className="flex items-start gap-3 px-4 py-3.5">
              <TenantAvatar name={ctx.tenantName} logoUrl={ctx.logoUrl} color={ctx.primaryColor} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 text-sm font-semibold break-words text-stone-900">{title.trim() || 'Título do aviso'}</p>
                  <span className="shrink-0 text-xs text-stone-500">agora</span>
                </div>
                <p className="mt-0.5 text-sm break-words whitespace-pre-line text-stone-600">{body.trim() || 'A mensagem aparece aqui.'}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-0">
        <h2 className="px-5 pt-5 pb-3 font-semibold">Enviados</h2>
        {data.items.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-stone-500">Nenhum aviso enviado ainda.</p>
        ) : (
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {data.items.map((a) => (
              <li key={a.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-stone-500">
                    {formatDateTime(a.createdAt)} · {a.sentBy} · {a.recipients === 1 ? '1 cliente' : `${a.recipients} clientes`}
                  </p>
                </div>
                <p className="mt-0.5 text-sm whitespace-pre-line text-stone-600">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={confirmOpen} onClose={() => !sending && setConfirmOpen(false)} title="Enviar aviso?">
        <div className="space-y-4">
          <p className="text-stone-700">
            O aviso &quot;{title.trim()}&quot; vai para {data.audience === 1 ? '1 cliente' : `${data.audience} clientes`}. Depois de enviado, não dá para
            desfazer.
            {left !== null && ` Ficam ${left - 1 === 1 ? '1 aviso' : `${left - 1} avisos`} neste mês.`}
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
