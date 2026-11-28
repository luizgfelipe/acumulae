import { LOCALE, tr } from '@/lib/region';
import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from '@/components/service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: { default: tr('Acumulaê — seu cartão fidelidade', 'Acumulaê — o seu cartão de fidelização'), template: '%s · Acumulaê' },
  description: tr(
    'Acumule e acompanhe seus cartões fidelidade de restaurantes num só lugar, sem papel.',
    'Acumule e acompanhe os seus cartões de fidelização de restaurantes num só lugar, sem papel.',
  ),
  applicationName: 'Acumulaê',
  appleWebApp: { capable: true, title: 'Acumulaê', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#F26419',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={LOCALE}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
