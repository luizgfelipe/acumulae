'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { PublicShell } from '@/components/customer-shell';
import { Alert, Button, Field, FullPageSpinner, Input, Modal } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { safeNext, useMe } from '@/lib/customer';
import { maskPhoneInput } from '@/lib/format';

export default function Page() {
  return (
    <Suspense>
      <CompleteProfile />
    </Suspense>
  );
}

/** RN-07: após o login social, telefone (obrigatório) e nascimento (opcional), uma única vez. */
function CompleteProfile() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const { me, loading } = useMe({ required: true, allowIncomplete: true });
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [terms, setTerms] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me?.profileComplete) router.replace(next);
  }, [me, next, router]);

  if (loading || !me) return <FullPageSpinner />;

  function review(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (phone.replace(/\D/g, '').length < 10) return setError('Informe o telefone com DDD.');
    if (!terms) return setError('Para continuar, aceite os Termos de Uso e a Política de Privacidade.');
    setConfirming(true);
  }

  async function save() {
    setSaving(true);
    try {
      await api('/api/me/complete-profile', { method: 'POST', body: { phone, birthDate: birthDate || null, acceptTerms: true } });
      router.replace(next);
    } catch (err) {
      setConfirming(false);
      setSaving(false);
      setError(errorMessage(err));
    }
  }

  return (
    <PublicShell>
      <h1 className="mb-1 text-2xl font-bold">Falta pouco, {me.name.split(' ')[0]}!</h1>
      <p className="mb-6 text-stone-600">Precisamos do seu WhatsApp para o atendente encontrar você no caixa.</p>
      <form onSubmit={review} className="space-y-4">
        <Field label="Telefone (WhatsApp)">
          <Input value={phone} onChange={(e) => setPhone(maskPhoneInput(e.target.value))} inputMode="tel" placeholder="(47) 9 9999-9999" required />
        </Field>
        <Field label="Data de nascimento (opcional)" hint="Informe apenas se quiser receber promoções de aniversário.">
          <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <label className="flex items-start gap-3 text-sm text-stone-700">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-600" />
          <span>
            Li e aceito os <Link href="/termos" target="_blank" className="font-medium text-brand-700 underline">Termos de Uso</Link> e a{' '}
            <Link href="/privacidade" target="_blank" className="font-medium text-brand-700 underline">Política de Privacidade</Link>.
          </span>
        </label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" size="lg">
          Continuar
        </Button>
      </form>
      <Modal open={confirming} onClose={() => setConfirming(false)} title="Confira seus dados">
        <p className="text-stone-700">
          Seu WhatsApp é <strong>{phone}</strong> e seu e-mail é <strong className="break-all">{me.email ?? '—'}</strong>?
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Corrigir
          </Button>
          <Button onClick={save} loading={saving}>
            Confirmar
          </Button>
        </div>
      </Modal>
    </PublicShell>
  );
}
