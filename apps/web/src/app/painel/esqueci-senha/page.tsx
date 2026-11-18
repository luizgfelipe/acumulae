'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { StaffCard } from '@/components/staff-card';
import { Alert, Button, Field, Input } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';

export default function StaffForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await staffApi('/api/staff/auth/password/forgot', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <StaffCard title="Esqueci a senha" subtitle="Para atendentes e gestores.">
      {sent ? (
        <Alert kind="success">Se houver uma conta, enviamos um link para o e-mail. Ele vale por 30 minutos.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy} className="w-full">
            Enviar link
          </Button>
        </form>
      )}
      <Link href="/painel/entrar" className="mt-4 block text-center text-sm font-semibold text-brand-700">
        Voltar para o login
      </Link>
    </StaffCard>
  );
}
