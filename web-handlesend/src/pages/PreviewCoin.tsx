import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, Copy, MousePointer2 } from 'lucide-react';
import type { Address } from 'viem';
import { useCurveTrades, useMarket } from '@/lib/market';
import { exhibitForTicker, useCoins, useHolders } from '@/lib/coins';
import { useCurve } from '@/lib/objects';
import { TradePanel } from '@/components/TradePanel';
import { explorerTx } from '@/shared/pons';
import { compactNumber, copyText, eth, pct, shortAddress, timeAgo, tinyUsd, usd } from '@/lib/format';
import { PriceChart } from '@/components/PriceChart';
import { TxPanel, sampleTx, useLaunchTx } from '@/components/TxProof';
import { SegmentedTabs } from '@/components/Tabs';
import { SpecimenCard } from '@/components/CoinCard';
import { GlassIcon, type GlassName } from '@/components/GlassIcon';
import { AsciiField } from '@/components/AsciiField';
import { Loading } from '@/components/Feedback';
import { demoHash, exhibitSpecs } from '@/lib/memes';
import { cn } from '@/lib/utils';

const ExhibitViewer = lazy(() => import('@/components/ExhibitViewer'));
type Tab = 'trades' | 'holders' | 'treasury';

/** Coin page for an ObjectPad original: a real Pons coin launched by the ObjectPad treasury, with its live on-chain market. */
export default function PreviewCoin() {
  const { ticker = '' } = useParams(); const key = ticker.toLowerCase();
  const feed = useCoins(); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null;
  const originals = useMemo(() => (feed.data?.items ?? []).filter(c => c.kind === 'original'), [feed.data]);
  const coin = originals.find(c => c.symbol.toLowerCase() === key || exhibitForTicker(c.symbol)?.ticker.toLowerCase() === key);
  const exhibit = coin ? exhibitForTicker(coin.symbol) : exhibitForTicker(ticker);
  const live = coin?.state === 'live' && coin.curve ? coin : null;
  const curve = useCurve(live?.curve as Address | undefined); const trades = useCurveTrades(live?.curve); const holders = useHolders(live?.curve);
  const launchTx = useLaunchTx(live?.launchHash);
  const [tab, setTab] = useState<Tab>('trades'); const [copied, setCopied] = useState<boolean>(false);
  const sample = useMemo(() => exhibit && coin ? sampleTx({ tag: coin.tag ?? '', objectName: exhibit.catalog, objectId: demoHash(`${exhibit.id}-object`, 64), coinName: coin.name, symbol: coin.symbol, specs: exhibitSpecs(exhibit) }) : null, [exhibit, coin]);
  const list = useMemo(() => trades.data?.trades ?? [], [trades.data]);
  if (feed.isPending) return <Loading label="Reading the coin from Robinhood Chain…"/>;
  if (!coin || !exhibit) return <div className="page py-24 text-center"><h1 className="display text-5xl">Coin not found.</h1><Link to="/explore" className="btn press mt-6 min-h-12 px-6">Explore coins<ArrowRight size={16}/></Link></div>;
  const state = curve.data; const priceEth = state?.priceEth ?? coin.priceEth; const capEth = state?.marketCapEth ?? coin.marketCapEth; const progress = state?.progress ?? coin.progress;
  const money = (v: number) => (ethUsd ? usd(v * ethUsd) : eth(v, 4)); const price = !live ? '—' : ethUsd ? tinyUsd(priceEth * ethUsd) : `${priceEth.toPrecision(3)} ETH`;
  const fallback = <div className="flex h-full items-center justify-center"><img src={exhibit.image} alt="" className="h-[70%] object-contain"/></div>;
  const others = originals.filter(c => c.id !== coin.id && c.state === 'live').slice(0, 4); const up = coin.change24h >= 0;
  const volume = list.reduce((s, t) => s + t.eth, 0);
  const proof: { icon: GlassName; title: string; stat: string }[] = [{ icon: 'mesh', title: 'Real 3D scan', stat: `${compactNumber(exhibit.triangles)} tris` }, { icon: 'chain', title: 'Live on-chain', stat: live ? shortAddress(live.token, 6, 4) : 'launching' }, { icon: 'fingerprint', title: 'Object tag', stat: coin.tag ?? '1 of 1' }, { icon: 'coins', title: 'On-chain trades', stat: `${coin.trades.toLocaleString()}` }];
  return <div className="page py-5 sm:py-8">
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div className="steel relative overflow-hidden rounded-[34px] p-2.5">
        <div className="raised crop relative h-[400px] overflow-hidden rounded-[28px] sm:h-[600px] lg:h-full lg:min-h-[600px]"><i/><i/><i/><i/>
          <div className="scan-stage absolute inset-0" aria-hidden="true"/><div className="scan-grid absolute inset-0" aria-hidden="true"/>
          <div className="ticks-x pointer-events-none absolute inset-x-14 bottom-3 h-3 opacity-60" aria-hidden="true"/><div className="ticks-y pointer-events-none absolute inset-y-20 left-3 w-3 opacity-60" aria-hidden="true"/>
          <Suspense fallback={fallback}><ExhibitViewer src={exhibit.url} active fallback={fallback}/></Suspense>
          <div className="pointer-events-none absolute left-5 top-5 max-w-[75%] sm:left-6 sm:top-6 sm:max-w-[60%]"><p className="lab">ObjectPad original</p><p className="display mt-2 text-[24px] leading-[1.02] sm:text-[36px]">{exhibit.catalog}</p>{coin.tag && <span className="chip-dark mt-2.5">{coin.tag}</span>}</div>
          <span className="chip pointer-events-none absolute right-6 top-6 hidden sm:inline-flex"><MousePointer2 size={12}/>Drag 360°</span>
          <div className="raised pointer-events-none absolute bottom-5 left-5 right-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[20px] px-4 py-3 sm:right-auto">
            <span className="flex items-center gap-2"><GlassIcon name="chain" size={30}/><span><span className="block font-mono text-[11px] font-bold uppercase text-ink/60">Launch tx</span><span className="block font-mono text-[12px] font-extrabold">{live?.launchHash ? shortAddress(live.launchHash, 8, 6) : 'launching…'}</span></span></span>
            {[['tris', exhibit.triangles.toLocaleString()], ['verts', exhibit.vertices.toLocaleString()], ['edges', exhibit.edges.toLocaleString()], ['dims', exhibit.dims.map(d => d.toFixed(2)).join('×')]].map(([k, v]) => <span key={k}><span className="block font-mono text-[11px] font-bold uppercase text-ink/60">{k}</span><span className="block font-mono text-[12px] font-extrabold tnum">{v}</span></span>)}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="raised rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center gap-3"><img src={exhibit.coin} alt="" className="size-16 rounded-full shadow-[0_0_0_1.5px_rgba(12,13,16,.12),0_10px_20px_-10px_rgba(20,24,40,.5)]"/><div className="min-w-0 flex-1"><h1 className="display truncate text-[32px] sm:text-[40px]">{coin.name}</h1><p className="mt-1 flex items-center gap-2 font-mono text-xs font-semibold text-ink/65"><span className="chip-dark">${coin.symbol}</span>{live ? <>{shortAddress(live.token, 6, 4)}<button onClick={() => void copyText(live.token).then(setCopied)} aria-label="Copy contract address" className="flex size-8 items-center justify-center rounded-full hover:bg-ink/5">{copied ? <Check size={13}/> : <Copy size={13}/>}</button></> : 'launching soon'}</p></div></div>
          <div className="mt-5 flex items-end justify-between"><div><p className="stat-label">Price</p><p className="display text-[38px] leading-none tnum">{price}</p></div>{live && <span className={cn('rounded-xl px-3 py-1.5 font-mono text-sm font-extrabold', up ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>{up ? '▲' : '▼'} {pct(coin.change24h)} 24h</span>}</div>
          <dl className="mt-5 grid grid-cols-2 gap-2">{[['Market cap', live ? money(capEth) : '—'], ['24h volume', live ? money(coin.volume24hEth) : '—'], ['Holders', live ? (holders.data?.count ?? coin.holders).toLocaleString() : '—'], ['Launched', live && coin.launchedAt ? timeAgo(coin.launchedAt) : 'soon']].map(([k, v]) => <div key={k} className="sunk rounded-2xl px-3.5 py-3"><dt className="stat-label !text-[11px]">{k}</dt><dd className="mt-1 text-[19px] font-extrabold tnum">{v}</dd></div>)}</dl>
          <div className="mt-4"><div className="sunk h-2.5 overflow-hidden rounded-full"><div className="bar-grow h-full rounded-full bg-ink" style={{ width: `${Math.max(1, progress * 100)}%` }}/></div><p className="mt-1.5 font-mono text-[11.5px] font-bold uppercase text-ink/65">{(progress * 100).toFixed(2)}% to graduation</p></div>
        </div>
        {launchTx.data ? <TxPanel view={launchTx.data} expected={coin.tag ? { objectTag: coin.tag } : undefined} colors={exhibit.colors}/> : sample && <TxPanel view={sample} colors={exhibit.colors}/>}
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{proof.map(card => <div key={card.title} className="raised flex items-center gap-3 rounded-[24px] p-3 pr-4"><GlassIcon name={card.icon} size={52}/><div className="min-w-0"><p className="text-[15px] font-extrabold">{card.title}</p><p className="truncate font-mono text-[11px] font-bold text-ink/65">{card.stat}</p></div></div>)}</div>

    <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <section className="raised rounded-[30px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-[18px] font-extrabold"><GlassIcon name="chart" size={36}/>${coin.symbol} / ETH</h2><span className="chip"><span className="pulse-dot size-1.5 rounded-full bg-up"/>LIVE · Robinhood Chain</span></div>
        {!live ? <div className="sunk mt-4 flex h-[420px] items-center justify-center rounded-2xl text-[15px] font-bold text-ink/65">Launching on Robinhood Chain. The chart goes live with the first trade.</div> : trades.isPending ? <div className="sunk mt-4 h-[420px] animate-pulse rounded-2xl"/> : <PriceChart trades={list} ethUsd={ethUsd} className="mt-4 h-[380px] sm:h-[460px]"/>}
        <div className="mt-5"><SegmentedTabs label="Coin data" size="sm" value={tab} onChange={setTab} items={[{ value: 'trades', label: 'Trades' }, { value: 'holders', label: 'Holders' }, { value: 'treasury', label: 'Fee split' }]}/></div>
        {tab === 'trades' && (list.length ? <div className="sunk mt-4 max-h-80 overflow-auto rounded-2xl"><table className="w-full text-left text-xs"><thead className="stat-label sticky top-0 bg-[#EEF0F3]/95 backdrop-blur"><tr><th className="px-3 py-2.5 font-bold">Side</th><th className="font-bold">Amount</th><th className="font-bold">Tokens</th><th className="hidden font-bold sm:table-cell">Trader</th><th className="px-3 text-right font-bold">When</th></tr></thead><tbody>{[...list].reverse().slice(0, 80).map(t => <tr key={t.id} className="border-t border-ink/[0.06]"><td className={cn('px-3 py-2 font-extrabold uppercase', t.side === 'buy' ? 'text-up' : 'text-down')}>{t.side}</td><td className="font-semibold tnum">{money(t.eth)}</td><td className="tnum">{compactNumber(t.tokens)}</td><td className="hidden font-mono text-ink/60 sm:table-cell">{shortAddress(t.trader, 5, 3)}</td><td className="px-3 text-right"><a href={explorerTx(t.hash)} target="_blank" rel="noreferrer" className="font-mono text-ink/65 hover:underline">{timeAgo(t.at)}</a></td></tr>)}</tbody></table></div> : <p className="sunk mt-4 rounded-2xl p-5 text-sm font-bold text-ink/65">No trades yet. Be the first buyer.</p>)}
        {tab === 'holders' && (holders.data?.holders.length ? <ul className="mt-4 space-y-1.5">{holders.data.holders.slice(0, 20).map((h, i) => <li key={h.address} className="sunk flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm"><span className="w-5 font-mono text-xs font-bold text-ink/60">{i + 1}</span><a href={`https://robinhoodchain.blockscout.com/address/${h.address}`} target="_blank" rel="noreferrer" className="font-mono text-xs font-semibold hover:underline">{shortAddress(h.address, 6, 4)}</a>{h.label && <span className="chip-dark !py-0.5">{h.label}</span>}<span className="ml-auto hidden font-mono text-[11px] text-ink/65 sm:block">held {timeAgo(h.since).replace(' ago', '')}</span><span className="w-24 sm:w-28"><span className="block h-1.5 overflow-hidden rounded-full bg-ink/[0.08]"><span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(2, h.share * 100)}%` }}/></span></span><span className="w-14 text-right font-mono text-xs font-extrabold">{(h.share * 100).toFixed(2)}%</span></li>)}</ul> : <p className="sunk mt-4 rounded-2xl p-5 text-sm font-bold text-ink/65">{holders.isPending && live ? 'Reading holders…' : 'No holders yet.'}</p>)}
        {tab === 'treasury' && <div className="mt-4 grid gap-3 sm:grid-cols-3">{([{ t: 'Buyback & burn $OBJECTPAD', v: volume * 0.005, icon: 'burn' }, { t: 'Creator', v: volume * 0.005, icon: 'coins' }, { t: 'Holders', v: volume * 0.005, icon: 'diamond' }] as { t: string; v: number; icon: GlassName }[]).map(f => <div key={f.t} className="sunk rounded-[20px] p-4"><GlassIcon name={f.icon} size={48}/><p className="display mt-3 text-2xl tnum">{money(f.v)}</p><p className="text-sm font-bold text-ink/60">{f.t}</p></div>)}<p className="text-xs font-semibold text-ink/65 sm:col-span-3">0.5% of every trade each, from {list.length} on-chain trades ({money(volume)} volume).</p></div>}
      </section>
      <div className="space-y-4">
        <div className="raised rounded-[30px] p-5 sm:p-6"><h2 className="mb-4 flex items-center gap-2 text-[18px] font-extrabold"><GlassIcon name="coins" size={34}/>Trade ${coin.symbol}</h2>
          {live ? <><TradePanel token={live.token as Address} curve={live.curve as Address} symbol={coin.symbol} state={state}/>{live.launchHash && <a href={explorerTx(live.launchHash)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 text-[13px] font-extrabold text-ink underline">Launch transaction on Robinhood Chain<ArrowUpRight size={13}/></a>}</> : <p className="sunk rounded-2xl p-4 text-[15px] font-bold text-ink/70">Launching soon. Trading opens the moment it is live.</p>}
          <Link to="/launch" className="btn press mt-3 min-h-12 w-full text-sm"><GlassIcon name="qr" size={26} className="!filter-none"/>Launch your own object coin free</Link>
        </div>
        <section className="steel relative overflow-hidden rounded-[26px] p-5"><AsciiField className="absolute inset-0 h-full w-full" cell={14} density={0.06} chart={false} tone={0.08}/><p className="lab relative">The object</p><p className="relative mt-3 text-[16px] font-bold leading-7 text-ink/80">{exhibit.caption}</p><p className="relative mt-2 text-[13px] font-semibold text-ink/60">An ObjectPad original, launched by the ObjectPad treasury. Scan your own object and launch it free.</p></section>
      </div>
    </div>

    {others.length > 0 && <section className="mt-10"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab">More object coins</p><h2 className="display mt-2 text-[34px]">Keep scrolling the lab.</h2></div><Link to="/launch" className="btn press min-h-12 pl-1.5 pr-5 text-sm"><span className="orb size-9"><GlassIcon name="qr" size={26} className="!filter-none"/></span>Launch yours free</Link></div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{others.map((c, i) => <SpecimenCard key={c.id} coin={c} ethUsd={ethUsd} index={i}/>)}</div>
    </section>}
  </div>;
}
