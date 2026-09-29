import { useEffect, useRef, type MutableRefObject } from 'react';
import { BODY_EDGES, BODY_TRIS, PT, VIEW_TARGET_DEG, type ArFrame } from '@/lib/arScan';
import { cn } from '@/lib/utils';

const GREEN = '30,220,120';

/**
 * Draws the scanner's live result over the camera picture: a green low-poly mesh on faces, a triangulated skeleton on bodies
 * and a tracked, triangulated shell on objects. `mirror` flips x for selfie cameras so it lines up with the mirrored video.
 */
export function ArOverlay({ frame, mirror, width, height }: { frame: MutableRefObject<ArFrame>; mirror: boolean; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; let raf = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw); ctx.clearRect(0, 0, width, height);
      const f = frame.current; if (!f.vw || !f.vh) return;
      // The video fills the stage with object-cover: same scale on both axes, cropped to fit.
      const s = Math.max(width / f.vw, height / f.vh); const ox = (width - f.vw * s) / 2; const oy = (height - f.vh * s) / 2;
      const X = (nx: number): number => { const x = nx * f.vw * s + ox; return mirror ? width - x : x; };
      const Y = (ny: number): number => ny * f.vh * s + oy;
      if (f.kind === 'face') drawFace(ctx, f, X, Y);
      else if (f.kind === 'body') drawBody(ctx, f, X, Y);
      else drawObject(ctx, f, X, Y, s, t, reduced);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [frame, mirror, width, height]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 size-full" style={{ width, height }}/>;
}

type Project = (n: number) => number;

function drawFace(ctx: CanvasRenderingContext2D, f: ArFrame, X: Project, Y: Project): void {
  const { points, tris, painted } = f; if (!points || !tris || !painted) return;
  const n = points.length / PT;
  const levels: Path2D[] = [new Path2D(), new Path2D(), new Path2D()]; const faint = new Path2D();
  for (let t = 0; t < painted.length; t++) {
    const a = tris[t * 3]; const b = tris[t * 3 + 1]; const c = tris[t * 3 + 2]; if (a >= n || b >= n || c >= n) continue;
    const p = painted[t]; const path = p > 0.75 ? levels[2] : p > 0.4 ? levels[1] : p > 0.08 ? levels[0] : faint;
    path.moveTo(X(points[a * PT]), Y(points[a * PT + 1])); path.lineTo(X(points[b * PT]), Y(points[b * PT + 1])); path.lineTo(X(points[c * PT]), Y(points[c * PT + 1])); path.closePath();
  }
  ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.stroke(faint);
  const alphas = [0.16, 0.3, 0.46];
  levels.forEach((path, i) => { ctx.fillStyle = `rgba(${GREEN},${alphas[i]})`; ctx.fill(path); ctx.strokeStyle = `rgba(150,255,195,${0.45 + i * 0.2})`; ctx.stroke(path); });
}

