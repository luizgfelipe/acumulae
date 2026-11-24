import { renderBadge } from '@/lib/icon';

/** /icons/badge: silhueta branca da barra de status das notificações no Android. */
export function GET() {
  const res = renderBadge();
  res.headers.set('Cache-Control', 'public, max-age=604800, immutable');
  return res;
}
