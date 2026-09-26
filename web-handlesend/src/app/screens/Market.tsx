import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { ArrowDownCircle, ArrowUpCircle, ArrowUpRight, Box, CheckCircle2, CircleHelp, Search, Share, Star, BadgeCheck } from 'lucide-react';
import type { ObjectCoin, ObjectRecord } from '@/shared/domain';
import { api } from '@/lib/api';
import { readCurve, quoteBuy, quoteSell, withSlippage, ensureAllowance, prepareTx, waitForReceipt, parseAmount, type CurveState } from '@/lib/chain';
import { useHolders, type CoinTrade } from '@/lib/coins';
import { buyPairedWithEth, quotePairedBuy } from '@/lib/pairs';
import { CURVE_ABI } from '@/shared/pons';
import { useApp } from '../store';
import { isNsfwCoin } from '@/shared/nsfw';
import { Feedback } from '../feedback';
import { Fmt } from '../format';
import { Cover, PushScreen, RootScreen, Sheet } from '../chrome';
import { PairBadge, V2Tag } from '../pairs';
import { CircleIconButton, CloudDrift, CoinAvatar, ConfettiBurst, Display, EmptyState, Enter, ErrorBanner, InkSegmented, Lab, PadButton, PAD, Pill, ProgressBar, RemoteImage, Rolling, Shimmer, Sparkline, Spinner, StatTile } from '../ui';

const EXPLORER = 'https://robinhoodchain.blockscout.com';
const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
const addressUrl = (a: string) => `${EXPLORER}/address/${a}`;
const tokenUrl = (a: string) => `${EXPLORER}/token/${a}`;
const ModelView = lazy(() => import('../ModelView'));

type Sort = 'Trending' | 'New' | 'Market cap' | 'Volume' | 'Watchlist' | 'NSFW 18+';
const SORTS: Sort[] = ['Trending', 'New', 'Market cap', 'Volume', 'Watchlist', 'NSFW 18+'];

function TradeTicker({ trades, coins, ethUsd }: { trades: CoinTrade[]; coins: ObjectCoin[]; ethUsd: number | null }) {
  const items = [...trades, ...trades];
  return <div className="ap-sunk h-[34px] overflow-hidden rounded-[14px] px-3"><div className="ap-marquee h-full items-center gap-[18px]" style={{ ['--dur' as string]: `${trades.length * 3.2}s` }}>{items.map((t, i) => { const sym = coins.find(c => c.curve.toLowerCase() === t.curve.toLowerCase())?.symbol ?? 'COIN'; return <span key={i} className="flex shrink-0 items-center gap-[5px]"><span className="size-1.5 rounded-full" style={{ background: t.side === 'buy' ? PAD.up : PAD.down }}/><span className="ap-mono whitespace-nowrap text-[11px] font-extrabold text-ink/70">{t.side.toUpperCase()} ${sym} · {Fmt.value(t.eth, ethUsd)}</span></span>; })}</div></div>;
}

