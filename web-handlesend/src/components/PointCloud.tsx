import { memo, useEffect, useRef } from 'react';
import { usePreferences } from '@/hooks/use-preferences';
import { useInView } from '@/hooks/use-in-view';
import { cn } from '@/lib/utils';
import { IS_TOUCH } from '@/lib/perf';

/** How the cloud is drawn: scattered sensor noise, assembling into the object, a scan plane sweeping, or finished colour. */
export type CloudMode = 'noise' | 'swirl' | 'assemble' | 'scan' | 'solid' | 'wire';
interface Cloud { p: number[]; c: string[] }
const cache = new Map<string, Promise<Cloud>>();
function load(src: string): Promise<Cloud> { let hit = cache.get(src); if (!hit) { hit = fetch(src).then(r => { if (!r.ok) throw new Error('cloud'); return r.json() as Promise<Cloud>; }); cache.set(src, hit); } return hit; }

/**
 * Lightweight 2D-canvas renderer for a real 3D scan's surface samples (points taken from the textured model with their
 * true colours). No WebGL, so it can appear many times on a page. `progress` (0–1) drives the assemble/scan modes.
 */
export const PointCloud = memo(function PointCloud({ src, mode = 'solid', progress, className, size = 1.6, speed = 0.35, tilt = 0.18 }: { src: string; mode?: CloudMode; progress?: number; className?: string; size?: number; speed?: number; tilt?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null); const { reducedMotion } = usePreferences(); const visible = useInView(canvas, '100px');
  const state = useRef<{ mode: CloudMode; progress?: number }>({ mode, progress }); state.current = { mode, progress };
  useEffect(() => {
    const element = canvas.current; const context = element?.getContext('2d'); if (!element || !context) return;
    let cloud: Cloud | null = null; let frame = 0; let alive = true; const started = performance.now(); let scatter: Float32Array | null = null; let modeAt = performance.now(); let lastMode = state.current.mode;
    void load(src).then(data => { if (!alive) return; cloud = data; const n = data.p.length / 3; scatter = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) scatter[i] = (Math.random() - 0.5) * 3.2; draw(performance.now()); }).catch(() => undefined);
    const draw = (now: number) => {
      const rect = element.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); const w = Math.max(1, Math.round(rect.width * dpr)); const h = Math.max(1, Math.round(rect.height * dpr));
      if (element.width !== w || element.height !== h) { element.width = w; element.height = h; }
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, w, h); if (!cloud || !scatter) return;
      if (state.current.mode !== lastMode) { lastMode = state.current.mode; modeAt = now; }
      const m = state.current.mode; const age = (now - modeAt) / 1000;
      const auto = m === 'assemble' ? Math.min(1, age / 1.4) : m === 'scan' ? Math.min(1, (age % 5) / 1.1) : 1;
      const k = state.current.progress ?? auto; const ease = 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
      const angle = reducedMotion ? 0.6 : ((now - started) / 1000) * speed + 0.6; const cos = Math.cos(angle); const sin = Math.sin(angle); const ct = Math.cos(tilt); const st = Math.sin(tilt);
      const scale = Math.min(w, h) * 0.34; const cx = w / 2; const cy = h / 2 + h * 0.02; const n = cloud.p.length / 3; const dot = size * dpr;
      const items: [number, number, number, string, number][] = [];
      for (let i = 0; i < n; i++) {
        let x = cloud.p[i * 3]; let y = cloud.p[i * 3 + 1]; let z = cloud.p[i * 3 + 2];
        if (m === 'swirl') {
          // Points orbit fast on rings around the object, spiralling in until they lock onto the surface.
          const lock = Math.min(1, age / 1.3) ** 2; const r0 = 1.1 + (i % 13) / 13; const a0 = (i * 2.399) + age * (5 - lock * 4) * (1 + (i % 7) / 7);
          const ox = Math.cos(a0) * r0; const oz = Math.sin(a0) * r0; const oy = ((i % 101) / 101 - 0.5) * 2 * (1 - lock * 0.3);
          x = ox + (x - ox) * lock; y = oy + (y - oy) * lock; z = oz + (z - oz) * lock;
        } else if (m === 'noise' || m === 'assemble') { const t = m === 'noise' ? 0 : Math.min(1, Math.max(0, ease * 1.25 - (i % 97) / 97 * 0.25)); x = scatter[i * 3] + (x - scatter[i * 3]) * t; y = scatter[i * 3 + 1] + (y - scatter[i * 3 + 1]) * t; z = scatter[i * 3 + 2] + (z - scatter[i * 3 + 2]) * t; }
        const rx = x * cos - z * sin; const rz = x * sin + z * cos; const ry = y * ct - rz * st; const depth = y * st + rz * ct;
        const persp = 1 / (1 + depth * 0.18); const sx = cx + rx * scale * persp; const sy = cy - ry * scale * persp;
        let color = cloud.c[i]; let alpha = 0.95;
        if (m === 'noise') { color = '#1B1D22'; alpha = 0.28; }
        else if (m === 'swirl') { const lock = Math.min(1, age / 1.3); color = lock > 0.85 ? cloud.c[i] : i % 3 ? '#1B1D22' : '#6A6E78'; alpha = 0.45 + lock * 0.5; }
        else if (m === 'wire') { color = '#1B1D22'; alpha = 0.55; }
        else if (m === 'scan') { const level = -1 + ease * 2.2; if (y > level) { alpha = 0.5; } else if (y > level - 0.08) { color = '#FFFFFF'; alpha = 1; } }
        else if (m === 'assemble' && ease < 0.999) { alpha = 0.35 + ease * 0.6; }
        items.push([depth, sx, sy, color, alpha * (0.55 + 0.45 * persp)]);
      }
      items.sort((a, b) => b[0] - a[0]);
      for (const [, sx, sy, color, alpha] of items) { context.globalAlpha = alpha; context.fillStyle = color; context.fillRect(sx - dot / 2, sy - dot / 2, dot, dot); }
      context.globalAlpha = 1;
    };
    let last = 0;
    const loop = (now: number) => { if (!alive) return; if (!IS_TOUCH || now - last > 32) { draw(now); last = now; } if (!reducedMotion && visible) frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [src, size, speed, tilt, reducedMotion, visible]);
  return <canvas ref={canvas} className={cn('pointer-events-none h-full w-full', className)} aria-hidden="true"/>;
});
