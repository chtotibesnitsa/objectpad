import { memo, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import type { CaptureSession } from '@/shared/domain';
import { cn } from '@/lib/utils';

/** Reads each accepted photo back from the private store once, as an object URL keyed by view id. */
export function useViewUrls(session: CaptureSession, download: (url: string) => Promise<Blob>): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({}); const loading = useRef<Set<string>>(new Set()); const keys = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const v of session.views) {
      const k = `${v.view}:${v.hash}`; if (keys.current[v.view] === k || loading.current.has(k)) continue; loading.current.add(k);
      void download(`${API_BASE}/sessions/${session.id}/views/${v.view}`).then(blob => { keys.current[v.view] = k; const url = URL.createObjectURL(blob); setUrls(u => ({ ...u, [v.view]: url })); }).catch(() => undefined).finally(() => loading.current.delete(k));
    }
  }, [session.views, session.id, download]);
  useEffect(() => () => { Object.values(urls).forEach(u => URL.revokeObjectURL(u)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}

const RAMP = ' .:-=+*#%@';
interface Cell { ch: string; lum: number; r: number; g: number; b: number; }
async function sample(src: string, cols: number, rows: number): Promise<Cell[]> {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = cols; c.height = rows; const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const s = Math.max(cols / img.width, rows / img.height); const w = img.width * s; const h = img.height * s; ctx.drawImage(img, (cols - w) / 2, (rows - h) / 2, w, h);
  const d = ctx.getImageData(0, 0, cols, rows).data; const out: Cell[] = [];
  for (let i = 0; i < cols * rows; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255; out.push({ ch: RAMP[Math.min(RAMP.length - 1, Math.floor((1 - lum) * RAMP.length))], lum, r, g, b }); }
  return out;
}

/**
 * A photo arriving: random 0s and 1s resolve into ASCII characters coloured from the real pixels, then the actual photo
 * fades in on top. Plays once per photo.
 */
export const AsciiPhoto = memo(function AsciiPhoto({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null); const [done, setDone] = useState<boolean>(false);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; let raf = 0; let alive = true;
    const cols = 30, rows = 40; const start = performance.now();
    void sample(src, cols, rows).then(cells => {
      if (!alive) return; const ctx = canvas.getContext('2d')!; const W = canvas.width = canvas.clientWidth * 2; const H = canvas.height = canvas.clientHeight * 2; const cw = W / cols, ch = H / rows;
      ctx.font = `bold ${Math.round(ch * 0.95)}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const order = cells.map((_, i) => Math.random() * 0.7 + (Math.floor(i / cols) / rows) * 0.3);
      const draw = (t: number) => {
        const k = Math.min(1, (t - start) / 1600); ctx.fillStyle = '#0F1115'; ctx.fillRect(0, 0, W, H);
        cells.forEach((cell, i) => { const x = (i % cols + 0.5) * cw, y = (Math.floor(i / cols) + 0.5) * ch; const on = k > order[i]; ctx.fillStyle = on ? `rgb(${cell.r},${cell.g},${cell.b})` : 'rgba(255,255,255,.35)'; ctx.fillText(on ? cell.ch === ' ' ? '·' : cell.ch : Math.random() > 0.5 ? '1' : '0', x, y); });
        if (k < 1) raf = requestAnimationFrame(draw); else setTimeout(() => alive && setDone(true), 450);
      };
      raf = requestAnimationFrame(draw);
    }).catch(() => setDone(true));
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [src]);
  return <div className={cn('relative h-full w-full bg-[#0F1115]', className)}>
    <canvas ref={ref} className={cn('absolute inset-0 h-full w-full transition-opacity duration-700', done && 'opacity-0')} aria-hidden="true"/>
    <img src={src} alt="" className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-700', done ? 'opacity-100' : 'opacity-0')}/>
  </div>;
});

interface Bit { x: number; y: number; vx: number; vy: number; ch: string; color: string; life: number; }
/**
 * The build in motion: each photo loops through photo → ASCII → drifting 0s and 1s that stream into the model in the
 * centre, then reforms. Speed follows real progress.
 */
export const DataStream = memo(function DataStream({ urls, progress, className }: { urls: string[]; progress: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null); const prog = useRef<number>(progress); prog.current = progress;
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !urls.length) return; let raf = 0; let alive = true;
    const cols = 16, rows = 20;
    void Promise.all(urls.map(u => sample(u, cols, rows).catch(() => null))).then(all => {
      if (!alive) return; const photos = all.filter((p): p is Cell[] => Boolean(p)); if (!photos.length) return;
      const ctx = canvas.getContext('2d')!; const W = canvas.width = canvas.clientWidth * 2; const H = canvas.height = canvas.clientHeight * 2;
      const tileW = Math.min(W / (photos.length + 2), 150), tileH = tileW * 1.3; const gap = (W - tileW * photos.length) / (photos.length + 1); const cw = tileW / cols, chh = tileH / rows;
      const bits: Bit[] = []; const cx = W / 2, cy = H * 0.86; const t0 = performance.now();
      const draw = (t: number) => {
        ctx.clearRect(0, 0, W, H); const speed = 0.6 + prog.current / 60;
        photos.forEach((cells, p) => {
          const phase = (((t - t0) / 1000) * speed * 0.25 + p / photos.length) % 1; const x0 = gap + p * (tileW + gap), y0 = H * 0.08;
          const shown = phase < 0.35 ? 1 : phase < 0.75 ? 1 - (phase - 0.35) / 0.4 : (phase - 0.75) / 0.25;
          ctx.font = `bold ${Math.round(chh)}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          cells.forEach((cell, i) => {
            const cxI = i % cols, cyI = Math.floor(i / cols); const gate = ((cyI * 7 + cxI * 13) % 100) / 100; const x = x0 + (cxI + 0.5) * cw, y = y0 + (cyI + 0.5) * chh;
            if (gate < shown) { ctx.fillStyle = `rgb(${cell.r},${cell.g},${cell.b})`; ctx.fillText(cell.ch === ' ' ? '·' : cell.ch, x, y); }
            else if (phase >= 0.35 && phase < 0.75 && Math.random() < 0.012 && bits.length < 700) bits.push({ x, y, vx: (cx - x) / 90 + (Math.random() - 0.5) * 1.5, vy: -1 - Math.random() * 2, ch: Math.random() > 0.5 ? '1' : '0', color: `rgb(${cell.r},${cell.g},${cell.b})`, life: 1 });
          });
        });
        ctx.font = 'bold 22px ui-monospace, monospace';
        for (let i = bits.length - 1; i >= 0; i--) { const b = bits[i]; b.vy += 0.09; b.vx += (cx - b.x) * 0.0009; b.x += b.vx * speed; b.y += b.vy * speed; b.life -= 0.006 * speed; if (b.life <= 0 || b.y > cy) { bits.splice(i, 1); continue; } ctx.globalAlpha = Math.min(1, b.life * 1.5); ctx.fillStyle = b.color; ctx.fillText(b.ch, b.x, b.y); }
        ctx.globalAlpha = 1; raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    });
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [urls]);
  return <canvas ref={ref} className={cn('h-full w-full', className)} aria-hidden="true"/>;
});

