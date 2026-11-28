'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { PublicShell } from '@/components/customer-shell';
import { markInstallPending } from '@/lib/install';
import { SocialButtons } from '@/components/social-buttons';
import { Alert, Button, Field, Input, Modal } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { safeNext } from '@/lib/customer';
import { maskPhoneInput } from '@/lib/format';
import { tr } from '@/lib/region';

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
    // PT: 9 dígitos (912 345 678); BR: DDD + número.
    if (form.phone.replace(/\D/g, '').length < tr(10, 9)) return setError(tr('Informe o telefone com DDD.', 'Indique o número de telemóvel completo.'));
    if (form.password.length < 6) return setError(tr('A senha precisa ter pelo menos 6 caracteres.', 'A palavra-passe tem de ter pelo menos 6 caracteres.'));
    if (!terms)
      return setError(
        tr(
          'Para continuar, aceite os Termos de Uso e a Política de Privacidade.',
          'Para continuar, aceite os Termos de Utilização e a Política de Privacidade.',
        ),
      );
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
      markInstallPending();
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
      <p className="mb-6 text-stone-600">
        {tr('Uma conta só, válida em todos os estabelecimentos participantes.', 'Uma só conta, válida em todos os estabelecimentos aderentes.')}
      </p>

      <SocialButtons next={next} />

      <form onSubmit={review} className="space-y-4">
        <Field label="Nome">
          <Input value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} />
        </Field>
        <Field
          label={tr('Telefone (WhatsApp)', 'Telemóvel')}
          hint={tr('É por ele que o atendente encontra você no caixa.', 'É por ele que o operador de caixa o encontra.')}
        >
          <Input
            value={form.phone}
            onChange={set('phone')}
            autoComplete="tel-national"
            inputMode="tel"
            placeholder={tr('(47) 9 9999-9999', '912 345 678')}
            required
          />
        </Field>
        <Field label="E-mail" hint={tr('Usado para entrar e para recuperar a senha.', 'Usado para entrar e para recuperar a palavra-passe.')}>
          <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </Field>
        <Field
          label={tr('Senha', 'Palavra-passe')}
          hint={tr('Mínimo de 6 caracteres. Evite sequências e sua data de nascimento.', 'Mínimo de 6 caracteres. Evite sequências e a sua data de nascimento.')}
        >
          <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={6} />
        </Field>
        <Field
          label="Data de nascimento (opcional)"
          hint={tr('Informe apenas se quiser receber promoções de aniversário.', 'Indique apenas se quiser receber promoções de aniversário.')}
        >
          <Input type="date" value={form.birthDate} onChange={set('birthDate')} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <label className="flex items-start gap-3 text-sm text-stone-700">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-600" />
          <span>
            Li e aceito os{' '}
            <Link href="/termos" target="_blank" className="font-medium text-accent-600 underline">
              {tr('Termos de Uso', 'Termos de Utilização')}
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" target="_blank" className="font-medium text-accent-600 underline">
              Política de Privacidade
            </Link>
            {tr(
              '. Cada estabelecimento onde eu consumir verá meu nome e meu histórico de consumo nele.',
              '. Cada estabelecimento onde eu consumir verá o meu nome e o meu histórico de consumo nele.',
            )}
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
                  {tr('Esqueci minha senha', 'Esqueci-me da palavra-passe')}
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
        <Link href={`/entrar?next=${encodeURIComponent(next)}`} className="font-semibold text-accent-600">
          Entrar
        </Link>
      </p>

      <Modal open={confirming} onClose={() => setConfirming(false)} title={tr('Confira seus dados', 'Verifique os seus dados')}>
        <p className="text-stone-700">
          {tr(
            <>
              Seu WhatsApp é <strong className="whitespace-nowrap">{form.phone}</strong> e seu e-mail é <strong className="break-all">{form.email}</strong>?
            </>,
            <>
              O seu telemóvel é o <strong className="whitespace-nowrap">{form.phone}</strong> e o seu e-mail é{' '}
              <strong className="break-all">{form.email}</strong>?
            </>,
          )}
        </p>
        <p className="mt-2 text-sm text-stone-500">
          {tr('Um erro de digitação impede a recuperação da conta.', 'Um erro de escrita impede a recuperação da conta.')}
        </p>
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
