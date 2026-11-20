import { renderBadge, renderIcon } from '@/lib/icon';

/** /icons/192, /icons/512 (?maskable=1) e /icons/badge (barra de status das notificações no Android). */
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const res = size === 'badge' ? renderBadge() : renderIcon(size === '512' ? 512 : 192, new URL(req.url).searchParams.has('maskable'));
  res.headers.set('Cache-Control', 'public, max-age=604800, immutable');
  return res;
}
