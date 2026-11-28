import { CardStyle } from '@prisma/client';
import { z } from 'zod';
import { badRequest } from './errors';
import { tr } from './region';
import { DEFAULT_STAMP_ICON, MAX_STAMP_IMAGE_BYTES } from './stamps';
import type { VisualAllowance } from '../plans/plans';

/** Campos da identidade visual carregados nas listagens (sem os bytes do logo). */
export const BRANDING_SELECT = {
  primaryColor: true,
  secondaryColor: true,
  cardStyle: true,
  stampIcon: true,
  stampImageMime: true,
  logoMime: true,
  version: true,
} as const;

export const DEFAULT_PRIMARY_COLOR = '#F26419';

export const cardStyleSchema = z.nativeEnum(CardStyle);

type BrandingRow = {
  primaryColor: string;
  secondaryColor: string | null;
  cardStyle: CardStyle;
  stampIcon: string;
  stampImageMime: string | null;
  version: number;
};

/**
 * Cores, modelo do cartão e selo, com os padrões. `secondaryColor` null = a principal faz os dois papéis;
 * `stampImageUrl` presente = a imagem própria substitui o ícone.
 * Com `allow` (o que o plano vigente libera), o que não é liberado deixa de aparecer — cai para a principal,
 * o Clássico e o ✓ — mas continua guardado e volta num upgrade. Sem `allow`, devolve o que está salvo.
 */
export function brandStyle(slug: string, b: BrandingRow | null | undefined, allow?: VisualAllowance) {
  const custom = !allow || allow.cardCustomization;
  const icon = b?.stampIcon ?? DEFAULT_STAMP_ICON;
  return {
    primaryColor: b?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
    secondaryColor: custom ? (b?.secondaryColor ?? null) : null,
    cardStyle: custom ? (b?.cardStyle ?? CardStyle.CLASSICO) : CardStyle.CLASSICO,
    stampIcon: !allow || allow.allowedStampIcons.includes(icon) ? icon : DEFAULT_STAMP_ICON,
    stampImageUrl:
      b?.stampImageMime && (!allow || allow.customStampImage) ? `/api/public/tenants/${slug}/stamp?v=${b.version}` : null,
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

const imageDataUrlSchema = (maxBytes: number) =>
  z
    .string()
    .max(Math.ceil((maxBytes * 4) / 3) + 100, tr('imagem grande demais', 'imagem demasiado grande'))
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, 'envie uma imagem PNG, JPG ou WebP');

export const logoDataUrlSchema = imageDataUrlSchema(MAX_LOGO_BYTES);
export const stampImageDataUrlSchema = imageDataUrlSchema(MAX_STAMP_IMAGE_BYTES);

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
export function parseLogo(dataUrl: string, maxBytes = MAX_LOGO_BYTES): { data: Uint8Array<ArrayBuffer>; mime: LogoMime } {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const data = Buffer.from(base64, 'base64');
  if (!data.length) throw badRequest('INVALID_IMAGE', 'Imagem inválida.');
  if (data.length > maxBytes) throw badRequest('IMAGE_TOO_LARGE', `A imagem deve ter no máximo ${Math.round(maxBytes / 1024)} KB.`);
  const mime = sniff(data);
  if (!mime) throw badRequest('INVALID_IMAGE', 'Envie uma imagem PNG, JPG ou WebP.');
  return { data: new Uint8Array(data), mime };
}
