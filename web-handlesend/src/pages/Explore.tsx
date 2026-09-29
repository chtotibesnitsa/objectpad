import { lazy, memo, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, Box, KeyRound, Search, TrendingUp } from 'lucide-react';
import type { ObjectRecord } from '@/shared/domain';
import { ErrorState, Loading } from '@/components/Feedback';
import { MarketBoard } from '@/components/MarketBoard';
import { SegmentedTabs } from '@/components/Tabs';
import { useArchive, useBuilding, type ListedObject, type SortKey } from '@/lib/objects';
import { BuildingCard } from '@/components/BuildingCoin';
import { useInView } from '@/hooks/use-in-view';
import { useMarket } from '@/lib/market';
import { useCoins } from '@/lib/coins';
import { SpecimenCard, LaunchTile, ChangeChip, LiveBadge, CoinCardStats } from '@/components/CoinCard';
import { GlassIcon } from '@/components/GlassIcon';
import { type CurveState } from '@/lib/chain';
import { cn } from '@/lib/utils';
import { PairBadge, PairLogo } from '@/components/PairBadge';
import { usePairs } from '@/lib/pairs';
import { isNsfwCoin, isNsfwText } from '@/shared/nsfw';
import { AdultGate, AdultTabButton } from '@/components/AdultGate';

const ExhibitViewer = lazy(() => import('@/components/ExhibitViewer'));

/** Live coin card: the real scanned 3D model spins over its photo while the card is on screen. */
export const ObjectCard = memo(function ObjectCard({ object, curve, ethUsd: ethUsdProp = null, spin = true }: { object: ObjectRecord; curve?: CurveState | null; ethUsd?: number | null; spin?: boolean }) {
  const stage = useRef<HTMLDivElement>(null); const seen = useInView(stage, '160px'); const [ready, setReady] = useState<boolean>(false);
  const onReady = useMemo(() => () => setReady(true), []);
  // Same live indexed stats as ObjectPad originals: trades, holders, 24h change and the price sparkline from real on-chain trades.
  const feed = useCoins(); const market = useMarket(); const ethUsd = ethUsdProp ?? market.data?.ethUsd ?? null;
  const coin = useMemo(() => feed.data?.items.find(c => c.id === object.objectId) ?? null, [feed.data, object.objectId]);
  const priceEth = coin?.priceEth || curve?.priceEth || 0; const marketCapEth = coin?.marketCapEth || curve?.marketCapEth || 0;
  const spark = useMemo(() => coin?.spark.length ? coin.spark : priceEth ? [priceEth, priceEth] : [], [coin, priceEth]);
  const change = coin?.change24h ?? 0; const progress = coin?.progress ?? curve?.progress ?? 0; const graduated = coin?.graduated ?? curve?.graduated ?? false;
  const live = Boolean(coin || curve);
  return <Link to={`/objects/${object.objectId}`} className="raised lift group block overflow-hidden rounded-[26px]">
    <div ref={stage} className="scan-stage crop relative m-1.5 overflow-hidden rounded-[21px]"><i/><i/><i/><i/>
      <div className="grid-paper absolute inset-0 opacity-60" aria-hidden="true"/><img src={object.model.thumbnailUrl} alt={`3D scan of ${object.verifiedName}`} loading="lazy" className={cn('relative aspect-square w-full object-contain p-5 transition-all duration-500 group-hover:scale-105 motion-reduce:transform-none', ready && 'scale-90 opacity-0')}/>
      {spin && seen && <div className={cn('pointer-events-none absolute inset-0 transition-opacity duration-700', ready ? 'opacity-100' : 'opacity-0')}><Suspense fallback={null}><ExhibitViewer src={object.model.modelUrl} active fallback={null} onReady={onReady} speed={1.6}/></Suspense></div>}
      <span className="chip-dark absolute left-3 top-3">${object.symbol}</span>
      {coin?.pair && <PairBadge symbol={coin.pair.symbol} logo={coin.pair.logo} className="absolute left-3 top-12"/>}
      {live && <ChangeChip change={change}/>}
      {object.checkin && <span className="absolute right-3 top-12 flex size-7 items-center justify-center rounded-full bg-up text-white" title="Object Key check-in"><KeyRound size={13}/></span>}
      {object.objectTag && <span className="chip absolute bottom-3 left-3 hidden !text-[11px] sm:inline-flex">{object.objectTag}</span>}
      {live && <LiveBadge/>}</div>
    <CoinCardStats id={`c-${object.objectId}`} name={object.verifiedName} marketCapEth={marketCapEth} ethUsd={ethUsd} trades={coin?.trades ?? 0} holders={coin?.holders ?? 0} spark={spark} change={change} progress={progress} graduated={graduated} live={live}/>
  </Link>;
});

