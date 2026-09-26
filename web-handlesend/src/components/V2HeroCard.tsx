import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { usePairs } from '@/lib/pairs';
import { MergeExplainer } from './MergeExplainer';
import { PairLogo } from './PairBadge';
import { pct, usd } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Front-page hero visual: the object + stock merge, above a live, scrolling tape of pair assets priced on-chain. */
export const V2HeroCard = memo(function V2HeroCard() {
  const pairs = usePairs();
  const tape = useMemo(() => (pairs.data?.assets ?? []).filter(a => a.priceUsd && (a.kind === 'stock' || a.kind === 'etf' || a.kind === 'commodity')).slice(0, 24), [pairs.data]);
  return <div className="steel relative overflow-hidden rounded-[34px] p-2.5">
    <div className="flex items-center justify-between px-3 pb-2 pt-1"><span className="flex items-center gap-2 font-mono text-[11px] font-extrabold uppercase text-ink/65"><span className="pulse-dot size-1.5 rounded-full bg-up"/>Live · stock pairing</span><Link to="/v2" className="flex min-h-8 items-center gap-1 font-mono text-[11px] font-extrabold uppercase text-ink/70 hover:text-ink">What’s new<ArrowUpRight size={12}/></Link></div>
    <MergeExplainer compact/>
    <div className="marquee-mask mt-2.5 overflow-hidden rounded-[20px] bg-white/70 py-2 shadow-[inset_0_0_0_1px_rgba(12,13,16,.07)]">
      {tape.length ? <div className="flex w-max gap-2 [animation:marquee_60s_linear_infinite] motion-reduce:animate-none">{[...tape, ...tape].map((a, i) => <span key={`${a.address}-${i}`} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2 py-1 shadow-[0_0_0_1px_rgba(12,13,16,.08)]"><PairLogo src={a.logo} symbol={a.symbol} size={20}/><span className="text-[12.5px] font-extrabold">{a.symbol}</span><span className="font-mono text-[11.5px] font-bold tnum">{usd(a.priceUsd ?? 0)}</span>{a.change24h !== null && <span className={cn('font-mono text-[11px] font-bold', a.change24h >= 0 ? 'text-up' : 'text-down')}>{pct(a.change24h)}</span>}</span>)}</div>
        : <p className="px-4 font-mono text-[11.5px] font-bold uppercase text-ink/55">{pairs.isError ? 'Pair prices unavailable' : 'Reading pair prices from Robinhood Chain…'}</p>}
    </div>
  </div>;
});
