import { memo, useEffect, useRef } from 'react';
import { usePreferences } from '@/hooks/use-preferences';

const HEX = '0123456789abcdef';
const hex = (n: number): string => Array.from({ length: n }, () => HEX[Math.floor(Math.random() * 16)]).join('');
const SNIPPETS = ['launchAndBuy()', 'chainId: 4663', 'tris=93,462', 'sha256(mesh)', 'OP-7F3K-92QD', 'burn(0.5%)', 'eth_sendRawTx', 'verts=70,138', 'Ξ 0.00081', 'block #4,812,093', '{ views: 6 }', 'registry.commit()', 'gas 0.02 gwei', 'ObjectRegistered', 'mint(1/1)', 'status: 0x1'];
const SHADE = ' .:-=+*#%@';

interface Star { x: number; y: number; depth: number; phase: number; size: number; }
interface Node { x: number; y: number; label: string; }
interface Constellation { side: 0 | 1; x: number; y: number; nodes: Node[]; edges: [number, number][]; spin: number; }
interface Planet { side: 0 | 1; x: number; y: number; r: number; ring: boolean; speed: number; tilt: number; }
interface Streak { side: 0 | 1; x: number; y: number; vx: number; vy: number; text: string; life: number; }
interface Floater { side: 0 | 1; x: number; y: number; text: string; speed: number; }
interface Spark { x: number; y: number; vx: number; vy: number; ch: string; life: number; }

/**
 * Space-lab atmosphere drawn only in the page's side gutters, never behind content: twinkling stars, constellations
 * whose nodes are tx hashes, ASCII planets, shooting transactions and drifting code. It parallaxes with scroll, lights up
 * under the cursor and bursts into hex on click. One canvas; hidden when the gutters are too narrow.
 */
