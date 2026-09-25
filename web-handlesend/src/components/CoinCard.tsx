import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { ObjectCoin } from '@/shared/domain';
import { exhibitForTicker } from '@/lib/coins';
import { eth, pct, usd } from '@/lib/format';
import { SpinSprite } from './SpinSprite';
import { GlassIcon } from './GlassIcon';
import { cn } from '@/lib/utils';

/** Tiny price line from a coin's trades. */
export function sparkPath(prices: number[], height = 28): string {
  const min = Math.min(...prices); const max = Math.max(...prices);
  return prices.map((p, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, prices.length - 1)) * 100).toFixed(1)},${(height - ((p - min) / (max - min || 1)) * (height - 4)).toFixed(1)}`).join(' ');
}

/** Live change chip for the top-right of a coin card's stage. */
export function ChangeChip({ change }: { change: number }) {
  const up = change >= 0;
  return <span className={cn('absolute right-3 top-3 rounded-full px-2 py-0.5 font-mono text-[11px] font-extrabold', up ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>{up ? '▲' : '▼'} {pct(change)}</span>;
}

/** Pulsing LIVE badge for the bottom-right of a coin card's stage. */
export function LiveBadge() {
  return <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 font-mono text-[11px] font-extrabold text-up"><span className="pulse-dot size-1.5 rounded-full bg-up"/>LIVE</span>;
}

/** Shared lower half of every coin card: name, market cap, trades · holders, sparkline and graduation bar. */
export function CoinCardStats({ id, name, marketCapEth, ethUsd, trades, holders, spark: prices, change, progress, graduated = false, live = true }: { id: string; name: string; marketCapEth: number; ethUsd: number | null; trades: number; holders: number; spark: number[]; change: number; progress: number; graduated?: boolean; live?: boolean }) {
  const spark = useMemo(() => prices.length >= 2 ? sparkPath(prices) : 'M0,26 L100,26', [prices]);
  const up = change >= 0; const color = up ? '#12A150' : '#E5484D'; const gid = `sp-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return <div className="px-3 pb-3.5 pt-2 sm:px-4 sm:pb-4">
    <div className="flex items-start justify-between gap-2"><h3 className="truncate text-[15px] font-extrabold leading-tight sm:text-[15.5px]">{name}</h3><ArrowUpRight size={16} className="shrink-0 text-ink/65 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink"/></div>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-0.5"><div><p className="stat-label whitespace-nowrap !text-[11px]">Mcap</p><p className="mt-0.5 text-[16px] font-extrabold tnum">{!live ? '—' : ethUsd ? usd(marketCapEth * ethUsd, 0) : eth(marketCapEth, 2)}</p></div><span className="whitespace-nowrap font-mono text-[11px] font-bold text-ink/60">{trades} trades · {holders} holders</span></div>
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-9 w-full"><defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".22"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs><path d={`${spark} L100,30 L0,30 Z`} fill={`url(#${gid})`}/><path d={spark} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg>
    <div className="sunk mt-2 h-1.5 overflow-hidden rounded-full"><div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(1, progress * 100)}%` }}/></div>
    <p className="mt-1.5 font-mono text-[11px] font-bold uppercase text-ink/60">{graduated ? 'Graduated' : `${(progress * 100).toFixed(1)}% to graduation`}</p>
  </div>;
}

/** Coin card for an ObjectPad original: its real 360° scan spinning on a lab stage, with live on-chain market cap, change and sparkline. */
export const SpecimenCard = memo(function SpecimenCard({ coin, ethUsd, index = 0 }: { coin: ObjectCoin; ethUsd: number | null; index?: number }) {
  const exhibit = exhibitForTicker(coin.symbol); const live = coin.state === 'live';
  return <Link to={coin.path} className="raised lift group block overflow-hidden rounded-[26px]">
    <div className="scan-stage crop relative m-1.5 overflow-hidden rounded-[21px]"><i/><i/><i/><i/>
      <div className="grid-paper absolute inset-0 opacity-60" aria-hidden="true"/>
      {exhibit ? <SpinSprite src={exhibit.spin} delay={index * 0.8} className="relative mx-auto w-[80%]"/> : <img src={coin.logo} alt="" className="relative mx-auto aspect-square w-[70%] object-contain p-4"/>}
      <span className="chip-dark absolute left-3 top-3">${coin.symbol}</span>
      {live ? <ChangeChip change={coin.change24h}/> : <span className="chip absolute right-3 top-3 !text-[11px]">Launching</span>}
      {coin.tag && <span className="chip absolute bottom-3 left-3 hidden !text-[11px] sm:inline-flex">{coin.tag}</span>}
      {live && <LiveBadge/>}
    </div>
    <CoinCardStats id={`o-${coin.id}`} name={coin.name} marketCapEth={coin.marketCapEth} ethUsd={ethUsd} trades={coin.trades} holders={coin.holders} spark={coin.spark} change={coin.change24h} progress={coin.progress} graduated={coin.graduated} live={live}/>
  </Link>;
});

/** Launch tile that sits in coin grids so the next coin is always one click away. */
export function LaunchTile() {
  return <Link to="/launch" className="steel lift group relative flex h-full min-h-[300px] flex-col justify-between overflow-hidden rounded-[26px] p-4 sm:min-h-[380px] sm:p-5">
    <div className="grid-paper pointer-events-none absolute inset-0 opacity-70" aria-hidden="true"/>
    <GlassIcon name="qr" size={72} float className="relative"/>
    <div className="relative"><p className="display text-[26px] leading-none sm:text-[34px]">Your object<br/>goes here.</p><p className="mt-3 font-mono text-[11px] font-bold uppercase tracking-wider text-ink/60">$0 · no account · ~3 min</p><span className="btn mt-4 min-h-11 w-full px-4 text-sm sm:mt-5 sm:w-auto sm:px-5">Scan & launch<ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5"/></span></div>
  </Link>;
}
