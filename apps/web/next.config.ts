import type { NextConfig } from 'next';

/**
 * O navegador fala só com este app; o Next.js repassa /api/* para a API interna.
 * Assim tudo fica num domínio só (sem CORS) e os cookies httpOnly são do mesmo site.
 * API_INTERNAL_URL é resolvida no build (padrão: serviço "api" do docker compose).
 */
const apiUrl = (process.env.API_INTERNAL_URL ?? 'http://api:3001').replace(/\/+$/, '');
const isDev = process.env.NODE_ENV === 'development';

/**
 * CSP das páginas. 'unsafe-inline' em scripts é exigido pelo App Router sem nonce (o nonce obrigaria
 * renderização dinâmica em todas as páginas); o ganho principal aqui é bloquear scripts, frames e
 * conexões de outros domínios. O 'unsafe-eval' só entra no `next dev`.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async redirects() {
    // Endereços antigos dos ícones (antes da logo), ainda gravados em PWAs instaladas.
    return [
      { source: '/icons/192', destination: '/icons/icon-192.png', permanent: true },
      { source: '/icons/512', destination: '/icons/icon-512.png', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Tudo menos /api/* (a API manda os próprios cabeçalhos via helmet).
        source: '/((?!api/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
