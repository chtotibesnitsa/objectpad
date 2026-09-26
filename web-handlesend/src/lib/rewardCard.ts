import type { Reward, RewardProof } from '@/lib/rewards';

const W = 1200; const H = 675;
async function load(url: string): Promise<HTMLImageElement | null> {
  try { const img = new Image(); img.crossOrigin = 'anonymous'; await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('img')); img.src = url; }); return img; } catch { return null; }
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void { const s = Math.max(w / img.naturalWidth, h / img.naturalHeight); const dw = img.naturalWidth * s; const dh = img.naturalHeight * s; ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function lines(ctx: CanvasRenderingContext2D, text: string, max: number, limit: number): string[] { const out: string[] = []; let line = ''; for (const w of text.split(' ')) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out.slice(0, limit); }

function sky(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1F6FEB'); g.addColorStop(0.6, '#4A97FF'); g.addColorStop(1, '#A8D2FF'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, a] of [[120, 640, 260, 0.95], [520, 700, 300, 0.9], [980, 660, 280, 0.9], [1100, 120, 160, 0.6], [60, 60, 180, 0.7]] as const) { const c = ctx.createRadialGradient(x, y, 0, x, y, r); c.addColorStop(0, `rgba(255,255,255,${a})`); c.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); }
  let s = 11; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < 70; i++) { const x = 800 + rnd() * 380; const y = 120 + rnd() * 420; const z = 8 + rnd() * 20; ctx.fillStyle = `rgba(${90 + rnd() * 60},${160 + rnd() * 60},255,${0.55 + rnd() * 0.4})`; round(ctx, x, y, z, z, 3); ctx.fill(); if (rnd() < 0.35) { ctx.fillStyle = '#fff'; ctx.font = `900 ${z * 0.7}px "Geist Mono", monospace`; ctx.fillText(['0', '1', '#'][Math.floor(rnd() * 3)], x + z * 0.28, y + z * 0.78); } }
}

/**
 * Share card for a bounty. `winner` turns it into a "PAID" proof card with the winner, amount and payout tx.
 * Drawn client-side from real bounty data only.
 */
export async function renderRewardCard(reward: Reward, winner?: RewardProof | null): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is not supported on this device.');
  try { await Promise.all(['900 80px Anybody', '800 30px Geist', '700 22px "Geist Mono"'].map(f => document.fonts.load(f))); } catch { /* fallback fonts */ }
  const img = reward.image && reward.coverState !== 'generating' ? await load(reward.image) : null;
  if (img) { cover(ctx, img, 0, 0, W, H); const shade = ctx.createLinearGradient(0, 0, W * 0.7, 0); shade.addColorStop(0, 'rgba(10,30,90,.72)'); shade.addColorStop(1, 'rgba(10,30,90,0)'); ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H); }
  else sky(ctx);
  const paid = reward.status === 'paid' || Boolean(winner && winner.state === 'paid');
  ctx.fillStyle = paid ? '#12A150' : 'rgba(255,255,255,.92)'; round(ctx, 60, 54, paid ? 250 : 210, 50, 25); ctx.fill();
  ctx.fillStyle = paid ? '#fff' : '#0C0D10'; ctx.font = '800 22px "Geist Mono", monospace'; ctx.fillText(paid ? '✓ WINNER PAID' : '● OPEN BOUNTY', 84, 87);
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(10,40,120,.4)'; ctx.shadowBlur = 24;
  ctx.font = '900 76px Anybody, sans-serif'; const head = lines(ctx, reward.title.toUpperCase(), 700, 3); head.forEach((l, i) => ctx.fillText(l, 60, 196 + i * 78));
  const y = 196 + head.length * 78 + 8;
  ctx.font = '900 96px Anybody, sans-serif'; ctx.fillText(`$${reward.rewardUsd.toLocaleString('en-US')}`, 60, y + 60);
  ctx.shadowBlur = 0; ctx.font = '800 26px Geist, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.fillText(paid ? `Paid to ${winner?.handle ? '@' + winner.handle : winner?.wallet ?? 'the winner'} on Robinhood Chain` : reward.kind === 'community' ? `Locked in escrow · posted by ${reward.poster.handle ? '@' + reward.poster.handle : 'a hunter'}` : 'REWARDS ONLY GO UP.', 60, y + 112);
  if (paid && (winner?.payoutTx ?? reward.payoutTx)) { ctx.font = '700 20px "Geist Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,.8)'; const tx = (winner?.payoutTx ?? reward.payoutTx)!; ctx.fillText(`tx ${tx.slice(0, 12)}…${tx.slice(-8)}`, 60, y + 148); }
  const av = winner?.avatar ? await load(winner.avatar) : null;
  if (paid && av) { ctx.save(); ctx.beginPath(); ctx.arc(W - 150, 150, 80, 0, Math.PI * 2); ctx.clip(); cover(ctx, av, W - 230, 70, 160, 160); ctx.restore(); ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(W - 150, 150, 80, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(12,13,16,.82)'; ctx.fillRect(0, H - 76, W, 76);
  ctx.fillStyle = '#fff'; ctx.font = '900 34px Anybody, sans-serif'; ctx.fillText('objectpad.fun/rewards', 60, H - 26);
  ctx.font = '700 20px "Geist Mono", monospace'; ctx.fillStyle = 'rgba(255,255,255,.6)'; const tag = 'find it · scan it · get paid'; ctx.fillText(tag, W - 60 - ctx.measureText(tag).width, H - 30);
  return canvas;
}
