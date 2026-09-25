import { memo, useEffect, useRef } from 'react';
import { useInView } from '@/hooks/use-in-view';
import { IS_TOUCH } from '@/lib/perf';
import { usePreferences } from '@/hooks/use-preferences';
import { cn } from '@/lib/utils';
import { SpaceField } from './SpaceField';

const GLYPHS = '01$Ξ▲▼+-=/\\|#%@*<>{}[]';
const SHADES = ['░', '▒', '▓', '█'];

/**
 * Canvas "market terminal" texture: faint twinkling ASCII glyphs plus a scrolling ASCII candlestick chart along the
 * bottom. Drawn at ~9 fps, paused when the tab is hidden, and drawn once for reduced-motion users.
 */
export const AsciiField = memo(function AsciiField({ className, cell = 16, density = 0.1, chart = true, tone = 0.07, rgb = '12,13,16' }: { className?: string; cell?: number; density?: number; chart?: boolean; tone?: number; rgb?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null); const { reducedMotion } = usePreferences(); const visible = useInView(canvas, '60px');
  useEffect(() => {
    const element = canvas.current; const context = element?.getContext('2d'); if (!element || !context) return;
    let cols = 0; let rows = 0; let cells: string[] = []; let series: number[] = []; let level = 0.5; let frame = 0; let timer = 0;
    const pick = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const resize = () => {
      const rect = element.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(rect.width * dpr)); element.height = Math.max(1, Math.round(rect.height * dpr)); context.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(rect.width / cell); rows = Math.ceil(rect.height / cell);
      cells = Array.from({ length: cols * rows }, () => (Math.random() < density ? pick() : ''));
      series = Array.from({ length: cols }, () => { level = Math.min(0.95, Math.max(0.1, level + (Math.random() - 0.42) * 0.12)); return level; });
      draw();
    };
    const draw = () => {
      const width = cols * cell; const height = rows * cell; context.clearRect(0, 0, width, height);
      context.font = `500 ${Math.round(cell * 0.72)}px "Geist Mono", ui-monospace, monospace`; context.textBaseline = 'top';
      for (let i = 0; i < cells.length; i++) { const ch = cells[i]; if (!ch) continue; const x = (i % cols) * cell; const y = Math.floor(i / cols) * cell; context.fillStyle = `rgba(${rgb},${ch === 'Ξ' ? tone * 1.8 : tone})`; context.fillText(ch, x, y); }
      if (chart) {
        const band = Math.max(4, Math.floor(rows * 0.28));
        for (let c = 0; c < cols; c++) {
          const value = series[c]; const top = rows - Math.round(value * band); const up = c === 0 || value >= series[c - 1];
          for (let r = top; r < rows; r++) { const depth = (r - top) / Math.max(1, rows - top); context.fillStyle = `rgba(${rgb},${tone * (up ? 1.5 - depth : 0.9 - depth * 0.6)})`; context.fillText(SHADES[Math.min(3, Math.floor((1 - depth) * 4))], c * cell, r * cell); }
        }
      }
    };
    const tick = () => {
      if (document.hidden) return; frame++;
      for (let k = 0; k < Math.max(3, cells.length * 0.004); k++) { const i = Math.floor(Math.random() * cells.length); cells[i] = Math.random() < density * 1.2 ? pick() : ''; }
      if (chart && frame % 2 === 0) { series.shift(); level = Math.min(0.95, Math.max(0.1, level + (Math.random() - 0.42) * 0.12)); series.push(level); }
      draw();
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    if (!reducedMotion && visible) timer = window.setInterval(tick, IS_TOUCH ? 220 : 110);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, [cell, density, chart, tone, rgb, reducedMotion, visible]);
  return <canvas ref={canvas} className={cn('pointer-events-none', className)} aria-hidden="true"/>;
});

const DRIFT = ['0x7f3a…c21e', 'Ξ 0.0008', 'tris=93462', 'OP-7F3K-92QD', 'verts=70138', '▲ +12.4%', 'sha256:e3b0…', '{ view: 6 }', 'dims=0.55×1.00', 'launchAndBuy()', 'block #4,812,093', '1/1', 'mat=vinyl', '░▒▓█', 'gas 0.02 gwei', '$PEPE', '$QUACK', 'edges=160367', 'chainId 4663', '[ scan ]', '◇ mesh ok', 'rgb=#709050', '→ burn 0.5%', '⟡'];

/**
 * Site-wide drifting lab readouts: short mono strings (hashes, mesh stats, tickers) float slowly up the page at very
 * low contrast, so the pearl background never looks empty. One canvas, ~12 fps, paused when hidden.
 */
export const DriftField = memo(function DriftField() {
  const canvas = useRef<HTMLCanvasElement>(null); const { reducedMotion } = usePreferences();
  useEffect(() => {
    const element = canvas.current; const context = element?.getContext('2d'); if (!element || !context) return;
    let w = 0; let h = 0; let timer = 0;
    const HUES = ['0,140,40', '40,90,200', '120,70,200', '200,110,20', '12,13,16'];
    const items = Array.from({ length: 18 }, (_, i) => ({ text: DRIFT[i % DRIFT.length], x: Math.random() * 0.92, y: Math.random(), speed: 0.00012 + Math.random() * 0.0002, size: 11 + Math.round(Math.random() * 2), alpha: 0.5 + Math.random() * 0.3, hue: HUES[i % HUES.length] }));
    const resize = () => { const dpr = Math.min(window.devicePixelRatio || 1, 2); w = window.innerWidth; h = window.innerHeight; element.width = w * dpr; element.height = h * dpr; context.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); };
    const draw = () => { context.clearRect(0, 0, w, h); for (const it of items) { context.font = `700 ${it.size}px "Geist Mono", ui-monospace, monospace`; const x = it.x * w; const y = it.y * h; const tw = context.measureText(it.text).width; context.globalAlpha = it.alpha; context.fillStyle = `rgba(${it.hue},0.08)`; context.beginPath(); context.roundRect(x - 7, y - it.size - 4, tw + 14, it.size + 10, 8); context.fill(); context.strokeStyle = `rgba(${it.hue},0.18)`; context.lineWidth = 1; context.stroke(); context.fillStyle = `rgba(${it.hue},0.7)`; context.fillText(it.text, x, y); } context.globalAlpha = 1; };
    const tick = () => { if (document.hidden) return; for (const it of items) { it.y -= it.speed * 8; if (it.y < -0.03) { it.y = 1.03; it.x = Math.random(); it.text = DRIFT[Math.floor(Math.random() * DRIFT.length)]; } } draw(); };
    resize(); window.addEventListener('resize', resize);
    if (!reducedMotion) timer = window.setInterval(tick, 80);
    return () => { window.removeEventListener('resize', resize); window.clearInterval(timer); };
  }, [reducedMotion]);
  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 -z-[1] h-full w-full" aria-hidden="true"/>;
});

