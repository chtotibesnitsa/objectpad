import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Coins, Sparkles, Zap } from 'lucide-react';
import { useInView } from '@/hooks/use-in-view';
import { usePreferences } from '@/hooks/use-preferences';
import { IS_TOUCH } from '@/lib/perf';
import { cn } from '@/lib/utils';

interface Cloud { p: number[]; c: string[] }
interface Pts { n: number; x: Float32Array; y: Float32Array; z: Float32Array; seed: Float32Array; sx: Float32Array; sy: Float32Array; col: string[]; minY: number; maxY: number }
const cache = new Map<string, Promise<Pts>>();

/** Lifts the scan's real colours so a dark hoodie still reads on the dark stage. */
function lift(hex: string): string {
  const v = parseInt(hex.slice(1), 16); const r = (v >> 16) & 255; const g = (v >> 8) & 255; const b = v & 255;
  const f = (c: number) => Math.min(255, Math.round(c * 0.78 + 58));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function load(src: string): Promise<Pts> {
  let hit = cache.get(src);
  if (!hit) {
    hit = fetch(src).then(r => { if (!r.ok) throw new Error('cloud'); return r.json() as Promise<Cloud>; }).then(cloud => {
      const n = Math.floor(cloud.p.length / 3); const x = new Float32Array(n); const y = new Float32Array(n); const z = new Float32Array(n); const seed = new Float32Array(n); const sx = new Float32Array(n); const sy = new Float32Array(n);
      let minY = Infinity; let maxY = -Infinity;
      for (let i = 0; i < n; i++) { x[i] = cloud.p[i * 3]; y[i] = cloud.p[i * 3 + 1]; z[i] = cloud.p[i * 3 + 2]; seed[i] = Math.random(); sx[i] = (Math.random() - 0.5) * 3; sy[i] = (Math.random() - 0.5) * 2.4; if (y[i] < minY) minY = y[i]; if (y[i] > maxY) maxY = y[i]; }
      return { n, x, y, z, seed, sx, sy, col: cloud.c.map(lift), minY, maxY };
    });
    cache.set(src, hit);
  }
  return hit;
}

export const STORY_STEPS = [
  { id: 'capture', icon: Camera, title: 'Three angles', line: 'Front, left, right. Your phone checks light and focus on every shot before it uploads.' },
  { id: 'body', icon: Sparkles, title: 'Your body builds', line: 'The 3D engine infers the rest of you, line by line. You approve it or rebuild it.' },
  { id: 'smash', icon: Zap, title: 'Your chart hits', line: 'Your name and your ticker, fused onto the double you approved.' },
  { id: 'coin', icon: Coins, title: 'Your own coin', line: 'Your face on your own coin. You sign who earns what, in basis points, before launch.' },
] as const;
const STEP_MS = 4800;
const SHOTS = [0.22, 0.5, 0.78];
const YAWS = [-0.62, 0, 0.62];
const GLYPHS = '01#%@+/$▲';
const IMPACT = 0.4;

const ease = (k: number): number => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
const clamp = (v: number): number => Math.min(1, Math.max(0, v));
/** Turns a display name into a 3–6 character ticker; falls back to $YOU. */
export const tickerOf = (name: string): string => { const t = name.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6); return t.length >= 2 ? t : 'YOU'; };

/** Camera yaw during the capture step: settles on each angle just before its shot. */
function captureYaw(k: number): number {
  if (k < SHOTS[0]) return YAWS[0] * ease(k / SHOTS[0]);
  if (k < SHOTS[1]) return YAWS[0] + (YAWS[1] - YAWS[0]) * ease((k - SHOTS[0] - 0.04) / (SHOTS[1] - SHOTS[0] - 0.08));
  if (k < SHOTS[2]) return YAWS[1] + (YAWS[2] - YAWS[1]) * ease((k - SHOTS[1] - 0.04) / (SHOTS[2] - SHOTS[1] - 0.08));
  return YAWS[2];
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; ch: string }

/**
 * The 4-step People story on one 2D canvas (no WebGL): real surface samples from a fictional sample scan, depth-sorted
 * each frame, capped at ~30 fps on phones and paused off screen. DOM overlays are moved through refs, not React state.
 */
