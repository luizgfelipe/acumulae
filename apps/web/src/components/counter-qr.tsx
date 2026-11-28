'use client';

import { LOCALE, tr } from '@/lib/region';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useId, useRef, useState } from 'react';
import { Button, TenantAvatar } from './ui';

interface Props {
  tenantName: string;
  /** Unidade do cartaz (quando há mais de uma). */
  storeName?: string | null;
  url: string;
  logoUrl: string | null;
  color: string;
  /** Nome do arquivo da imagem baixada (sem extensão). */
  fileName: string;
}

const LEAD = tr('Junte selos e ganhe recompensas', 'Junte carimbos e ganhe recompensas');
const SUB = tr('Participe do nosso programa de fidelidade', 'Participe no nosso programa de fidelização');
const STEPS = tr('Aponte a câmera do celular, crie sua conta e pronto.', 'Aponte a câmara do telemóvel, crie a sua conta e está feito.');
const BRAND = tr('Acumulaê · cartão fidelidade', 'Acumulaê · cartão de fidelização');

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Cartaz do balcão: o cliente aponta a câmera, cria a conta e entra no programa. Imprimir, baixar ou copiar o link. */
export function CounterQr({ tenantName, storeName, url, logoUrl, color, fileName }: Props) {
  const svgId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  function print() {
    const svg = document.getElementById(svgId)?.outerHTML;
    const w = window.open('', '_blank', 'width=700,height=900');
    if (!svg || !w) return;
    const logo = logoUrl ? `<img src="${escape(new URL(logoUrl, window.location.origin).href)}" alt="" class="logo">` : '';
    w.document.write(`<!doctype html><html lang="${LOCALE}"><head><meta charset="utf-8"><title>QR do balcão · ${escape(tenantName)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; display: flex; justify-content: center; color: #1c1917; }
  .poster { width: 150mm; border: 3px solid ${color}; border-radius: 24px; overflow: hidden; text-align: center; }
  .top { background: ${color}; color: #fff; padding: 28px 24px 22px; }
  .logo { width: 72px; height: 72px; border-radius: 16px; object-fit: cover; background: #fff; margin-bottom: 10px; }
  h1 { margin: 0; font-size: 30px; }
  .store { margin: 4px 0 0; opacity: .9; font-size: 16px; }
  .body { padding: 28px 24px 32px; }
  .lead { font-size: 22px; font-weight: 700; margin: 0 0 6px; }
  .sub { margin: 0; color: #57534e; font-size: 16px; }
  svg { width: 240px; height: 240px; margin: 26px auto; display: block; }
  .steps { font-size: 15px; color: #44403c; margin: 0; }
  .brand { margin-top: 18px; font-size: 12px; color: #a8a29e; }
</style></head><body>
<div class="poster">
  <div class="top">${logo}<h1>${escape(tenantName)}</h1>${storeName ? `<p class="store">${escape(storeName)}</p>` : ''}</div>
  <div class="body">
    <p class="lead">${LEAD}</p>
    <p class="sub">${SUB}</p>
    ${svg}
    <p class="steps">${STEPS}</p>
    <p class="brand">${BRAND}</p>
  </div>
</div>
<script>window.onload = () => { window.print(); };</script>
</body></html>`);
    w.document.close();
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${fileName}.png`;
    a.click();
  }

  function copy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-sm overflow-hidden rounded-3xl border-2 bg-white text-center shadow-sm" style={{ borderColor: color }}>
        <div className="flex flex-col items-center gap-2 px-5 pt-5 pb-4 text-white" style={{ background: color }}>
          <TenantAvatar name={tenantName} logoUrl={logoUrl} color="rgba(255,255,255,0.25)" size={56} />
          <div>
            <p className="text-xl font-bold">{tenantName}</p>
            {storeName && <p className="text-sm opacity-90">{storeName}</p>}
          </div>
        </div>
        <div className="px-5 pt-4 pb-5">
          <p className="font-semibold">{LEAD}</p>
          <p className="text-sm text-stone-600">{SUB}</p>
          <div className="mx-auto my-4 w-fit">
            <QRCodeSVG id={svgId} value={url} size={200} level="M" marginSize={0} />
          </div>
          <p className="text-sm text-stone-700">{STEPS}</p>
        </div>
      </div>
      {/* Versão grande, com margem, só para a imagem baixada. */}
      <QRCodeCanvas ref={canvasRef} value={url} size={1024} level="M" marginSize={4} className="hidden" aria-hidden />

      <div className="mx-auto grid max-w-sm grid-cols-3 gap-2">
        <Button onClick={print} className="px-2">
          Imprimir
        </Button>
        <Button variant="secondary" onClick={download} className="px-2">
          {tr('Baixar', 'Descarregar')}
        </Button>
        <Button variant="secondary" onClick={copy} className="whitespace-nowrap px-2">
          {copied ? 'Copiado!' : 'Copiar link'}
        </Button>
      </div>
      <p className="mx-auto max-w-sm break-all text-center text-xs text-stone-500">{url}</p>
    </div>
  );
}
