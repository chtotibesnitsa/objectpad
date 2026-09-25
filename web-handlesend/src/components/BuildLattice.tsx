import { memo, useEffect, useRef } from 'react';
import { usePreferences } from '@/hooks/use-preferences';
import { cn } from '@/lib/utils';

/**
 * Abstract reconstruction visual for a private scan in progress: a rotating geodesic lattice whose points lock into
 * place from the bottom up as the real provider progress rises. It never pretends to be the user's object.
 */
export const BuildLattice = memo(function BuildLattice({ progress, className, mode = 'build' }: { progress: number; className?: string; mode?: 'build' | 'search' }) {
  const canvas = useRef<HTMLCanvasElement>(null); const { reducedMotion } = usePreferences(); const target = useRef<number>(progress); target.current = progress;
  useEffect(() => {
    const element = canvas.current; const context = element?.getContext('2d'); if (!element || !context) return;
    const points: [number, number, number][] = []; const count = 900; const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) { const y = 1 - (i / (count - 1)) * 2; const r = Math.sqrt(1 - y * y); const t = golden * i; const squash = 0.82 + 0.18 * Math.sin(t * 3) * Math.cos(y * 4); points.push([Math.cos(t) * r * squash, y * 0.92, Math.sin(t) * r * squash]); }
    let shown = 0; let frame = 0; let alive = true; const start = performance.now();
    const draw = (now: number) => {
      const rect = element.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); const w = Math.round(rect.width * dpr); const h = Math.round(rect.height * dpr);
      if (element.width !== w || element.height !== h) { element.width = w; element.height = h; }
      context.clearRect(0, 0, w, h); shown += (target.current - shown) * 0.06;
      const angle = reducedMotion ? 0.5 : (now - start) / 3200; const cos = Math.cos(angle); const sin = Math.sin(angle); const scale = Math.min(w, h) * 0.36; const cx = w / 2; const cy = h / 2;
      const level = -1 + Math.max(0, Math.min(1, shown / 100)) * 2.02; const sweep = mode === 'search' ? Math.sin((now - start) / 700) : level;
      for (const [x, y, z] of points) {
        const rx = x * cos - z * sin; const rz = x * sin + z * cos; const persp = 1 / (1 + rz * 0.25); const sx = cx + rx * scale * persp; const sy = cy - y * scale * persp;
        const built = mode === 'build' && y <= level; const edge = Math.abs(y - sweep) < 0.05;
        context.globalAlpha = edge ? 1 : built ? 0.35 + 0.55 * persp : 0.12;
        context.fillStyle = edge ? '#0C0D10' : '#1B1D22';
        const d = (edge ? 2.6 : built ? 2.1 : 1.4) * dpr; context.fillRect(sx - d / 2, sy - d / 2, d, d);
      }
      context.globalAlpha = 1; if (alive && !reducedMotion) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [reducedMotion, mode]);
  return <canvas ref={canvas} className={cn('pointer-events-none h-full w-full', className)} aria-hidden="true"/>;
});