/** Site-wide atmosphere: pearl light over engineering paper, plus the space-lab field in the side gutters. */
export function CryptoBackdrop() { return <><div className="backdrop" aria-hidden="true"/><div className="aurora aurora-a motion-reduce:hidden" aria-hidden="true"/><div className="aurora aurora-b motion-reduce:hidden" aria-hidden="true"/><SpaceField/></>; }

const ASCII = '.:-=+*#%@';
/**
 * ASCII rendering of a real scanned object: samples its 3D point cloud, rotates it and draws it as characters, the
 * denser glyphs where more surface faces the viewer. Used as a moving texture in section backgrounds.
 */
export const AsciiObject = memo(function AsciiObject({ src, className, cols = 56, rows = 28, speed = 0.4 }: { src: string; className?: string; cols?: number; rows?: number; speed?: number }) {
  const ref = useRef<HTMLPreElement>(null); const { reducedMotion } = usePreferences(); const visible = useInView(ref, '40px');
  useEffect(() => {
    if (!visible) return;
    let alive = true; let frame = 0; let points: number[] = []; const started = performance.now();
    void fetch(src).then(r => r.json() as Promise<{ p: number[] }>).then(d => { points = d.p; }).catch(() => undefined);
    const draw = (now: number) => {
      if (!alive) return; const el = ref.current;
      if (el && points.length && !document.hidden) {
        const grid = new Float32Array(cols * rows); const depth = new Float32Array(cols * rows).fill(-9); const a = reducedMotion ? 0.7 : ((now - started) / 1000) * speed; const c = Math.cos(a); const s = Math.sin(a);
        for (let i = 0; i < points.length; i += 3) { const x = points[i] * c - points[i + 2] * s; const z = points[i] * s + points[i + 2] * c; const y = points[i + 1]; const gx = Math.floor((x * 0.46 + 0.5) * cols); const gy = Math.floor((0.5 - y * 0.46) * rows); if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue; const k = gy * cols + gx; grid[k] += 1; if (z > depth[k]) depth[k] = z; }
        let out = ''; for (let r = 0; r < rows; r++) { for (let q = 0; q < cols; q++) { const k = r * cols + q; const v = grid[k] ? Math.min(ASCII.length - 1, Math.floor(grid[k] * 0.9 + (depth[k] + 1) * 2.2)) : -1; out += v < 0 ? ' ' : ASCII[v]; } out += '\n'; }
        el.textContent = out;
      }
      if (!reducedMotion) frame = window.setTimeout(() => requestAnimationFrame(draw), IS_TOUCH ? 140 : 70) as unknown as number;
    };
    requestAnimationFrame(draw);
    return () => { alive = false; window.clearTimeout(frame); };
  }, [src, cols, rows, speed, reducedMotion, visible]);
  return <pre ref={ref} aria-hidden="true" className={cn('ascii-rain pointer-events-none select-none', className)}/>;
});
