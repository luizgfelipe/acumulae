import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from '@/components/service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Acumulae — seu cartão fidelidade', template: '%s · Acumulae' },
  description: 'Acumule e acompanhe seus cartões fidelidade de restaurantes num só lugar, sem papel.',
  applicationName: 'Acumulae',
  appleWebApp: { capable: true, title: 'Acumulae', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#E85D04',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
