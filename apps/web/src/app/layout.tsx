import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from '@/components/service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Acumulaê — seu cartão fidelidade', template: '%s · Acumulaê' },
  description: 'Acumule e acompanhe seus cartões fidelidade de restaurantes num só lugar, sem papel.',
  applicationName: 'Acumulaê',
  appleWebApp: { capable: true, title: 'Acumulaê', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#FC3B7F',
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
