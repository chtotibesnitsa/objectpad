import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Box } from 'lucide-react';
import type { MarketTrade } from '@/shared/domain';
import { explorerTx } from '@/shared/pons';
import { useMarket } from '@/lib/market';
import { previewCoins } from '@/lib/preview';
import { compactNumber, eth, pct, shortAddress, timeAgo, tinyUsd, usd } from '@/lib/format';
import { CountUp } from './Reveal';
import { CoinIcon } from './CoinIcon';
import { sparkPath } from './CoinCard';
import { cn } from '@/lib/utils';

/** One ObjectPad coin row, live or lab specimen, normalised for the board. */
export interface BoardCoin { key: string; to: string; symbol: string; name: string; icon: ReactNode; priceEth: number; changePct: number; volumeEth: number; capEth: number | null; trades: number; buys: number; sells: number; spark: number[]; live: boolean; tag?: string; }
export interface BoardTrade { id: string; to: string; symbol: string; icon: ReactNode; side: 'buy' | 'sell'; eth: number; trader: string; at: number; href?: string; live: boolean; }

/**
 * Every coin on ObjectPad: live object coins read from Robinhood Chain first, then lab specimens (simulated markets,
 * clearly tagged). Ranked by 24h volume. Shared by the homepage board, the list view and the ticker.
 */
export function usePlatformMarket() {
  const market = useMarket(); const data = market.data;
  return useMemo(() => {
    const now = Date.now(); const day = now - 86_400_000;
    const live: BoardCoin[] = (data?.coins ?? []).filter(c => c.objectId).map(c => ({ key: c.token, to: `/objects/${c.objectId}`, symbol: c.symbol, name: c.name, icon: <CoinIcon src={c.logo} seed={c.token} size={36}/>, priceEth: c.priceEth, changePct: c.changePct, volumeEth: c.volumeEth, capEth: c.priceEth * 1e9, trades: c.trades, buys: c.buys, sells: c.sells, spark: [], live: true }));
    const lab: BoardCoin[] = previewCoins().map(c => { const recent = c.trades.filter(t => t.at >= day); return { key: c.ticker, to: `/coin/${c.ticker.toLowerCase()}`, symbol: c.ticker, name: c.name, icon: <img src={c.exhibit.coin} alt="" className="size-9 rounded-full object-cover shadow-[0_0_0_1px_rgba(12,13,16,.1)]"/>, priceEth: c.priceEth, changePct: c.change24h, volumeEth: c.volume24hEth, capEth: c.marketCapEth, trades: recent.length, buys: recent.filter(t => t.side === 'buy').length, sells: recent.filter(t => t.side === 'sell').length, spark: c.trades.filter((_, i) => i % 4 === 0).map(t => t.price), live: false, tag: c.tag }; });
    const coins = [...live, ...lab].sort((a, b) => Number(b.live) - Number(a.live) || b.volumeEth - a.volumeEth);
    const liveTrades: BoardTrade[] = (data?.trades ?? []).filter((t: MarketTrade) => t.objectId).map(t => ({ id: t.id, to: `/objects/${t.objectId}`, symbol: t.symbol, icon: <CoinIcon src={t.logo} seed={t.token} size={28}/>, side: t.side, eth: t.eth, trader: t.trader, at: t.at, href: explorerTx(t.hash), live: true }));
    const labTrades: BoardTrade[] = previewCoins().flatMap(c => c.trades.slice(-8).map(t => ({ id: t.id, to: `/coin/${c.ticker.toLowerCase()}`, symbol: c.ticker, icon: <img src={c.exhibit.coin} alt="" className="size-7 rounded-full"/>, side: t.side, eth: t.eth, trader: t.trader, at: t.at, live: false })));
    const trades = [...liveTrades, ...labTrades].sort((a, b) => b.at - a.at);
    const totals = coins.reduce((s, c) => ({ volumeEth: s.volumeEth + c.volumeEth, trades: s.trades + c.trades, buys: s.buys + c.buys, sells: s.sells + c.sells, capEth: s.capEth + (c.capEth ?? 0) }), { volumeEth: 0, trades: 0, buys: 0, sells: 0, capEth: 0 });
    return { coins, trades, totals, liveCount: live.length, ethUsd: data?.ethUsd ?? null, updatedAt: data?.updatedAt ?? now, loading: market.isPending };
  }, [data, market.isPending]);
}

const Spark = memo(function Spark({ prices, up }: { prices: number[]; up: boolean }) {
  if (prices.length < 3) return <span className="block h-7 w-20"/>;
  return <svg viewBox="0 0 100 28" className="h-7 w-20" preserveAspectRatio="none" aria-hidden="true"><path d={sparkPath(prices)} fill="none" stroke={up ? '#12A150' : '#E5484D'} strokeWidth="2" strokeLinejoin="round"/></svg>;
});