export const PeopleStory = memo(function PeopleStory({ name, ticker }: { name: string; ticker: string }) {
  const stage = useRef<HTMLDivElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  const chartCard = useRef<HTMLDivElement>(null); const flash = useRef<HTMLDivElement>(null); const bar = useRef<HTMLSpanElement>(null); const angle = useRef<HTMLSpanElement>(null); const pct = useRef<HTMLSpanElement>(null);
  const thumbs = useRef<(HTMLCanvasElement | null)[]>([]);
  const visible = useInView(stage, '60px'); const { reducedMotion } = usePreferences();
  const [step, setStep] = useState<number>(0); const [shots, setShots] = useState<number>(0); const [hit, setHit] = useState<boolean>(false);
  const clock = useRef<{ step: number; t: number; shots: number; hit: boolean }>({ step: 0, t: 0, shots: 0, hit: false });

  const jump = useCallback((i: number) => { clock.current = { step: i, t: 0, shots: i === 0 ? 0 : 3, hit: i > 2 }; setStep(i); setShots(i === 0 ? 0 : 3); setHit(i > 2); }, []);

  useEffect(() => {
    const el = canvas.current; const ctx = el?.getContext('2d'); if (!el || !ctx) return;
    let body: Pts | null = null; let bust: Pts | null = null; let alive = true; let frame = 0; let last = performance.now(); let lastDraw = 0;
    let order: Uint32Array = new Uint32Array(0); let keys: Float32Array = new Float32Array(0);
    const sparks: Spark[] = [];
    void Promise.all([load('/models/points/human.json'), load('/models/points/human-bust.json')]).then(([b, h]) => { if (!alive) return; body = b; bust = h; draw(performance.now()); }).catch(() => undefined);

    const project = (pts: Pts, yaw: number, cx: number, cy: number, yc: number, scale: number, shock: number, ix: number, iy: number) => {
      if (order.length !== pts.n) { order = new Uint32Array(pts.n); keys = new Float32Array(pts.n); }
      const cos = Math.cos(yaw); const sin = Math.sin(yaw);
      const X = new Float32Array(pts.n); const Y = new Float32Array(pts.n); const P = new Float32Array(pts.n);
      for (let i = 0; i < pts.n; i++) {
        let x = pts.x[i]; let y = pts.y[i]; const z = pts.z[i];
        if (shock > 0) { const dx = x - ix; const dy = y - iy; const d = Math.hypot(dx, dy) + 0.25; const push = shock * 0.22 * (0.6 + pts.seed[i]) / d; x += dx / d * push; y += dy / d * push; }
        const rx = x * cos - z * sin; const rz = x * sin + z * cos; const persp = 1 / (1 - rz * 0.16);
        X[i] = cx + rx * scale * persp; Y[i] = cy - (y - yc) * scale * persp; P[i] = persp; keys[i] = rz; order[i] = i;
      }
      order.sort((a, b) => keys[a] - keys[b]);
      return { X, Y, P };
    };

    const draw = (now: number) => {
      const rect = el.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2);
      const w = Math.max(1, Math.round(rect.width * dpr)); const h = Math.max(1, Math.round(rect.height * dpr));
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
      if (!body || !bust) return;
      const { step: s, t } = clock.current; const k = reducedMotion ? 0.96 : clamp(t / STEP_MS); const time = now / 1000; const dot = Math.max(1.4, 1.9 * dpr * (w < 700 ? 0.85 : 1));
      if (bar.current) bar.current.style.transform = `scaleX(${k})`;
      ctx.font = `800 ${Math.round(9 * dpr)}px "Geist Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

      if (s === 0) {
        const yaw = reducedMotion ? 0 : captureYaw(k); const p = bust; const scale = h * 0.82 / (p.maxY - p.minY); const yc = (p.maxY + p.minY) / 2 - 0.02;
        const { X, Y, P } = project(p, yaw, w / 2, h * 0.5, yc, scale, 0, 0, 0);
        const scanY = h * (0.12 + ((time * 0.35) % 1) * 0.76);
        for (let j = 0; j < p.n; j++) { const i = order[j]; const near = Math.abs(Y[i] - scanY) < 5 * dpr; ctx.globalAlpha = near ? 1 : 0.92; ctx.fillStyle = near ? '#7CFFB2' : p.col[i]; const d = dot * P[i] * (near ? 1.5 : 1); ctx.fillRect(X[i] - d / 2, Y[i] - d / 2, d, d); }
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#2EE584'; ctx.fillRect(w * 0.12, scanY, w * 0.76, Math.max(1, dpr)); ctx.globalAlpha = 1;
        if (angle.current) angle.current.textContent = `${yaw < 0 ? '−' : yaw > 0 ? '+' : '±'}${String(Math.round(Math.abs(yaw) * 57.3)).padStart(2, '0')}°`;
      } else if (s === 1) {
        const p = body; const zoom = ease(k / 0.28); const bs = bust;
        const bustScale = h * 0.82 / (bs.maxY - bs.minY); const bodyScale = h * 0.88 / (p.maxY - p.minY);
        const scale = bustScale + (bodyScale - bustScale) * zoom; const yc = ((bs.maxY + bs.minY) / 2) * (1 - zoom) + ((p.maxY + p.minY) / 2) * zoom;
        const level = 0.5 - ease(clamp((k - 0.14) / 0.74)) * 1.62; const yaw = Math.sin(time * 0.6) * 0.35;
        const { X, Y, P } = project(p, yaw, w / 2, h * 0.5, yc, scale, 0, 0, 0);
        let built = 0;
        for (let j = 0; j < p.n; j++) {
          const i = order[j]; const y = p.y[i];
          if (y >= level + 0.16) { built++; ctx.globalAlpha = 0.95; ctx.fillStyle = p.col[i]; const d = dot * P[i]; ctx.fillRect(X[i] - d / 2, Y[i] - d / 2, d, d); }
          else if (y >= level) { built++; const q = 5 * dpr; ctx.globalAlpha = 0.9; ctx.fillStyle = p.col[i]; ctx.fillRect(Math.round(X[i] / q) * q, Math.round(Y[i] / q) * q, q - 1, q - 1); }
          else if (y >= level - 0.16) { ctx.globalAlpha = 0.55 + p.seed[i] * 0.45; ctx.fillStyle = p.seed[i] > 0.86 ? '#FFFFFF' : '#2EE584'; ctx.fillText(GLYPHS[Math.floor((p.seed[i] * 97 + time * 9) % GLYPHS.length)], X[i] + Math.sin(time * 14 + i) * 1.5 * dpr, Y[i]); }
          else if (p.seed[i] > 0.55) { const m = 0.12 + 0.08 * Math.sin(time + p.seed[i] * 9); ctx.globalAlpha = 0.14; ctx.fillStyle = '#9AA3AE'; const sx = w / 2 + (p.sx[i] + (p.x[i] - p.sx[i]) * m) * scale; const sy = h * 0.5 - (p.sy[i] + (p.y[i] - p.sy[i]) * m - yc) * scale; ctx.fillRect(sx, sy, dpr, dpr); }
        }
        ctx.globalAlpha = 0.8; ctx.fillStyle = '#2EE584'; const ly = h * 0.5 - (level - yc) * scale; ctx.fillRect(w * 0.18, ly, w * 0.64, Math.max(1, dpr * 1.5)); ctx.globalAlpha = 1;
        if (pct.current) pct.current.textContent = `${String(Math.round((built / p.n) * 100)).padStart(2, '0')}%`;
      } else if (s === 2) {
        const p = body; const scale = h * 0.88 / (p.maxY - p.minY); const yc = (p.maxY + p.minY) / 2; const yaw = Math.sin(time * 0.5) * 0.3 + 0.25;
        const since = k - IMPACT; const shock = since > 0 ? Math.exp(-since * 9) : 0;
        const shakeX = shock * Math.sin(time * 90) * 9 * dpr; const shakeY = shock * Math.cos(time * 70) * 5 * dpr;
        const { X, Y, P } = project(p, yaw, w * 0.44 + shakeX, h * 0.5 + shakeY, yc, scale, shock, 0.35, 0.25);
        for (let j = 0; j < p.n; j++) { const i = order[j]; const glitch = shock > 0.25 && p.seed[i] > 0.7; ctx.globalAlpha = 0.95; if (glitch) { ctx.fillStyle = '#2EE584'; ctx.fillText(GLYPHS[Math.floor(p.seed[i] * 50) % GLYPHS.length], X[i], Y[i]); } else { ctx.fillStyle = p.col[i]; const d = dot * P[i]; ctx.fillRect(X[i] - d / 2, Y[i] - d / 2, d, d); } }
        if (!clock.current.hit && k >= IMPACT) { clock.current.hit = true; setHit(true); navigator.vibrate?.(14); const ix = w * 0.6; const iy = h * 0.42; for (let q = 0; q < (IS_TOUCH ? 50 : 90); q++) { const a = Math.random() * Math.PI * 2; const v = (2 + Math.random() * 9) * dpr; sparks.push({ x: ix, y: iy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2 * dpr, life: 1, ch: GLYPHS[q % GLYPHS.length] }); } }
        const card = chartCard.current;
        if (card) { const inK = ease(k / IMPACT); const x = k < IMPACT ? (1 - inK) * 120 : 0; const rot = k < IMPACT ? (1 - inK) * 18 : Math.sin(time * 2) * 1.2; const sc = k < IMPACT ? 1 : 1 - Math.min(0.12, (k - IMPACT) * 0.4); card.style.transform = `translate3d(${x}%, ${k < IMPACT ? -(1 - inK) * 30 : 0}%, 0) rotate(${rot}deg) scale(${sc})`; card.style.opacity = String(clamp(k / 0.08)); }
      } else {
        const p = bust; const R = Math.min(w, h) * 0.3; const cx = w / 2; const cy = h * 0.42;
        const flip = ease(k / 0.34); const spin = (1 - flip) * Math.PI * 3.5; const sx = Math.max(0.04, Math.abs(Math.cos(spin))) * (0.96 + Math.sin(time * 1.6) * 0.04);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, 1);
        const rim = ctx.createLinearGradient(-R, -R, R, R); rim.addColorStop(0, '#FFE58A'); rim.addColorStop(0.45, '#E0B000'); rim.addColorStop(0.7, '#8A6500'); rim.addColorStop(1, '#FFD84A');
        ctx.beginPath(); ctx.arc(0, 0, R * 1.08, 0, Math.PI * 2); ctx.fillStyle = rim; ctx.fill();
        const face = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R); face.addColorStop(0, '#2A2D33'); face.addColorStop(1, '#0B0C0F');
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = face; ctx.fill(); ctx.clip();
        const scale = R * 1.9 / (p.maxY - p.minY); const yc = (p.maxY + p.minY) / 2 + 0.04; const yaw = Math.sin(time * 0.7) * 0.25;
        const { X, Y, P } = project(p, yaw, 0, R * 0.18, yc, scale, 0, 0, 0);
        for (let j = 0; j < p.n; j++) { const i = order[j]; ctx.globalAlpha = 0.95; ctx.fillStyle = p.col[i]; const d = dot * P[i] * 0.95; ctx.fillRect(X[i] - d / 2, Y[i] - d / 2, d, d); }
        ctx.globalAlpha = 0.18; const shine = ctx.createLinearGradient(-R, -R, R, R); shine.addColorStop(0.3, 'rgba(255,255,255,0)'); shine.addColorStop(0.5, 'rgba(255,255,255,1)'); shine.addColorStop(0.7, 'rgba(255,255,255,0)'); ctx.fillStyle = shine; ctx.translate(Math.sin(time * 0.8) * R * 0.8, 0); ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4);
        ctx.restore(); ctx.globalAlpha = 1;
      }
      if (sparks.length) {
        for (let q = sparks.length - 1; q >= 0; q--) { const sp = sparks[q]; sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.25 * dpr; sp.life -= 0.022; if (sp.life <= 0) { sparks.splice(q, 1); continue; } ctx.globalAlpha = sp.life; ctx.fillStyle = q % 3 ? '#2EE584' : '#FFD84A'; ctx.fillText(sp.ch, sp.x, sp.y); }
        ctx.globalAlpha = 1;
      }
    };

    const shoot = (idx: number) => {
      const th = thumbs.current[idx]; const tctx = th?.getContext('2d');
      if (th && tctx) { th.width = 120; th.height = 150; const cw = el.width; const ch = el.height; const side = Math.min(cw * 0.7, ch * 0.9); tctx.fillStyle = '#15171B'; tctx.fillRect(0, 0, 120, 150); tctx.drawImage(el, (cw - side * 0.8) / 2, (ch - side) / 2, side * 0.8, side, 0, 0, 120, 150); }
      const f = flash.current; if (f) { f.classList.remove('story-flash'); void f.offsetWidth; f.classList.add('story-flash'); }
      navigator.vibrate?.(8);
    };

    const loop = (now: number) => {
      if (!alive) return; const dt = Math.min(64, now - last); last = now;
      if (visible && !reducedMotion) {
        const c = clock.current; c.t += dt;
        if (c.step === 0) { const k = c.t / STEP_MS; while (c.shots < 3 && k >= SHOTS[c.shots]) { shoot(c.shots); c.shots++; setShots(c.shots); } }
        if (c.t >= STEP_MS) { c.step = (c.step + 1) % 4; c.t = 0; if (c.step === 0) { c.shots = 0; setShots(0); } if (c.step === 2) { c.hit = false; setHit(false); } setStep(c.step); }
      }
      if (!IS_TOUCH || now - lastDraw > 32) { draw(now); lastDraw = now; }
      if (visible) frame = requestAnimationFrame(loop);
    };
    if (reducedMotion) { const i = window.setInterval(() => draw(performance.now()), 400); return () => { alive = false; window.clearInterval(i); }; }
    frame = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [visible, reducedMotion]);

  const cur = STORY_STEPS[step];
  return <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
    <div className="order-2 lg:order-1">
      <ol className="grid gap-2">
        {STORY_STEPS.map((st, i) => { const on = i === step; return <li key={st.id}><button type="button" onClick={() => jump(i)} aria-current={on ? 'step' : undefined} className={cn('press group relative w-full overflow-hidden rounded-[22px] p-4 text-left transition-colors', on ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]')}>
          <div className="flex items-center gap-3.5">
            <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl font-mono text-[13px] font-extrabold transition-colors', on ? 'bg-[#2EE584] text-ink' : 'bg-white/[0.07] text-white/55')}>{on ? <st.icon size={19}/> : `0${i + 1}`}</span>
            <div className="min-w-0 flex-1"><p className={cn('text-[17px] font-extrabold tracking-[-0.02em]', on ? 'text-white' : 'text-white/55')}>{st.title}</p>{on && <p className="slide-in mt-1 text-[13.5px] font-semibold leading-5 text-white/60">{st.line}</p>}</div>
          </div>
          {on && <span className="absolute inset-x-4 bottom-0 h-[2px] overflow-hidden rounded-full bg-white/10"><span ref={bar} className="block h-full origin-left bg-[#2EE584]" style={{ transform: 'scaleX(0)' }}/></span>}
        </button></li>; })}
      </ol>
    </div>

    <div ref={stage} className="order-1 relative mx-auto aspect-[4/5] w-full max-w-[560px] overflow-hidden rounded-[32px] bg-[#0B0C0F] shadow-[0_0_0_1px_rgba(255,255,255,.07),0_40px_80px_-40px_rgba(46,229,132,.35)] lg:order-2 lg:max-w-none lg:aspect-[5/4]">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_45%,#343942,transparent_75%)]"/>
      <div aria-hidden className="grid-smoke absolute inset-0 opacity-40"/>
      <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full"/>
      <div ref={flash} aria-hidden className="pointer-events-none absolute inset-0 bg-white opacity-0"/>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,.025)_0_1px,transparent_1px_3px)]"/>

      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 font-mono text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-white/70 backdrop-blur"><span className="size-1.5 animate-pulse rounded-full bg-[#2EE584]"/>Step 0{step + 1} · {cur.title}</div>
      <p className="absolute bottom-3 right-4 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/30">Fictional sample scan · illustration</p>

      {step === 0 && <>
        <div aria-hidden className="pointer-events-none absolute inset-[12%_18%]">{['left-0 top-0 border-l-2 border-t-2 rounded-tl-2xl', 'right-0 top-0 border-r-2 border-t-2 rounded-tr-2xl', 'left-0 bottom-0 border-l-2 border-b-2 rounded-bl-2xl', 'right-0 bottom-0 border-r-2 border-b-2 rounded-br-2xl'].map(c => <span key={c} className={cn('absolute size-8 border-[#2EE584]', c)}/>)}</div>
        <div className="absolute right-4 top-4 rounded-full bg-black/50 px-3 py-1.5 font-mono text-[11px] font-extrabold text-[#2EE584] backdrop-blur">YAW <span ref={angle}>±00°</span></div>
        <div className="absolute inset-x-0 bottom-9 flex justify-center gap-2">{['Left', 'Front', 'Right'].map((l, i) => <div key={l} className={cn('relative h-[74px] w-[58px] overflow-hidden rounded-xl bg-white/[0.06] shadow-[0_0_0_1.5px_rgba(255,255,255,.12)] transition-all duration-300 sm:h-[92px] sm:w-[72px]', shots > i && 'shadow-[0_0_0_2px_#2EE584] [animation:slot-pop_.4s_both]')}>
          <canvas ref={el => { thumbs.current[i] = el; }} className={cn('size-full object-cover transition-opacity', shots > i ? 'opacity-100' : 'opacity-0')}/>
          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center font-mono text-[9px] font-extrabold uppercase text-white/80">{shots > i ? '✓ ' : ''}{l}</span>
        </div>)}</div>
      </>}

      {step === 1 && <div className="absolute right-4 top-4 rounded-2xl bg-black/55 px-3.5 py-2.5 text-right backdrop-blur"><p className="font-mono text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-white/50">Generating body</p><p className="display text-[30px] leading-none text-[#2EE584] tnum"><span ref={pct}>00%</span></p></div>}

      {step === 2 && <div ref={chartCard} className="absolute right-[4%] top-[18%] w-[46%] max-w-[250px] rounded-[20px] bg-white/[0.08] p-3.5 text-white opacity-0 shadow-[0_0_0_1px_rgba(255,255,255,.14),0_30px_60px_-20px_rgba(0,0,0,.8)] backdrop-blur-md will-change-transform">
        <p className="truncate text-[12px] font-bold text-white/60">{name || 'Your name'}</p>
        <p className="display text-[26px] leading-none">${ticker}</p>
        <svg viewBox="0 0 200 80" className="mt-2 w-full" aria-hidden><defs><linearGradient id="story-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2EE584" stopOpacity=".45"/><stop offset="1" stopColor="#2EE584" stopOpacity="0"/></linearGradient></defs><path d="M0 70 L20 64 L36 66 L52 52 L70 56 L88 40 L104 44 L122 28 L140 34 L158 18 L178 22 L200 8 L200 80 L0 80Z" fill="url(#story-fill)"/><path d="M0 70 L20 64 L36 66 L52 52 L70 56 L88 40 L104 44 L122 28 L140 34 L158 18 L178 22 L200 8" fill="none" stroke="#2EE584" strokeWidth="3" strokeLinejoin="round"/></svg>
        {hit && <p className="mt-1.5 font-mono text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-[#2EE584] [animation:stamp_.5s_both]">Fused · approved double</p>}
      </div>}

      {step === 3 && <div className="absolute inset-x-0 bottom-9 flex flex-col items-center px-4">
        <p className="display text-[clamp(30px,6vw,46px)] leading-none text-white [animation:fuse-born_.6s_both]">${ticker}</p>
        <p className="mt-1 max-w-[80%] truncate text-[13px] font-bold text-white/55">{name || 'Your name'} · your own coin</p>
        <svg key={ticker} viewBox="0 0 300 50" className="mt-3 w-[72%] max-w-[320px]" aria-hidden><path d="M0 44 L25 40 L45 42 L70 30 L95 34 L120 22 L150 26 L175 14 L205 18 L230 8 L260 12 L300 2" fill="none" stroke="#FFD84A" strokeWidth="3" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset="1" style={{ animation: 'chart-draw 1.6s .3s cubic-bezier(.2,.8,.2,1) forwards' }}/></svg>
      </div>}
    </div>
  </div>;
});
