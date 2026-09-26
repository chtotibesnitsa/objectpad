import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Fingerprint, MousePointer2 } from 'lucide-react';
import { usePreferences } from '@/hooks/use-preferences';
import { useInView } from '@/hooks/use-in-view';
import { demoHash, demoTag, MEMES, type MemeExhibit } from '@/lib/memes';
import { usePairs, type PairQuote } from '@/lib/pairs';
import { pct, usd } from '@/lib/format';
import { PairLogo } from './PairBadge';
import { FUSE_AT } from './fusion';
import { cn } from '@/lib/utils';
import { VIEWS } from '@/shared/domain';
import { CountUp } from './Reveal';
import { PHASE_MS, SHOT_AT, type ScanClock } from './scanClock';

const ScanScene = lazy(() => import('./ScanScene'));
/** Five steps, captions kept to the same length so every card reads as one even line. */
export const HERO_PHASES = [
  { label: 'Real object', caption: 'Anything you can hold' },
  { label: 'Phone scan', caption: 'Six angles, one lap' },
  { label: '3D rebuild', caption: 'Real mesh, bottom up' },
  { label: 'One of one', caption: 'AI blocks every copy' },
  { label: 'Stock pair', caption: 'Backed by a real market' },
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
  return <div key={run} className="glass-strong pointer-events-none absolute bottom-[68px] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full px-1.5 py-1.5" aria-hidden="true">
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
  return <div className="card-pop pointer-events-none absolute bottom-[68px] left-4 w-[220px] sm:bottom-[72px] sm:left-6 sm:w-[264px]" aria-hidden="true">
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

/** Which stock each showcase object gets paired with in step 5, so every loop tells a small story. */
const STORY_PAIR: Record<string, string> = { duck: 'NVDA', wojak: 'GME', pepe: 'COIN', bull: 'SPY', fine: 'AMC', beanie: 'SNAP', frog: 'RBLX', rock: 'GLD', sneaker: 'LULU', console: 'TTWO', mug: 'COST', card: 'GME', squirrel: 'SPCX', pizza: 'AMZN', shiba: 'cbBTC', banana: 'MSTR', hippo: 'NFLX', penguin: 'RDDT' };
const FALLBACK_PAIR = { symbol: 'NVDA', name: 'NVIDIA', logo: null, priceUsd: null, change24h: null } as const;
type StageQuote = Pick<PairQuote, 'symbol' | 'name' | 'priceUsd' | 'change24h'> & { logo: string | null };

/** Step 5 overlay: "pairing with" while the two fly together, then the coin's bold ticker, centred, with the stock it's paired with. */
function PairedCoin({ exhibit, pair, run }: { exhibit: MemeExhibit; pair: StageQuote; run: number }) {
  const born = Math.round(FUSE_AT * PHASE_MS[4]);
  return <div key={run} className="pointer-events-none absolute inset-x-0 bottom-[72px] flex flex-col items-center px-4 text-center" aria-hidden="true">
    <div className="fuse-hint glass-strong absolute bottom-2 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5" style={{ '--born': `${born}ms` } as CSSProperties}><PairLogo src={pair.logo} symbol={pair.symbol} size={22}/><span className="font-mono text-[11.5px] font-extrabold uppercase tracking-wider text-ink/70">Pairing with {pair.symbol}</span></div>
    <div className="fuse-born flex flex-col items-center" style={{ '--born': `${born + 180}ms` } as CSSProperties}>
      <span className="flex items-center gap-1.5 rounded-full bg-up/10 px-2.5 py-1 font-mono text-[11px] font-extrabold uppercase text-up"><span className="pulse-dot size-1.5 rounded-full bg-up"/>Coin launched</span>
      <p className="display mt-2 text-[44px] leading-none sm:text-[58px]">${exhibit.ticker}</p>
      <span className="v2-pill mt-3 inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[13px] font-extrabold text-[#3A2A05]"><PairLogo src={pair.logo} symbol={pair.symbol} size={24}/>Paired with {pair.symbol}{pair.priceUsd !== null && <span className="font-mono text-[12px] font-bold opacity-80">{usd(pair.priceUsd)}</span>}{pair.change24h !== null && <span className={cn('font-mono text-[12px] font-bold', pair.change24h >= 0 ? 'text-[#0B6B35]' : 'text-down')}>{pct(pair.change24h)}</span>}</span>
    </div>
  </div>;
}

/** Live tape of stocks, ETFs and commodities priced on Robinhood Chain, along the bottom of the stage. */
function PairTape({ assets }: { assets: PairQuote[] }) {
  return <div className="marquee-mask absolute inset-x-3 bottom-3 overflow-hidden rounded-[18px] bg-white/75 py-1.5 shadow-[inset_0_0_0_1px_rgba(12,13,16,.07)] backdrop-blur-md" aria-label="Pair assets priced on Robinhood Chain">
    {assets.length ? <div className="flex w-max gap-1.5 [animation:marquee_70s_linear_infinite] motion-reduce:animate-none">{[...assets, ...assets].map((a, i) => <span key={`${a.address}-${i}`} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2.5 shadow-[0_0_0_1px_rgba(12,13,16,.07)]"><PairLogo src={a.logo} symbol={a.symbol} size={20}/><span className="text-[12px] font-extrabold">{a.symbol}</span><span className="font-mono text-[11px] font-bold tnum">{usd(a.priceUsd ?? 0)}</span>{a.change24h !== null && <span className={cn('font-mono text-[11px] font-bold', a.change24h >= 0 ? 'text-up' : 'text-down')}>{pct(a.change24h)}</span>}</span>)}</div>
      : <p className="px-3 py-1 font-mono text-[11px] font-bold uppercase text-ink/55">Reading pair prices from Robinhood Chain…</p>}
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
  const pairs = usePairs();
  const tape = useMemo(() => (pairs.data?.assets ?? []).filter(a => a.priceUsd && (a.kind === 'stock' || a.kind === 'etf' || a.kind === 'commodity')), [pairs.data]);
  const pair = useMemo<StageQuote>(() => { const want = STORY_PAIR[current.id] ?? 'NVDA'; const q = pairs.data?.assets.find(a => a.symbol === want) ?? pairs.data?.assets.find(a => a.symbol === 'NVDA'); return q ? { symbol: q.symbol, name: q.name, logo: q.logo, priceUsd: q.priceUsd, change24h: q.change24h } : { ...FALLBACK_PAIR, symbol: want }; }, [current.id, pairs.data]);
  const stagePair = useMemo(() => ({ symbol: pair.symbol, price: pair.priceUsd !== null ? usd(pair.priceUsd) : '—', change: pair.change24h }), [pair]);
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
    <div className="raised crop relative h-[440px] overflow-hidden rounded-[32px] sm:h-[580px]" onPointerDown={() => setHeld(true)} onPointerUp={() => setHeld(false)} onPointerLeave={() => setHeld(false)}>
      <div className="scan-stage absolute inset-[6px] rounded-[27px]" aria-hidden="true"/>
      <div className="scan-grid absolute inset-0" aria-hidden="true"/>
      <div className="ticks-x pointer-events-none absolute inset-x-10 bottom-3 h-3 opacity-60" aria-hidden="true"/>
      <div className="ticks-y pointer-events-none absolute inset-y-16 left-3 w-3 opacity-60" aria-hidden="true"/>
      {(!scene || !ready) && poster}
      {scene && <SceneBoundary onFail={() => setScene(false)}><Suspense fallback={null}><div className={cn('absolute inset-0 transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0')}><ScanScene src={current.url} coin={current.coin} pair={stagePair} next={next.url} nextCoin={next.coin} clock={clock} active={visible && !reducedMotion} onReady={onReady}/></div></Suspense></SceneBoundary>}
      {phase === 1 && ready && <Flashes run={run}/>}

      <div className="pointer-events-none absolute left-5 top-5 sm:left-7 sm:top-6"><p className="spec">{current.kind}</p><p key={current.id} className="slide-in display mt-1.5 text-2xl sm:text-[30px]">{current.name}</p></div>
      <div className="pointer-events-none absolute right-5 top-4 text-right sm:right-7 sm:top-5" aria-live="polite"><span className="sr-only">Step {phase + 1} of 5: {HERO_PHASES[phase].label}</span><span aria-hidden="true" className="flex items-baseline gap-1"><span key={`n${phase}-${exhibit}`} className="num-flip display text-[52px] leading-none sm:text-[68px]">{String(phase + 1).padStart(2, '0')}</span><span className="display text-base text-muted">/05</span></span></div>

      {phase === 0 && ready && <div className="glass-strong pointer-events-none absolute bottom-[68px] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-2 font-mono text-[11.5px] uppercase tracking-wider text-ink/70"><MousePointer2 size={12}/>Drag to spin 360°</div>}
      {phase === 1 && <ShotStrip run={run}/>}
      {phase === 2 && <div key={run} className="glass-strong card-pop pointer-events-none absolute bottom-[68px] left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2"><span className="pulse-signal size-2 rounded-full bg-ink"/><span className="display text-lg tnum"><CountUp value={current.triangles} duration={PHASE_MS[2] * 0.85} format={v => Math.round(v).toLocaleString()}/></span><span className="font-mono text-[11.5px] uppercase tracking-wider text-muted">triangles</span></div>}
      {phase === 3 && <OneOfOne key={run} exhibit={current}/>}
      {phase === 4 && ready && <PairedCoin exhibit={current} pair={pair} run={run}/>}
      <PairTape assets={tape}/>
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
