import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, Check, Copy, Lock, MousePointer2 } from 'lucide-react';
import { previewCoin, previewCoins } from '@/lib/preview';
import { useCurveTrades, useHouseCoins, useMarket } from '@/lib/market';
import { useCurve } from '@/lib/objects';
import { TradePanel } from '@/components/TradePanel';
import { explorerTx } from '@/shared/pons';
import type { Address } from 'viem';
import { compactNumber, copyText, eth, pct, shortAddress, timeAgo, tinyUsd, usd } from '@/lib/format';
import { PriceChart } from '@/components/PriceChart';
import { TxPanel, sampleTx } from '@/components/TxProof';
import { SegmentedTabs } from '@/components/Tabs';
import { SpecimenCard } from '@/components/CoinCard';
import { GlassIcon, type GlassName } from '@/components/GlassIcon';
import { AsciiField } from '@/components/AsciiField';
import { PercentRow, SideSwitch } from '@/components/TradePanel';
import { cn } from '@/lib/utils';

const ExhibitViewer = lazy(() => import('@/components/ExhibitViewer'));
type Tab = 'trades' | 'holders' | 'treasury';

/** Coin page for a lab specimen: same layout as a live coin, with its simulated market and trading switched off. */
export default function PreviewCoin() {
  const { ticker = '' } = useParams(); const coin = previewCoin(ticker); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null;
  const [tab, setTab] = useState<Tab>('trades'); const [side, setSide] = useState<'buy' | 'sell'>('buy'); const [copied, setCopied] = useState<boolean>(false);
  const house = useHouseCoins().data?.coins.find(c => c.ticker.toLowerCase() === ticker.toLowerCase()); const live = house?.state === 'live' && house.token && house.curve ? house : null;
  const curve = useCurve(live?.curve as Address | undefined); const liveTrades = useCurveTrades(live?.curve ?? undefined);
  const tx = useMemo(() => coin ? sampleTx({ tag: coin.tag, objectName: coin.exhibit.catalog, objectId: coin.objectId, coinName: coin.name, symbol: coin.ticker, specs: coin.specs }) : null, [coin]);
  if (!coin || !tx) return <div className="page py-24 text-center"><h1 className="display text-5xl">Coin not found.</h1><Link to="/explore" className="btn press mt-6 min-h-12 px-6">Explore coins<ArrowRight size={16}/></Link></div>;
  const money = (v: number) => (ethUsd ? usd(v * ethUsd) : eth(v, 3)); const price = ethUsd ? tinyUsd(coin.priceEth * ethUsd) : `${coin.priceEth.toPrecision(3)} ETH`;
  const e = coin.exhibit; const fallback = <div className="flex h-full items-center justify-center"><img src={e.image} alt="" className="h-[70%] object-contain"/></div>;
  const others = previewCoins().filter(c => c.ticker !== coin.ticker).slice(0, 4); const up = coin.change24h >= 0;
  const proof: { icon: GlassName; title: string; stat: string }[] = [{ icon: 'qr', title: 'Physically scanned', stat: '6 photos' }, { icon: 'mesh', title: 'Rebuilt in 3D', stat: `${compactNumber(e.triangles)} tris` }, { icon: 'fingerprint', title: 'Can’t be copied', stat: '1 of 1' }, { icon: 'chain', title: 'Named on-chain', stat: coin.tag }];
  return <div className="page py-5 sm:py-8">
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div className="steel relative overflow-hidden rounded-[34px] p-2.5">
        <div className="raised crop relative h-[400px] overflow-hidden rounded-[28px] sm:h-[600px] lg:h-full lg:min-h-[600px]"><i/><i/><i/><i/>
          <div className="scan-stage absolute inset-0" aria-hidden="true"/><div className="scan-grid absolute inset-0" aria-hidden="true"/>
          <div className="ticks-x pointer-events-none absolute inset-x-14 bottom-3 h-3 opacity-60" aria-hidden="true"/><div className="ticks-y pointer-events-none absolute inset-y-20 left-3 w-3 opacity-60" aria-hidden="true"/>
          <Suspense fallback={fallback}><ExhibitViewer src={e.url} active fallback={fallback}/></Suspense>
          <div className="pointer-events-none absolute left-5 top-5 max-w-[75%] sm:left-6 sm:top-6 sm:max-w-[60%]"><p className="lab">Object on-chain</p><p className="display mt-2 text-[24px] leading-[1.02] sm:text-[36px]">{e.catalog}</p><span className="chip-dark mt-2.5">{coin.tag}</span></div>
          <span className="chip pointer-events-none absolute right-6 top-6 hidden sm:inline-flex"><MousePointer2 size={12}/>Drag 360°</span>
          <div className="raised pointer-events-none absolute bottom-5 left-5 right-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[20px] px-4 py-3 sm:right-auto">
            <span className="flex items-center gap-2"><GlassIcon name="chain" size={30}/><span><span className="block font-mono text-[11px] font-bold uppercase text-ink/60">Launch tx</span><span className="block font-mono text-[12px] font-extrabold">{shortAddress(coin.launchTx, 8, 6)}</span></span></span>
            {[['tris', e.triangles.toLocaleString()], ['verts', e.vertices.toLocaleString()], ['edges', e.edges.toLocaleString()], ['dims', e.dims.map(d => d.toFixed(2)).join('×')]].map(([k, v]) => <span key={k}><span className="block font-mono text-[11px] font-bold uppercase text-ink/60">{k}</span><span className="block font-mono text-[12px] font-extrabold tnum">{v}</span></span>)}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="raised rounded-[30px] p-5 sm:p-6">
          <div className="flex items-center gap-3"><img src={e.coin} alt="" className="size-16 rounded-full shadow-[0_0_0_1.5px_rgba(12,13,16,.12),0_10px_20px_-10px_rgba(20,24,40,.5)]"/><div className="min-w-0 flex-1"><h1 className="display truncate text-[32px] sm:text-[40px]">{coin.name}</h1><p className="mt-1 flex items-center gap-2 font-mono text-xs font-semibold text-ink/65"><span className="chip-dark">${coin.ticker}</span>{shortAddress(coin.token, 6, 4)}<button onClick={() => void copyText(coin.token).then(setCopied)} aria-label="Copy address" className="flex size-8 items-center justify-center rounded-full hover:bg-ink/5">{copied ? <Check size={13}/> : <Copy size={13}/>}</button></p></div></div>
          <div className="mt-5 flex items-end justify-between"><div><p className="stat-label">Price</p><p className="display text-[38px] leading-none tnum">{price}</p></div><span className={cn('rounded-xl px-3 py-1.5 font-mono text-sm font-extrabold', up ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>{up ? '▲' : '▼'} {pct(coin.change24h)} 24h</span></div>
          <dl className="mt-5 grid grid-cols-2 gap-2">{[['Market cap', money(coin.marketCapEth)], ['24h volume', money(coin.volume24hEth)], ['Holders', coin.holderCount.toLocaleString()], ['Launched', timeAgo(coin.launchedAt)]].map(([k, v]) => <div key={k} className="sunk rounded-2xl px-3.5 py-3"><dt className="stat-label !text-[11px]">{k}</dt><dd className="mt-1 text-[19px] font-extrabold tnum">{v}</dd></div>)}</dl>
          <div className="mt-4"><div className="sunk h-2.5 overflow-hidden rounded-full"><div className="bar-grow h-full rounded-full bg-ink" style={{ width: `${coin.progress * 100}%` }}/></div><p className="mt-1.5 font-mono text-[11.5px] font-bold uppercase text-ink/65">{(coin.progress * 100).toFixed(1)}% to graduation</p></div>
        </div>
        <TxPanel view={tx} colors={e.colors}/>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{proof.map(card => <div key={card.title} className="raised flex items-center gap-3 rounded-[24px] p-3 pr-4"><GlassIcon name={card.icon} size={52}/><div className="min-w-0"><p className="text-[15px] font-extrabold">{card.title}</p><p className="truncate font-mono text-[11px] font-bold text-ink/65">{card.stat}</p></div></div>)}</div>

    <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <section className="raised rounded-[30px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-[18px] font-extrabold"><GlassIcon name="chart" size={36}/>${coin.ticker} / ETH</h2>{live ? <span className="chip"><span className="pulse-dot size-1.5 rounded-full bg-up"/>LIVE · {liveTrades.data?.trades.length ?? 0} trades</span> : <span className="chip">SIM · {coin.trades.length} trades · simulated</span>}</div>
        {live ? (liveTrades.data?.trades.length ? <PriceChart trades={liveTrades.data.trades} ethUsd={ethUsd} className="mt-4 h-[300px] sm:h-[380px]"/> : <div className="sunk mt-4 flex h-[380px] items-center justify-center rounded-2xl text-[15px] font-bold text-ink/65">{liveTrades.isPending ? 'Loading live trades…' : 'Live on Robinhood Chain. The chart fills in with the first trades.'}</div>) : <PriceChart trades={coin.trades} ethUsd={ethUsd} className="mt-4 h-[300px] sm:h-[380px]"/>}
        <div className="mt-5"><SegmentedTabs label="Coin data" size="sm" value={tab} onChange={setTab} items={[{ value: 'trades', label: 'Trades' }, { value: 'holders', label: 'Holders' }, { value: 'treasury', label: 'Fee treasury' }]}/></div>
        {tab === 'trades' && <div className="sunk mt-4 max-h-80 overflow-auto rounded-2xl"><table className="w-full text-left text-xs"><thead className="stat-label sticky top-0 bg-[#EEF0F3]/95 backdrop-blur"><tr><th className="px-3 py-2.5 font-bold">Side</th><th className="font-bold">Amount</th><th className="font-bold">Tokens</th><th className="hidden font-bold sm:table-cell">Trader</th><th className="hidden font-bold sm:table-cell">Tx</th><th className="px-3 text-right font-bold">When</th></tr></thead><tbody>{[...coin.trades].reverse().slice(0, 60).map(t => <tr key={t.id} className="border-t border-ink/[0.06]"><td className={cn('px-3 py-2 font-extrabold uppercase', t.side === 'buy' ? 'text-up' : 'text-down')}>{t.side}</td><td className="font-semibold tnum">{money(t.eth)}</td><td className="tnum">{compactNumber(t.tokens)}</td><td className="hidden font-mono text-ink/60 sm:table-cell">{shortAddress(t.trader, 5, 3)}</td><td className="hidden font-mono text-ink/65 sm:table-cell">{shortAddress(t.hash, 6, 4)}</td><td className="px-3 text-right font-mono text-ink/65">{timeAgo(t.at)}</td></tr>)}</tbody></table></div>}
        {tab === 'holders' && <ul className="mt-4 space-y-1.5">{coin.holders.map((h, i) => <li key={h.address} className="sunk flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm"><span className="w-5 font-mono text-xs font-bold text-ink/60">{i + 1}</span><span className="font-mono text-xs font-semibold">{shortAddress(h.address, 6, 4)}</span>{h.label && <span className="chip-dark !py-0.5">{h.label}</span>}<span className="ml-auto hidden font-mono text-[11px] text-ink/65 sm:block">held {timeAgo(h.since).replace(' ago', '')}</span><span className="w-28"><span className="block h-1.5 overflow-hidden rounded-full bg-ink/[0.08]"><span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(2, h.share * 100)}%` }}/></span></span><span className="w-14 text-right font-mono text-xs font-extrabold">{(h.share * 100).toFixed(2)}%</span></li>)}</ul>}
        {tab === 'treasury' && <div className="mt-4 grid gap-3 sm:grid-cols-3">{([{ t: 'Burned $OBJECTPAD', v: coin.fees.burnEth, icon: 'burn' }, { t: 'Creator rewards', v: coin.fees.creatorEth, icon: 'coins' }, { t: 'Holder rewards', v: coin.fees.holdersEth, icon: 'diamond' }] as { t: string; v: number; icon: GlassName }[]).map(f => <div key={f.t} className="sunk rounded-[20px] p-4"><GlassIcon name={f.icon} size={48}/><p className="display mt-3 text-2xl tnum">{money(f.v)}</p><p className="text-sm font-bold text-ink/60">{f.t}</p></div>)}<p className="text-xs font-semibold text-ink/65 sm:col-span-3">0.5% of every trade each. Holder rewards weight by how long you’ve held.</p></div>}
      </section>
      <div className="space-y-4">
        <div className="raised rounded-[30px] p-5 sm:p-6"><h2 className="mb-4 flex items-center gap-2 text-[18px] font-extrabold"><GlassIcon name="coins" size={34}/>Trade ${coin.ticker}</h2>
          {live ? <><TradePanel token={live.token as Address} curve={live.curve as Address} symbol={coin.ticker} state={curve.data}/>{live.hash && <a href={explorerTx(live.hash)} target="_blank" rel="noreferrer" className="mt-3 block text-[13px] font-extrabold text-ink underline">Launch transaction on Robinhood Chain</a>}</> : <>
          <SideSwitch side={side} onChange={setSide}/>
          <div className="mt-4 rounded-[18px] border-2 border-ink/10 bg-white p-4"><div className="flex items-center justify-between text-[13px] font-extrabold text-ink/70"><span>{side === 'buy' ? 'You pay' : 'You sell'}</span><span>Balance —</span></div><div className="mt-1 flex items-center gap-2"><input disabled placeholder={side === 'buy' ? '0.05' : '1,000,000'} className="min-w-0 flex-1 bg-transparent text-[28px] font-extrabold outline-none placeholder:text-ink/30" aria-label="Amount"/><span className="rounded-full bg-ink px-3 py-1.5 text-[14px] font-extrabold text-white">{side === 'buy' ? 'ETH' : `$${coin.ticker}`}</span></div></div>
          <PercentRow onPick={() => undefined} disabled/>
          <div className="-my-1 flex justify-center"><span className="relative z-10 mt-2.5 flex size-9 items-center justify-center rounded-full bg-ink text-white"><ArrowDown size={16}/></span></div>
          <div className="rounded-[18px] bg-ink/[0.06] p-4"><p className="text-[13px] font-extrabold text-ink/70">You receive</p><p className="mt-1 text-[22px] font-extrabold text-ink">{side === 'buy' ? `≈ ${compactNumber(0.05 / coin.priceEth)} $${coin.ticker}` : `≈ ${eth(1_000_000 * coin.priceEth, 5)}`}</p></div>
          <p className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-ink/[0.08] text-[14px] font-extrabold text-ink/75"><Lock size={15}/>Lab specimen · simulated market · trading off</p>
          </>}
          <Link to="/launch" className="btn press mt-3 min-h-12 w-full text-sm"><GlassIcon name="qr" size={26} className="!filter-none"/>Launch your own object coin free</Link>
        </div>
        <section className="steel relative overflow-hidden rounded-[26px] p-5"><AsciiField className="absolute inset-0 h-full w-full" cell={14} density={0.06} chart={false} tone={0.08}/><p className="lab relative">The object</p><p className="relative mt-3 text-[16px] font-bold leading-7 text-ink/80">{coin.story}</p></section>
      </div>
    </div>

    <section className="mt-10"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab">More object coins</p><h2 className="display mt-2 text-[34px]">Keep scrolling the lab.</h2></div><Link to="/launch" className="btn press min-h-12 pl-1.5 pr-5 text-sm"><span className="orb size-9"><GlassIcon name="qr" size={26} className="!filter-none"/></span>Launch yours free</Link></div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{others.map((c, i) => <SpecimenCard key={c.ticker} coin={c} ethUsd={ethUsd} index={i}/>)}</div>
    </section>
  </div>;
}
