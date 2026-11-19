'use client';

import { useEffect, useState } from 'react';

/**
 * Instalação da PWA.
 * - Android/Chrome: o navegador dispara `beforeinstallprompt`; guardamos o evento e o botão "Instalar" abre o diálogo nativo.
 * - iPhone: a Apple não deixa o site abrir a instalação; mostramos o passo a passo (Compartilhar → Tela de Início).
 * O convite só aparece no celular e nunca quando o app já está aberto instalado.
 */

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const KEYS = {
  installed: 'acu_installed',
  pending: 'acu_install_pending',
  bannerDismissedAt: 'acu_install_banner_dismissed_at',
};

/** De quanto em quanto tempo a faixa da tela de cartões volta depois de fechada. */
export const BANNER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* navegação privada ou armazenamento bloqueado: o convite só volta a aparecer */
  }
}

/** Chamado uma vez no layout raiz, o mais cedo possível (o evento pode chegar logo no carregamento). */
export function captureInstallPrompt() {
  const w = window as Window & { __acuInstall?: boolean };
  if (w.__acuInstall) return;
  w.__acuInstall = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // esconde a mini-barra do Chrome; quem convida é o app
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set(KEYS.installed, '1');
    emit();
  });
}

export type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export interface InstallState {
  /** false até montar no navegador (evita piscar na renderização do servidor). */
  ready: boolean;
  platform: Platform;
  /** Já está instalado (aberto como app, ou instalado a partir deste navegador). */
  installed: boolean;
  /** O navegador oferece o diálogo nativo de instalação. */
  canPrompt: boolean;
  /** Vale convidar: celular e ainda não instalado. */
  shouldInvite: boolean;
  prompt: () => Promise<boolean>;
}

export function useInstall(): InstallState {
  const [, force] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    setReady(true);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (!ready) return { ready, platform: 'other', installed: false, canPrompt: false, shouldInvite: false, prompt: async () => false };
  const platform = detectPlatform();
  const installed = isStandalone() || get(KEYS.installed) === '1';
  return {
    ready,
    platform,
    installed,
    canPrompt: deferred !== null,
    shouldInvite: platform !== 'other' && !installed,
    prompt: async () => {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === 'accepted') set(KEYS.installed, '1');
      emit();
      return outcome === 'accepted';
    },
  };
}

/** Marca que o convite deve abrir na próxima tela logada (depois do cadastro). */
export function markInstallPending() {
  set(KEYS.pending, '1');
}
export function takeInstallPending(): boolean {
  const pending = get(KEYS.pending) === '1';
  if (pending) set(KEYS.pending, null);
  return pending;
}

export function bannerDue(now = Date.now()): boolean {
  const at = Number(get(KEYS.bannerDismissedAt) ?? 0);
  return !at || now - at >= BANNER_INTERVAL_MS;
}
export function dismissBanner(now = Date.now()) {
  set(KEYS.bannerDismissedAt, String(now));
}
