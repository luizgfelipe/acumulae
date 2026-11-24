'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { logout } from '@/lib/customer';
import { Alert, Button, Modal } from './ui';

/** Quem aceitou uma versão antiga dos Termos de Uso precisa aceitar a atual para continuar usando o app. */
export function TermsUpdate({ onAccepted }: { onAccepted: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/me/terms', { method: 'POST', body: { acceptTerms: true } });
      await onAccepted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function leave() {
    await logout();
    window.location.replace('/');
  }

  return (
    <Modal open onClose={() => undefined} title="Atualizamos os Termos de Uso">
      <div className="space-y-4 text-stone-700">
        <p>
          Agora os termos deixam claro que, ao participar do programa de um estabelecimento, ele recebe seu nome, telefone, e-mail e data de
          nascimento, além do seu histórico <strong>naquele</strong> estabelecimento. Ofertas e notificações de promoção continuam só para quem
          você autorizar.
        </p>
        <p className="text-sm">
          Leia os{' '}
          <Link href="/termos" target="_blank" className="font-medium text-accent-600 underline">
            Termos de Uso
          </Link>{' '}
          e a{' '}
          <Link href="/privacidade" target="_blank" className="font-medium text-accent-600 underline">
            Política de Privacidade
          </Link>
          .
        </p>
        {error && <Alert>{error}</Alert>}
        <Button className="w-full" loading={busy} onClick={accept}>
          Li e aceito
        </Button>
        <button onClick={leave} disabled={busy} className="w-full text-center text-sm text-stone-500 hover:text-stone-800 hover:underline">
          Não aceito, sair da conta
        </button>
      </div>
    </Modal>
  );
}
