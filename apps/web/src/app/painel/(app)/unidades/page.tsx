'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AddressForm } from '@/components/address-form';
import { CounterQr } from '@/components/counter-qr';
import { usePanel } from '@/components/panel-context';
import { Alert, Badge, Button, Card, Field, FullPageSpinner, Input, Modal } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { AddressFields, EMPTY_ADDRESS, addressPayload, draftOf } from '@/lib/address';
import { brl, isFull, recommendationText } from '@/lib/plan';
import { tr } from '@/lib/region';
import { useLoad } from '@/lib/use-load';

interface Store {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  addressFields: AddressFields | null;
  status: 'ACTIVE' | 'INACTIVE';
  signupUrl: string;
}

function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function StoresPage() {
  const { me, plan, reload: reloadPanel } = usePanel();
  const { data, error, setData } = useLoad(() => staffApi<Store[]>('/api/admin/stores'), []);
  const [form, setForm] = useState({ name: '', address: EMPTY_ADDRESS });
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Store | null>(null);
  const [editing, setEditing] = useState<Store | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const usage = plan?.limits.stores;
  const full = usage ? isFull(usage) : false;

  async function save(key: string, call: () => Promise<Store[]>, onError: (m: string) => void) {
    setBusy(key);
    try {
      setData(await call());
      reloadPanel();
      return true;
    } catch (err) {
      onError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = addressPayload(form.address);
    if (!parsed.ok) return setFormError(parsed.error);
    const ok = await save(
      'new',
      () => staffApi<Store[]>('/api/admin/stores', { method: 'POST', body: { name: form.name, slug: slugify(form.name), address: parsed.value } }),
      setFormError,
    );
    if (ok) setForm({ name: '', address: EMPTY_ADDRESS });
  }

  const toggle = (s: Store) => {
    setActionError(null);
    return save(
      s.id,
      () => staffApi<Store[]>(`/api/admin/stores/${s.id}`, { method: 'PATCH', body: { status: s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }),
      setActionError,
    );
  };

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Unidades</h1>
        {usage && usage.max !== null && (
          <p className="text-sm text-stone-600">
            {usage.used} de {usage.max} {usage.max === 1 ? 'unidade ativa' : 'unidades ativas'} no seu plano
          </p>
        )}
      </div>
      {actionError && <Alert>{actionError}</Alert>}

      <div className="grid gap-4 md:grid-cols-2">
        {data.map((s) => (
          <Card key={s.id} className={s.status === 'ACTIVE' ? '' : 'bg-stone-50'}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="text-sm text-stone-500">{s.address ?? tr('Sem endereço', 'Sem morada')}</p>
              </div>
              <Badge color={s.status === 'ACTIVE' ? 'green' : 'stone'}>{s.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setPrinting(s)}>
                QR do balcão
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggle(s)} loading={busy === s.id}>
                {s.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="max-w-xl">
        <h2 className="mb-3 font-semibold">Nova unidade</h2>
        {full && usage ? (
          <div className="space-y-2 text-sm text-stone-700">
            <p>
              {tr('Seu plano permite', 'O seu plano permite')} {usage.max} {usage.max === 1 ? 'unidade ativa' : 'unidades ativas'}.
              {usage.extraPriceCents !== null
                ? tr(
                    ` Cada unidade extra custa ${brl(usage.extraPriceCents)} por mês: fale com o suporte do Acumulaê para contratar.`,
                    ` Cada unidade adicional custa ${brl(usage.extraPriceCents)} por mês: contacte o suporte do Acumulaê para a contratar.`,
                  )
                : ' Para ter mais unidades, mude de plano.'}
            </p>
            {plan?.recommendation && <p className="font-medium">{recommendationText(plan.recommendation)}</p>}
            <Link href="/painel/plano" className="font-medium text-accent-600 underline">
              {tr('Ver meu plano', 'Ver o meu plano')}
            </Link>
          </div>
        ) : (
          <form onSubmit={create} className="space-y-3">
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={tr('Ex.: Sushi X - Shopping', 'Ex.: Sushi X - Centro Comercial')} required maxLength={120} />
            </Field>
            <AddressForm value={form.address} onChange={(address) => setForm((f) => ({ ...f, address }))} />
            {formError && <Alert>{formError}</Alert>}
            <Button type="submit" loading={busy === 'new'}>
              Adicionar unidade
            </Button>
          </form>
        )}
      </Card>

      <EditStore
        store={editing}
        onClose={() => setEditing(null)}
        onSave={(s, body) =>
          save(`edit-${s.id}`, () => staffApi<Store[]>(`/api/admin/stores/${s.id}`, { method: 'PATCH', body }), (m) => {
            throw new Error(m);
          })
        }
      />

      <Modal open={!!printing} onClose={() => setPrinting(null)} title="QR do balcão">
        {printing && (
          <CounterQr
            tenantName={me.context?.tenantName ?? ''}
            storeName={printing.name}
            url={printing.signupUrl}
            logoUrl={me.context?.logoUrl ?? null}
            color={me.context?.primaryColor ?? '#F26419'}
            fileName={`qr-${printing.slug}`}
          />
        )}
      </Modal>
    </div>
  );
}

function EditStore({
  store,
  onClose,
  onSave,
}: {
  store: Store | null;
  onClose: () => void;
  onSave: (s: Store, body: { name: string; address?: AddressFields | null }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);

  // Preenche o formulário quando abre para outra unidade.
  if (store && openFor !== store.id) {
    setOpenFor(store.id);
    setName(store.name);
    setAddress(draftOf(store.addressFields));
    setErr(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    const parsed = addressPayload(address);
    if (!parsed.ok) return setErr(parsed.error);
    setBusy(true);
    try {
      // Endereço antigo em texto livre continua até o gestor informar o CEP.
      const keepLegacy = !parsed.value && !store.addressFields && store.address;
      await onSave(store, { name, ...(keepLegacy ? {} : { address: parsed.value }) });
      setOpenFor(null);
      onClose();
    } catch (x) {
      setErr(x instanceof Error ? x.message : tr('Não foi possível salvar.', 'Não foi possível guardar.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!store}
      onClose={() => {
        setOpenFor(null);
        onClose();
      }}
      title="Editar unidade"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome" hint={tr('Aparece no app do cliente e no caixa.', 'Aparece na app do cliente e no caixa.')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        {store && (
          <AddressForm
            key={store.id}
            value={address}
            onChange={setAddress}
            legacy={store.addressFields ? null : store.address}
            lockedInitially={!!store.addressFields}
          />
        )}
        {err && <Alert>{err}</Alert>}
        <Button type="submit" loading={busy} className="w-full">
          {tr('Salvar', 'Guardar')}
        </Button>
      </form>
    </Modal>
  );
}

