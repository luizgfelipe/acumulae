import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Acumulae — cartão fidelidade',
    short_name: 'Acumulae',
    description: 'Seus cartões fidelidade num só lugar.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fafaf9',
    theme_color: '#E85D04',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [{ name: 'Meu QR', url: '/qr', icons: [{ src: '/icons/192', sizes: '192x192' }] }],
  };
}
