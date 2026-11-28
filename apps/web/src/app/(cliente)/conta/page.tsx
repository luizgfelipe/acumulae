'use client';

import { ChevronDown, ChevronRight, KeyRound, LogOut, Trash2, TriangleAlert } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { useLoggedCustomer } from '@/components/customer-context';
import { Alert, Button, Card, Field, Input, Modal, Switch, TenantAvatar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { MembershipCard, logout } from '@/lib/customer';
import { forgetPushDevice, usePush } from '@/lib/push';
import { formatE164 } from '@/lib/format';
import { tr } from '@/lib/region';

export default function AccountPage() {
  const { me, reload } = useLoggedCustomer();
  const [cards, setCards] = useState<MembershipCard[]>([]);
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setName(me.name);
    setBirthDate(me.birthDate ?? '');
  }, [me]);

  useEffect(() => {
    api<MembershipCard[]>('/api/me/memberships').then(setCards).catch(() => undefined);
  }, []);

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
      setMsg({ kind: 'success', text: tr('Dados salvos.', 'Dados guardados.') });
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

  // Atalho: a mesma escolha para todos os estabelecimentos atuais (os próximos continuam perguntando).
  async function toggleAll(value: boolean) {
    setCards((cs) => cs.map((x) => ({ ...x, marketingConsent: value })));
    await api('/api/me/consent', { method: 'PATCH', body: { marketingConsent: value } }).catch(() => undefined);
  }

  const tenants = uniqueTenants(cards);
  const allOn = tenants.length > 0 && tenants.every((c) => c.marketingConsent === true);
  const someOn = tenants.some((c) => c.marketingConsent === true);

  async function doLogout() {
    setLoggingOut(true);
    await logout();
    leaveAccount();
  }

  return (
    <>
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
              <Field
                label="Data de nascimento"
                hint={tr(
                  'Opcional. Serve para os estabelecimentos lembrarem do seu aniversário.',
                  'Opcional. Serve para os estabelecimentos se lembrarem do seu aniversário.',
                )}
              >
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
                  {dirty ? tr('Salvar alterações', 'Guardar alterações') : tr('Salvo', 'Guardado')}
                </Button>
              </div>
            </form>

            <dl className="mt-5 divide-y divide-stone-100 border-t border-stone-100 text-sm">
              <InfoRow label={tr('Telefone (WhatsApp)', 'Telemóvel')} value={formatE164(me.phone) || '—'} />
              <InfoRow label="E-mail" value={me.email ?? '—'} />
            </dl>
            <p className="mt-2 text-xs text-stone-500">
              {tr('Para trocar o telefone ou o e-mail, fale com o suporte.', 'Para mudar o telemóvel ou o e-mail, contacte o suporte.')}
            </p>
          </Card>
        </Section>

        <PushSection />

        <Section
          title="Promoções"
          hint={tr(
            'Quem você autorizar pode ver seu telefone, e-mail e aniversário e mandar ofertas. Estabelecimentos novos perguntam quando você ganhar o primeiro cartão.',
            'Quem autorizar pode ver o seu telemóvel, e-mail e aniversário e enviar ofertas. Os novos estabelecimentos perguntam quando ganhar o primeiro cartão.',
          )}
        >
          <Card className="p-0">
            {cards.length === 0 ? (
              <p className="p-5 text-sm text-stone-500">{tr('Você ainda não participa de nenhum programa.', 'Ainda não participa em nenhum programa.')}</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                <li className="flex items-center gap-3 rounded-t-2xl bg-stone-50 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Todos os estabelecimentos</p>
                    <p className="text-xs text-stone-500">
                      {allOn
                        ? tr('Recebendo de todos', 'A receber de todos')
                        : someOn
                          ? tr('Recebendo de alguns: ajuste abaixo', 'A receber de alguns: ajuste em baixo')
                          : tr('Não recebendo de nenhum', 'Sem receber de nenhum')}
                    </p>
                  </div>
                  <Switch checked={allOn} onChange={toggleAll} label="Receber promoções de todos os estabelecimentos" />
                </li>
                {tenants.map((c) => (
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
            <ActionRow onClick={() => setPwOpen(true)} icon={<KeyRound className="h-5 w-5" aria-hidden />}>
              {me.hasPassword ? tr('Trocar senha', 'Alterar palavra-passe') : tr('Criar senha', 'Criar palavra-passe')}
            </ActionRow>
          </Card>
        </Section>

        <Button variant="secondary" size="lg" className="w-full" onClick={doLogout} loading={loggingOut}>
          {!loggingOut && <LogOut className="h-5 w-5" aria-hidden />}
          Sair desta conta
        </Button>

        <DangerZone onDelete={() => setDelOpen(true)} />
      </div>

      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} hasPassword={me.hasPassword} onDone={reload} />
      <DeleteModal open={delOpen} onClose={() => setDelOpen(false)} hasPassword={me.hasPassword} onDone={leaveAccount} />
    </>
  );
}

/** Depois de sair ou excluir a conta: recarrega o app do zero, já sem o cliente carregado no layout. */
function leaveAccount() {
  window.location.replace('/');
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

function ActionRow({ onClick, icon, children }: { onClick: () => void; icon?: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-5 py-3.5 text-left font-medium text-stone-800 transition-colors hover:bg-stone-50"
    >
      {icon && <span className="text-stone-500">{icon}</span>}
      <span className="flex-1">{children}</span>
      <ChevronRight className="h-5 w-5 text-stone-400" aria-hidden />
    </button>
  );
}

/**
 * Excluir a conta fica recolhido numa "zona de perigo": não aparece por engano no meio das
 * opções do dia a dia, mas continua fácil de achar (direito de exclusão da LGPD).
 */
function DangerZone({ onDelete }: { onDelete: () => void }) {
  return (
    <details className="group rounded-2xl border border-red-200 bg-red-50/40 open:bg-red-50/70">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold text-red-800 transition-colors hover:bg-red-50 [&::-webkit-details-marker]:hidden">
        <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden />
        <span className="flex-1">Zona de perigo</span>
        <ChevronDown className="h-5 w-5 transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 px-5 pb-5">
        <p className="text-sm text-red-900/80">
          {tr(
            'Excluir a conta apaga seus dados pessoais, cartões e recompensas de todos os estabelecimentos. Não dá para desfazer.',
            'Eliminar a conta apaga os seus dados pessoais, cartões e recompensas de todos os estabelecimentos. Não é possível anular.',
          )}
        </p>
        <Button variant="danger" className="w-full" onClick={onDelete}>
          <Trash2 className="h-4.5 w-4.5" aria-hidden />
          {tr('Excluir minha conta', 'Eliminar a minha conta')}
        </Button>
      </div>
    </details>
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
    <Modal open={open} onClose={onClose} title={hasPassword ? tr('Trocar senha', 'Alterar palavra-passe') : tr('Criar senha', 'Criar palavra-passe')}>
      {ok ? (
        <div className="space-y-4">
          <Alert kind="success">
            {hasPassword
              ? tr(
                  'Senha alterada. As sessões em outros aparelhos foram encerradas.',
                  'Palavra-passe alterada. As sessões noutros dispositivos foram terminadas.',
                )
              : tr(
                  'Senha criada. Agora você também pode entrar com seu telefone ou e-mail e essa senha.',
                  'Palavra-passe criada. Agora também pode entrar com o seu telemóvel ou e-mail e essa palavra-passe.',
                )}
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
                {tr(
                  <>
                    Você já entra com sua conta Google ou Apple e <strong>não precisa de senha</strong>. Criar uma é opcional.
                  </>,
                  <>
                    Já entra com a sua conta Google ou Apple e <strong>não precisa de palavra-passe</strong>. Criar uma é opcional.
                  </>,
                )}
              </p>
              <p>
                {tr(
                  'Com uma senha, você também pode entrar usando seu telefone ou e-mail. Isso ajuda quando:',
                  'Com uma palavra-passe, também pode entrar com o seu telemóvel ou e-mail. Isto ajuda quando:',
                )}
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>{tr('você perder o acesso à sua conta Google ou Apple;', 'perder o acesso à sua conta Google ou Apple;')}</li>
                <li>{tr('estiver em um aparelho onde ela não está conectada.', 'estiver num dispositivo onde ela não tem sessão iniciada.')}</li>
              </ul>
            </div>
          )}
          {hasPassword && (
            <Field label={tr('Senha atual', 'Palavra-passe atual')}>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </Field>
          )}
          <Field label={tr('Nova senha', 'Nova palavra-passe')} hint="Mínimo de 6 caracteres.">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full">
            {tr('Salvar', 'Guardar')}
          </Button>
        </form>
      )}
    </Modal>
  );
}

const CONFIRM_WORD = tr('EXCLUIR', 'ELIMINAR');

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
      await forgetPushDevice(); // a API já apagou os aparelhos; aqui desfaz a inscrição no navegador
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={tr('Excluir minha conta', 'Eliminar a minha conta')}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-stone-700">
          {tr(
            <>
              Seus dados pessoais serão apagados e você perderá todos os cartões e recompensas. Os estabelecimentos mantêm apenas o histórico de
              movimentações, sem identificar você. Isso não pode ser desfeito.
            </>,
            <>
              Os seus dados pessoais serão apagados e perderá todos os cartões e recompensas. Os estabelecimentos mantêm apenas o histórico de
              movimentos, sem o identificar. Isto não pode ser anulado.
            </>,
          )}
        </p>
        {hasPassword && (
          <Field label={tr('Sua senha', 'A sua palavra-passe')}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
        )}
        <Field label={tr('Digite "EXCLUIR" para confirmar', 'Escreva "ELIMINAR" para confirmar')}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} required />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="danger" loading={loading} disabled={confirm !== CONFIRM_WORD} className="w-full">
          {tr('Excluir definitivamente', 'Eliminar definitivamente')}
        </Button>
      </form>
    </Modal>
  );
}

