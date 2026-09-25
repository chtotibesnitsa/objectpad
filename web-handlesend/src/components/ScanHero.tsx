import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Fingerprint, MousePointer2 } from 'lucide-react';
import { usePreferences } from '@/hooks/use-preferences';
import { useInView } from '@/hooks/use-in-view';
import { demoHash, demoTag, MEMES, type MemeExhibit } from '@/lib/memes';
import { cn } from '@/lib/utils';
import { VIEWS } from '@/shared/domain';
import { CountUp } from './Reveal';
import { PHASE_MS, SHOT_AT, type ScanClock } from './ScanScene';

const ScanScene = lazy(() => import('./ScanScene'));
/** Five steps, captions kept to the same length so every card reads as one even line. */
export const HERO_PHASES = [
  { label: 'Real object', caption: 'Anything you can hold' },
  { label: 'Phone scan', caption: 'Six angles, one lap' },
  { label: '3D rebuild', caption: 'Real mesh, bottom up' },
  { label: 'One of one', caption: 'AI blocks every copy' },
  { label: 'Coin live', caption: 'Named on-chain, free' },
] as const;

class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}
function webglAvailable(): boolean { try { const canvas = document.createElement('canvas'); return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl')); } catch { return false; } }

/** Six shot markers; each lights up the instant the 3D phone fires its flash. */
function ShotStrip({ run }: { run: number }) {
  const segment = PHASE_MS[1] / VIEWS.length;
  return <div key={run} className="glass-strong pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full px-1.5 py-1.5" aria-hidden="true">
    {VIEWS.map((view, i) => <span key={view.id} className="shot-on flex h-7 min-w-8 items-center justify-center rounded-full px-2 font-mono text-[11.5px] font-semibold" style={{ animationDelay: `${(i + SHOT_AT) * segment}ms` }}>{i + 1}</span>)}
    <span className="ml-1 pr-2 font-mono text-[11.5px] uppercase tracking-wider text-muted">angles</span>
  </div>;
}
function Flashes({ run }: { run: number }) {
  const segment = PHASE_MS[1] / VIEWS.length;
  return <div key={run} aria-hidden="true">{VIEWS.map((view, i) => <div key={view.id} className="flash-pop pointer-events-none absolute inset-0 bg-white" style={{ animationDelay: `${(i + SHOT_AT) * segment}ms` }}/>)}</div>;
}

/** Graded-slab verification card: pearl foil header, a bold 1/1 and the object tag. */
function OneOfOne({ exhibit }: { exhibit: MemeExhibit }) {
  return <div className="card-pop pointer-events-none absolute bottom-4 left-4 w-[220px] sm:bottom-6 sm:left-6 sm:w-[264px]" aria-hidden="true">
    <div className="glass-strong overflow-hidden rounded-[18px]">
      <div className="foil flex items-center justify-between px-3.5 py-2"><span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]">Graded · ObjectPad</span><span className="font-mono text-[11px] font-semibold">{demoTag(exhibit)}</span></div>
      <div className="flex items-center gap-3 px-3.5 py-3.5">
        <div className="sunk shine flex size-[68px] shrink-0 items-center justify-center rounded-2xl"><span className="display text-[30px]">1/1</span></div>
        <div className="min-w-0"><p className="display text-lg leading-none">One of one</p><p className="mt-1.5 truncate text-[13px] font-medium">{exhibit.catalog}</p><p className="mt-1 flex items-center gap-1 text-xs font-semibold text-up"><Check size={13} strokeWidth={3}/>No match in archive</p></div>
      </div>
      <div className="flex items-center gap-2 border-t border-ink/[0.06] px-3.5 py-2 font-mono text-[11px] text-muted"><Fingerprint size={11}/>fingerprint {demoHash(exhibit.id, 12)}</div>
    </div>
  </div>;
}

/** Showcase coin card: real-render coin art, short sample address, market cap counting up, a green chart and the on-chain name. */
function CoinLive({ exhibit, run }: { exhibit: MemeExhibit; run: number }) {
  const address = `0x${demoHash(exhibit.ticker, 40)}`;
  const path = useMemo(() => {
    let seed = 0; for (const ch of exhibit.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const points: [number, number][] = []; let y = 92;
    for (let i = 0; i <= 28; i++) { const x = (i / 28) * 240; const push = i < 6 ? rand() * 5 - 2 : 2 + rand() * 7 * (i / 28 + 0.4); y = Math.max(8, y - push + (rand() < 0.2 ? 6 : 0)); points.push([x, i === 28 ? 10 : y]); }
    return points.map(([x, py], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${py.toFixed(1)}`).join(' ');
  }, [exhibit.id]);
  return <div key={run} className="card-pop pointer-events-none absolute right-4 top-[88px] w-[236px] sm:right-6 sm:top-[108px] sm:w-[284px]" aria-hidden="true">
    <div className="glass-strong overflow-hidden rounded-[20px]">
      <div className="flex items-center gap-3 px-3.5 pt-3.5">
        <img src={exhibit.coin} alt="" className="size-11 rounded-full object-cover shadow-[0_0_0_1px_rgba(12,13,16,.1)]"/>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="display text-lg leading-none">${exhibit.ticker}</p><span className="flex items-center gap-1 rounded-full bg-up/10 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-up"><span className="pulse-dot size-1.5 rounded-full bg-up"/>Live</span></div><p className="mt-1 font-mono text-[12px] text-muted">{address.slice(0, 6)}…{address.slice(-4)}</p></div>
      </div>
      <div className="mt-3 flex items-end justify-between px-3.5"><div><p className="spec">Market cap</p><p className="display text-[26px] leading-none text-up"><CountUp value={186_400 + (exhibit.triangles % 90) * 1000} duration={2600} format={v => `$${Math.round(v / 100) / 10}K`}/></p></div><p className="display text-base leading-none text-up">+<CountUp value={1840 + (exhibit.triangles % 700)} duration={2600} format={v => `${Math.round(v).toLocaleString()}%`}/></p></div>
      <svg viewBox="0 0 240 100" className="mt-2 h-20 w-full" preserveAspectRatio="none">
        <defs><linearGradient id={`fill-${exhibit.id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#12A150" stopOpacity=".22"/><stop offset="100%" stopColor="#12A150" stopOpacity="0"/></linearGradient></defs>
        {[25, 50, 75].map(y => <line key={y} x1="0" x2="240" y1={y} y2={y} stroke="#0C0D10" strokeOpacity=".05" strokeDasharray="3 4"/>)}
        <path d={`${path} L240,100 L0,100 Z`} fill={`url(#fill-${exhibit.id})`} className="fade-late"/>
        <path d={path} fill="none" stroke="#12A150" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw-line"/>
      </svg>
      <div className="border-t border-ink/[0.06] bg-ink/[0.025] px-3.5 py-2.5"><p className="spec !text-[11px]">Name in launch tx</p><p className="mt-0.5 truncate font-mono text-[11px] font-medium"><span className="font-bold text-ink">{demoTag(exhibit)}</span> · {exhibit.catalog}</p></div>
    </div>
  </div>;
}

/**
 * Homepage hero stage: one real 3D object per loop, carried through the five steps from object to coin. The model is
 * always centred and draggable 360°. A render shows instantly; the WebGL scene fades in when ready.
 */
export function ScanHero() {
  const { reducedMotion } = usePreferences();
  const [phase, setPhase] = useState<number>(0); const [ready, setReady] = useState<boolean>(false); const [scene, setScene] = useState<boolean>(false); const [exhibit, setExhibit] = useState<number>(0); const [run, setRun] = useState<number>(0); const [held, setHeld] = useState<boolean>(false);
  const clock = useRef<ScanClock>({ phase: 0, startedAt: performance.now() }); const root = useRef<HTMLDivElement>(null); const visible = useInView(root, '0px');
  const current = MEMES[exhibit % MEMES.length]; const next = MEMES[(exhibit + 1) % MEMES.length];
  const go = useCallback((value: number) => { clock.current = { phase: value, startedAt: performance.now() }; setPhase(value); setRun(r => r + 1); }, []);
  useEffect(() => { if (reducedMotion || !webglAvailable()) return; const start = () => setScene(true); const idle = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 900 }) : window.setTimeout(start, 300); return () => { if (window.cancelIdleCallback && typeof idle === 'number') window.cancelIdleCallback(idle); window.clearTimeout(idle as number); }; }, [reducedMotion]);
  useEffect(() => {
    if (reducedMotion || held || !visible) return;
    const timer = window.setTimeout(() => { const value = (clock.current.phase + 1) % HERO_PHASES.length; if (value === 0) { setReady(false); setExhibit(e => e + 1); } go(value); }, PHASE_MS[phase] - Math.min(PHASE_MS[phase], performance.now() - clock.current.startedAt));
    return () => window.clearTimeout(timer);
  }, [phase, reducedMotion, held, visible, go]);
  const onReady = useCallback(() => { setReady(true); clock.current = { phase: clock.current.phase, startedAt: performance.now() }; setRun(r => r + 1); }, []);
  const poster = <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true"><img src={current.image} alt="" className="float-y h-[62%] w-auto object-contain drop-shadow-[0_30px_30px_rgba(20,24,40,.18)]"/></div>;
  return <div ref={root} className="relative">
    <div className="raised crop relative h-[440px] overflow-hidden rounded-[32px] sm:h-[560px]" onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerLeave={() => setHeld(false)}>
      <div className="scan-stage absolute inset-[6px] rounded-[27px]" aria-hidden="true"/>
      <div className="scan-grid absolute inset-0" aria-hidden="true"/>
      <div className="ticks-x pointer-events-none absolute inset-x-10 bottom-3 h-3 opacity-60" aria-hidden="true"/>
      <div className="ticks-y pointer-events-none absolute inset-y-16 left-3 w-3 opacity-60" aria-hidden="true"/>
      {(!scene || !ready) && poster}
      {scene && <SceneBoundary onFail={() => setScene(false)}><Suspense fallback={null}><div className={cn('absolute inset-0 transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0')}><ScanScene src={current.url} coin={current.coin} next={next.url} nextCoin={next.coin} clock={clock} active={visible && !reducedMotion} onReady={onReady}/></div></Suspense></SceneBoundary>}
      {phase === 1 && ready && <Flashes run={run}/>}

      <div className="pointer-events-none absolute left-5 top-5 sm:left-7 sm:top-6"><p className="spec">{current.kind}</p><p key={current.id} className="slide-in display mt-1.5 text-2xl sm:text-[30px]">{current.name}</p></div>
      <div className="pointer-events-none absolute right-5 top-4 text-right sm:right-7 sm:top-5" aria-live="polite"><span className="sr-only">Step {phase + 1} of 5: {HERO_PHASES[phase].label}</span><span aria-hidden="true" className="flex items-baseline gap-1"><span key={`n${phase}-${exhibit}`} className="num-flip display text-[52px] leading-none sm:text-[68px]">{String(phase + 1).padStart(2, '0')}</span><span className="display text-base text-muted">/05</span></span></div>

      {phase === 0 && ready && <div className="glass-strong pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-2 font-mono text-[11.5px] uppercase tracking-wider text-ink/70"><MousePointer2 size={12}/>Drag to spin 360°</div>}
      {phase === 1 && <ShotStrip run={run}/>}
      {phase === 2 && <div key={run} className="glass-strong card-pop pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2"><span className="pulse-signal size-2 rounded-full bg-ink"/><span className="display text-lg tnum"><CountUp value={current.triangles} duration={PHASE_MS[2] * 0.85} format={v => Math.round(v).toLocaleString()}/></span><span className="font-mono text-[11.5px] uppercase tracking-wider text-muted">triangles</span></div>}
      {phase === 3 && <OneOfOne key={run} exhibit={current}/>}
      {phase === 4 && <CoinLive exhibit={current} run={run}/>}
    </div>

    <ol className="mt-3 grid grid-cols-5 gap-2" aria-label="From object to coin in five steps">
      {HERO_PHASES.map((item, i) => { const active = phase === i; const done = phase > i; return <li key={item.label}>
        <button type="button" onClick={() => go(i)} aria-current={active ? 'step' : undefined} className={cn('step-card group relative flex h-full w-full flex-col overflow-hidden rounded-2xl px-2.5 pb-3 pt-2.5 text-left sm:px-3.5', active ? 'raised text-ink scale-[1.03]' : 'glass text-ink hover:bg-white/80')}>
          <span className="flex items-start justify-between"><span className={cn('display text-[28px] leading-none sm:text-[40px]', active ? 'text-ink' : done ? 'text-ink' : 'text-ink/25')}>{i + 1}</span>{done && <span className="flex size-4 items-center justify-center rounded-full bg-ink/80 text-white"><Check size={10} strokeWidth={3}/></span>}</span>
          <span className="mt-2 block text-[11px] font-semibold leading-tight sm:text-[13px]">{item.label}</span>
          <span className={cn('mt-0.5 hidden text-[11.5px] leading-4 md:block', 'text-ink/65')}>{item.caption}</span>
          <span className="absolute inset-x-0 bottom-0 h-[3px]"><span key={active ? `bar${run}` : 'idle'} className={cn('block h-full bg-ink', active && !reducedMotion && !held ? 'phase-fill' : 'w-0')} style={{ animationDuration: `${PHASE_MS[i]}ms` } as CSSProperties}/></span>
        </button>
      </li>; })}
    </ol>
    <p className="mt-2 text-center text-xs text-muted md:hidden">{HERO_PHASES[phase].caption}</p>
  </div>;
}
