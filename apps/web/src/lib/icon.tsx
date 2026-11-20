import { ImageResponse } from 'next/og';

/** Ícone do app desenhado em código (sem arquivos binários no repositório). */
export function renderIcon(size: number, maskable = false) {
  const pad = maskable ? size * 0.2 : size * 0.1;
  const inner = size - pad * 2;
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: maskable ? '#E85D04' : 'transparent',
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: maskable ? 0 : inner * 0.24,
            background: '#E85D04',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width={inner * 0.62} height={inner * 0.62} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="m8.3 12.2 2.6 2.6 4.8-5.3" />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}

/** Ícone pequeno da barra de status do Android (só o contorno branco conta; o fundo é transparente). */
export function renderBadge(size = 96) {
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
        <svg width={size * 0.9} height={size * 0.9} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.3 12.2 2.6 2.6 4.8-5.3" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
