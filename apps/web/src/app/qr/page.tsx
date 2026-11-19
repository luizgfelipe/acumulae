'use client';

import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FullPageSpinner, Logo, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/customer';

interface QrPayload {
  payload: string;
  expiresAt: string;
  periodSeconds: number;
  name: string;
}

/** Meu QR: QR pessoal dinâmico em tela cheia, renovado a cada 30 s (RN-51). */
export default function MyQrPage() {
  const { me } = useMe({ required: true });
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(30);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const q = await api<QrPayload>('/api/me/qr');
      setQr(q);
      setError(null);
      const ms = Math.max(1000, new Date(q.expiresAt).getTime() - Date.now() - 1000);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, ms);
    } catch (e) {
      setError(errorMessage(e));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 5000);
    }
  }, []);

  useEffect(() => {
    if (!me?.profileComplete) return;
    load();
    // Mantém a tela acesa enquanto o QR está aberto (quando o navegador suporta).
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [me, load]);

  useEffect(() => {
    const t = setInterval(() => {
      if (qr) setLeft(Math.max(0, Math.ceil((new Date(qr.expiresAt).getTime() - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(t);
  }, [qr]);

  if (!me) return <FullPageSpinner />;

  return (
    <div className="flex min-h-dvh flex-col items-center bg-white px-6 py-6">
      <div className="flex w-full max-w-sm items-center justify-between">
        <Logo />
        <Link href="/" className="rounded-xl px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 transition-colors">
          Fechar
        </Link>
      </div>
      <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold">{me.name}</p>
          <p className="text-stone-500">Mostre este código no caixa</p>
        </div>
        <div className="rounded-3xl border-4 border-stone-900 bg-white p-5">
          {qr ? (
            <QRCodeSVG value={qr.payload} size={260} level="M" marginSize={0} />
          ) : (
            <div className="grid h-[260px] w-[260px] place-items-center text-brand-600">
              <Spinner className="h-8 w-8" />
            </div>
          )}
        </div>
        {qr && (
          <div className="w-60">
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full bg-brand-600 transition-all duration-300" style={{ width: `${(left / qr.periodSeconds) * 100}%` }} />
            </div>
            <p className="mt-2 text-center text-xs text-stone-500">O código muda a cada {qr.periodSeconds} segundos, por segurança.</p>
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        <p className="text-center text-sm text-stone-500">Dica: aumente o brilho da tela para facilitar a leitura.</p>
      </div>
    </div>
  );
}
