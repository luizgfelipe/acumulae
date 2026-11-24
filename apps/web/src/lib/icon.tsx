import { ImageResponse } from 'next/og';

/**
 * Ícone pequeno da barra de status do Android (só o contorno branco conta; o fundo é transparente).
 * Os ícones coloridos do app são arquivos gerados a partir da logo (public/icons, docs/marca).
 */
export function renderBadge(size = 96) {
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
        <svg width={size * 0.9} height={size * 0.9} viewBox="0 0 24 24" fill="white">
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