const Row = memo(function Row({ coin, rank, ethUsd, maxVolume }: { coin: BoardCoin; rank: number; ethUsd: number | null; maxVolume: number }) {
  const buyShare = coin.trades ? coin.buys / coin.trades : 0.5; const up = coin.changePct >= 0;
  return <Link to={coin.to} className="group flex min-h-[64px] items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-white sm:px-3">
    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-extrabold tnum', rank === 1 ? 'bg-[#F7D774]/60' : rank === 2 ? 'bg-[#D9DEE6]' : rank === 3 ? 'bg-[#E8C3A0]/60' : 'text-ink/65')}>{rank}</span>
    {coin.icon}
    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-[15px] font-extrabold">${coin.symbol}</span>{coin.live ? <span className="flex items-center gap-1 rounded-full bg-up/12 px-1.5 py-px font-mono text-[11px] font-bold text-up"><span className="pulse-dot size-1.5 rounded-full bg-up"/>LIVE</span> : <span className="rounded-full bg-ink/[0.06] px-1.5 py-px font-mono text-[11px] font-bold text-ink/60">SIM</span>}</span><span className="block truncate text-xs font-semibold text-ink/60">{coin.name}</span></span>
    <span className="hidden lg:block"><Spark prices={coin.spark} up={up}/></span>
    <span className="hidden w-28 shrink-0 sm:block"><span className="flex h-2 overflow-hidden rounded-full bg-down/30"><span className="bar-grow block h-full rounded-full bg-up" style={{ width: `${Math.round(buyShare * 100)}%` }}/></span><span className="mt-1 block font-mono text-[11.5px] font-semibold text-ink/60 tnum"><span className="text-up">{coin.buys}</span> / <span className="text-down">{coin.sells}</span></span></span>
    <span className="w-24 shrink-0 text-right"><span className="block text-sm font-bold tnum">{ethUsd ? tinyUsd(coin.priceEth * ethUsd) : eth(coin.priceEth, 10)}</span><span className={cn('block font-mono text-[11px] font-bold tnum', up ? 'text-up' : 'text-down')}>{up ? '▲' : '▼'} {pct(coin.changePct)}</span></span>
    <span className="hidden w-24 shrink-0 text-right md:block"><span className="block text-sm font-bold tnum">{coin.capEth ? (ethUsd ? usd(coin.capEth * ethUsd, 0) : eth(coin.capEth, 1)) : '—'}</span><span className="block font-mono text-[11.5px] text-ink/65">mcap</span></span>
    <span className="hidden w-28 shrink-0 text-right md:block"><span className="block text-sm font-bold tnum">{ethUsd ? usd(coin.volumeEth * ethUsd, 0) : eth(coin.volumeEth, 2)}</span><span className="mt-1 block h-1 overflow-hidden rounded-full bg-ink/[0.06]"><span className="bar-grow ml-auto block h-full rounded-full bg-gradient-to-r from-[#00C805] to-[#6EE7A0]" style={{ width: `${Math.max(4, (coin.volumeEth / maxVolume) * 100)}%` }}/></span></span>
    <ArrowUpRight size={14} className="hidden shrink-0 text-ink/65 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink lg:block"/>
  </Link>;
});

/** Live trade tape across every ObjectPad coin. */
export const Tape = memo(function Tape({ trades, ethUsd, limit = 14 }: { trades: BoardTrade[]; ethUsd: number | null; limit?: number }) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  return <ul className="space-y-1">{trades.slice(0, limit).map(trade => { const buy = trade.side === 'buy'; return <li key={trade.id} className="tape-in">
    <Link to={trade.to} className="flex min-h-12 items-center gap-3 rounded-xl bg-white/70 px-3 py-2 text-sm transition-colors hover:bg-white">
      <span className={cn('h-7 w-1 shrink-0 rounded-full', buy ? 'bg-up' : 'bg-down')}/>
      {trade.icon}
      <span className="min-w-0 flex-1"><span className="block truncate font-extrabold">${trade.symbol}{!trade.live && <span className="ml-1.5 font-mono text-[11px] font-bold text-ink/65">SIM</span>}</span><span className="block font-mono text-[11.5px] text-ink/60">{shortAddress(trade.trader, 4, 3)} · {timeAgo(trade.at, now)}</span></span>
      <span className={cn('rounded-md px-1.5 py-0.5 font-mono text-[11.5px] font-bold uppercase', buy ? 'bg-up/10 text-up' : 'bg-down/10 text-down')}>{buy ? 'Buy' : 'Sell'}</span>
      <span className={cn('w-20 shrink-0 text-right font-mono text-[13px] font-bold tnum', buy ? 'text-up' : 'text-down')}>{ethUsd ? usd(trade.eth * ethUsd) : eth(trade.eth, 3)}</span>
    </Link>
  </li>; })}</ul>;
});