const SORTS: { value: SortKey; label: string }[] = [{ value: 'trending', label: 'Trending' }, { value: 'newest', label: 'Newest' }, { value: 'marketcap', label: 'Market cap' }, { value: 'volume', label: 'Reserve' }];

export default function Explore() {
  const [params, setParams] = useSearchParams(); const [kind, setKind] = useState<string>('all'); const [search, setSearch] = useState<string>(params.get('q') ?? ''); const deferred = useDeferredValue(search);
  const tab = params.get('tab') === 'market' ? 'market' : 'objects'; const adult = params.get('view') === 'nsfw'; const sort = (params.get('sort') as SortKey | null) ?? 'trending';
  const query = useArchive({ q: deferred, sort }); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null;
  const building = useBuilding(); const qc = useQueryClient(); const allBuilding = useMemo(() => building.data?.items ?? [], [building.data]);
  // A coin that leaves the building list just went live: refresh the grid so its real 3D model appears straight away.
  const seenBuilding = useRef<Set<string>>(new Set());
  useEffect(() => { const now = new Set(allBuilding.map(b => b.code)); if ([...seenBuilding.current].some(code => !now.has(code))) void qc.invalidateQueries({ queryKey: ['objectpad', 'archive'] }); seenBuilding.current = now; }, [allBuilding, qc]);
  const set = (key: string, value: string | null) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const feed = useCoins(); const pairParam = params.get('pair') ?? 'all'; const pairsBoard = usePairs();
  const nsfwIds = useMemo(() => new Set((feed.data?.items ?? []).filter(isNsfwCoin).map(c => c.id)), [feed.data]);
  const recordNsfw = (r: ObjectRecord): boolean => nsfwIds.has(r.objectId) || isNsfwText(r.verifiedName, r.symbol, r.objectName, r.story);
  const buildingItems = useMemo(() => allBuilding.filter(b => (b.nsfw === true || isNsfwText(b.name, b.symbol)) === adult && Date.now() - (b.startedAt ?? b.queuedAt) < 180_000), [allBuilding, adult]);
  const pairOf = useMemo(() => new Map((feed.data?.items ?? []).map(c => [c.id, c.pair?.address ?? null])), [feed.data]);
  const pairChips = useMemo(() => { const counts = new Map<string, number>(); for (const c of feed.data?.items ?? []) if (c.pair) counts.set(c.pair.address, (counts.get(c.pair.address) ?? 0) + 1); return (pairsBoard.data?.assets ?? []).filter(a => counts.has(a.address.toLowerCase())).map(a => ({ ...a, n: counts.get(a.address.toLowerCase()) ?? 0 })).sort((a, b) => b.n - a.n); }, [feed.data, pairsBoard.data]);
  const matchPair = (id: string): boolean => { if (pairParam === 'all') return true; const p = pairOf.get(id) ?? null; if (pairParam === 'stocks') return Boolean(p); if (pairParam === 'eth') return !p; return p === pairParam.toLowerCase(); };
  const items: ListedObject[] = (query.data?.items ?? []).filter(i => matchPair(i.record.objectId) && recordNsfw(i.record) === adult); const liveIds = useMemo(() => new Set(items.map(i => i.record.objectId)), [items]);
  const previews = useMemo(() => { const q = deferred.trim().toLowerCase(); const list = (feed.data?.items ?? []).filter(c => isNsfwCoin(c) === adult && c.kind === 'original' && !liveIds.has(c.id) && (pairParam === 'all' || pairParam === 'eth')).filter(c => !q || `${c.name} ${c.symbol} ${c.tag ?? ''} ${c.objectName ?? ''}`.toLowerCase().includes(q)); if (sort === 'newest') return [...list].sort((a, b) => b.launchedAt - a.launchedAt); if (sort === 'volume') return [...list].sort((a, b) => b.volume24hEth - a.volume24hEth); return [...list].sort((a, b) => b.marketCapEth - a.marketCapEth); }, [deferred, sort, feed.data, liveIds, pairParam, adult]);
  return <div className="page py-6 sm:py-10">
    <div className="flex flex-wrap items-end justify-between gap-5"><div className="flex items-end gap-4"><GlassIcon name={tab === 'market' ? 'chart' : 'mesh'} size={84} float className="hidden sm:block"/><div><p className="lab">Explore · Robinhood Chain</p><h1 className="display mt-3 text-[46px] sm:text-[64px]">{tab === 'market' ? 'Coin list.' : 'Object coins.'}</h1><p className="mt-2 max-w-xl text-[17px] font-extrabold text-ink/65">{tab === 'market' ? 'Every ObjectPad coin, ranked by 24h volume.' : 'Every coin here is a real thing someone scanned.'}</p></div></div>
      <SegmentedTabs label="View" value={tab} onChange={value => set('tab', value === 'market' ? 'market' : null)} items={[{ value: 'objects', label: 'Grid', icon: <Box size={14}/> }, { value: 'market', label: 'List', icon: <Activity size={14}/> }]}/></div>
    {tab === 'market' ? <div className="mt-6"><div className="mb-3 flex justify-end"><AdultTabButton on={adult} onClick={() => set('view', adult ? null : 'nsfw')}/></div><AdultGate active={adult} onLeave={() => set('view', null)}><MarketBoard limit={48} adult={adult}/></AdultGate></div> : <>
      <div className="steel mt-6 flex flex-col gap-3 rounded-[24px] p-2.5 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full lg:max-w-md"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"/><input aria-label="Search coins, tickers, tags or hashes" value={search} onChange={event => { setSearch(event.target.value); set('q', event.target.value || null); }} placeholder="Name, ticker, OP- tag or hash…" className="w-full pl-11"/></div>
        <div className="flex flex-wrap gap-1.5">{[['all', 'All'], ['live', 'Live'], ['memes', 'Memes'], ['toys', 'Toys'], ['desk', 'Desk & other'], ['people', 'People']].map(([v, l]) => <button key={v} onClick={() => setKind(v)} className={cn('press min-h-9 rounded-full px-3.5 text-xs font-extrabold', kind === v ? 'raised' : 'text-ink/65 hover:text-ink')}>{l}</button>)}</div>
        <div className="flex flex-wrap items-center gap-1.5"><SegmentedTabs label="Sort" size="sm" value={sort} onChange={value => set('sort', value === 'trending' ? null : value)} items={SORTS.map(s => ({ ...s, icon: s.value === 'trending' ? <TrendingUp size={12}/> : undefined }))}/>
          <AdultTabButton on={adult} onClick={() => set('view', adult ? null : 'nsfw')}/></div></div>
      <div className="no-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Filter by pair">
        <span className="mr-1 flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-extrabold uppercase text-ink/55"><span className="v2-pill relative inline-flex h-[18px] items-center rounded-full px-1.5 text-[10px] font-black text-[#3A2A05]">V2</span>Paired with</span>
        {[['all', 'All'], ['stocks', 'Any stock'], ['eth', 'ETH']].map(([v, l]) => <button key={v} onClick={() => set('pair', v === 'all' ? null : v)} className={cn('press min-h-9 shrink-0 rounded-full px-3.5 text-xs font-extrabold', pairParam === v ? 'bg-ink text-white' : 'raised text-ink/70')}>{l}</button>)}
        {pairChips.map(a => <button key={a.address} onClick={() => set('pair', a.address.toLowerCase())} className={cn('press flex min-h-9 shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-extrabold', pairParam === a.address.toLowerCase() ? 'bg-ink text-white' : 'raised')}><PairLogo src={a.logo} symbol={a.symbol} size={24}/>{a.symbol}<span className="opacity-60">{a.n}</span></button>)}
      </div>
      <AdultGate active={adult} onLeave={() => set('view', null)}>{query.isPending ? <Loading label="Reading live object coins…"/> : <>
        {query.isError && <div className="mt-6"><ErrorState message="Live coins couldn’t load right now. ObjectPad originals are still shown below." retry={() => void query.refetch()}/></div>}
        {kind === 'people' && <div className="raised mt-6 rounded-[28px] p-6 text-center sm:p-10"><p className="display text-[28px] leading-tight">No People coins have launched yet.</p><p className="mx-auto mt-2 max-w-md text-[14px] font-semibold text-ink/60">Every person coin appears here only after they scan, verify and approve their own double. Be the first.</p><a href="/People/start" className="btn press mt-5 inline-flex min-h-12 px-6">Make my 3D double</a></div>}
        <div className={cn('mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5', kind === 'people' && 'hidden')}>
          {(kind === 'all' || kind === 'live') && !deferred && buildingItems.map(coin => <BuildingCard key={coin.code} coin={coin}/>)}
          {items.map((item, i) => <ObjectCard key={item.record.objectId} object={item.record} curve={item.curve} ethUsd={ethUsd} spin={i < 8}/>)}
          {previews.map((coin, i) => <SpecimenCard key={coin.id} coin={coin} ethUsd={ethUsd} index={i}/>)}
          {!deferred && <LaunchTile/>}
        </div>
        {adult && !deferred && !items.length && !previews.length && !buildingItems.length && <div className="py-16 text-center"><p className="text-xl font-bold">No 18+ coins right now.</p></div>}
        {deferred && !items.length && !previews.length && <div className="py-16 text-center"><p className="text-xl font-bold">No matching coins.</p><p className="mt-2 text-sm text-muted">Try a different name, ticker or tag.</p></div>}
      </>}
      </AdultGate>
      {query.data?.partial && <p className="mt-6 text-center text-xs text-muted">Showing the newest 25 live coins.</p>}
    </>}
  </div>;
}
