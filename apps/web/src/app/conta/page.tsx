'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { CustomerShell } from '@/components/customer-shell';
import { Alert, Button, Card, Field, FullPageSpinner, Input, Modal } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { MembershipCard, logout, useMe } from '@/lib/customer';
import { formatE164 } from '@/lib/format';

export default function AccountPage() {
  const router = useRouter();
  const { me, reload } = useMe({ required: true });
  const [cards, setCards] = useState<MembershipCard[]>([]);
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  useEffect(() => {
    if (!me) return;
    setName(me.name);
    setBirthDate(me.birthDate ?? '');
    api<MembershipCard[]>('/api/me/memberships').then(setCards).catch(() => undefined);
  }, [me]);

  if (!me) return <FullPageSpinner />;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await api('/api/me', { method: 'PATCH', body: { name, birthDate: birthDate || null } });
      await reload();
      setMsg({ kind: 'success', text: 'Dados salvos.' });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function toggleConsent(c: MembershipCard, value: boolean) {
    setCards((cs) => cs.map((x) => (x.membershipId === c.membershipId ? { ...x, marketingConsent: value } : x)));
    await api(`/api/me/memberships/${c.membershipId}/consent`, { method: 'PATCH', body: { marketingConsent: value } }).catch(() => undefined);
  }

  async function doLogout() {
    await logout();
    router.replace('/');
  }

  return (
    <CustomerShell>
      <div className="space-y-5 pt-2">
        <h1 className="text-2xl font-bold">Minha conta</h1>

        <Card>
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </Field>
            <Field label="Telefone (WhatsApp)" hint="Para trocar o telefone, fale com o suporte.">
              <Input value={formatE164(me.phone)} disabled />
            </Field>
            <Field label="E-mail">
              <Input value={me.email ?? ''} disabled />
            </Field>
            <Field label="Data de nascimento" hint="🎁 Informe e ganhe um presente no seu aniversário.">
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
            </Field>
            {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
            <Button type="submit" loading={saving} className="w-full">
              Salvar
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="font-semibold">Promoções por estabelecimento</h2>
          <p className="mb-3 text-sm text-stone-600">Escolha quem pode ver seu telefone para enviar ofertas. Aceitar um não autoriza os outros.</p>
          {cards.length === 0 && <p className="text-sm text-stone-500">Você ainda não participa de nenhum programa.</p>}
          <ul className="divide-y divide-stone-100">
            {cards.map((c) => (
              <li key={c.membershipId} className="flex items-center justify-between py-3">
                <span className="font-medium">{c.tenant.name}</span>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand-600"
                    checked={!!c.marketingConsent}
                    onChange={(e) => toggleConsent(c, e.target.checked)}
                  />
                  Receber
                </label>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3">
          <Button variant="secondary" className="w-full" onClick={() => setPwOpen(true)}>
            {me.hasPassword ? 'Trocar senha' : 'Criar senha'}
          </Button>
          <Button variant="secondary" className="w-full" onClick={doLogout}>
            Sair
          </Button>
          <Button variant="ghost" className="w-full text-red-700" onClick={() => setDelOpen(true)}>
            Excluir minha conta
          </Button>
        </Card>
      </div>

      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} hasPassword={me.hasPassword} onDone={reload} />
      <DeleteModal open={delOpen} onClose={() => setDelOpen(false)} hasPassword={me.hasPassword} onDone={() => router.replace('/')} />
    </CustomerShell>
  );
}

function PasswordModal({ open, onClose, hasPassword, onDone }: { open: boolean; onClose: () => void; hasPassword: boolean; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/me/password', { method: 'POST', body: { currentPassword: current || undefined, newPassword: next } });
      setOk(true);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={hasPassword ? 'Trocar senha' : 'Criar senha'}>
      {ok ? (
        <div className="space-y-4">
          <Alert kind="success">Senha alterada. As sessões em outros aparelhos foram encerradas.</Alert>
          <Button className="w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {hasPassword && (
            <Field label="Senha atual">
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </Field>
          )}
          <Field label="Nova senha" hint="Mínimo de 6 caracteres.">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full">
            Salvar
          </Button>
        </form>
      )}
    </Modal>
  );
}

function DeleteModal({ open, onClose, hasPassword, onDone }: { open: boolean; onClose: () => void; hasPassword: boolean; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/me', { method: 'DELETE', body: { password: password || undefined, confirm } });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Excluir minha conta">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-stone-700">
          Seus dados pessoais serão apagados e você perderá todos os cartões e recompensas. Os estabelecimentos mantêm apenas o histórico de
          movimentações, sem identificar você. Isso não pode ser desfeito.
        </p>
        {hasPassword && (
          <Field label="Sua senha">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
        )}
        <Field label='Digite "EXCLUIR" para confirmar'>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} required />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="danger" loading={loading} disabled={confirm !== 'EXCLUIR'} className="w-full">
          Excluir definitivamente
        </Button>
      </form>
    </Modal>
  );
}
