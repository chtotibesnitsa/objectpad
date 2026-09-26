import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronRight, Loader2, Timer, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Feedback } from './feedback';
import { countdownOf, Fmt } from './format';
import type { Reward } from '@/lib/rewards';

export const PAD = { paper: '#ECEEF1', pearl: '#F8F9FA', ink: '#0C0D10', graphite: '#1B1D22', muted: '#6A6E78', up: '#12A150', down: '#E5484D', sky: '#2F7BF2', skyLight: '#6FB2FF', amber: '#F59E0B', gold: '#F5C542', goldInk: '#3A2A05' } as const;
export const img = (name: string): string => `/app/img/${name}.webp`;

export function Lab({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) { return <p className={cn('ap-lab text-ink/55', className)} style={style}>{children}</p>; }
export function Display({ children, size = 34, className, style }: { children: ReactNode; size?: number; className?: string; style?: CSSProperties }) { return <h2 className={cn('ap-display whitespace-pre-line text-ink', className)} style={{ fontSize: size, ...style }}>{children}</h2>; }

/** Staggered entrance (the iOS `.enter(delay)`). */
export function Enter({ delay = 0, children, className, as = 'div' }: { delay?: number; children: ReactNode; className?: string; as?: 'div' | 'section' }) { const T = as; return <T className={cn('ap-enter', className)} style={{ ['--d' as string]: `${delay}s` }}>{children}</T>; }

type Kind = 'ink' | 'pearl' | 'sky' | 'up' | 'down' | 'ghost';
const KIND: Record<Kind, string> = { ink: 'bg-ink text-white shadow-[0_8px_14px_-4px_rgba(12,13,16,.25)] ring-1 ring-white/10', pearl: 'bg-white text-ink ring-1 ring-ink/10', sky: 'bg-[#2F7BF2] text-white shadow-[0_8px_14px_-2px_rgba(47,123,242,.45)] ring-1 ring-white/10', up: 'bg-[#12A150] text-white ring-1 ring-white/10', down: 'bg-[#E5484D] text-white ring-1 ring-white/10', ghost: 'bg-ink/[0.07] text-ink' };
export function PadButton({ title, icon: Icon, kind = 'ink', busy = false, enabled = true, height = 56, onClick, className, sound = true }: { title: string; icon?: LucideIcon; kind?: Kind; busy?: boolean; enabled?: boolean; height?: number; onClick: () => void; className?: string; sound?: boolean }) {
  return <button type="button" disabled={!enabled || busy} onPointerDown={() => enabled && !busy && Feedback.tap(sound)} onClick={onClick} className={cn('ap-press flex w-full items-center justify-center gap-2 rounded-full px-4 text-[15.5px] font-extrabold', KIND[kind], !enabled && 'opacity-40', className)} style={{ minHeight: height }}>
    {busy ? <Loader2 size={17} className="ap-spin"/> : Icon ? <Icon size={17} strokeWidth={2.6}/> : null}<span className="truncate">{title}</span>
  </button>;
}
export function CircleIconButton({ icon: Icon, dark = false, size = 44, onClick, label, className }: { icon: LucideIcon; dark?: boolean; size?: number; onClick: () => void; label: string; className?: string }) {
  return <button type="button" aria-label={label} onPointerDown={() => Feedback.tap()} onClick={onClick} className={cn('ap-press flex shrink-0 items-center justify-center rounded-full', dark ? 'ap-glass-dark text-white' : 'ap-glass text-ink', className)} style={{ width: size, height: size }}><Icon size={size * 0.4} strokeWidth={2.5}/></button>;
}
/** Selectable pill used for filters and sorts. */
export function Pill({ title, icon: Icon, on, accent = PAD.ink, onClick }: { title: string; icon?: LucideIcon; on: boolean; accent?: string; onClick: () => void }) {
  return <button type="button" onClick={() => { Feedback.selection(); onClick(); }} className="ap-press ap-quiet flex h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[15px] text-[13px] font-extrabold transition-[background,box-shadow,color] duration-300" style={{ background: on ? accent : '#fff', color: on ? '#fff' : 'rgba(12,13,16,.7)', boxShadow: on ? `0 6px 10px -2px ${accent}59` : '0 1px 2px rgba(12,13,16,.05)' }}>{Icon && <Icon size={11} strokeWidth={3}/>}{title}</button>;
}
/** Segmented control on an ink track with a sliding white thumb. */
export function InkSegmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  const index = Math.max(0, options.findIndex(o => o[0] === value));
  return <div className="relative flex gap-1 rounded-[18px] bg-ink p-1">
    <span className="absolute bottom-1 top-1 rounded-[14px] bg-white transition-transform duration-[400ms] [transition-timing-function:cubic-bezier(.34,1.3,.64,1)]" style={{ left: 4, width: `calc((100% - 8px - ${(options.length - 1) * 4}px) / ${options.length})`, transform: `translateX(calc(${index * 100}% + ${index * 4}px))` }}/>
    {options.map(([v, l]) => <button key={v} type="button" onClick={() => { Feedback.selection(); onChange(v); }} className={cn('relative z-10 min-h-10 flex-1 truncate px-1 text-[13px] font-extrabold transition-colors', v === value ? 'text-ink' : 'text-white/70')}>{l}</button>)}
  </div>;
}
export function PulseDot({ color = PAD.up, size = 7 }: { color?: string; size?: number }) { return <span className="ap-pulse-dot" style={{ width: size, height: size, background: color }}/>; }

