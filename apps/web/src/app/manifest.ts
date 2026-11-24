import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Acumulaê — cartão fidelidade',
    short_name: 'Acumulaê',
    description: 'Seus cartões fidelidade num só lugar.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fffbf1',
    theme_color: '#FC3B7F',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [{ name: 'Meu QR', url: '/qr', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] }],
  };
}
