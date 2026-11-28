'use client';

import { FormEvent, useState } from 'react';
import { usePanel } from '@/components/panel-context';
import { Alert, Badge, Button, Card, Field, FullPageSpinner, Input, Modal, Select } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { tr } from '@/lib/region';
import { useLoad } from '@/lib/use-load';

interface StaffData {
  members: Array<{
    membershipId: string;
    name: string;
    email: string;
    role: 'MANAGER' | 'ATTENDANT';
    status: 'ACTIVE' | 'INACTIVE';
    isMe: boolean;
    stores: { id: string; name: string }[];
  }>;
  pendingInvites: Array<{ id: string; email: string; name: string | null; role: string; expiresAt: string; stores: { id: string; name: string }[] }>;
}

type Store = { id: string; name: string; status: string };

export default function StaffPage() {
  const { data, error, setData, reload } = useLoad(() => staffApi<StaffData>('/api/admin/staff'), []);
  const stores = useLoad(() => staffApi<Store[]>('/api/admin/stores'), []);
  const [form, setForm] = useState({ name: '', email: '', role: 'ATTENDANT' as 'ATTENDANT' | 'MANAGER', storeIds: [] as string[] });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Escolha de unidades de um atendente (editar, ou ao tornar um gestor atendente). */
  const [storesFor, setStoresFor] = useState<{ member: StaffData['members'][number]; demote: boolean } | null>(null);
  const { plan, reload: reloadPanel } = usePanel();
  const staffLimit = plan?.limits.staff;

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const r = await staffApi<{ inviteUrl: string }>('/api/admin/staff', {
        method: 'POST',
        body: { ...form, name: form.name || null, storeIds: form.role === 'MANAGER' ? [] : singleStore ? [singleStore.id] : form.storeIds },
      });
      setInviteUrl(r.inviteUrl);
      setForm({ name: '', email: '', role: 'ATTENDANT', storeIds: [] });
      reload();
      reloadPanel();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, body: Record<string, unknown>) {
    setActionError(null);
    try {
      setData(await staffApi<StaffData>(`/api/admin/staff/${id}`, { method: 'PATCH', body }));
      reloadPanel();
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;
  const activeStores = stores.data?.filter((s) => s.status === 'ACTIVE') ?? [];
  // No MVP há uma unidade por estabelecimento: ela é atribuída automaticamente.
  const singleStore = activeStores.length === 1 ? activeStores[0] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Funcionários</h1>
        {staffLimit && staffLimit.max !== null && (
          <p className="text-sm text-stone-600">
            {staffLimit.used} de {staffLimit.max} no seu plano, contando os convites pendentes
          </p>
        )}
      </div>
      {actionError && <Alert>{actionError}</Alert>}

      <Card className="p-0">
        <ul className="divide-y divide-stone-100">
          {data.members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-48 flex-1">
                <p className="font-medium">
                  {m.name} {m.isMe && <span className="text-xs text-stone-500">{tr('(você)', '(o próprio)')}</span>}
                </p>
                <p className="text-sm text-stone-500">{m.email}</p>
                {m.role === 'ATTENDANT' && !singleStore && (
                  <p className="text-xs text-stone-500">Unidades: {m.stores.map((s) => s.name).join(', ') || 'nenhuma'}</p>
                )}
                {m.role === 'MANAGER' && !singleStore && <p className="text-xs text-stone-500">Todas as unidades</p>}
              </div>
              <Badge color={m.role === 'MANAGER' ? 'brand' : 'stone'}>{m.role === 'MANAGER' ? 'Gestor' : tr('Atendente', 'Operador')}</Badge>
              <Badge color={m.status === 'ACTIVE' ? 'green' : 'red'}>{m.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Badge>
              {!m.isMe && (
                <div className="flex gap-2">
                  {m.role === 'ATTENDANT' && !singleStore && (
                    <Button size="sm" variant="secondary" onClick={() => setStoresFor({ member: m, demote: false })}>
                      Unidades
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      m.role === 'MANAGER' && !singleStore
                        ? setStoresFor({ member: m, demote: true })
                        : update(m.membershipId, { role: m.role === 'MANAGER' ? 'ATTENDANT' : 'MANAGER' })
                    }
                  >
                    Tornar {m.role === 'MANAGER' ? tr('atendente', 'operador') : 'gestor'}
                  </Button>
                  <Button size="sm" variant={m.status === 'ACTIVE' ? 'ghost' : 'secondary'} className={m.status === 'ACTIVE' ? 'text-red-700' : ''} onClick={() => update(m.membershipId, { status: m.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>
                    {m.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {data.pendingInvites.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Convites pendentes</h2>
          <ul className="space-y-1 text-sm">
            {data.pendingInvites.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>
                  {i.name ? `${i.name} · ` : ''}
                  {i.email} ({i.role === 'MANAGER' ? 'gestor' : tr('atendente', 'operador')})
                  {i.role !== 'MANAGER' && !singleStore && i.stores.length > 0 && (
                    <span className="text-stone-500"> · {i.stores.map((st) => st.name).join(', ')}</span>
                  )}
                </span>
                <span className="text-stone-500">expira {formatDateTime(i.expiresAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="max-w-xl">
        <h2 className="mb-3 font-semibold">Convidar funcionário</h2>
        <form onSubmit={invite} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Field>
          </div>
          <Field label="Perfil">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'ATTENDANT' | 'MANAGER' })}>
              <option value="ATTENDANT">{tr('Atendente (só caixa)', 'Operador (só caixa)')}</option>
              <option value="MANAGER">Gestor (caixa + painel)</option>
            </Select>
          </Field>
          {form.role === 'ATTENDANT' && !singleStore && (
            <StorePicker stores={activeStores} value={form.storeIds} onChange={(storeIds) => setForm({ ...form, storeIds })} />
          )}
          {form.role === 'MANAGER' && !singleStore && <p className="text-xs text-stone-500">{tr('Gestores acessam todas as unidades.', 'Os gestores têm acesso a todas as unidades.')}</p>}
          {formError && <Alert>{formError}</Alert>}
          <Button type="submit" loading={busy}>
            Enviar convite
          </Button>
        </form>
      </Card>

      <StoresModal
        key={storesFor?.member.membershipId ?? 'none'}
        target={storesFor}
        stores={activeStores}
        onClose={() => setStoresFor(null)}
        onSave={async (storeIds) => {
          if (!storesFor) return;
          const ok = await update(storesFor.member.membershipId, storesFor.demote ? { role: 'ATTENDANT', storeIds } : { storeIds });
          if (ok) setStoresFor(null);
        }}
      />

      <Modal open={!!inviteUrl} onClose={() => setInviteUrl(null)} title="Convite criado">
        <p className="text-sm text-stone-700">
          {tr(
            'Enviamos o convite por e-mail. Você também pode mandar este link (uso único, válido por 72 horas):',
            'Enviámos o convite por e-mail. Também pode enviar esta ligação (uso único, válida por 72 horas):',
          )}
        </p>
        <Input readOnly value={inviteUrl ?? ''} className="mt-3 text-sm" onFocus={(e) => e.target.select()} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => inviteUrl && navigator.clipboard?.writeText(inviteUrl)}>
            {tr('Copiar link', 'Copiar ligação')}
          </Button>
          <Button onClick={() => setInviteUrl(null)}>Fechar</Button>
        </div>
      </Modal>
    </div>
  );
}

/** Unidades em que o atendente pode usar o caixa. */
function StorePicker({ stores, value, onChange }: { stores: Store[]; value: string[]; onChange: (ids: string[]) => void }) {
  const all = stores.length > 0 && stores.every((s) => value.includes(s.id));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-stone-700">Unidades em que pode trabalhar</p>
        <button type="button" className="text-xs font-semibold text-accent-600 hover:underline" onClick={() => onChange(all ? [] : stores.map((s) => s.id))}>
          {all ? 'Desmarcar todas' : 'Marcar todas'}
        </button>
      </div>
      <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
        {stores.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-stone-50">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={value.includes(s.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((x) => x !== s.id))}
            />
            {s.name}
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-stone-500">
        {tr('O atendente só entra no caixa das unidades marcadas.', 'O operador só entra no caixa das unidades marcadas.')}
      </p>
    </div>
  );
}

/** Editar as unidades de um atendente, ou escolher as unidades ao tornar um gestor atendente. */
function StoresModal({
  target,
  stores,
  onClose,
  onSave,
}: {
  target: { member: StaffData['members'][number]; demote: boolean } | null;
  stores: Store[];
  onClose: () => void;
  onSave: (storeIds: string[]) => Promise<void>;
}) {
  const [ids, setIds] = useState<string[]>(() => (target && !target.demote ? target.member.stores.map((s) => s.id) : []));
  const [saving, setSaving] = useState(false);
  if (!target) return null;
  return (
    <Modal open onClose={onClose} title={target.demote ? 'Tornar ' + target.member.name + tr(' atendente', ' operador') : 'Unidades de ' + target.member.name}>
      <div className="space-y-4">
        {target.demote && (
          <p className="text-sm text-stone-600">
            {tr('Atendentes só usam o caixa. Escolha em quais unidades.', 'Os operadores só usam o caixa. Escolha em que unidades.')}
          </p>
        )}
        <StorePicker stores={stores} value={ids} onChange={setIds} />
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!ids.length}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              await onSave(ids);
              setSaving(false);
            }}
          >
            {target.demote ? tr('Tornar atendente', 'Tornar operador') : tr('Salvar', 'Guardar')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
