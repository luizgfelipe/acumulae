'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { PublicShell } from '@/components/customer-shell';
import { SocialButtons } from '@/components/social-buttons';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { safeNext } from '@/lib/customer';
import { tr } from '@/lib/region';

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}

function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const linking = params.get('vincular') === '1';
  const [identifier, setIdentifier] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(params.get('erro') === 'oauth' ? 'Não foi possível entrar com a conta social. Tente novamente.' : null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ customer: { profileComplete: boolean } }>('/api/auth/login', { method: 'POST', body: { identifier, password } });
      router.replace(r.customer.profileComplete ? next : `/completar-perfil?next=${encodeURIComponent(next)}`);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <PublicShell>
      <h1 className="mb-1 text-2xl font-bold">Entrar</h1>
      <p className="mb-6 text-stone-600">{tr('Acesse seus cartões fidelidade.', 'Aceda aos seus cartões de fidelização.')}</p>

      {linking && (
        <div className="mb-4">
          <Alert kind="info">
            {tr(
              'Já existe uma conta com este e-mail. Entre com sua senha para vincular o login social a ela.',
              'Já existe uma conta com este e-mail. Entre com a sua palavra-passe para lhe associar o início de sessão social.',
            )}
          </Alert>
        </div>
      )}

      {!linking && <SocialButtons next={next} />}

      <form onSubmit={submit} className="space-y-4">
        <Field label={tr('Telefone (WhatsApp) ou e-mail', 'Telemóvel ou e-mail')}>
          <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" inputMode="email" required />
        </Field>
        <Field label={tr('Senha', 'Palavra-passe')}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full" size="lg">
          Entrar
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        <Link href="/esqueci-senha" className="block font-medium text-accent-600">
          {tr('Esqueci minha senha', 'Esqueci-me da palavra-passe')}
        </Link>
        <p className="text-stone-600">
          Não tem conta?{' '}
          <Link href={`/cadastro?next=${encodeURIComponent(next)}`} className="font-semibold text-accent-600">
            {tr('Cadastre-se', 'Registe-se')}
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
