import { HttpException } from '@nestjs/common';
import { MAX_LOGO_BYTES, logoDataUrlSchema, logoUrlOf, parseLogo } from './branding';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)]);
const dataUrl = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString('base64')}`;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return ((e as HttpException).getResponse() as { code: string }).code;
  }
  return undefined;
}

/** RN-101: logo PNG/JPG/WebP até 200 KB, conferido pela assinatura do arquivo; SVG recusado. */
describe('parseLogo (RN-101)', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPG],
    ['image/webp', WEBP],
  ])('aceita %s pela assinatura do arquivo', (mime, buf) => {
    const r = parseLogo(dataUrl(mime, buf));
    expect(r.mime).toBe(mime);
    expect(Buffer.from(r.data).equals(buf)).toBe(true);
  });

  it('usa a assinatura real, não o tipo declarado', () => {
    expect(parseLogo(dataUrl('image/png', JPG)).mime).toBe('image/jpeg');
  });

  it('recusa conteúdo que não é imagem', () => {
    expect(codeOf(() => parseLogo(dataUrl('image/png', Buffer.from('<svg onload=alert(1)>'))))).toBe('INVALID_IMAGE');
  });

  it('recusa imagem vazia', () => {
    expect(codeOf(() => parseLogo('data:image/png;base64,'))).toBe('INVALID_IMAGE');
  });

  it('recusa imagem acima de 200 KB', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES)]);
    expect(codeOf(() => parseLogo(dataUrl('image/png', big)))).toBe('IMAGE_TOO_LARGE');
  });
});

describe('logoDataUrlSchema', () => {
  it('aceita data URL PNG/JPG/WebP', () => {
    expect(logoDataUrlSchema.safeParse(dataUrl('image/png', PNG)).success).toBe(true);
    expect(logoDataUrlSchema.safeParse(dataUrl('image/webp', WEBP)).success).toBe(true);
  });

  it.each([
    'https://exemplo.com/logo.png',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/gif;base64,R0lGODlh',
    'data:image/png;base64,não é base64!',
  ])('recusa "%s"', (value) => {
    expect(logoDataUrlSchema.safeParse(value).success).toBe(false);
  });
});

describe('logoUrlOf', () => {
  it('versiona a URL para cache longo (RN-108)', () => {
    expect(logoUrlOf('sushi-x', { logoMime: 'image/png', version: 3 })).toBe('/api/public/tenants/sushi-x/logo?v=3');
  });

  it('sem logo devolve null', () => {
    expect(logoUrlOf('sushi-x', { logoMime: null, version: 3 })).toBeNull();
    expect(logoUrlOf('sushi-x', null)).toBeNull();
  });
});
