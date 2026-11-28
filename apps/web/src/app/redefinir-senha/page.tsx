'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { PublicShell } from '@/components/customer-shell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { tr } from '@/lib/region';

export default function Page() {
  return (
    <Suspense>
      <ResetPage />
    </Suspense>
  );
}

function ResetPage() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError(tr('As senhas não conferem.', 'As palavras-passe não coincidem.'));
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/password/reset', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicShell>
      <h1 className="mb-4 text-2xl font-bold">{tr('Nova senha', 'Nova palavra-passe')}</h1>
      {done ? (
        <div className="space-y-4">
          <Alert kind="success">
            {tr(
              'Senha alterada! Por segurança, encerramos as sessões em outros aparelhos.',
              'Palavra-passe alterada! Por segurança, terminámos as sessões noutros dispositivos.',
            )}
          </Alert>
          <Link href="/entrar" className="block text-center font-semibold text-accent-600">
            Entrar
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={tr('Nova senha', 'Nova palavra-passe')} hint="Mínimo de 6 caracteres.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label={tr('Repita a nova senha', 'Repita a nova palavra-passe')}>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full" size="lg">
            {tr('Salvar nova senha', 'Guardar nova palavra-passe')}
          </Button>
        </form>
      )}
    </PublicShell>
  );
}
