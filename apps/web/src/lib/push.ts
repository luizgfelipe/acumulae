'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { detectPlatform, isStandalone } from './install';
import { tr } from './region';

/**
 * Notificações no celular (Web Push). Quem ativa recebe cada notificação do sino também no aparelho;
 * quem não ativa continua vendo tudo dentro do app.
 * - Android/computador: funciona no navegador ou no app instalado.
 * - iPhone (iOS 16.4+): só com o Acumulaê adicionado à Tela de Início, aberto por lá.
 */
export type PushState =
  | 'loading'
  /** Servidor sem chaves VAPID: o recurso fica escondido. */
  | 'unavailable'
  /** Navegador sem suporte a push. */
  | 'unsupported'
  /** iPhone fora do app instalado. */
  | 'needs-install'
  /** O cliente bloqueou as notificações do site. */
  | 'denied'
  | 'off'
  | 'on';

let keyPromise: Promise<string | null> | null = null;
function publicKey() {
  keyPromise ??= api<{ publicKey: string | null }>('/api/me/push/config')
    .then((r) => r.publicKey)
    .catch(() => {
      keyPromise = null;
      return null;
    });
  return keyPromise;
}

function supported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration() {
  // Em produção o SW já é registrado no carregamento; no `next dev` ele só existe para o push.
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

async function currentSubscription() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function toUint8(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function readState(): Promise<PushState> {
  const key = await publicKey();
  if (!key) return 'unavailable';
  if (!supported()) return detectPlatform() === 'ios' && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Pede a permissão (precisa vir de um toque do cliente) e cadastra este aparelho. */
export async function enablePush(): Promise<PushState> {
  const key = await publicKey();
  if (!key) return 'unavailable';
  if (!supported()) return readState();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // Inscrição feita com outra chave (servidor trocou o VAPID): refaz.
  if (sub && sub.options.applicationServerKey) {
    const current = new Uint8Array(sub.options.applicationServerKey);
    const wanted = toUint8(key);
    if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(key) });
  await api('/api/me/push/subscriptions', { method: 'POST', body: sub.toJSON() });
  return 'on';
}

/** Desliga neste aparelho (as notificações continuam no sino). */
export async function disablePush(): Promise<PushState> {
  const sub = await currentSubscription();
  if (sub) {
    await api('/api/me/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return readState();
}

/**
 * Ao abrir o app: se este aparelho já está inscrito, reenvia a inscrição para a API (mantém o vínculo
 * com quem está logado e o "visto por último" em dia).
 */
export async function syncPush() {
  if (!supported() || Notification.permission !== 'granted' || !(await publicKey())) return;
  const sub = await currentSubscription();
  if (sub) await api('/api/me/push/subscriptions', { method: 'POST', body: sub.toJSON() }).catch(() => undefined);
}

/** Antes de sair da conta: o próximo a logar neste aparelho não recebe as notificações de quem saiu. */
export async function forgetPushDevice() {
  await disablePush().catch(() => undefined);
}

export function usePush() {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    readState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  const run = useCallback(async (fn: () => Promise<PushState>) => {
    setBusy(true);
    try {
      setState(await fn());
    } catch {
      setState(await readState());
      throw new Error(
        tr('Não foi possível ativar as notificações neste aparelho. Tente de novo.', 'Não foi possível ativar as notificações neste dispositivo. Tente novamente.'),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    state,
    busy,
    enable: () => run(enablePush),
    disable: () => run(disablePush),
  };
}
