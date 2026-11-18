import { Request } from 'express';

export function clientIp(req: Request): string {
  return (req.ip ?? req.socket?.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
}

export function deviceLabel(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return ua ? String(ua).slice(0, 200) : null;
}
