import { renderIcon } from '@/lib/icon';

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const n = size === '512' ? 512 : 192;
  const maskable = new URL(req.url).searchParams.has('maskable');
  const res = renderIcon(n, maskable);
  res.headers.set('Cache-Control', 'public, max-age=604800, immutable');
  return res;
}