export function CoinRow({ coin, rank, ethUsd }: { coin: ObjectCoin; rank: number; ethUsd: number | null }) {
  return <div className="ap-raised flex items-center gap-3 rounded-[22px] p-3 text-left">
    <span className="ap-mono w-5 shrink-0 text-center text-[11px] font-extrabold text-[#6A6E78]">{rank}</span>
    <CoinAvatar url={coin.logo} symbol={coin.symbol} size={50}/>
    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-extrabold">{coin.name}</span><span className="mt-0.5 flex items-center gap-1.5"><span className="ap-mono truncate text-[10.5px] font-bold text-[#6A6E78]">${coin.symbol} · {coin.holders} holders</span>{coin.pair && <PairBadge pair={coin.pair}/>}</span></span>
    <Sparkline points={coin.spark} up={coin.change24h >= 0} className="h-6 w-[52px] shrink-0"/>
    <span className="shrink-0 text-right"><span className="block text-[14px] font-extrabold">{Fmt.value(coin.marketCapEth, ethUsd)}</span><span className="ap-mono block text-[11px] font-extrabold" style={{ color: coin.change24h >= 0 ? PAD.up : PAD.down }}>{Fmt.pct(coin.change24h)}</span></span>
  </div>;
}

export default function MarketView() {
  const app = useApp(); const [sort, setSort] = useState<Sort>('Trending'); const [query, setQuery] = useState<string>(''); const [pairFilter, setPairFilter] = useState<string>('all'); const [adultOk, setAdultOk] = useState<boolean>(false);
  const list = useMemo(() => {
    const adult = sort === 'NSFW 18+'; let l = app.coins.filter(c => isNsfwCoin(c) === adult); const q = query.trim().toLowerCase();
    if (q) l = l.filter(c => `${c.name} ${c.symbol} ${c.objectName ?? ''} ${c.pair?.symbol ?? ''}`.toLowerCase().includes(q));
    if (pairFilter === 'stocks') l = l.filter(c => c.pair); else if (pairFilter === 'eth') l = l.filter(c => !c.pair); else if (pairFilter !== 'all') l = l.filter(c => c.pair?.address.toLowerCase() === pairFilter);
    const s = [...l];
    if (sort === 'Trending' || adult) return s.sort((a, b) => b.trending - a.trending); if (sort === 'New') return s.sort((a, b) => b.launchedAt - a.launchedAt);
    if (sort === 'Market cap') return s.sort((a, b) => b.marketCapEth - a.marketCapEth); if (sort === 'Volume') return s.sort((a, b) => b.volume24hEth - a.volume24hEth);
    return s.filter(c => app.watchlist.has(c.id));
  }, [app.coins, app.watchlist, query, pairFilter, sort]);
  const pairs = useMemo(() => { const m = new Map<string, { pair: NonNullable<ObjectCoin['pair']>; n: number }>(); app.coins.forEach(c => { if (!c.pair) return; const k = c.pair.address.toLowerCase(); const e = m.get(k); if (e) e.n++; else m.set(k, { pair: c.pair, n: 1 }); }); return [...m.values()].sort((a, b) => b.n - a.n); }, [app.coins]);
  const volume = app.coins.filter(c => !isNsfwCoin(c)).reduce((s, c) => s + c.volume24hEth, 0);
  return <RootScreen><div className="flex flex-col gap-3">
    <Enter className="flex flex-col gap-3.5">
      <Lab>Robinhood Chain · live</Lab><Display size={42}>Market</Display>
      <div className="flex gap-2"><StatTile label="Coins" value={`${app.coins.length}`} glass="glass_coins"/><StatTile label="24h volume" value={Fmt.value(volume, app.ethUsd)} glass="glass_chart"/></div>
      {app.recent.length > 0 && <TradeTicker trades={app.recent.slice(0, 14)} coins={app.coins} ethUsd={app.ethUsd}/>}
    </Enter>
    <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2.5 bg-[#ECEEF1]/[0.92] px-4 pb-2 pt-[max(8px,env(safe-area-inset-top))] backdrop-blur-md">
      <div className="ap-glass flex h-11 items-center gap-2 rounded-full px-3.5"><Search size={16} className="text-[#6A6E78]"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search objects" autoCorrect="off" className="ap-bare min-w-0 flex-1 text-[15px] font-semibold"/></div>
      <div className="ap-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4">{SORTS.map(s => <Pill key={s} title={s} icon={s === 'Watchlist' ? Star : undefined} on={sort === s} onClick={() => setSort(s)}/>)}</div>
      <div className="ap-scroll -mx-4 flex items-center gap-1.5 overflow-x-auto px-4"><V2Tag className="shrink-0"/>
        {([['all', 'All pairs'], ['stocks', 'Any stock'], ['eth', 'ETH']] as const).map(([k, l]) => <Pill key={k} title={l} on={pairFilter === k} onClick={() => setPairFilter(k)}/>)}
        {pairs.map(({ pair: p, n }) => { const on = pairFilter === p.address.toLowerCase(); return <button key={p.address} type="button" onClick={() => { Feedback.selection(); setPairFilter(p.address.toLowerCase()); }} className="ap-press ap-quiet flex h-[38px] shrink-0 items-center gap-[5px] rounded-full pl-1 pr-3" style={{ background: on ? PAD.ink : '#fff', color: on ? '#fff' : PAD.ink }}><CoinAvatar url={p.logo} symbol={p.symbol} size={22}/><span className="text-[13px] font-extrabold">{p.symbol}</span><span className="ap-mono text-[11px] font-bold opacity-60">{n}</span></button>; })}
      </div>
    </div>
    {app.coinsError ? <ErrorBanner message={app.coinsError}/> : !app.loaded ? [0, 1, 2, 3, 4, 5].map(i => <Shimmer key={i} className="h-[76px] rounded-[22px]"/>) : list.length === 0 ? <p className="pt-8 text-center text-[14px] font-semibold text-[#6A6E78]">{sort === 'Watchlist' ? 'Tap the star on any coin to watch it.' : 'No coins match.'}</p> : null}
    {sort === 'NSFW 18+' && !adultOk ? <div className="ap-raised mt-2 rounded-[24px] p-5 text-center"><p className="ap-mono text-[11px] font-extrabold" style={{ color: PAD.down }}>18+ · ADULT CONTENT</p><p className="mt-2 text-[22px] font-extrabold">NSFW coins</p><p className="mt-1.5 text-[14px] font-semibold text-[#6A6E78]">Coins with adult names or objects, flagged by keyword filters or our AI. Only continue if you're 18 or older.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setAdultOk(true)} className="ap-press h-12 flex-1 rounded-full text-[15px] font-extrabold text-white" style={{ background: PAD.ink }}>I'm 18+</button><button type="button" onClick={() => setSort('Trending')} className="ap-press ap-raised h-12 flex-1 rounded-full text-[15px] font-extrabold">Go back</button></div></div> : list.map((c, i) => <Enter key={c.id} delay={Math.min(i, 8) * 0.04}><button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.push(`/app/coin/${c.id}`)} className="ap-press block w-full"><CoinRow coin={c} rank={i + 1} ethUsd={app.ethUsd}/></button></Enter>)}
  </div></RootScreen>;
}

// ── Coin detail ─────────────────────────────────────────
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return ''; let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2; d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`; }
  return d;
}
function PriceChart({ trades }: { trades: CoinTrade[] }) {
  const pts = useMemo(() => trades.filter(t => t.price > 0).sort((a, b) => a.at - b.at), [trades]);
  if (pts.length < 2) return <p className="flex min-h-[120px] items-center justify-center text-[13px] font-semibold text-[#6A6E78]">The chart fills in as trades land.</p>;
  const lo = Math.min(...pts.map(p => p.price)), hi = Math.max(...pts.map(p => p.price)), span = hi - lo || hi * 0.1 || 1; const t0 = pts[0].at, t1 = pts[pts.length - 1].at, tspan = t1 - t0 || 1;
  const xy: [number, number][] = pts.map(p => [((p.at - t0) / tspan) * 300, 160 - ((p.price - lo) / span) * 150 - 5]); const line = smoothPath(xy);
  return <svg viewBox="0 0 300 170" className="h-[170px] w-full" preserveAspectRatio="none"><defs><linearGradient id="apc" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={PAD.sky} stopOpacity=".35"/><stop offset="1" stopColor={PAD.sky} stopOpacity="0"/></linearGradient></defs><path d={`${line} L300,170 L0,170 Z`} fill="url(#apc)"/><path d={line} fill="none" stroke={PAD.sky} strokeWidth="2.4" vectorEffect="non-scaling-stroke"/></svg>;
}

export function CoinDetailView() {
  const { id = '' } = useParams(); const app = useApp(); const c = app.coin(id);
  const [trading, setTrading] = useState<'buy' | 'sell' | null>(null); const [model3D, setModel3D] = useState<boolean>(false);
  const record = useQuery({ queryKey: ['objectpad', 'app', 'record', c?.id], enabled: Boolean(c), queryFn: () => api<ObjectRecord & { model?: { modelUrl: string; thumbnailUrl: string; triangles: number } }>(`/objects/${c!.id}`), retry: false });
  const curve = useQuery({ queryKey: ['objectpad', 'curve', c?.curve], enabled: Boolean(c), queryFn: () => readCurve(c!.curve as Address), refetchInterval: 15_000 });
  const trades = useQuery({ queryKey: ['objectpad', 'app', 'trades', c?.curve], enabled: Boolean(c), queryFn: () => api<{ trades: CoinTrade[] }>(`/curves/${c!.curve}/trades`, { timeout: 40_000 }), refetchInterval: 10_000 });
  const holders = useHolders(c?.curve);
  const list = useMemo(() => [...(trades.data?.trades ?? [])].sort((a, b) => b.at - a.at), [trades.data]);
  const r = record.data; const cs = curve.data; const watched = c ? app.watchlist.has(c.id) : false;
  const share = async () => { if (!c) return; const url = `https://www.objectpad.fun${c.path || `/objects/${c.id}`}`; try { if (navigator.share) await navigator.share({ url, text: `$${c.symbol} on ObjectPad` }); else { await navigator.clipboard.writeText(url); app.show('Link copied'); } } catch { /* cancelled */ } };
  return <PushScreen title={c ? `$${c.symbol}` : undefined} trailing={c && <><button type="button" aria-label="Watch" onClick={() => app.toggleWatch(c.id)} className="ap-press flex size-10 items-center justify-center"><Star size={20} fill={watched ? PAD.gold : 'none'} stroke={watched ? PAD.gold : PAD.ink} strokeWidth={2.3}/></button><button type="button" aria-label="Share" onClick={share} className="ap-press flex size-10 items-center justify-center"><Share size={19} strokeWidth={2.3}/></button></>}>
    <div className="flex flex-col gap-3.5 px-4 pb-28">
      {c ? <>
        <Enter className="flex flex-col gap-3.5">
          <div className="ap-sky relative flex h-[280px] items-center justify-center overflow-hidden rounded-[32px]">
            <CloudDrift style={{ opacity: 0.6 }}/>
            <div className="ap-bob size-[190px] overflow-hidden rounded-[40px] shadow-[0_12px_20px_rgba(0,0,0,.2)]"><RemoteImage src={r?.model?.thumbnailUrl || c.logo} fallback={c.symbol}/></div>
            {r?.model?.modelUrl && <button type="button" onClick={() => setModel3D(true)} className="ap-press ap-glass absolute bottom-3.5 right-3.5 flex items-center gap-1.5 rounded-full px-3.5 py-[9px] text-[13px] font-extrabold"><Box size={15}/>View in 3D</button>}
          </div>
          <div className="flex items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[15px] font-bold text-[#6A6E78]">{c.name}</p>
              {c.pair && <span className="flex items-center gap-1.5"><PairBadge pair={c.pair} showChange/>{c.pair.priceUsd && <span className="ap-mono truncate text-[11px] font-bold text-[#6A6E78]">{c.pair.name} · {Fmt.usd(c.pair.priceUsd)}</span>}</span>}
              <Rolling text={Fmt.price(cs?.priceEth ?? c.priceEth, app.ethUsd)} className="ap-display" style={{ fontSize: 36 }}/>
            </div>
            <span className="ap-mono rounded-full px-2.5 py-1.5 text-[14px] font-extrabold text-white" style={{ background: c.change24h >= 0 ? PAD.up : PAD.down }}>{Fmt.pct(c.change24h)}</span>
          </div>
        </Enter>
        <Enter delay={0.05}><div className="ap-raised flex flex-col gap-2 rounded-[26px] p-4">
          <PriceChart trades={list}/>
          {cs && <><div className="flex justify-between"><Lab>{cs.graduated ? 'Graduated to DEX' : 'Bonding curve'}</Lab><span className="ap-mono text-[11px] font-extrabold">{Math.floor(cs.progress * 100)}%</span></div><ProgressBar value={cs.progress} color={cs.graduated ? PAD.up : PAD.sky}/></>}
        </div></Enter>
        <Enter delay={0.1} className="flex gap-2.5"><PadButton title="Buy" icon={ArrowDownCircle} kind="up" onClick={() => setTrading('buy')}/><PadButton title="Sell" icon={ArrowUpCircle} kind="down" onClick={() => setTrading('sell')}/></Enter>
        <Enter delay={0.15} className="grid grid-cols-2 gap-2">
          <StatTile label="Market cap" value={Fmt.value(cs?.marketCapEth ?? c.marketCapEth, app.ethUsd)}/><StatTile label="24h volume" value={Fmt.value(c.volume24hEth, app.ethUsd)}/>
          <StatTile label="Holders" value={`${holders.data?.count ?? c.holders}`}/><StatTile label="Trades" value={`${c.trades}`}/>
        </Enter>
        {r && <Enter delay={0.2}><div className="ap-raised flex flex-col gap-2.5 rounded-[26px] p-4">
          <Lab>The object</Lab><p className="text-[15px] font-semibold text-ink/80">{r.story}</p>
          <div className="flex flex-wrap gap-2"><span className="ap-sunk flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold text-ink/75"><BadgeCheck size={13} fill={PAD.ink} stroke="#fff"/>{r.acceptedViewCount} verified angles</span>{(r.model?.triangles ?? 0) > 0 && <span className="ap-sunk flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold text-ink/75"><Box size={13}/>{Fmt.compact(r.model!.triangles)} tris</span>}</div>
          <div className="my-1 h-px bg-ink/10"/>
          {[['Token', r.tokenAddress, tokenUrl(r.tokenAddress)], r.launchTransactionHash ? ['Launch tx', r.launchTransactionHash, txUrl(r.launchTransactionHash)] : null, r.creatorWallet ? ['Creator', r.creatorWallet, addressUrl(r.creatorWallet)] : null].filter((x): x is string[] => Boolean(x)).map(([k, v, u]) => <a key={k} href={u} target="_blank" rel="noreferrer" className="flex items-center"><span className="flex-1 text-[13px] font-bold text-[#6A6E78]">{k}</span><span className="ap-mono text-[12px] font-bold">{Fmt.short(v, 8, 6)}</span><ArrowUpRight size={11} strokeWidth={3} className="ml-1 text-[#6A6E78]"/></a>)}
        </div></Enter>}
        <Enter delay={0.25}><div className="ap-raised flex flex-col gap-2.5 rounded-[26px] p-4">
          <Lab>Latest trades</Lab>{!list.length && <p className="text-[13px] font-semibold text-[#6A6E78]">No trades yet. Be the first.</p>}
          {list.slice(0, 12).map(t => <a key={t.id} href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="flex items-center gap-2"><span className="ap-mono flex h-[22px] w-11 items-center justify-center rounded-full text-[10.5px] font-extrabold text-white" style={{ background: t.side === 'buy' ? PAD.up : PAD.down }}>{t.side.toUpperCase()}</span><span className="ap-mono flex-1 text-[12px] font-bold">{Fmt.short(t.trader)}</span><span className="text-right"><span className="block text-[13px] font-extrabold">{Fmt.value(t.eth, app.ethUsd)}</span><span className="ap-mono block text-[10px] font-semibold text-[#6A6E78]">{Fmt.ago(t.at)}</span></span></a>)}
        </div></Enter>
        <Enter delay={0.3}><div className="ap-raised flex flex-col gap-2.5 rounded-[26px] p-4">
          <Lab>Top holders</Lab>
          {(holders.data?.holders ?? []).slice(0, 8).map((h, i) => <div key={h.address} className="flex items-center"><span className="ap-mono w-[18px] text-[11px] font-extrabold text-[#6A6E78]">{i + 1}</span><span className="ap-mono flex-1 text-[12px] font-bold">{h.label ?? Fmt.short(h.address)}</span><span className="text-[13px] font-extrabold">{(h.share * (h.share <= 1 ? 100 : 1)).toFixed(2)}%</span></div>)}
          {!(holders.data?.holders.length) && <p className="text-[13px] font-semibold text-[#6A6E78]">Loading holders…</p>}
        </div></Enter>
      </> : app.loaded ? <EmptyState icon={CircleHelp} title="Coin not found" body="It may still be launching. Pull to refresh."/> : <div className="flex justify-center pt-20"><Spinner/></div>}
    </div>
    {c && <TradeSheet coin={c} side={trading} curve={cs} onClose={() => setTrading(null)} onDone={() => { void curve.refetch(); void trades.refetch(); app.refreshHoldings(); }}/>}
    <Cover open={model3D} dark><div className="relative size-full">{r?.model?.modelUrl && model3D && <Suspense fallback={<div className="flex size-full items-center justify-center"><Spinner className="text-white/60"/></div>}><ModelView src={r.model.modelUrl}/></Suspense>}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[max(16px,env(safe-area-inset-top))]"><p className="text-[16px] font-extrabold text-white">{c?.name}</p><CircleIconButton icon={CheckCircle2} dark label="Done" onClick={() => setModel3D(false)}/></div></div></Cover>
  </PushScreen>;
}

