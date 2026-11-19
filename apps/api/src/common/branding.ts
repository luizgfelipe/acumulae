import { CardStyle } from '@prisma/client';
import { z } from 'zod';
import { badRequest } from './errors';

/** Campos da identidade visual carregados nas listagens (sem os bytes do logo). */
export const BRANDING_SELECT = { primaryColor: true, secondaryColor: true, cardStyle: true, logoMime: true, version: true } as const;

export const DEFAULT_PRIMARY_COLOR = '#E85D04';

export const cardStyleSchema = z.nativeEnum(CardStyle);

/** Cores e modelo do cartão, com os padrões. `secondaryColor` null = a principal faz os dois papéis. */
export function brandColors(b: { primaryColor: string; secondaryColor: string | null; cardStyle: CardStyle } | null | undefined) {
  return {
    primaryColor: b?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
    secondaryColor: b?.secondaryColor ?? null,
    cardStyle: b?.cardStyle ?? CardStyle.CLASSICO,
  };
}

/** Tamanho máximo do logo já decodificado. O navegador reduz para 256 px antes de enviar. */
export const MAX_LOGO_BYTES = 200 * 1024;

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'] as const;
type LogoMime = (typeof ALLOWED)[number];

/** URL pública (relativa ao app) do logo, versionada para cache longo. */
export function logoUrlOf(slug: string, b: { logoMime: string | null; version: number } | null | undefined): string | null {
  return b?.logoMime ? `/api/public/tenants/${slug}/logo?v=${b.version}` : null;
}

export const logoDataUrlSchema = z
  .string()
  .max(Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 100, 'imagem grande demais')
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, 'envie uma imagem PNG, JPG ou WebP');

function sniff(buf: Buffer): LogoMime | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Decodifica um data URL de imagem e confere o conteúdo real (assinatura do arquivo).
 * SVG não é aceito (poderia carregar script servido do mesmo domínio).
 */
export function parseLogo(dataUrl: string): { data: Uint8Array<ArrayBuffer>; mime: LogoMime } {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const data = Buffer.from(base64, 'base64');
  if (!data.length) throw badRequest('INVALID_IMAGE', 'Imagem inválida.');
  if (data.length > MAX_LOGO_BYTES) throw badRequest('IMAGE_TOO_LARGE', 'A imagem deve ter no máximo 200 KB.');
  const mime = sniff(data);
  if (!mime) throw badRequest('INVALID_IMAGE', 'Envie uma imagem PNG, JPG ou WebP.');
  return { data: new Uint8Array(data), mime };
}
