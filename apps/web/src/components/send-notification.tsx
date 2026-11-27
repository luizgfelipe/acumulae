'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { BODY_MAX, STORE_HINT, Segment, StoreOption, TITLE_MAX, audienceLabel, clients, notifications, segmentKeyOf, segmentQuery } from '@/lib/announcements';
import { errorMessage, staffApi } from '@/lib/api';
import { usePanel } from './panel-context';
import { Alert, Button, Card, Field, Input, Modal, Select, TenantAvatar, Textarea } from './ui';

/** Como a notificação aparece no sino do cliente. */
export function NotificationPreview({ title, body }: { title: string; body: string }) {
  const { me } = usePanel();
  const ctx = me.context!;
  return (
    <Card className="p-0">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <TenantAvatar name={ctx.tenantName} logoUrl={ctx.logoUrl} color={ctx.primaryColor} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold break-words text-stone-900">{title.trim() || 'Título da notificação'}</p>
            <span className="shrink-0 text-xs text-stone-500">agora</span>
          </div>
          <p className="mt-0.5 text-sm break-words whitespace-pre-line text-stone-600">{body.trim() || 'A mensagem aparece aqui.'}</p>
        </div>
      </div>
    </Card>
  );
}

/** Escolha da unidade do envio; só aparece com 2 ou mais unidades ativas. "" = todas. */
export function StorePicker({ stores, value, onChange, disabled }: { stores: StoreOption[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  if (stores.length < 2) return null;
  return (
    <Field label="Unidade" hint={STORE_HINT}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">Todas as unidades</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

interface Preview {
  /** Clientes no filtro. */
  total: number;
  /** Desses, quantos aceitaram promoções (quem recebe). */
  audience: number;
  usage: { used: number; max: number | null };
}

/** Botão "Enviar notificação" dos relatórios: manda para os clientes do filtro que aceitaram promoções. */
export function SendNotificationButton({ segment, suggestion }: { segment: Segment; suggestion?: { title: string; body: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Enviar notificação
      </Button>
      {open && <SendModal segment={segment} suggestion={suggestion} onClose={() => setOpen(false)} />}
    </>
  );
}

function SendModal({ segment, suggestion, onClose }: { segment: Segment; suggestion?: { title: string; body: string }; onClose: () => void }) {
  const { reload: reloadPanel } = usePanel();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState(suggestion?.title ?? '');
  const [body, setBody] = useState(suggestion?.body ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);
  /** Unidade escolhida ("" = todas). */
  const [storeId, setStoreId] = useState('');
  const key = JSON.stringify(segment);

  useEffect(() => {
    staffApi<Array<StoreOption & { status: string }>>('/api/admin/stores')
      .then((r) => setStores(r.filter((s) => s.status === 'ACTIVE').map(({ id, name }) => ({ id, name }))))
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    setPreview(null);
    staffApi<Preview>('/api/admin/announcements/preview', { query: segmentQuery(JSON.parse(key), storeId) })
      .then(setPreview)
      .catch((e) => setError(errorMessage(e)));
  }, [key, storeId]);

  const max = preview?.usage.max ?? null;
  const left = preview && max !== null ? Math.max(0, max - preview.usage.used) : null;
  const blocked = left === 0;
  const valid = title.trim().length >= 3 && body.trim().length >= 3;
  const canSend = !!preview && valid && !blocked && preview.audience > 0;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const r = await staffApi<{ recipients: number }>('/api/admin/announcements', {
        method: 'POST',
        body: { title: title.trim(), body: body.trim(), segment, storeId: storeId || null },
      });
      setDone(r.recipients);
      reloadPanel();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const label = audienceLabel(segmentKeyOf(segment), stores.find((s) => s.id === storeId));

  return (
    <Modal open onClose={() => !sending && onClose()} title="Enviar notificação">
      {done !== null ? (
        <div className="space-y-4">
          <Alert kind="success">Notificação enviada para {clients(done)}.</Alert>
          <p className="text-sm text-stone-600">
            O histórico fica em{' '}
            <Link href="/painel/notificacoes" className="font-medium text-accent-600 underline">
              Notificações
            </Link>
            .
          </p>
          <Button className="w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      ) : (
        <form onSubmit={send} className="space-y-4">
          <StorePicker stores={stores} value={storeId} onChange={setStoreId} disabled={sending} />
          <div className="rounded-xl bg-stone-50 p-3 text-sm">
            <p className="font-medium text-stone-800">Para: {label}</p>
            {preview ? (
              <p className="mt-0.5 text-stone-600">
                {preview.audience === preview.total
                  ? `${clients(preview.audience)} no filtro.`
                  : `${clients(preview.audience)} de ${preview.total} no filtro ${preview.audience === 1 ? 'aceitou' : 'aceitaram'} receber promoções. Só ${preview.audience === 1 ? 'ele recebe' : 'eles recebem'}.`}
                {left !== null && ` Gasta 1 das ${notifications(left)} que restam no mês.`}
                <span className="mt-1 block text-xs text-stone-500">Vai para todos do filtro, não só os da página que está aberta no relatório.</span>
              </p>
            ) : (
              !error && <p className="mt-0.5 text-stone-500">Contando os clientes…</p>
            )}
          </div>

          <Field label="Título" hint={`${title.length}/${TITLE_MAX}`}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} required autoFocus />
          </Field>
          <Field label="Mensagem" hint={`${body.length}/${BODY_MAX}`}>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX} rows={4} required />
          </Field>
          <NotificationPreview title={title} body={body} />

          {blocked && (
            <Alert kind="warning">
              Você já usou as {max} notificações do mês no seu plano.{' '}
              <Link href="/painel/plano" className="font-semibold underline">
                Ver meu plano
              </Link>
            </Alert>
          )}
          {preview && !blocked && preview.audience === 0 && (
            <Alert kind="info">Ninguém neste filtro aceitou receber promoções, então não há para quem enviar.</Alert>
          )}
          {error && <Alert>{error}</Alert>}

          <p className="text-xs text-stone-500">Depois de enviada, não dá para desfazer.</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose} disabled={sending}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" loading={sending} disabled={!canSend}>
              {preview && preview.audience > 0 ? `Enviar para ${clients(preview.audience)}` : 'Enviar'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
