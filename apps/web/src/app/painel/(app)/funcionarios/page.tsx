'use client';

import { FormEvent, useState } from 'react';
import { Alert, Badge, Button, Card, Field, FullPageSpinner, Input, Modal, Select } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
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
  pendingInvites: Array<{ id: string; email: string; name: string | null; role: string; expiresAt: string }>;
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
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;
  const activeStores = stores.data?.filter((s) => s.status === 'ACTIVE') ?? [];
  // No MVP há uma unidade por estabelecimento: ela é atribuída automaticamente.
  const singleStore = activeStores.length === 1 ? activeStores[0] : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Funcionários</h1>
      {actionError && <Alert>{actionError}</Alert>}

      <Card className="p-0">
        <ul className="divide-y divide-stone-100">
          {data.members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-48 flex-1">
                <p className="font-medium">
                  {m.name} {m.isMe && <span className="text-xs text-stone-500">(você)</span>}
                </p>
                <p className="text-sm text-stone-500">{m.email}</p>
                {m.role === 'ATTENDANT' && !singleStore && <p className="text-xs text-stone-500">Unidades: {m.stores.map((s) => s.name).join(', ') || 'nenhuma'}</p>}
              </div>
              <Badge color={m.role === 'MANAGER' ? 'brand' : 'stone'}>{m.role === 'MANAGER' ? 'Gestor' : 'Atendente'}</Badge>
              <Badge color={m.status === 'ACTIVE' ? 'green' : 'red'}>{m.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</Badge>
              {!m.isMe && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => update(m.membershipId, { role: m.role === 'MANAGER' ? 'ATTENDANT' : 'MANAGER' })}>
                    Tornar {m.role === 'MANAGER' ? 'atendente' : 'gestor'}
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
                  {i.email} ({i.role === 'MANAGER' ? 'gestor' : 'atendente'})
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
              <option value="ATTENDANT">Atendente (só caixa)</option>
              <option value="MANAGER">Gestor (caixa + painel)</option>
            </Select>
          </Field>
          {form.role === 'ATTENDANT' && !singleStore && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-stone-700">Unidades permitidas</p>
              <div className="space-y-1.5">
                {activeStores.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={form.storeIds.includes(s.id)}
                      onChange={(e) =>
                        setForm({ ...form, storeIds: e.target.checked ? [...form.storeIds, s.id] : form.storeIds.filter((x) => x !== s.id) })
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {formError && <Alert>{formError}</Alert>}
          <Button type="submit" loading={busy}>
            Enviar convite
          </Button>
        </form>
      </Card>

      <Modal open={!!inviteUrl} onClose={() => setInviteUrl(null)} title="Convite criado">
        <p className="text-sm text-stone-700">Enviamos o convite por e-mail. Você também pode mandar este link (uso único, válido por 72 horas):</p>
        <Input readOnly value={inviteUrl ?? ''} className="mt-3 text-sm" onFocus={(e) => e.target.select()} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => inviteUrl && navigator.clipboard?.writeText(inviteUrl)}>
            Copiar link
          </Button>
          <Button onClick={() => setInviteUrl(null)}>Fechar</Button>
        </div>
      </Modal>
    </div>
  );
}
