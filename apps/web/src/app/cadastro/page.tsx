'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { PublicShell } from '@/components/customer-shell';
import { SocialButtons } from '@/components/social-buttons';
import { Alert, Button, Field, Input, Modal } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { safeNext } from '@/lib/customer';
import { maskPhoneInput } from '@/lib/format';

export default function Page() {
  return (
    <Suspense>
      <SignupPage />
    </Suspense>
  );
}

function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', birthDate: '' });
  const [terms, setTerms] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'phone' ? maskPhoneInput(e.target.value) : e.target.value }));

  function review(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.phone.replace(/\D/g, '').length < 10) return setError('Informe o telefone com DDD.');
    if (form.password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    if (!terms) return setError('Para continuar, aceite os Termos de Uso e a Política de Privacidade.');
    // RN-05: confirmação de telefone e e-mail antes de salvar.
    setConfirming(true);
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setExists(false);
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: { ...form, email: form.email.trim(), birthDate: form.birthDate || null, acceptTerms: true },
      });
      router.replace(next);
    } catch (err) {
      setConfirming(false);
      setLoading(false);
      if (err instanceof ApiError && err.code === 'ACCOUNT_EXISTS') setExists(true);
      setError(errorMessage(err));
    }
  }

  return (
    <PublicShell>
      <h1 className="mb-1 text-2xl font-bold">Criar conta</h1>
      <p className="mb-6 text-stone-600">Uma conta só, válida em todos os estabelecimentos participantes.</p>

      <SocialButtons next={next} />

      <form onSubmit={review} className="space-y-4">
        <Field label="Nome">
          <Input value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} />
        </Field>
        <Field label="Telefone (WhatsApp)" hint="É por ele que o atendente encontra você no caixa.">
          <Input value={form.phone} onChange={set('phone')} autoComplete="tel-national" inputMode="tel" placeholder="(47) 9 9999-9999" required />
        </Field>
        <Field label="E-mail" hint="Usado para entrar e para recuperar a senha.">
          <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </Field>
        <Field label="Senha" hint="Mínimo de 6 caracteres. Evite sequências e sua data de nascimento.">
          <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={6} />
        </Field>
        <Field label="Data de nascimento (opcional)" hint="🎁 Informe e ganhe um presente no seu aniversário.">
          <Input type="date" value={form.birthDate} onChange={set('birthDate')} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <label className="flex items-start gap-3 text-sm text-stone-700">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-600" />
          <span>
            Li e aceito os{' '}
            <Link href="/termos" target="_blank" className="font-medium text-brand-700 underline">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" target="_blank" className="font-medium text-brand-700 underline">
              Política de Privacidade
            </Link>
            . Cada estabelecimento onde eu consumir verá meu nome e meu histórico de consumo nele.
          </span>
        </label>
        {error && (
          <Alert>
            {error}
            {exists && (
              <span className="mt-2 flex gap-4 font-semibold">
                <Link href={`/entrar?next=${encodeURIComponent(next)}`} className="underline">
                  Entrar
                </Link>
                <Link href="/esqueci-senha" className="underline">
                  Esqueci minha senha
                </Link>
              </span>
            )}
          </Alert>
        )}
        <Button type="submit" className="w-full" size="lg">
          Continuar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600">
        Já tem conta?{' '}
        <Link href={`/entrar?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700">
          Entrar
        </Link>
      </p>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Confira seus dados">
        <p className="text-stone-700">
          Seu WhatsApp é <strong className="whitespace-nowrap">{form.phone}</strong> e seu e-mail é <strong className="break-all">{form.email}</strong>?
        </p>
        <p className="mt-2 text-sm text-stone-500">Um erro de digitação impede a recuperação da conta.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Corrigir
          </Button>
          <Button onClick={submit} loading={loading}>
            Sim, criar conta
          </Button>
        </div>
      </Modal>
    </PublicShell>
  );
}