/** The ObjectPad market: platform-wide 24h volume, trades, buy pressure, ranked coins and the live tape. */
export function MarketBoard({ limit = 10, compact = false }: { limit?: number; compact?: boolean }) {
  const board = usePlatformMarket(); const { ethUsd, totals } = board;
  const coins = board.coins.slice(0, limit); const maxVolume = Math.max(...coins.map(c => c.volumeEth), 1e-9);
  const buyPct = totals.trades ? Math.round((totals.buys / totals.trades) * 100) : 50;
  const stats: { label: string; value: ReactNode; tint: string }[] = [
    { label: '24h volume', value: <CountUp value={ethUsd ? totals.volumeEth * ethUsd : totals.volumeEth} format={v => ethUsd ? usd(v, 0) : eth(v, 2)}/>, tint: 'from-white to-[#F1F3F6]' },
    { label: '24h trades', value: <CountUp value={totals.trades} format={v => compactNumber(Math.round(v))}/>, tint: 'from-white to-[#F1F3F6]' },
    { label: 'Coins trading', value: <CountUp value={board.coins.length} format={v => String(Math.round(v))}/>, tint: 'from-white to-[#F1F3F6]' },
    { label: 'Buy pressure', value: <span className={cn('tnum', buyPct >= 50 ? 'text-up' : 'text-down')}>{buyPct}%</span>, tint: 'from-white to-[#F1F3F6]' },
  ];
  return <div className={cn('grid gap-4', !compact && 'xl:grid-cols-[1.55fr_1fr]')}>
    <div className="raised rounded-[28px] p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-2"><div className="flex items-center gap-2.5"><span className="pulse-dot size-2 rounded-full bg-up"/><h3 className="text-base font-extrabold">ObjectPad coins</h3><span className="chip">by 24h volume</span></div><span className="font-mono text-[11.5px] font-bold uppercase text-ink/60">{board.liveCount} live · updated {timeAgo(board.updatedAt)}</span></div>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{stats.map(stat => <div key={stat.label} className={cn('rounded-2xl bg-gradient-to-br px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(12,13,16,.07)]', stat.tint)}><dt className="spec !text-[11px]">{stat.label}</dt><dd className="display mt-1.5 text-2xl">{stat.value}</dd></div>)}</dl>
      <div className="mt-3 px-2"><div className="flex h-2.5 overflow-hidden rounded-full"><span className="bg-up transition-all duration-700" style={{ width: `${buyPct}%` }}/><span className="flex-1 bg-down/70"/></div><div className="mt-1 flex justify-between font-mono text-[11.5px] font-bold uppercase"><span className="text-up">{totals.buys} buys</span><span className="text-down">{totals.sells} sells</span></div></div>
      <div className="mt-4 flex items-center gap-3 px-3 font-mono text-[11px] font-bold uppercase tracking-wider text-ink/65"><span className="w-7 text-center">#</span><span className="w-9"/><span className="flex-1">Coin</span><span className="hidden w-20 lg:block">24h</span><span className="hidden w-28 sm:block">Buys / sells</span><span className="w-24 text-right">Price</span><span className="hidden w-24 text-right md:block">Mcap</span><span className="hidden w-28 text-right md:block">Volume 24h</span><span className="hidden w-[14px] lg:block"/></div>
      <div className="mt-1 divide-y divide-ink/[0.05]">{coins.map((coin, i) => <Row key={coin.key} coin={coin} rank={i + 1} ethUsd={ethUsd} maxVolume={maxVolume}/>)}</div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink/[0.06] px-2 pt-3 text-xs font-semibold text-ink/65"><span className="flex items-center gap-1.5"><Box size={13}/>LIVE = on Robinhood Chain · SIM = lab specimen, simulated market</span><Link to="/explore?tab=market" className="flex min-h-9 items-center gap-1 font-extrabold text-ink">Full list<ArrowUpRight size={13}/></Link></div>
    </div>
    {!compact && <div className="raised flex flex-col rounded-[28px] p-3 sm:p-5">
      <div className="flex items-center justify-between px-1"><h3 className="flex items-center gap-2 text-base font-extrabold"><span className="pulse-dot size-2 rounded-full bg-up"/>Live trades</h3><span className="font-mono text-[11.5px] font-bold uppercase text-ink/60">all ObjectPad coins</span></div>
      <div className="sunk mt-4 flex-1 rounded-2xl p-1.5"><Tape trades={board.trades} ethUsd={ethUsd} limit={limit >= 20 ? 24 : 12}/></div>
    </div>}
  </div>;
}
