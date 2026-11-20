'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { QrScanner } from '@/components/qr-scanner';
import { Alert, Spinner } from '@/components/ui';

/**
 * Converte o texto lido num caminho interno do app, se for um QR de estabelecimento:
 * `/e/{slug}` (QR do balcão, entra no programa) ou `/c/{token}` (QR temporário com selos).
 * Só o caminho é usado (nunca o domínio), então um QR de outro site não vira redirecionamento.
 */
function storeQrPath(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!/^\/(e|c)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}`;
}

/** Ler QR: o cliente aponta a câmera para o QR do balcão ou para o QR temporário do caixa. */
export default function ReadQrPage() {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [going, setGoing] = useState(false);

  function onResult(text: string) {
    const path = storeQrPath(text);
    if (path) {
      setGoing(true);
      router.push(path);
      return;
    }
    setError(
      text.trim().startsWith('AC1.')
        ? 'Esse é o QR pessoal de um cliente. Aponte para o QR do estabelecimento.'
        : 'Este QR não é de um estabelecimento do Acumulaê.',
    );
    setAttempt((a) => a + 1); // reinicia o leitor
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 pt-4">
      <div className="text-center">
        <p className="text-2xl font-bold">Ler QR Code</p>
        <p className="text-stone-500">Aponte para o QR do balcão ou o que o caixa mostrar na tela</p>
      </div>
      {going ? (
        <div className="grid aspect-square w-full place-items-center rounded-2xl bg-stone-200 text-brand-600">
          <Spinner className="h-10 w-10" />
        </div>
      ) : (
        <QrScanner key={attempt} onResult={onResult} />
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
