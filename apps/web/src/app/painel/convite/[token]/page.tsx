'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { StaffCard } from '@/components/staff-card';
import { Alert, Button, Field, FullPageSpinner, Input } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { tr } from '@/lib/region';
import { StaffMe } from '@/lib/staff';

interface InviteInfo {
  tenantName: string;
  email: string;
  name: string | null;
  role: 'MANAGER' | 'ATTENDANT';
  hasAccount: boolean;
}

/** RN-93: o gestor/funcionário define a própria senha pelo link de convite. */
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    staffApi<InviteInfo>(`/api/staff/invites/${token}`)
      .then((i) => {
        setInfo(i);
        setName(i.name ?? '');
      })
      .catch((e) => setLoadError(errorMessage(e)));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!info?.hasAccount && password !== confirm) return setError(tr('As senhas não conferem.', 'As palavras-passe não coincidem.'));
    setBusy(true);
    setError(null);
    try {
      const me = await staffApi<StaffMe>(`/api/staff/invites/${token}/accept`, { method: 'POST', body: { name: name || undefined, password } });
      const role = me.context?.role;
      router.replace(role === 'MANAGER' ? '/painel' : me.context?.storeId ? '/caixa' : '/caixa/unidade');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <StaffCard title="Convite indisponível">
        <Alert kind="warning">{loadError}</Alert>
        <Link href="/painel/entrar" className="mt-4 block text-center font-semibold text-accent-600">
          {tr('Ir para o login', 'Ir para o início de sessão')}
        </Link>
      </StaffCard>
    );
  if (!info) return <FullPageSpinner />;

  return (
    <StaffCard
      title={`Bem-vindo(a) ao ${info.tenantName}`}
      subtitle={tr(
        `Você foi convidado(a) como ${info.role === 'MANAGER' ? 'gestor(a)' : 'atendente'} (${info.email}).`,
        `Foi convidado(a) como ${info.role === 'MANAGER' ? 'gestor(a)' : 'operador(a)'} (${info.email}).`,
      )}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={tr('Seu nome', 'O seu nome')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </Field>
        {info.hasAccount ? (
          <Field
            label={tr('Sua senha atual do Acumulaê', 'A sua palavra-passe atual do Acumulaê')}
            hint={tr(
              'Você já tem acesso a outro estabelecimento; use a mesma senha.',
              'Já tem acesso a outro estabelecimento; use a mesma palavra-passe.',
            )}
          >
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </Field>
        ) : (
          <>
            <Field label={tr('Crie uma senha', 'Crie uma palavra-passe')} hint="Mínimo de 6 caracteres.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            </Field>
            <Field label={tr('Repita a senha', 'Repita a palavra-passe')}>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </Field>
          </>
        )}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} size="lg" className="w-full">
          Aceitar convite
        </Button>
      </form>
    </StaffCard>
  );
}
