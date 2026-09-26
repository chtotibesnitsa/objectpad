import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePreferences } from '@/hooks/use-preferences';
import { useInView } from '@/hooks/use-in-view';
import { exhibitById, MEMES, type MemeExhibit } from '@/lib/memes';
import { usePairs, type PairQuote } from '@/lib/pairs';
import { pct, usd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PairLogo } from './PairBadge';
import { FUSE_AT } from './fusion';
import { FUSION_MS, type FusionClock } from './FusionScene';

const FusionScene = lazy(() => import('./FusionScene'));

/** Object × stock combinations that tell a story. Used by the fusion stage and the V2 narrative grid. */
export const COMBOS: { object: string; pair: string; story: string }[] = [
  { object: 'duck', pair: 'NVDA', story: 'Rubber-duck debugging, riding the AI trade.' },
  { object: 'bull', pair: 'SPY', story: 'Wall Street’s bull, backed by the whole S&P 500.' },
  { object: 'card', pair: 'GME', story: 'A graded slab, paired with the original meme stock.' },
  { object: 'rock', pair: 'GLD', story: 'Diamond hands, backed by gold.' },
  { object: 'console', pair: 'TTWO', story: 'Press start on a gaming stock.' },
  { object: 'banana', pair: 'MSTR', story: 'Taped to the chain, stacked like a treasury.' },
  { object: 'pizza', pair: 'AMZN', story: 'The 10,000 BTC pizza, delivered by Amazon.' },
  { object: 'shiba', pair: 'cbBTC', story: 'Much coin. Backed by bitcoin.' },
];

export interface ComboView { exhibit: MemeExhibit; story: string; symbol: string; quote: PairQuote | null; }
/** Resolves every combo to its 3D exhibit and the live on-chain quote of its pair asset. */
export function useCombos(): ComboView[] {
  const pairs = usePairs();
  return useMemo(() => COMBOS.map(c => ({ exhibit: exhibitById(c.object) ?? MEMES[0], story: c.story, symbol: c.pair, quote: pairs.data?.assets.find(a => a.symbol === c.pair) ?? null })), [pairs.data]);
}

class Boundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}
function webgl(): boolean { try { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl2') ?? c.getContext('webgl')); } catch { return false; } }

/**
 * The V2 hero visual. Each loop: a real 3D object appears, a liquid-glass chart of its paired stock flies in, both
 * collide in green sparks and one gold-rimmed coin spins up in the centre with its ticker and pair underneath.
 */
export function FusionStage({ className }: { className?: string }) {
  const { reducedMotion } = usePreferences(); const combos = useCombos();
  const [index, setIndex] = useState<number>(0); const [ready, setReady] = useState<boolean>(false); const [run, setRun] = useState<number>(0); const [scene, setScene] = useState<boolean>(false);
  const clock = useRef<FusionClock>({ startedAt: performance.now() }); const root = useRef<HTMLDivElement>(null); const visible = useInView(root, '0px');
  const combo = combos[index % combos.length]; const next = combos[(index + 1) % combos.length];
  const pair = useMemo(() => ({ symbol: combo.symbol, price: combo.quote?.priceUsd ? usd(combo.quote.priceUsd) : '—', change: combo.quote?.change24h ?? null }), [combo]);
  useEffect(() => { if (!reducedMotion && webgl()) setScene(true); }, [reducedMotion]);
  useEffect(() => {
    if (!ready || !visible || reducedMotion) return;
    const timer = window.setTimeout(() => { setReady(false); setIndex(i => i + 1); }, Math.max(0, FUSION_MS - (performance.now() - clock.current.startedAt)));
    return () => window.clearTimeout(timer);
  }, [ready, visible, reducedMotion, run]);
  const onReady = useCallback(() => { clock.current = { startedAt: performance.now() }; setReady(true); setRun(r => r + 1); }, []);
  const born = Math.round(FUSE_AT * FUSION_MS);
  const settled = !scene || reducedMotion;
  return <div ref={root} className={cn('raised crop relative overflow-hidden rounded-[34px]', className)}>
    <div className="scan-stage absolute inset-[6px] rounded-[29px]" aria-hidden="true"/>
    <div className="scan-grid absolute inset-0" aria-hidden="true"/>
    {settled && <img src={combo.exhibit.coin} alt="" className="absolute left-1/2 top-[40%] size-[38%] max-w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full object-contain shadow-[0_0_0_5px_#E2B43C,0_30px_50px_-20px_rgba(12,13,16,.35)]"/>}
    {scene && <Boundary onFail={() => setScene(false)}><Suspense fallback={null}><div className="absolute inset-0"><FusionScene src={combo.exhibit.url} coin={combo.exhibit.coin} pair={pair} next={next.exhibit.url} nextCoin={next.exhibit.coin} clock={clock} active={visible} onReady={onReady}/></div></Suspense></Boundary>}

    <div className="pointer-events-none absolute inset-x-5 top-5 flex items-start justify-between sm:inset-x-7 sm:top-6">
      <div key={`o${index}`} className="slide-in"><p className="spec">Real object</p><p className="display mt-1 text-[22px] sm:text-[26px]">{combo.exhibit.name}</p></div>
      <div key={`p${index}`} className="slide-in flex flex-col items-end text-right"><p className="spec">Paired stock</p><span className="mt-1 flex items-center gap-2"><PairLogo src={combo.quote?.logo} symbol={combo.symbol} size={26}/><span className="display text-[22px] sm:text-[26px]">{combo.symbol}</span></span></div>
    </div>

    <div key={run} className="pointer-events-none absolute inset-x-0 bottom-5 flex flex-col items-center px-4 text-center sm:bottom-7" aria-live="polite">
      {!settled && <div className="fuse-hint glass-strong absolute bottom-6 flex items-center gap-2 rounded-full px-3.5 py-2" style={{ '--born': `${born}ms` } as CSSProperties}><span className="pulse-dot size-1.5 rounded-full bg-up"/><span className="font-mono text-[11.5px] font-extrabold uppercase tracking-wider text-ink/70">Object + {combo.symbol} → one coin</span></div>}
      <div className={settled ? '' : 'fuse-born'} style={{ '--born': `${born + 160}ms` } as CSSProperties}>
        <p className="display text-[46px] leading-none sm:text-[64px]">${combo.exhibit.ticker}</p>
        <span className="v2-pill mt-3 inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[13.5px] font-extrabold text-[#3A2A05]"><PairLogo src={combo.quote?.logo} symbol={combo.symbol} size={24}/>Paired with {combo.symbol}{combo.quote?.priceUsd ? <span className="font-mono text-[12px] font-bold opacity-80">{usd(combo.quote.priceUsd)}</span> : null}{combo.quote?.change24h !== null && combo.quote?.change24h !== undefined && <span className={cn('font-mono text-[12px] font-bold', combo.quote.change24h >= 0 ? 'text-[#0B6B35]' : 'text-down')}>{pct(combo.quote.change24h)}</span>}</span>
        <p className="mt-2.5 text-[13.5px] font-bold text-ink/70">{combo.story}</p>
      </div>
    </div>
  </div>;
}
