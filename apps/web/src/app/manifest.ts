import { LOCALE, tr } from '@/lib/region';
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: tr('Acumulaê — cartão fidelidade', 'Acumulaê — cartão de fidelização'),
    short_name: 'Acumulaê',
    description: tr('Seus cartões fidelidade num só lugar.', 'Os seus cartões de fidelização num só lugar.'),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fffbf1',
    theme_color: '#F26419',
    lang: LOCALE,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [{ name: tr('Meu QR', 'O meu QR'), url: '/qr', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] }],
  };
}