interface Drop { id: number; x: number; y: number; v: number; good: boolean; }
/** Tap-the-bits mini game for the wait: catch the 1s, dodge the 0s. Best score stays in this browser. */
export const BitCatcher = memo(function BitCatcher({ className }: { className?: string }) {
  const [drops, setDrops] = useState<Drop[]>([]); const [score, setScore] = useState<number>(0); const [combo, setCombo] = useState<number>(0);
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem('objectpad.bits.best') ?? 0) || 0); const next = useRef<number>(0);
  useEffect(() => {
    const tick = setInterval(() => setDrops(list => { const moved = list.map(d => ({ ...d, y: d.y + d.v })).filter(d => d.y < 104); if (Math.random() < 0.45) moved.push({ id: ++next.current, x: 6 + Math.random() * 88, y: -6, v: 1.4 + Math.random() * 1.8, good: Math.random() > 0.3 }); return moved; }), 60);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => { if (score > best) { setBest(score); try { localStorage.setItem('objectpad.bits.best', String(score)); } catch { /* ignore */ } } }, [score, best]);
  const hit = (d: Drop) => { setDrops(list => list.filter(x => x.id !== d.id)); if (d.good) { setCombo(c => c + 1); setScore(s => s + 1 + Math.floor(combo / 5)); navigator.vibrate?.(8); } else { setCombo(0); setScore(s => Math.max(0, s - 3)); navigator.vibrate?.([20, 30, 20]); } };
  return <div className={cn('relative overflow-hidden rounded-[24px] bg-[#0F1115]', className)}>
    <div className="pointer-events-none absolute inset-x-4 top-3 z-10 flex items-center justify-between text-white"><p className="text-[14px] font-extrabold">Catch the 1s · dodge the 0s</p><p className="font-mono text-[13px] font-extrabold tnum">{score} pts{combo >= 5 && <span className="ml-2 text-[#FFD479]">×{1 + Math.floor(combo / 5)}</span>}<span className="ml-3 text-white/55">best {best}</span></p></div>
    {drops.map(d => <button key={d.id} type="button" onPointerDown={() => hit(d)} aria-label={d.good ? 'Catch one' : 'Zero'} className={cn('absolute flex size-11 -translate-x-1/2 items-center justify-center rounded-full font-mono text-[22px] font-black transition-transform active:scale-75', d.good ? 'text-white' : 'text-down')} style={{ left: `${d.x}%`, top: `${d.y}%` }}>{d.good ? '1' : '0'}</button>)}
  </div>;
});
