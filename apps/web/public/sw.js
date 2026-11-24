/* Service worker do Acumulae.
 * - Arquivos estáticos do Next (/_next/static): cache-first (são versionados).
 * - Navegação: network-first, com página offline de reserva.
 * - /api: nunca passa pelo cache (saldo e QR precisam estar sempre atualizados).
 * - Push: mostra a notificação no celular e, ao tocar, abre a tela certa e marca como lida.
 * Em localhost (next dev) não há cache: o SW só existe ali para testar o push.
 */
const VERSION = 'acumulae-v3';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll([OFFLINE_URL])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (DEV || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Acumulaê';
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || '',
        icon: data.icon || '/icons/icon-192.png',
        badge: '/icons/badge',
        tag: data.id,
        lang: 'pt-BR',
        data: { id: data.id, url: data.url || '/notificacoes' },
      }),
      // Com o app aberto, o sino atualiza na hora.
      self.clients.matchAll({ type: 'window' }).then((list) => list.forEach((c) => c.postMessage({ type: 'push' }))),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { id, url = '/notificacoes' } = event.notification.data || {};
  event.waitUntil(
    (async () => {
      if (id) await fetch(`/api/me/notifications/${id}/read`, { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
      const target = new URL(url, self.location.origin).href;
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate ? open.navigate(target).catch(() => open.postMessage({ type: 'open', url })) : undefined;
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// O navegador trocou a inscrição (expirou ou renovou as chaves): manda a nova para a API.
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options) return;
  event.waitUntil(
    self.registration.pushManager.subscribe(options).then((sub) =>
      fetch('/api/me/push/subscriptions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      }),
    ),
  );
});
