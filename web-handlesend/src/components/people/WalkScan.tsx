import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureView } from '@/shared/people';

/** Where around the subject (degrees clockwise from the first shot) each view is taken. */
export const VIEW_YAW: Record<CaptureView, number> = { front: 0, right: 90, back: 180, left: 270, body_front: 0, body_side: 90, body_back: 180 };
const SECTORS = 24;
const SECTOR_DEG = 360 / SECTORS;

type SensorState = 'idle' | 'asking' | 'live' | 'denied' | 'unsupported';

interface OrientationCtor { requestPermission?: () => Promise<'granted' | 'denied'>; }

/**
 * Tracks how far the phone has travelled around the subject using the compass/gyro heading.
 * The heading at the moment scanning starts is 0°. Returns a relative yaw in [0, 360).
 */
export function useWalkYaw() {
  const [state, setState] = useState<SensorState>('idle');
  const [yaw, setYaw] = useState<number>(0);
  const origin = useRef<number | null>(null);
  const yawRef = useRef<number>(0);
  const handler = useCallback((e: DeviceOrientationEvent) => {
    const w = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    const heading = typeof w.webkitCompassHeading === 'number' ? w.webkitCompassHeading : e.alpha == null ? null : (360 - e.alpha) % 360;
    if (heading == null) return;
    if (origin.current == null) origin.current = heading;
    const rel = (((heading - origin.current) % 360) + 360) % 360;
    yawRef.current = rel; setYaw(rel);
  }, []);
  const start = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) { setState('unsupported'); return false; }
    setState('asking'); origin.current = null;
    try {
      const ctor = DeviceOrientationEvent as unknown as OrientationCtor;
      if (typeof ctor.requestPermission === 'function') { const r = await ctor.requestPermission(); if (r !== 'granted') { setState('denied'); return false; } }
    } catch { setState('denied'); return false; }
    window.addEventListener('deviceorientationabsolute', handler as EventListener, true);
    window.addEventListener('deviceorientation', handler as EventListener, true);
    // A desktop reports the event once with null values: treat "no reading soon" as unsupported.
    window.setTimeout(() => { if (origin.current == null) setState('unsupported'); }, 1800);
    setState('live'); return true;
  }, [handler]);
  const stop = useCallback(() => {
    window.removeEventListener('deviceorientationabsolute', handler as EventListener, true);
    window.removeEventListener('deviceorientation', handler as EventListener, true);
    origin.current = null; setState('idle'); setYaw(0);
  }, [handler]);
  useEffect(() => () => { window.removeEventListener('deviceorientationabsolute', handler as EventListener, true); window.removeEventListener('deviceorientation', handler as EventListener, true); }, [handler]);
  return { state, yaw, yawRef, start, stop };
}

/** Sector index for a yaw. */
export const sectorOf = (yaw: number): number => Math.floor((((yaw % 360) + 360) % 360) / SECTOR_DEG) % SECTORS;

/**
 * Low-poly mesh wrapped around the subject. Triangles turn green sector by sector as the phone covers that angle,
 * so the person can see exactly which sides are still missing. Purely a coverage display: it does not read depth.
 */
export function TriangleOverlay({ covered, current, shots, width, height }: { covered: ReadonlySet<number>; current: number; shots: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const reveal = useRef<Map<number, number>>(new Map());
  const raf = useRef<number>(0);
  const props = useRef({ covered, current, shots });
  props.current = { covered, current, shots };

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cx = width / 2; const cy = height * 0.5; const rx = width * 0.3; const ry = height * 0.4; const rings = 7;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      const { covered: cov, current: cur } = props.current;
      // Ease each sector's reveal toward 1 when covered.
      for (let s = 0; s < SECTORS; s++) { const v = reveal.current.get(s) ?? 0; const target = cov.has(s) ? 1 : 0; reveal.current.set(s, reduced ? target : v + (target - v) * 0.12); }
      // Vertices: rings from crown to base, wrapped around a rotating ellipse, projected with a slight perspective.
      const spin = (cur * SECTOR_DEG * Math.PI) / 180;
      const point = (ring: number, s: number): [number, number, number] => {
        const v = ring / rings; const a = (s / SECTORS) * Math.PI * 2 - spin; const r = Math.sin(v * Math.PI) ** 0.8;
        const x = Math.sin(a) * r; const z = Math.cos(a) * r;
        return [cx + x * rx, cy - ry + v * ry * 2 + z * 6, z];
      };
      for (let ring = 0; ring < rings; ring++) {
        for (let s = 0; s < SECTORS; s++) {
          const s2 = (s + 1) % SECTORS;
          const a = point(ring, s); const b = point(ring, s2); const c = point(ring + 1, s); const d = point(ring + 1, s2);
          if (a[2] + b[2] + c[2] + d[2] < -0.2) continue;
          const rv = reveal.current.get(s) ?? 0; const isCur = s === cur;
          const tri = (p: number[][], k: number) => {
            const lag = Math.max(0, Math.min(1, rv * 1.6 - (ring / rings) * 0.6 - k * 0.08));
            ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.closePath();
            if (lag > 0) { ctx.fillStyle = `rgba(30,220,120,${0.42 * lag})`; ctx.fill(); }
            ctx.lineWidth = isCur ? 1.8 : 1; ctx.strokeStyle = isCur ? 'rgba(255,255,255,.95)' : lag > 0.5 ? 'rgba(120,255,180,.85)' : 'rgba(255,255,255,.28)'; ctx.stroke();
          };
          tri([a, b, c], 0); tri([b, d, c], 1);
        }
      }
      // Sweeping scan line on the current sector.
      if (!reduced) { const y = cy - ry + ((Math.sin(t / 500) + 1) / 2) * ry * 2; ctx.strokeStyle = 'rgba(80,255,160,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - rx, y); ctx.lineTo(cx + rx, y); ctx.stroke(); }
      raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [width, height]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 size-full" style={{ width, height }}/>;
}
