'use client';

import { useEffect } from 'react';
import { captureInstallPrompt } from '@/lib/install';

/** Registra o service worker da PWA (só em produção, onde há HTTPS) e captura o convite de instalação do navegador. */
export function ServiceWorker() {
  useEffect(() => {
    captureInstallPrompt();
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
