import { memo, useEffect, useRef } from 'react';
import { usePreferences } from '@/hooks/use-preferences';
import { useInView } from '@/hooks/use-in-view';
import { IS_TOUCH } from '@/lib/perf';
import { cn } from '@/lib/utils';

/** A surface sample: position, surface normal (both normalised to a ~2-unit tall figure). */
interface Cloud { p: Float32Array; n: Float32Array; count: number }
/** What the parent receives when a point on the figure is tapped. */
export interface Probe { index: number; x: number; y: number; z: number; sx: number; sy: number }

const RAMP = ' .·:-=+*≡#%@';
const DUST = ['▲', '△', '◢', '◣', '◤', '◥', '·', '/', '\\', '0', '1'];

/** Procedural stand-in (head, neck, shoulders) used until / unless a real scan loads. */
function proceduralCloud(count: number): Cloud {
  const p = new Float32Array(count * 3); const n = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const part = i / count; let x = 0; let y = 0; let z = 0; let nx = 0; let ny = 0; let nz = 0;
    const u = Math.random() * Math.PI * 2; const v = Math.acos(2 * Math.random() - 1);
    if (part < 0.62) {
      nx = Math.sin(v) * Math.cos(u); ny = Math.cos(v); nz = Math.sin(v) * Math.sin(u);
      x = nx * 0.46; y = 0.42 + ny * 0.6; z = nz * 0.52;
      if (nz > 0.55 && Math.abs(nx) < 0.14 && ny > -0.25 && ny < 0.15) z += 0.1 * (1 - Math.abs(nx) / 0.14);
      if (ny < -0.3) { x *= 0.86 + (ny + 1) * 0.1; }
    } else if (part < 0.72) {
      const a = Math.random() * Math.PI * 2; const h = Math.random(); nx = Math.cos(a); nz = Math.sin(a);
      x = nx * 0.22; z = nz * 0.24; y = -0.2 - h * 0.34;
    } else {
      nx = Math.sin(v) * Math.cos(u); ny = Math.cos(v); nz = Math.sin(v) * Math.sin(u);
      if (ny < 0) ny = -ny * 0.2;
      x = nx * 0.98; y = -0.62 + ny * 0.28 - 0.12; z = nz * 0.34;
    }
    p.set([x, y, z], i * 3); n.set([nx, ny, nz], i * 3);
  }
  return { p, n, count };
}

