'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { StaffCard } from '@/components/staff-card';
import { Alert, Button, Field, Input } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';

export default function Page() {
  return (
    <Suspense>
      <StaffReset />
    </Suspense>
  );
}

function StaffReset() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('As senhas não conferem.');
    setBusy(true);
    setError(null);
    try {
      await staffApi('/api/staff/auth/password/reset', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <StaffCard title="Nova senha">
      {done ? (
        <>
          <Alert kind="success">Senha alterada. Entre novamente.</Alert>
          <Link href="/painel/entrar" className="mt-4 block text-center font-semibold text-accent-600">
            Entrar
          </Link>
        </>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label="Nova senha">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          </Field>
          <Field label="Repita a nova senha">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy} className="w-full">
            Salvar
          </Button>
        </form>
      )}
    </StaffCard>
  );
}
