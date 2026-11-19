import { NextRequest, NextResponse } from 'next/server';

/**
 * www.acumulae.com.br → acumulae.com.br (308 mantém o método e o corpo).
 * O Dokploy precisa ter o domínio www cadastrado com certificado, senão o aviso de "site não seguro"
 * aparece antes de o redirecionamento acontecer.
 */
export function middleware(req: NextRequest) {
  // Só o Host (não o X-Forwarded-Host, que o cliente pode forjar e viraria um redirecionamento aberto).
  const host = (req.headers.get('host') ?? '').trim().toLowerCase();
  if (!host.startsWith('www.')) return NextResponse.next();
  const url = `https://${host.slice(4)}${req.nextUrl.pathname}${req.nextUrl.search}`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Ignora os arquivos estáticos do build; o resto (páginas e /api) passa pelo redirecionamento.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