const cache = new Map<string, Promise<Cloud>>();
/** Samples a GLB's surfaces (area-weighted) into a point cloud, centred and scaled to a 2-unit tall figure. */
function loadCloud(src: string, count: number): Promise<Cloud> {
  const key = `${src}|${count}`; const hit = cache.get(key); if (hit) return hit;
  const job = (async () => {
    const [{ GLTFLoader }, { MeshSurfaceSampler }, THREE] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/math/MeshSurfaceSampler.js'), import('three')]);
    const gltf = await new GLTFLoader().loadAsync(src); gltf.scene.updateMatrixWorld(true);
    const meshes: { mesh: InstanceType<typeof THREE.Mesh>; area: number }[] = [];
    gltf.scene.traverse(o => { const m = o as InstanceType<typeof THREE.Mesh>; if (m.isMesh && m.geometry) { const g = m.geometry; const idx = g.index; const tris = (idx ? idx.count : g.attributes.position.count) / 3; meshes.push({ mesh: m, area: tris }); } });
    if (!meshes.length) throw new Error('empty model');
    const total = meshes.reduce((s, m) => s + m.area, 0);
    const p = new Float32Array(count * 3); const n = new Float32Array(count * 3); const pos = new THREE.Vector3(); const nor = new THREE.Vector3(); const normalMatrix = new THREE.Matrix3(); let k = 0;
    for (const { mesh, area } of meshes) {
      const take = Math.round((area / total) * count); const sampler = new MeshSurfaceSampler(mesh).build(); normalMatrix.getNormalMatrix(mesh.matrixWorld);
      for (let i = 0; i < take && k < count; i++, k++) { sampler.sample(pos, nor); pos.applyMatrix4(mesh.matrixWorld); nor.applyMatrix3(normalMatrix).normalize(); p.set([pos.x, pos.y, pos.z], k * 3); n.set([nor.x, nor.y, nor.z], k * 3); }
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < k; i++) { const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const s = 2 / Math.max(maxY - minY, maxX - minX, 1e-6); const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    for (let i = 0; i < k; i++) { p[i * 3] = (p[i * 3] - cx) * s; p[i * 3 + 1] = (p[i * 3 + 1] - cy) * s; p[i * 3 + 2] = (p[i * 3 + 2] - cz) * s; }
    return { p, n, count: k } satisfies Cloud;
  })();
  cache.set(key, job); job.catch(() => cache.delete(key)); return job;
}

/**
 * A human figure drawn as shaded ASCII glyphs on a 2D canvas. The back of the figure continuously erodes into
 * drifting triangle "dust"; a scan plane sweeps the body; dragging rotates it and tapping sends a shockwave through
 * the nearest points and reports the probed landmark to `onProbe`.
 */
export const AsciiHuman = memo(function AsciiHuman({ src, className, onProbe, points }: { src?: string; className?: string; onProbe?: (p: Probe) => void; points?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null); const { reducedMotion } = usePreferences(); const visible = useInView(canvas, '80px');
  const probeRef = useRef(onProbe); probeRef.current = onProbe;
  useEffect(() => {
    const el = canvas.current; const ctx = el?.getContext('2d'); if (!el || !ctx) return;
    const count = points ?? (IS_TOUCH ? 1700 : 3200);
    let cloud: Cloud = proceduralCloud(count); let alive = true; let frame = 0; let last = 0;
    let off = new Float32Array(cloud.count * 2); let vel = new Float32Array(cloud.count * 2);
    const seed = new Float32Array(cloud.count).map(() => Math.random());
    if (src) void loadCloud(src, count).then(c => { if (!alive) return; cloud = c; off = new Float32Array(c.count * 2); vel = new Float32Array(c.count * 2); }).catch(() => undefined);
    let yaw = 0.5; let pitch = 0.06; let spin = 0.22; let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    const rings: { x: number; y: number; t: number }[] = []; const start = performance.now();
    const proj = new Float32Array(count * 4); // sx, sy, depth, shade
    const view = () => { const r = el.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); return { r, dpr }; };

    const draw = (now: number) => {
      const { r, dpr } = view(); const w = Math.max(1, Math.round(r.width * dpr)); const h = Math.max(1, Math.round(r.height * dpr));
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      const t = (now - start) / 1000; if (!drag && !reducedMotion) yaw += spin * 0.016;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
      const scale = Math.min(w * 0.46, h * 0.44); const cx = w / 2; const cy = h / 2;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const fs = Math.max(7, Math.round((IS_TOUCH ? 8.5 : 9.5) * dpr * Math.min(1.25, scale / (300 * dpr))));
      ctx.font = `600 ${fs}px 'Geist Mono', ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const erosion = reducedMotion ? 0.35 : 0.2 + 0.28 * (0.5 + 0.5 * Math.sin(t * 0.35));
      const scanY = reducedMotion ? 2 : 1.15 - ((t * 0.45) % 2.6);
      const order: number[] = [];
      for (let i = 0; i < cloud.count; i++) {
        const x = cloud.p[i * 3], y = cloud.p[i * 3 + 1], z = cloud.p[i * 3 + 2];
        const rx = x * cyw - z * syw; const rz0 = x * syw + z * cyw; const ry = y * cp - rz0 * sp; const rz = y * sp + rz0 * cp;
        const nx = cloud.n[i * 3], ny = cloud.n[i * 3 + 1], nz = cloud.n[i * 3 + 2];
        const nrz0 = nx * syw + nz * cyw; const nrx = nx * cyw - nz * syw; const nry = ny * cp - nrz0 * sp; const nrz = ny * sp + nrz0 * cp;
        const light = Math.max(0, nrx * -0.45 + nry * 0.55 + nrz * 0.7);
        const persp = 1 / (1 - rz * 0.16);
        let sx = cx + rx * scale * persp; let sy = cy - ry * scale * persp;
        // Dust: points on the figure's trailing side (in model space) peel off and drift up-right as triangles.
        const edge = -x * 0.9 + y * 0.35 + seed[i] * 0.25; const d = edge - (1 - erosion * 2.2);
        let dust = 0;
        if (d > 0) { dust = Math.min(1, d * 1.6); const life = (t * (0.18 + seed[i] * 0.2) + seed[i]) % 1; const k = dust * (0.35 + life * 1.4); sx += (0.6 + seed[i]) * k * scale * 0.55; sy -= (0.25 + seed[i] * 0.5) * k * scale * 0.4 + Math.sin(t * 2 + i) * 3 * dpr * dust; }
        sx += off[i * 2]; sy += off[i * 2 + 1];
        // A negative shade marks a dust particle.
        proj[i * 4] = sx; proj[i * 4 + 1] = sy; proj[i * 4 + 2] = rz; proj[i * 4 + 3] = dust > 0 ? -dust : light;
        order.push(i);
      }
      order.sort((a, b) => proj[a * 4 + 2] - proj[b * 4 + 2]);
      for (const i of order) {
        const sx = proj[i * 4], sy = proj[i * 4 + 1], rz = proj[i * 4 + 2], sh = proj[i * 4 + 3];
        const y = cloud.p[i * 3 + 1];
        if (sh < 0) { const a = (1 + sh) * 0.8; if (a <= 0.02) continue; ctx.globalAlpha = a; ctx.fillStyle = seed[i] > 0.93 ? '#12A150' : '#ECEEF1'; ctx.fillText(DUST[(i + Math.floor(t * 3)) % DUST.length], sx, sy); continue; }
        const facing = 0.35 + 0.65 * Math.max(0, Math.min(1, (rz + 1) / 2));
        const inScan = Math.abs(y - scanY) < 0.035;
        const glyph = inScan ? '█' : RAMP[Math.min(RAMP.length - 1, Math.max(1, Math.round(sh * (RAMP.length - 1))))];
        ctx.globalAlpha = inScan ? 1 : 0.25 + 0.75 * facing * (0.35 + sh * 0.65);
        ctx.fillStyle = inScan ? '#FFFFFF' : '#ECEEF1';
        ctx.fillText(glyph, sx, sy);
      }
      // Springs pull shocked points home.
      for (let i = 0; i < cloud.count * 2; i++) { vel[i] = (vel[i] - off[i] * 0.06) * 0.88; off[i] += vel[i]; }
      ctx.globalAlpha = 1;
      for (let k = rings.length - 1; k >= 0; k--) {
        const g = rings[k]; const age = (now - g.t) / 900; if (age > 1) { rings.splice(k, 1); continue; }
        ctx.strokeStyle = `rgba(18,161,80,${1 - age})`; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.arc(g.x, g.y, age * 120 * dpr, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(236,238,241,${0.6 * (1 - age)})`; ctx.beginPath(); for (let s = 0; s < 3; s++) { const a = -Math.PI / 2 + s * (Math.PI * 2 / 3) + age; const rr = 26 * dpr + age * 50 * dpr; const px = g.x + Math.cos(a) * rr, py = g.y + Math.sin(a) * rr; if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.stroke();
      }
    };
    const loop = (now: number) => { if (!alive) return; if (!IS_TOUCH || now - last > 30) { draw(now); last = now; } if (visible && !reducedMotion) frame = requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop); if (reducedMotion) draw(performance.now());

    const local = (e: PointerEvent) => { const { r, dpr } = view(); return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr, dpr }; };
    const down = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; };
    const move = (e: PointerEvent) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; yaw = drag.yaw + dx * 0.008; pitch = Math.max(-0.5, Math.min(0.5, drag.pitch + dy * 0.004)); };
    const up = (e: PointerEvent) => {
      const was = drag; drag = null; if (!was || was.moved) return;
      const { x, y, dpr } = local(e); rings.push({ x, y, t: performance.now() });
      let best = -1; let bestD = Infinity;
      for (let i = 0; i < cloud.count; i++) {
        const dx = proj[i * 4] - x, dy = proj[i * 4 + 1] - y; const d2 = dx * dx + dy * dy;
        if (d2 < (140 * dpr) ** 2) { const d = Math.sqrt(d2) || 1; const f = (1 - d / (140 * dpr)) * 26 * dpr; vel[i * 2] += (dx / d) * f; vel[i * 2 + 1] += (dy / d) * f; }
        if (proj[i * 4 + 3] >= 0 && d2 < bestD) { bestD = d2; best = i; }
      }
      spin = 0.22 + Math.random() * 0.1;
      if (best >= 0) probeRef.current?.({ index: best, x: cloud.p[best * 3], y: cloud.p[best * 3 + 1], z: cloud.p[best * 3 + 2], sx: x / dpr, sy: y / dpr });
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => { drag = null; });
    return () => { alive = false; cancelAnimationFrame(frame); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
  }, [src, reducedMotion, visible, points]);
  return <canvas ref={canvas} className={cn('block h-full w-full cursor-crosshair touch-none select-none', className)} aria-label="Interactive ASCII 3D human. Drag to rotate, tap to probe a landmark."/>;
});
