'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { tr } from '@/lib/region';
import { Alert } from './ui';

/**
 * Leitor de QR pela câmera do aparelho do caixa (html5-qrcode, usa o BarcodeDetector nativo quando há).
 * Câmera exige HTTPS (ou localhost).
 */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const id = useId().replace(/:/g, '');
  const elementId = `qr-reader-${id}`;
  const done = useRef(false);
  const cb = useRef(onResult);
  cb.current = onResult;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let scanner: { stop: () => Promise<void>; clear: () => void; isScanning?: boolean } | null = null;
    let cancelled = false;
    done.current = false;

    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) return;
        const s = new Html5Qrcode(elementId, {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scanner = s;
        await s.start(
          { facingMode: 'environment' },
          { fps: 12, qrbox: (w: number, h: number) => ({ width: Math.min(w, h) * 0.75, height: Math.min(w, h) * 0.75 }) },
          (text: string) => {
            if (done.current) return;
            done.current = true;
            if (navigator.vibrate) navigator.vibrate(60);
            cb.current(text);
          },
          () => undefined,
        );
      } catch (e) {
        if (!cancelled) {
          const msg = String((e as Error)?.message ?? e);
          setError(
            /permission|NotAllowed/i.test(msg)
              ? tr('Permita o acesso à câmera no navegador para ler o QR.', 'Permita o acesso à câmara no navegador para ler o QR.')
              : window.isSecureContext
                ? tr('Não foi possível abrir a câmera deste aparelho.', 'Não foi possível abrir a câmara deste dispositivo.')
                : tr('A câmera só funciona com HTTPS.', 'A câmara só funciona com HTTPS.'),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (scanner?.isScanning) {
        scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => undefined);
      }
    };
  }, [elementId]);

  return (
    <div className="space-y-3">
      <div id={elementId} className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-stone-900" />
      {error && <Alert kind="warning">{error}</Alert>}
    </div>
  );
}