export function useNow(interval = 1000): number { const [now, setNow] = useState<number>(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(t); }, [interval]); return now; }
/** Deadline pill that ticks every second; urgent (< 24h) pulses red, soon (< 3d) is amber. */
export function CountdownPill({ deadline, big = false }: { deadline: number | null | undefined; big?: boolean }) {
  const now = useNow(); const c = countdownOf(deadline, now);
  const bg = c.tier === 'urgent' ? PAD.down : c.tier === 'soon' ? PAD.amber : `rgba(12,13,16,${c.tier === 'ended' ? 0.6 : 0.8})`; const fg = c.tier === 'soon' ? PAD.ink : '#fff';
  return <span className="inline-flex items-center gap-1.5 rounded-full" style={{ background: bg, color: fg, padding: big ? '7px 12px' : '5px 9px', boxShadow: c.tier === 'urgent' ? `0 0 12px ${PAD.down}99` : undefined }}>
    {c.tier === 'urgent' ? <PulseDot color="#fff" size={6}/> : <Timer size={big ? 13 : 10} strokeWidth={3}/>}<span className="ap-mono ap-num font-extrabold uppercase" style={{ fontSize: big ? 13 : 10.5 }}>{c.label}</span>
  </span>;
}
/** Text that rolls to its new value. */
export function Rolling({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) { return <span className={cn('ap-num inline-block overflow-hidden', className)} style={style}><span key={text} className="ap-roll">{text}</span></span>; }

export function Shimmer({ className, style }: { className?: string; style?: CSSProperties }) { return <div className={cn('ap-shimmer', className)} style={style}/>; }
/** Remote image with a soft shimmer placeholder and a monogram fallback. */
export const RemoteImage = memo(function RemoteImage({ src, fallback = '', className, fit = 'cover' }: { src?: string | null; fallback?: string; className?: string; fit?: 'cover' | 'contain' }) {
  const [state, setState] = useState<'load' | 'ok' | 'fail'>(src ? 'load' : 'fail');
  useEffect(() => setState(src ? 'load' : 'fail'), [src]);
  return <div className={cn('relative size-full overflow-hidden', className)}>
    {state === 'load' && <Shimmer className="absolute inset-0"/>}
    {state === 'fail' ? <div className="flex size-full items-center justify-center bg-gradient-to-b from-[#DADDE3] to-[#ECEEF1]"><span className="ap-mono text-[12px] font-extrabold uppercase text-[#6A6E78]">{fallback.slice(0, 3)}</span></div>
      : <img src={src ?? ''} alt="" draggable={false} loading="lazy" decoding="async" onLoad={() => setState('ok')} onError={() => setState('fail')} className={cn('size-full transition-opacity duration-300', fit === 'cover' ? 'object-cover' : 'object-contain', state === 'ok' ? 'opacity-100' : 'opacity-0')}/>}
  </div>;
});
export function CoinAvatar({ url, symbol = '', size = 48 }: { url?: string | null; symbol?: string; size?: number }) {
  return <span className="block shrink-0 overflow-hidden bg-white shadow-[inset_0_0_0_1px_rgba(12,13,16,.08)]" style={{ width: size, height: size, borderRadius: size * 0.3 }}><RemoteImage src={url} fallback={symbol}/></span>;
}
export function GlassIcon({ name, size = 44, float = false, className }: { name: string; size?: number; float?: boolean; className?: string }) { return <img src={img(name)} alt="" draggable={false} className={cn('shrink-0 object-contain', float && 'ap-float', className)} style={{ width: size, height: size }}/>; }

/** Drifting voxel cubes with binary glyphs: the "object dissolving into data" motif, drawn on canvas. */
export const VoxelField = memo(function VoxelField({ count = 22, seed = 1, color = '#ffffff', className }: { count?: number; seed?: number; color?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; const g = canvas.getContext('2d'); if (!g) return; let frame = 0; let last = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (ms: number) => {
      frame = requestAnimationFrame(draw); if (ms - last < 33) return; last = ms;
      const dpr = Math.min(2, window.devicePixelRatio || 1); const w = canvas.clientWidth; const h = canvas.clientHeight; if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const t = reduce ? 0 : ms / 1000; let s = BigInt(seed * 9301 + 49297);
      const rnd = () => { s = (s * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn; return Number(s >> 33n) / 2 ** 31; };
      for (let i = 0; i < count; i++) {
        const x = rnd() * w, base = rnd() * h, side = 6 + rnd() * 14, speed = 6 + rnd() * 14, phase = rnd() * 10; const span = h + 40;
        const y = ((base - (t * speed) % span + span) % span) - 20; const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.3 + phase));
        g.globalAlpha = alpha * 0.55; g.fillStyle = color; g.beginPath(); g.roundRect(x, y, side, side, 2); g.fill();
        g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = 0.8; g.stroke();
        if (side > 12) { g.font = `900 ${side * 0.6}px ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(['0', '1', '#'][Math.floor(phase * 10) % 3], x + side / 2, y + side / 2 + 0.5); }
      }
      g.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, [count, seed, color]);
  return <canvas ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 size-full', className)}/>;
});
/** Drifting cloud blobs for sky backgrounds. */
export const CloudDrift = memo(function CloudDrift({ className, style }: { className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; const g = canvas.getContext('2d'); if (!g) return; let frame = 0; let last = 0;
    const draw = (ms: number) => {
      frame = requestAnimationFrame(draw); if (ms - last < 50) return; last = ms;
      const w = canvas.clientWidth; const h = canvas.clientHeight; if (!w || !h) return; if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      g.clearRect(0, 0, w, h); g.filter = 'blur(18px)'; g.fillStyle = 'rgba(255,255,255,.55)'; const t = ms / 1000;
      for (let i = 0; i < 6; i++) { const x = ((i * 97 + t * (6 + i * 2)) % (w + 200)) - 100; const y = h * (0.15 + 0.13 * i); g.beginPath(); g.ellipse(x + (75 + i * 10), y + (25 + i * 3), 75 + i * 10, 25 + i * 3, 0, 0, Math.PI * 2); g.fill(); }
      g.filter = 'none';
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={ref} aria-hidden="true" className={cn('pointer-events-none absolute inset-0 size-full', className)} style={style}/>;
});
export function ScanSweep() { return <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="ap-sweep"/></div>; }

/** A bounty's cover: the real image, or a live-drawn sky poster. */
export function SkyPoster({ reward, big = false, reveal = true }: { reward: Pick<Reward, 'id' | 'image' | 'coverState' | 'object' | 'rewardUsd'>; big?: boolean; reveal?: boolean }) {
  const painting = reward.coverState === 'generating'; const src = reward.image && !painting ? (reward.image.startsWith('http') ? reward.image : `https://www.objectpad.fun${reward.image}`) : null;
  const seed = useMemo(() => Math.abs([...reward.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 999), [reward.id]);
  return <div className="ap-sky relative size-full overflow-hidden">
    {src ? <div className="absolute inset-0" style={{ filter: reveal ? undefined : 'blur(30px)' }}><RemoteImage src={src}/></div> : <>
      <CloudDrift/>
      <div className="absolute inset-0" style={{ maskImage: 'linear-gradient(90deg, transparent, #000)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000)' }}><VoxelField count={big ? 26 : 14} seed={seed}/></div>
      <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingLeft: big ? 20 : 14, gap: big ? 8 : 4 }}>
        <p className="ap-display line-clamp-3 uppercase text-white drop-shadow-[0_3px_8px_rgba(0,60,200,.4)]" style={{ fontSize: big ? 30 : 18 }}>First {reward.object} scan: {Fmt.money(reward.rewardUsd)}</p>
        <p className="ap-mono font-extrabold text-white/95" style={{ fontSize: big ? 12 : 9 }}>REWARDS ONLY GO UP.</p>
        <p className="ap-display text-white" style={{ fontSize: big ? 22 : 14 }}>objectpad.fun</p>
      </div>
      {painting && <><span className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-ink/65 px-2.5 py-1.5 text-white"><Loader2 size={11} className="ap-spin"/><span className="ap-mono text-[10px] font-extrabold">AI PAINTING</span></span><ScanSweep/></>}
    </>}
    {!reveal && <span className="ap-glass absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-3.5 py-2 ap-mono text-[12px] font-extrabold text-white">18+ · TAP TO VIEW</span>}
  </div>;
}
export function RewardStatusPill({ reward }: { reward: Pick<Reward, 'status'> }) {
  const map: Record<string, [string, string, string]> = { open: ['OPEN', '#fff', PAD.ink], paid: ['PAID', PAD.up, '#fff'], won: ['WINNER PICKED', PAD.up, '#fff'], draft: ['DRAFT · FUND TO GO LIVE', PAD.ink, '#fff'], paying: ['PAYING OUT', '#fff', PAD.ink], refunding: ['REFUNDING', '#fff', PAD.ink] };
  const [label, bg, fg] = map[reward.status] ?? ['CLOSED', 'rgba(255,255,255,.85)', PAD.muted];
  return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style={{ background: bg, color: fg }}>{reward.status === 'open' ? <PulseDot size={6}/> : reward.status === 'paid' ? <Check size={10} strokeWidth={4}/> : null}<span className="ap-mono text-[10.5px] font-extrabold">{label}</span></span>;
}

export function Sparkline({ points, up = true, className }: { points: number[]; up?: boolean; className?: string }) {
  const d = useMemo(() => { const p = points.length > 1 ? points : [0, 0]; const lo = Math.min(...p), hi = Math.max(...p), span = Math.max(hi - lo, 1e-12); return p.map((v, i) => `${i ? 'L' : 'M'}${(i / (p.length - 1)) * 100},${(1 - (v - lo) / span) * 100}`).join(''); }, [points]);
  return <svg viewBox="-2 -4 104 108" preserveAspectRatio="none" className={className} aria-hidden="true"><path d={d} fill="none" stroke={up ? PAD.up : PAD.down} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
export function ProgressBar({ value, color = PAD.ink, height = 7 }: { value: number; color?: string; height?: number }) {
  return <div className="relative w-full overflow-hidden rounded-full bg-ink/[0.08]" style={{ height }}><div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 [transition-timing-function:cubic-bezier(.34,1.2,.64,1)]" style={{ background: color, width: `max(${height}px, ${Math.min(1, Math.max(0, value)) * 100}%)` }}/></div>;
}
export function StatTile({ label, value, glass, dark = false }: { label: string; value: string; glass?: string; dark?: boolean }) {
  return <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-[20px] p-3.5" style={{ background: dark ? 'rgba(255,255,255,.08)' : '#fff', boxShadow: dark ? undefined : '0 4px 8px rgba(12,13,16,.05)' }}>
    <div className="flex items-center justify-between"><Lab className={dark ? '!text-white/50' : '!text-ink/50'}>{label}</Lab>{glass && <GlassIcon name={glass} size={26}/>}</div>
    <Rolling text={value} className="ap-display truncate" style={{ fontSize: 22, color: dark ? '#fff' : PAD.ink }}/>
  </div>;
}
export function SectionHeader({ lab, title, action, onAction }: { lab: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="flex items-end justify-between"><div className="flex flex-col gap-1"><Lab>{lab}</Lab><Display size={26}>{title}</Display></div>
    {action && onAction && <button type="button" onPointerDown={() => Feedback.tap()} onClick={onAction} className="ap-press flex items-center gap-0.5 text-[13px] font-extrabold text-ink/60">{action}<ChevronRight size={13} strokeWidth={3}/></button>}</div>;
}
export function ErrorBanner({ message }: { message: string }) {
  return <div role="alert" className="ap-fade flex items-start gap-2 rounded-2xl bg-[#E5484D]/[0.08] p-3"><AlertTriangle size={16} className="mt-px shrink-0 text-[#E5484D]" fill="#E5484D" stroke="#fff"/><p className="text-[13px] font-bold text-[#E5484D]">{message}</p></div>;
}
export function PadField({ label, placeholder, value, onChange, mono = false, multiline = false, type = 'text', inputMode }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; mono?: boolean; multiline?: boolean; type?: string; inputMode?: 'decimal' | 'numeric' | 'email' | 'url' | 'text' }) {
  const cls = cn('ap-field', mono ? 'ap-mono !text-[14px] !font-semibold' : '');
  return <label className="flex flex-col gap-1.5">{label && <span className="text-[13px] font-extrabold text-ink/75">{label}</span>}
    {multiline ? <textarea rows={3} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className={cn(cls, 'resize-none')}/> : <input type={type} inputMode={inputMode} value={value} placeholder={placeholder} autoCapitalize={mono ? 'none' : 'sentences'} autoCorrect={mono ? 'off' : 'on'} spellCheck={!mono} onChange={e => onChange(e.target.value)} className={cls}/>}
  </label>;
}
/** Confetti burst of voxels for big moments (launches, payouts, claims). */
export function ConfettiBurst() {
  const bits = useMemo(() => Array.from({ length: 34 }, (_, i) => { const a = (i / 34) * Math.PI * 2; return { x: Math.cos(a) * (90 + Math.random() * 100), y: Math.sin(a) * (90 + Math.random() * 130) - 60 + 160, r: Math.random() * 400 - 200, c: [PAD.sky, PAD.gold, PAD.up, '#fff', PAD.skyLight][i % 5] }; }), []);
  return <div className="ap-confetti pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">{bits.map((b, i) => <i key={i} style={{ background: b.c, ['--x' as string]: `${b.x}px`, ['--y' as string]: `${b.y}px`, ['--r' as string]: `${b.r}deg` }}/>)}</div>;
}
export function Spinner({ size = 22, className }: { size?: number; className?: string }) { return <Loader2 size={size} className={cn('ap-spin text-ink/50', className)}/>; }
export function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return <div className="flex flex-col items-center gap-2 px-6 py-16 text-center"><Icon size={40} className="text-ink/40"/><p className="text-[18px] font-extrabold">{title}</p><p className="text-[14px] font-semibold text-[#6A6E78]">{body}</p></div>;
}
