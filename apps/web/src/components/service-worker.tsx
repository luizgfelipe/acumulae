'use client';

import { useEffect } from 'react';

/** Registra o service worker da PWA (só em produção, onde há HTTPS). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
