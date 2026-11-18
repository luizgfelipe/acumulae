'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Alert, Button, Field, Input, Logo } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { StaffArea, StaffMe } from '@/lib/staff';

/** Login de atendentes e gestores (compartilhado por /caixa/entrar e /painel/entrar). */
export function StaffLogin({ area }: { area: StaffArea }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next')?.startsWith(`/${area}`) ? params.get('next')! : `/${area}`;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const me = await staffApi<StaffMe>('/api/staff/auth/login', { method: 'POST', body: { email, password } });
      if (!me.workplaces.length) {
        setError('Seu acesso não está ativo em nenhum estabelecimento.');
        setLoading(false);
        return;
      }
      const needsChoice = !me.context || (area === 'caixa' && !me.context.storeId);
      router.replace(needsChoice ? `/caixa/unidade?next=${encodeURIComponent(next)}` : next);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-100 px-5">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-xl font-bold">{area === 'caixa' ? 'Caixa' : 'Painel do estabelecimento'}</h1>
        <p className="mb-6 text-sm text-stone-600">Entre com o e-mail e a senha do seu convite.</p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Senha">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} size="lg" className="w-full">
            Entrar
          </Button>
        </form>
        <div className="mt-5 flex justify-between text-sm">
          <Link href="/painel/esqueci-senha" className="font-medium text-brand-700">
            Esqueci a senha
          </Link>
          <Link href={area === 'caixa' ? '/painel/entrar' : '/caixa/entrar'} className="text-stone-500">
            {area === 'caixa' ? 'Ir para o painel' : 'Ir para o caixa'}
          </Link>
        </div>
      </div>
    </div>
  );
}