export const SpaceField = memo(function SpaceField() {
  const canvas = useRef<HTMLCanvasElement>(null); const { reducedMotion } = usePreferences();
  useEffect(() => {
    const el = canvas.current; const ctx = el?.getContext('2d'); if (!el || !ctx) return;
    if (window.innerWidth < 1100) return;
    let w = 0; let h = 0; let gutter = 0; let left = 0; let right = 0; let raf = 0; let alive = true;
    const mouse = { x: -999, y: -999 }; let scroll = window.scrollY; let scrollV = 0;
    let stars: Star[] = []; let cons: Constellation[] = []; let planets: Planet[] = []; const streaks: Streak[] = []; let floaters: Floater[] = []; const sparks: Spark[] = [];
    const gx = (side: 0 | 1, u: number): number => side === 0 ? 12 + u * (gutter - 24) : right + 12 + u * (gutter - 24);
    const measure = () => {
      const nav = document.querySelector('header .glass-nav') ?? document.querySelector('main .page');
      const rect = nav?.getBoundingClientRect(); left = rect ? rect.left : w; right = rect ? rect.right : w; gutter = Math.max(0, Math.min(left, w - right) - 8);
    };
    const seed = () => {
      stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random() * 3, depth: 0.2 + Math.random() * 0.8, phase: Math.random() * 6.28, size: Math.random() < 0.1 ? 2.4 : 1.3 }));
      cons = Array.from({ length: 4 }, (_, k) => { const n = 5 + Math.floor(Math.random() * 3); const nodes = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 0.8, y: (Math.random() - 0.5) * 180, label: `0x${hex(4)}` })); const edges: [number, number][] = nodes.slice(1).map((_, i) => [i, i + 1] as [number, number]); edges.push([0, Math.floor(n / 2)]); return { side: (k % 2) as 0 | 1, x: 0.5, y: 300 + k * 620, nodes, edges, spin: (Math.random() - 0.5) * 0.15 }; });
      planets = [{ side: 0, x: 0.5, y: 520, r: 46, ring: true, speed: 0.35, tilt: 0.35 }, { side: 1, x: 0.55, y: 180, r: 34, ring: false, speed: 0.5, tilt: 0 }, { side: 1, x: 0.45, y: 1100, r: 52, ring: true, speed: 0.25, tilt: -0.3 }, { side: 0, x: 0.5, y: 1500, r: 28, ring: false, speed: 0.6, tilt: 0 }];
      floaters = Array.from({ length: 10 }, (_, i) => ({ side: (i % 2) as 0 | 1, x: Math.random(), y: Math.random() * h, text: SNIPPETS[i % SNIPPETS.length], speed: 8 + Math.random() * 10 }));
    };
    const resize = () => { const dpr = Math.min(window.devicePixelRatio || 1, 2); w = window.innerWidth; h = window.innerHeight; el.width = w * dpr; el.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); measure(); };
    const inGutter = (x: number): boolean => gutter > 60 && (x < left - 4 || x > right + 4);
    const onMove = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onClick = (e: MouseEvent) => { if (!inGutter(e.clientX)) return; for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28; const v = 40 + Math.random() * 120; sparks.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ch: HEX[Math.floor(Math.random() * 16)], life: 1 }); } };
    const onScroll = () => { const y = window.scrollY; scrollV += y - scroll; scroll = y; };

    const planet = (p: Planet, t: number) => {
      const cx = gx(p.side, p.x); const cy = ((p.y - scroll * 0.25) % (h + 400) + h + 400) % (h + 400) - 200; if (cy < -120 || cy > h + 120) return;
      const cell = 7; const r = Math.min(p.r, gutter * 0.38); const near = Math.hypot(mouse.x - cx, mouse.y - cy) < r * 1.8; const rot = t * p.speed * (near ? 3 : 1);
      ctx.font = `700 ${cell + 2}px "Geist Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let yy = -r; yy <= r; yy += cell) for (let xx = -r; xx <= r; xx += cell * 0.8) {
        const d = (xx * xx + yy * yy) / (r * r); if (d > 1) continue; const z = Math.sqrt(1 - d);
        const nx = xx / r; const ny = yy / r; const light = Math.max(0, nx * -0.5 + ny * -0.45 + z * 0.75);
        const band = Math.sin((Math.asin(ny) * 3) + Math.atan2(nx, z) * 2 + rot) * 0.18;
        const k = Math.min(SHADE.length - 1, Math.max(1, Math.floor((light + band + 0.15) * SHADE.length)));
        ctx.fillStyle = `rgba(12,13,16,${near ? 0.75 : 0.5})`; ctx.fillText(SHADE[k], cx + xx, cy + yy);
      }
      if (p.ring) { ctx.strokeStyle = `rgba(12,13,16,${near ? 0.6 : 0.35})`; ctx.setLineDash([3, 5]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.7, r * 0.42, p.tilt, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); const a = t * 0.8; ctx.fillStyle = 'rgba(12,13,16,.7)'; ctx.fillText('Ξ', cx + Math.cos(a) * r * 1.7 * Math.cos(p.tilt) - Math.sin(a) * r * 0.42 * Math.sin(p.tilt), cy + Math.cos(a) * r * 1.7 * Math.sin(p.tilt) + Math.sin(a) * r * 0.42 * Math.cos(p.tilt)); }
    };

    const frame = (now: number) => {
      if (!alive) return; const t = now / 1000; ctx.clearRect(0, 0, w, h); scrollV *= 0.9;
      if (gutter > 60 && !document.hidden) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, left - 4, h); ctx.rect(right + 4, 0, w - right - 4, h); ctx.clip();
        // Stars: parallax by depth, stretched briefly by scroll speed.
        for (const s of stars) { const side: 0 | 1 = s.x < 0.5 ? 0 : 1; const x = gx(side, (s.x % 0.5) * 2); const y = ((s.y * h - scroll * s.depth * 0.5) % (h * 3) + h * 3) % (h * 3); if (y > h) continue; const tw = 0.35 + 0.35 * Math.sin(t * 2 + s.phase); const near = Math.hypot(mouse.x - x, mouse.y - y) < 70; ctx.fillStyle = `rgba(12,13,16,${near ? 0.9 : tw * s.depth})`; const stretch = Math.min(18, Math.abs(scrollV) * 0.3 * s.depth); ctx.fillRect(x, y, s.size, s.size + stretch); if (s.size > 2) { ctx.fillRect(x - 3, y + 0.7, 8.4, 1); ctx.fillRect(x + 0.7, y - 3, 1, 8.4); } }
        // Constellations: nodes are tx hashes, links draw in, labels show near the cursor.
        ctx.font = '700 11px "Geist Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        for (const c of cons) { const cx = gx(c.side, c.x); const cy = ((c.y - scroll * 0.4) % (h + 500) + h + 500) % (h + 500) - 250; const a = t * c.spin; const pts = c.nodes.map(n => { const x = n.x * gutter; return { x: cx + x * Math.cos(a) - n.y * 0.15 * Math.sin(a), y: cy + n.y + x * Math.sin(a) * 0.3, label: n.label }; }); const hot = pts.some(p => Math.hypot(mouse.x - p.x, mouse.y - p.y) < 60);
          ctx.strokeStyle = `rgba(12,13,16,${hot ? 0.55 : 0.22})`; ctx.lineWidth = 1; ctx.beginPath(); for (const [i, j] of c.edges) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); } ctx.stroke();
          pts.forEach((p, i) => { ctx.fillStyle = `rgba(12,13,16,${hot ? 0.95 : 0.6})`; ctx.beginPath(); ctx.arc(p.x, p.y, i === 0 ? 3.2 : 2.2, 0, 6.28); ctx.fill(); if (hot || i === 0) { ctx.fillStyle = `rgba(12,13,16,${hot ? 0.85 : 0.5})`; ctx.fillText(p.label, p.x + 6, p.y - 5); } }); }
        for (const p of planets) planet(p, t);
        // Drifting code, rising slowly; brighter under the cursor.
        ctx.font = '700 12px "Geist Mono", monospace'; ctx.textAlign = 'left';
        for (const f of floaters) { f.y -= f.speed / 60 + scrollV * 0.02; if (f.y < -20) { f.y = h + 20; f.x = Math.random(); f.text = Math.random() < 0.4 ? `0x${hex(4)}…${hex(4)}` : SNIPPETS[Math.floor(Math.random() * SNIPPETS.length)]; } if (f.y > h + 30) f.y = -10; const x = Math.min(gx(f.side, f.x), f.side === 0 ? left - 10 - ctx.measureText(f.text).width : w - 10 - ctx.measureText(f.text).width); const near = Math.hypot(mouse.x - x - 30, mouse.y - f.y) < 60; ctx.fillStyle = `rgba(12,13,16,${near ? 0.9 : 0.42})`; ctx.fillText(f.text, Math.max(8, x), f.y); }
        // Shooting transactions.
        if (Math.random() < 0.012 && streaks.length < 3) { const side: 0 | 1 = Math.random() < 0.5 ? 0 : 1; streaks.push({ side, x: gx(side, Math.random() * 0.3), y: Math.random() * h * 0.6, vx: 140 + Math.random() * 80, vy: 90 + Math.random() * 60, text: `tx 0x${hex(6)} ✓`, life: 1 }); }
        for (let i = streaks.length - 1; i >= 0; i--) { const s = streaks[i]; s.x += s.vx / 60 * (s.side === 1 ? 1 : 0.6); s.y += s.vy / 60; s.life -= 1 / 150; if (s.life <= 0) { streaks.splice(i, 1); continue; } const g = ctx.createLinearGradient(s.x - 60, s.y - 40, s.x, s.y); g.addColorStop(0, 'rgba(12,13,16,0)'); g.addColorStop(1, `rgba(12,13,16,${0.6 * s.life})`); ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(s.x - 60, s.y - 40); ctx.lineTo(s.x, s.y); ctx.stroke(); ctx.fillStyle = `rgba(12,13,16,${0.8 * s.life})`; ctx.font = '700 11px "Geist Mono", monospace'; ctx.fillText(s.text, s.x + 6, s.y + 4); }
        // Click bursts.
        ctx.font = '800 12px "Geist Mono", monospace';
        for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.x += p.vx / 60; p.y += p.vy / 60; p.vx *= 0.96; p.vy *= 0.96; p.life -= 1 / 50; if (p.life <= 0) { sparks.splice(i, 1); continue; } ctx.fillStyle = `rgba(12,13,16,${p.life})`; ctx.fillText(p.ch, p.x, p.y); }
        ctx.restore();
      }
      if (!reducedMotion) raf = requestAnimationFrame(frame);
    };
    resize(); seed();
    const observer = new ResizeObserver(measure); observer.observe(document.body);
    window.addEventListener('resize', resize); window.addEventListener('pointermove', onMove, { passive: true }); window.addEventListener('click', onClick); window.addEventListener('scroll', onScroll, { passive: true });
    const remeasure = window.setInterval(measure, 1500);
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); observer.disconnect(); window.clearInterval(remeasure); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); window.removeEventListener('click', onClick); window.removeEventListener('scroll', onScroll); };
  }, [reducedMotion]);
  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 -z-[1] h-full w-full" aria-hidden="true"/>;
});
