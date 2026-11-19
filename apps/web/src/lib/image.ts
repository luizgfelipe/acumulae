/**
 * Prepara o logo no navegador: centraliza a imagem num quadrado de até 256 px
 * (fundo transparente) e devolve um data URL PNG leve, pronto para enviar à API.
 */
export async function prepareLogo(file: File, size = 256, maxChars = 260_000): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Envie uma imagem PNG, JPG ou WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('A imagem original deve ter no máximo 10 MB.');

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      i.src = url;
    });
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const side = Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);

    let data = canvas.toDataURL('image/png');
    // Fotos grandes em PNG podem passar do limite: cai para JPEG com fundo branco.
    if (data.length > maxChars) {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, side, side);
      data = canvas.toDataURL('image/jpeg', 0.85);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