// ── Trade sheet ─────────────────────────────────────────
function TradeSheet({ coin, side: initial, curve, onClose, onDone }: { coin: ObjectCoin; side: 'buy' | 'sell' | null; curve: CurveState | undefined; onClose: () => void; onDone: () => void }) {
  const app = useApp(); const [side, setSide] = useState<'buy' | 'sell'>('buy'); const [amount, setAmount] = useState<string>(''); const [slippage, setSlippage] = useState<number>(300);
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [hash, setHash] = useState<string | null>(null); const [done, setDone] = useState<boolean>(false);
  const [bal, setBal] = useState<{ eth: bigint; tokens: bigint } | null>(null); const [quote, setQuote] = useState<bigint | null>(null);
  const open = initial !== null; const units = parseAmount(amount); const wallet = app.activeWallet;
  useEffect(() => { if (open) { setSide(initial ?? 'buy'); setAmount(''); setDone(false); setError(null); setHash(null); } }, [open, initial]);
  useEffect(() => { if (!open || !wallet) return; let c = false; void (async () => { try { const { chain } = await import('@/lib/chain'); const [eth, tokens] = await Promise.all([chain.getBalance({ address: wallet }), app.tokenBalance(coin.token, wallet)]); if (!c) setBal({ eth, tokens }); } catch { /* shown as … */ } })(); return () => { c = true; }; }, [open, wallet, coin.token, done]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setQuote(null); if (!units || !open) return; let c = false;
    const t = setTimeout(async () => { try {
      const p = coin.pair ? app.pair(coin.pair.address) : undefined;
      const q = side === 'buy' ? (coin.pair && p ? (await quotePairedBuy(p, coin.curve as Address, units, app.pairs?.router.quoter)).tokensOut : await quoteBuy(coin.curve as Address, units)) : wallet ? await quoteSell(coin.curve as Address, wallet, units) : null;
      if (!c) setQuote(q);
    } catch { if (!c) setQuote(null); } }, 350);
    return () => { c = true; clearTimeout(t); };
  }, [amount, side, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const trade = async () => {
    if (!units) return; setError(null);
    try {
      const signer = app.signer(); const send = (tx: Parameters<typeof signer.sendPrepared>[0]): Promise<Hex> => signer.sendPrepared(tx);
      if (side === 'buy' && coin.pair) {
        const p = app.pair(coin.pair.address); if (!p?.route) throw new Error(`No on-chain ETH route to ${coin.pair.symbol} right now.`); setBusy('Quoting…');
        const h = await buyPairedWithEth({ wallet: signer.address, pair: p, curve: coin.curve as Address, ethIn: units, slippageBps: slippage, send, router: app.pairs?.router.swapRouter, quoter: app.pairs?.router.quoter, onStep: s => setBusy(s === 1 ? `1/3 Swapping ETH → ${p.symbol}…` : s === 2 ? `2/3 Approving ${p.symbol}…` : `3/3 Buying $${coin.symbol}…`) });
        setHash(h);
      } else {
        setBusy('Quoting…');
        const expected = side === 'buy' ? await quoteBuy(coin.curve as Address, units) : await quoteSell(coin.curve as Address, signer.address, units); const minimum = withSlippage(expected, slippage);
        if (minimum <= 0n) throw new Error('The curve would return nothing for this amount.');
        if (side === 'sell') { setBusy('Approving…'); await ensureAllowance(signer.address, coin.token as Address, coin.curve as Address, units, send); }
        setBusy(side === 'buy' ? 'Buying…' : 'Selling…');
        const h = await send(await prepareTx(signer.address, { to: coin.curve as Address, data: encodeFunctionData({ abi: CURVE_ABI, functionName: side, args: [units, minimum, signer.address] }), value: side === 'buy' ? units : 0n }));
        setHash(h); setBusy('Confirming…'); await waitForReceipt(h);
      }
      Feedback.success('coins'); setDone(true); onDone();
    } catch (e) { setError((e instanceof Error ? e.message : 'The trade didn’t go through.').split('\n')[0]); Feedback.error(); }
    setBusy(null);
  };
  const max = () => { if (side === 'buy') { if (bal) { const v = bal.eth - 3_000_000_000_000_000n; setAmount(v > 0n ? Fmt.units(v, 6).replace(/,/g, '') : ''); } } else if (bal) setAmount(Fmt.units(bal.tokens, 4).replace(/,/g, '')); };
  return <Sheet open={open} onClose={onClose}><div className="flex min-h-full flex-col gap-4 px-[18px]">
    <div className="flex items-center gap-3"><CoinAvatar url={coin.logo} symbol={coin.symbol} size={46}/><div><p className="text-[18px] font-extrabold">${coin.symbol}</p><p className="ap-mono text-[12px] font-bold text-[#6A6E78]">{Fmt.price(curve?.priceEth ?? coin.priceEth, app.ethUsd)}</p></div></div>
    {coin.pair && <div className="flex items-center gap-2 rounded-2xl bg-[#FFF8E6] p-2.5 ring-1 ring-[#F5C542]/50"><CoinAvatar url={coin.pair.logo} symbol={coin.pair.symbol} size={24}/><div><p className="text-[13px] font-extrabold">Paired with {coin.pair.symbol}</p><p className="text-[11.5px] font-semibold text-[#6A6E78]">{side === 'buy' ? `Pay with ETH · routed on-chain into ${coin.pair.symbol} (3 confirmations)` : `Sells pay out in ${coin.pair.symbol}`}</p></div></div>}
    <InkSegmented options={[['buy', 'Buy'], ['sell', 'Sell']]} value={side} onChange={v => { setSide(v); setAmount(''); }}/>
    {done ? <div className="relative flex flex-1 flex-col items-center justify-center gap-2.5 py-10">
      <ConfettiBurst/><CheckCircle2 size={64} fill={PAD.up} stroke="#fff" className="ap-bounce"/><Display size={34}>{side === 'buy' ? 'Bought.' : 'Sold.'}</Display>
      {hash && <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="text-[14px] font-extrabold underline">View on Blockscout</a>}<PadButton title="Done" onClick={onClose}/>
    </div> : <>
      <div className="ap-raised flex flex-col gap-2 rounded-[24px] p-4">
        <div className="flex items-center justify-between"><Lab>{side === 'buy' ? 'You pay (ETH)' : `You sell ($${coin.symbol})`}</Lab><button type="button" onClick={max} className="ap-mono text-[11px] font-extrabold">Max</button></div>
        <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0" className="ap-bare ap-display w-full !text-[46px] text-ink placeholder:text-ink/25"/>
        <p className="ap-mono text-[11.5px] font-bold text-[#6A6E78]">Balance: {side === 'buy' ? (bal ? `${Fmt.units(bal.eth, 5)} ETH` : '…') : (bal ? `${Fmt.units(bal.tokens, 2)} ${coin.symbol}` : '…')}</p>
        {side === 'buy' && <div className="flex gap-1.5">{['0.001', '0.005', '0.01', '0.05'].map(v => <Pill key={v} title={v} on={amount === v} onClick={() => setAmount(v)}/>)}</div>}
      </div>
      <div className="ap-sunk flex flex-col gap-2 rounded-[20px] p-3.5">
        <div className="flex items-center justify-between"><span className="text-[13px] font-bold text-[#6A6E78]">You receive ≈</span><Rolling text={quote === null ? '—' : side === 'buy' ? `${Fmt.compact(Fmt.toNum(quote))} ${coin.symbol}` : coin.pair ? `${Fmt.units(quote, 6)} ${coin.pair.symbol}` : `${Fmt.units(quote, 6)} ETH`} className="text-[15px] font-extrabold"/></div>
        <div className="flex items-center justify-between"><span className="text-[13px] font-bold text-[#6A6E78]">Slippage</span><div className="flex gap-1.5">{[100, 300, 500].map(v => <Pill key={v} title={`${v / 100}%`} on={slippage === v} onClick={() => setSlippage(v)}/>)}</div></div>
      </div>
      {error && <ErrorBanner message={error}/>}
      <div className="flex-1"/>
      <p className="text-center text-[11.5px] font-semibold text-[#6A6E78]">Signed on {app.signedIn ? 'your account wallet' : 'this phone’s wallet'} · 1.5% creator tax + 1% curve fee</p>
      <PadButton title={busy ?? (side === 'buy' ? `Buy $${coin.symbol}` : `Sell $${coin.symbol}`)} kind={side === 'buy' ? 'up' : 'down'} busy={busy !== null} enabled={Boolean(units) && quote !== null} onClick={() => void trade()}/>
    </>}
  </div></Sheet>;
}
