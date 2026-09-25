const W = 1200;
const H = 630;

/** What one branded share card needs: the object's coin facts. Never includes capture photos. */
export interface ShareCardInput {
  name: string;
  symbol: string;
  ca?: string | null;
  imageUrl?: string | null;
  creator?: string | null;
  category?: string | null;
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  try {
    const img = new Image(); img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('image')); img.src = url; });
    return img;
  } catch { return null; }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): void {
  const words = text.split(' '); let line = ''; const lines: string[] = [];
  for (const word of words) { const test = line ? `${line} ${word}` : word; if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

/**
 * Draws the branded "REAL OBJECT → 3D SCAN → $COIN" launch card: the object, its ticker, a shortened
 * contract address, the creator and the objectpad.fun mark. Fully client-side; no server round trip.
 */
export async function renderShareCard(input: ShareCardInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is not supported on this device.');
  try { await Promise.all(['800 60px Anybody', '800 30px Geist', '700 24px "Geist Mono"'].map(f => document.fonts.load(f))); } catch { /* system fallback */ }

  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#181B21'); bg.addColorStop(1, '#0C0D10');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let gx = 30; gx < W; gx += 34) for (let gy = 30; gy < H - 92; gy += 34) { ctx.beginPath(); ctx.arc(gx, gy, 1.1, 0, Math.PI * 2); ctx.fill(); }

  // object portrait
  const cx = 250; const cy = 300; const r = 168;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 26; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#1B1D22'; ctx.fill(); ctx.restore();
  const img = input.imageUrl ? await loadImage(input.imageUrl) : null;
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 7, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#EEF0F3'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (img) { const iw = img.naturalWidth || 1; const ih = img.naturalHeight || 1; const scale = Math.max((r * 2) / iw, (r * 2) / ih); const dw = iw * scale; const dh = ih * scale; ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = '#ECEEF1'; ctx.stroke();

  const left = 470;
  ctx.font = '700 23px "Geist Mono", monospace'; ctx.fillStyle = 'rgba(236,238,241,0.55)';
  ctx.fillText('REAL OBJECT  →  3D SCAN  →  $COIN', left, 168);

  ctx.font = '800 58px Anybody, sans-serif'; ctx.fillStyle = '#ECEEF1';
  wrapText(ctx, input.name, left, 246, 660, 64, 2);

  const ticker = `$${input.symbol}`;
  ctx.font = '800 29px Geist, sans-serif'; const tw = ctx.measureText(ticker).width + 46;
  roundRect(ctx, left, 388, tw, 54, 27); ctx.fillStyle = '#ECEEF1'; ctx.fill();
  ctx.fillStyle = '#0C0D10'; ctx.fillText(ticker, left + 23, 424);

  ctx.font = '700 23px "Geist Mono", monospace'; ctx.fillStyle = 'rgba(236,238,241,0.6)';
  ctx.fillText(input.ca ? `CA ${input.ca.slice(0, 8)}…${input.ca.slice(-6)}` : 'launching on-chain', left + tw + 22, 423);

  ctx.font = '700 21px Geist, sans-serif'; ctx.fillStyle = 'rgba(236,238,241,0.62)';
  const meta = [input.creator ? `Launched by ${input.creator}` : null, input.category].filter(Boolean).join('  ·  ');
  if (meta) ctx.fillText(meta, left, 478);

  ctx.font = '800 25px Anybody, sans-serif'; ctx.fillStyle = '#ECEEF1'; ctx.fillText('objectpad.fun', 60, H - 44);
  ctx.font = '700 19px "Geist Mono", monospace'; ctx.fillStyle = 'rgba(236,238,241,0.5)';
  ctx.fillText('one real object · one coin · verified on-chain', 60, H - 19);

  return canvas;
}

export async function shareCardBlob(input: ShareCardInput): Promise<Blob> {
  const canvas = await renderShareCard(input);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'));
}
