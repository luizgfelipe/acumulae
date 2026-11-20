'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { CustomerShell } from '@/components/customer-shell';
import { Alert, Button, Card, Field, FullPageSpinner, Input, Modal, Switch, TenantAvatar, cx } from '@/components/ui';
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

  // Salvar só habilita com alguma mudança válida.
  const dirty = name.trim() !== me.name || birthDate !== (me.birthDate ?? '');
  const canSave = dirty && name.trim().length >= 2;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setMsg(null);
    try {
      await api('/api/me', { method: 'PATCH', body: { name: name.trim(), birthDate: birthDate || null } });
      await reload();
      setMsg({ kind: 'success', text: 'Dados salvos.' });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  function edit(fn: () => void) {
    fn();
    if (msg?.kind === 'success') setMsg(null);
  }

  function undo() {
    setName(me!.name);
    setBirthDate(me!.birthDate ?? '');
    setMsg(null);
  }

  // O consentimento vale para o estabelecimento inteiro (todos os cartões dele).
  async function toggleConsent(c: MembershipCard, value: boolean) {
    setCards((cs) => cs.map((x) => (x.tenant.slug === c.tenant.slug ? { ...x, marketingConsent: value } : x)));
    await api(`/api/me/memberships/${c.membershipId}/consent`, { method: 'PATCH', body: { marketingConsent: value } }).catch(() => undefined);
  }

  async function doLogout() {
    await logout();
    router.replace('/');
  }

  return (
    <CustomerShell>
      <div className="space-y-6 pt-2">
        {/* Quem está logado */}
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-brand-600 text-2xl font-bold text-white" aria-hidden>
            {me.name.trim()[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{me.name}</h1>
            <p className="truncate text-sm text-stone-500">{formatE164(me.phone) || me.email}</p>
          </div>
        </div>

        <Section title="Dados pessoais">
          <Card>
            <form onSubmit={save} className="space-y-4">
              <Field label="Nome">
                <Input value={name} onChange={(e) => edit(() => setName(e.target.value))} required minLength={2} maxLength={120} autoComplete="name" />
              </Field>
              <Field label="Data de nascimento" hint="Opcional. Serve para os estabelecimentos lembrarem do seu aniversário.">
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => edit(() => setBirthDate(e.target.value))}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </Field>
              {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
              <div className="flex gap-2">
                {dirty && (
                  <Button type="button" variant="ghost" onClick={undo} disabled={saving}>
                    Desfazer
                  </Button>
                )}
                <Button type="submit" loading={saving} disabled={!canSave} className="flex-1">
                  {dirty ? 'Salvar alterações' : 'Salvo'}
                </Button>
              </div>
            </form>

            <dl className="mt-5 divide-y divide-stone-100 border-t border-stone-100 text-sm">
              <InfoRow label="Telefone (WhatsApp)" value={formatE164(me.phone) || '—'} />
              <InfoRow label="E-mail" value={me.email ?? '—'} />
            </dl>
            <p className="mt-2 text-xs text-stone-500">Para trocar o telefone ou o e-mail, fale com o suporte.</p>
          </Card>
        </Section>

        <Section title="Promoções" hint="Escolha quem pode usar seu telefone para mandar ofertas. Aceitar um não autoriza os outros.">
          <Card className="p-0">
            {cards.length === 0 ? (
              <p className="p-5 text-sm text-stone-500">Você ainda não participa de nenhum programa.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {uniqueTenants(cards).map((c) => (
                  <li key={c.tenant.slug} className="flex items-center gap-3 px-5 py-3">
                    <TenantAvatar name={c.tenant.name} logoUrl={c.tenant.logoUrl} color={c.tenant.primaryColor} size={36} />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.tenant.name}</span>
                    <Switch
                      checked={!!c.marketingConsent}
                      onChange={(v) => toggleConsent(c, v)}
                      label={`Receber promoções do ${c.tenant.name}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>

        <Section title="Acesso">
          <Card className="p-0">
            <ul className="divide-y divide-stone-100">
              <li>
                <ActionRow onClick={() => setPwOpen(true)}>{me.hasPassword ? 'Trocar senha' : 'Criar senha'}</ActionRow>
              </li>
              <li>
                <ActionRow onClick={doLogout}>Sair desta conta</ActionRow>
              </li>
            </ul>
          </Card>
        </Section>

        <div className="pt-2 text-center">
          <button onClick={() => setDelOpen(true)} className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50">
            Excluir minha conta
          </button>
        </div>
      </div>

      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} hasPassword={me.hasPassword} onDone={reload} />
      <DeleteModal open={delOpen} onClose={() => setDelOpen(false)} hasPassword={me.hasPassword} onDone={() => router.replace('/')} />
    </CustomerShell>
  );
}

/** Um cartão por estabelecimento (quem tem 2 programas no mesmo lugar aparece uma vez). */
function uniqueTenants(cards: MembershipCard[]) {
  const seen = new Set<string>();
  return cards.filter((c) => !seen.has(c.tenant.slug) && seen.add(c.tenant.slug));
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-stone-600">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-stone-800">{value}</dd>
    </div>
  );
}

function ActionRow({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-5 py-3.5 text-left font-medium text-stone-800 transition-colors hover:bg-stone-50 first:rounded-t-2xl last:rounded-b-2xl"
    >
      {children}
      <span aria-hidden className="text-lg text-stone-400">
        ›
      </span>
    </button>
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
          <Alert kind="success">
            {hasPassword
              ? 'Senha alterada. As sessões em outros aparelhos foram encerradas.'
              : 'Senha criada. Agora você também pode entrar com seu telefone ou e-mail e essa senha.'}
          </Alert>
          <Button className="w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!hasPassword && (
            <div className="space-y-2 text-sm text-stone-600">
              <p>
                Você já entra com sua conta Google ou Apple e <strong>não precisa de senha</strong>. Criar uma é opcional.
              </p>
              <p>Com uma senha, você também pode entrar usando seu telefone ou e-mail. Isso ajuda quando:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>você perder o acesso à sua conta Google ou Apple;</li>
                <li>estiver em um aparelho onde ela não está conectada.</li>
              </ul>
            </div>
          )}
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
