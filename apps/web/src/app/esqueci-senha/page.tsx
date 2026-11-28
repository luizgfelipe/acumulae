'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { PublicShell } from '@/components/customer-shell';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { tr } from '@/lib/region';

export default function ForgotPage() {
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/password/forgot', { method: 'POST', body: { identifier } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicShell>
      <h1 className="mb-1 text-2xl font-bold">{tr('Esqueci minha senha', 'Esqueci-me da palavra-passe')}</h1>
      {sent ? (
        <div className="mt-4 space-y-4">
          <Alert kind="success">
            {tr(
              'Se houver uma conta, enviamos um link para o e-mail cadastrado. Ele vale por 30 minutos.',
              'Se existir uma conta, enviámos um link para o e-mail registado. É válido durante 30 minutos.',
            )}
          </Alert>
          <Link href="/entrar" className="block text-center font-semibold text-accent-600">
            {tr('Voltar para o login', 'Voltar ao início de sessão')}
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-6 text-stone-600">
            {tr(
              'Informe seu telefone ou e-mail. Enviaremos um link para o e-mail da sua conta.',
              'Indique o seu telemóvel ou e-mail. Enviaremos um link para o e-mail da sua conta.',
            )}
          </p>
          <form onSubmit={submit} className="space-y-4">
            <Field label={tr('Telefone ou e-mail', 'Telemóvel ou e-mail')}>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Enviar link
            </Button>
          </form>
        </>
      )}
    </PublicShell>
  );
}
