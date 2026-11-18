import type { NextConfig } from 'next';

/**
 * O navegador fala só com este app; o Next.js repassa /api/* para a API interna.
 * Assim tudo fica num domínio só (sem CORS) e os cookies httpOnly são do mesmo site.
 * API_INTERNAL_URL é resolvida no build (padrão: serviço "api" do docker compose).
 */
const apiUrl = (process.env.API_INTERNAL_URL ?? 'http://api:3001').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
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
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