/** Notificações no celular: liga ou desliga neste aparelho. */
function PushSection() {
  const { state, busy, enable, disable } = usePush();
  const [error, setError] = useState<string | null>(null);
  if (state === 'loading' || state === 'unavailable') return null;

  async function toggle(on: boolean) {
    setError(null);
    try {
      await (on ? enable() : disable());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Section
      title={tr('Notificações no celular', 'Notificações no telemóvel')}
      hint={tr(
        'Vale só para este aparelho. Mesmo desligadas, tudo continua aparecendo no sino do app.',
        'Vale só para este dispositivo. Mesmo desligadas, tudo continua a aparecer no sino da app.',
      )}
    >
      <Card>
        {state === 'on' || state === 'off' ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{tr('Avisar neste aparelho', 'Avisar neste dispositivo')}</p>
              <p className="text-sm text-stone-500">
                {tr('Selos, recompensas, resgates e novidades dos estabelecimentos.', 'Carimbos, recompensas, resgates e novidades dos estabelecimentos.')}
              </p>
            </div>
            <Switch checked={state === 'on'} onChange={(v) => !busy && toggle(v)} label={tr('Receber notificações neste aparelho', 'Receber notificações neste dispositivo')} />
          </div>
        ) : (
          <p className="text-sm text-stone-600">{PUSH_HELP[state]}</p>
        )}
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
      </Card>
    </Section>
  );
}

const PUSH_HELP: Record<'unsupported' | 'needs-install' | 'denied', string> = tr(
  {
    unsupported: 'Este navegador não recebe notificações. Elas continuam aparecendo no sino do app.',
    'needs-install': 'No iPhone, adicione o Acumulaê à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá para ativar.',
    denied: 'As notificações do Acumulaê estão bloqueadas neste aparelho. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) ou do celular.',
  },
  {
    unsupported: 'Este navegador não recebe notificações. Continuam a aparecer no sino da app.',
    'needs-install': 'No iPhone, adicione o Acumulaê ao ecrã principal (Partilhar → Adicionar ao ecrã principal) e abra-o a partir daí para ativar.',
    denied: 'As notificações do Acumulaê estão bloqueadas neste dispositivo. Permita-as nas definições do navegador (ícone do cadeado ao lado do endereço) ou do telemóvel.',
  },
);