function drawBody(ctx: CanvasRenderingContext2D, f: ArFrame, X: Project, Y: Project): void {
  const { points } = f; if (!points) return;
  const vis = (i: number): boolean => (points[i * PT + 3] ?? 0) > 0.5; const pt = (i: number): [number, number] => [X(points[i * PT]), Y(points[i * PT + 1])];
  ctx.fillStyle = `rgba(${GREEN},.28)`; ctx.strokeStyle = 'rgba(150,255,195,.9)'; ctx.lineWidth = 1.6;
  for (const [a, b, c] of BODY_TRIS) {
    if (!vis(a) || !vis(b) || !vis(c)) continue;
    const [ax, ay] = pt(a); const [bx, by] = pt(b); const [cx, cy] = pt(c);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
  for (const [a, b] of BODY_EDGES) { if (!vis(a) || !vis(b)) continue; const [ax, ay] = pt(a); const [bx, by] = pt(b); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
  ctx.fillStyle = '#fff';
  for (let i = 0; i < points.length / PT; i++) { if (!vis(i) || (i > 0 && i < 11)) continue; const [x, y] = pt(i); ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill(); }
}

/** A shell of green triangles over the tracked object plus corner brackets, so it is clear which object is being picked up. */
function drawObject(ctx: CanvasRenderingContext2D, f: ArFrame, X: Project, Y: Project, s: number, t: number, reduced: boolean): void {
  const a = f.anchor; if (!a) return;
  const cx = X(a.cx); const cy = Y(a.cy); const rx = a.rx * f.vw * s; const ry = a.ry * f.vh * s;
  const rings = 4; const spokes = 14; const spin = reduced ? 0 : t / 2600;
  const pos = (ring: number, k: number): [number, number] => { const r = ring / rings; const ang = (k / spokes) * Math.PI * 2 + spin * (ring % 2 ? 1 : -1); return [cx + Math.cos(ang) * rx * r, cy + Math.sin(ang) * ry * r]; };
  const pulse = reduced ? 0.5 : (Math.sin(t / 420) + 1) / 2;
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= rings; ring++) {
    for (let k = 0; k < spokes; k++) {
      const p1 = pos(ring, k); const p2 = pos(ring, k + 1); const q1 = pos(ring - 1, k);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(q1[0], q1[1]); ctx.closePath();
      ctx.fillStyle = `rgba(${GREEN},${((k + ring) % 3 === 0 ? 0.26 : 0.12) + pulse * 0.08})`; ctx.fill(); ctx.strokeStyle = 'rgba(150,255,195,.55)'; ctx.stroke();
      if (ring > 1) { const q2 = pos(ring - 1, k + 1); ctx.beginPath(); ctx.moveTo(p2[0], p2[1]); ctx.lineTo(q2[0], q2[1]); ctx.lineTo(q1[0], q1[1]); ctx.closePath(); ctx.fillStyle = `rgba(${GREEN},.1)`; ctx.fill(); ctx.stroke(); }
    }
  }
  // Corner brackets around the detected box.
  const L = Math.min(rx, ry) * 0.42; ctx.strokeStyle = f.found ? '#2EE584' : 'rgba(255,255,255,.75)'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) { const x = cx + sx * rx; const y = cy + sy * ry; ctx.beginPath(); ctx.moveTo(x - sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * L); ctx.stroke(); }
}

/**
 * Top-down "where am I walking" dial: one marker per photo the plan needs (filled and ticked once taken) and a live needle
 * for the subject's current angle to the camera.
 */
export function AngleDial({ views, has, yaw, active, className }: { views: readonly string[]; has: (v: never) => boolean; yaw: number | null; active: string; className?: string }) {
  const R = 30; const C = 40;
  const at = (deg: number, r: number): [number, number] => { const a = (deg * Math.PI) / 180; return [C - Math.sin(a) * r, C + Math.cos(a) * r]; };
  const needle = yaw === null ? null : at(yaw, R - 6);
  return <div className={cn('rounded-full bg-black/55 p-1 backdrop-blur', className)} role="img" aria-label="Angles captured">
    <svg viewBox="0 0 80 80" className="size-[84px]">
      <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1.5" strokeDasharray="3 4"/>
      <circle cx={C} cy={C} r="5" fill="rgba(255,255,255,.85)"/>
      {needle && <line x1={C} y1={C} x2={needle[0]} y2={needle[1]} stroke="#2EE584" strokeWidth="2.5" strokeLinecap="round"/>}
      {views.map(v => { const [x, y] = at(VIEW_TARGET_DEG[v] ?? 0, R); const done = (has as (v: string) => boolean)(v); return <g key={v}>
        <circle cx={x} cy={y} r={done ? 7 : 5.5} fill={done ? '#12A150' : v === active ? '#fff' : 'rgba(255,255,255,.25)'} stroke={v === active && !done ? '#2EE584' : 'none'} strokeWidth="2"/>
        {done && <path d={`M${x - 3},${y} l2.2,2.4 l4,-4.6`} fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>}</g>; })}
    </svg>
  </div>;
}
