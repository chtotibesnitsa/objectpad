import { memo, useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ArrowUpRight, Box, Fingerprint, KeyRound, Search, TrendingUp } from 'lucide-react';
import type { ObjectRecord } from '@/shared/domain';
import { shortHash } from '@/shared/security';
import { ErrorState, Loading } from '@/components/Feedback';
import { MarketBoard } from '@/components/MarketBoard';
import { SegmentedTabs } from '@/components/Tabs';
import { useArchive, type ListedObject, type SortKey } from '@/lib/objects';
import { useMarket } from '@/lib/market';
import { previewCoins } from '@/lib/preview';
import { SpecimenCard, LaunchTile } from '@/components/CoinCard';
import { GlassIcon } from '@/components/GlassIcon';
import { eth, tinyUsd, usd } from '@/lib/format';
import { type CurveState } from '@/lib/chain';
import { cn } from '@/lib/utils';

export const ObjectCard = memo(function ObjectCard({ object, curve, ethUsd = null }: { object: ObjectRecord; curve?: CurveState | null; ethUsd?: number | null }) {
  return <Link to={`/objects/${object.objectId}`} className="raised lift group overflow-hidden rounded-[26px]">
    <div className="relative m-1.5 overflow-hidden rounded-[19px] scan-stage"><img src={object.model.thumbnailUrl} alt={`3D scan of ${object.verifiedName}`} loading="lazy" className="aspect-square w-full object-contain p-5 transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none"/>
      <span className="chip-dark absolute left-3 top-3">${object.symbol}</span>
      <span className="absolute right-3 top-3 flex gap-1">{object.checkin && <span className="flex size-7 items-center justify-center rounded-full bg-up text-white" title="Object Key check-in"><KeyRound size={13}/></span>}{curve?.graduated && <span className="chip-dark">Graduated</span>}</span>
      {object.objectTag && <span className="glass-strong absolute bottom-3 left-3 rounded-full px-2.5 py-1 font-mono text-[11.5px]">{object.objectTag}</span>}</div>
    <div className="px-4 pb-4 pt-2"><div className="flex items-start justify-between gap-3"><h2 className="text-[15px] font-semibold leading-tight">{object.verifiedName}</h2><ArrowUpRight size={15} className="shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"/></div>
      <p className="mt-0.5 truncate text-xs text-muted">{object.objectName ?? object.category}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><p className="stat-label">Market cap</p><p className="mt-1 font-semibold tnum">{curve ? (ethUsd ? usd(curve.marketCapEth * ethUsd) : eth(curve.marketCapEth, 2)) : '—'}</p></div><div><p className="stat-label">Price</p><p className="mt-1 font-semibold tnum">{curve ? (ethUsd ? tinyUsd(curve.priceEth * ethUsd) : eth(curve.priceEth, 10)) : '—'}</p></div></div>
      {curve && !curve.graduated && <div className="mt-3"><div className="h-1 overflow-hidden rounded-full bg-ink/[0.07]"><div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(2, curve.progress * 100)}%` }}/></div><p className="mt-1.5 font-mono text-[11px] uppercase text-muted">{(curve.progress * 100).toFixed(1)}% to graduation</p></div>}
      <div className="mt-3 flex items-center gap-2 border-t border-ink/[0.06] pt-3 font-mono text-[11.5px] text-muted"><Fingerprint size={12}/>{shortHash(object.originalModelHash)}</div></div>
  </Link>;
});

const SORTS: { value: SortKey; label: string }[] = [{ value: 'trending', label: 'Trending' }, { value: 'newest', label: 'Newest' }, { value: 'marketcap', label: 'Market cap' }, { value: 'volume', label: 'Reserve' }];

export default function Explore() {
  const [params, setParams] = useSearchParams(); const [kind, setKind] = useState<string>('all'); const [search, setSearch] = useState<string>(params.get('q') ?? ''); const deferred = useDeferredValue(search);
  const tab = params.get('tab') === 'market' ? 'market' : 'objects'; const sort = (params.get('sort') as SortKey | null) ?? 'trending';
  const query = useArchive({ q: deferred, sort }); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null;
  const set = (key: string, value: string | null) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const items: ListedObject[] = query.data?.items ?? [];
  const previews = useMemo(() => { const q = deferred.trim().toLowerCase(); const list = previewCoins().filter(c => kind === 'all' || (kind === 'memes' ? /meme/i.test(c.exhibit.kind) : kind === 'toys' ? /toy|collectible|figurine/i.test(c.exhibit.kind) : kind === 'desk' ? !/meme|toy|collectible|figurine/i.test(c.exhibit.kind) : kind !== 'live')).filter(c => !q || `${c.name} ${c.ticker} ${c.tag} ${c.exhibit.catalog}`.toLowerCase().includes(q)); if (sort === 'marketcap' || sort === 'trending') return [...list].sort((a, b) => b.marketCapEth - a.marketCapEth); if (sort === 'newest') return [...list].sort((a, b) => b.launchedAt - a.launchedAt); return [...list].sort((a, b) => b.volumeEth - a.volumeEth); }, [deferred, sort, kind]);
  return <div className="page py-6 sm:py-10">
    <div className="flex flex-wrap items-end justify-between gap-5"><div className="flex items-end gap-4"><GlassIcon name={tab === 'market' ? 'chart' : 'mesh'} size={84} float className="hidden sm:block"/><div><p className="lab">Explore · Robinhood Chain</p><h1 className="display mt-3 text-[46px] sm:text-[64px]">{tab === 'market' ? 'Coin list.' : 'Object coins.'}</h1><p className="mt-2 max-w-xl text-[17px] font-extrabold text-ink/65">{tab === 'market' ? 'Every ObjectPad coin, ranked by 24h volume.' : 'Every coin here is a real thing someone scanned.'}</p></div></div>
      <SegmentedTabs label="View" value={tab} onChange={value => set('tab', value === 'market' ? 'market' : null)} items={[{ value: 'objects', label: 'Grid', icon: <Box size={14}/> }, { value: 'market', label: 'List', icon: <Activity size={14}/> }]}/></div>
    {tab === 'market' ? <div className="mt-6"><MarketBoard limit={48}/></div> : <>
      <div className="steel mt-6 flex flex-col gap-3 rounded-[24px] p-2.5 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full lg:max-w-md"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted"/><input aria-label="Search coins, tickers, tags or hashes" value={search} onChange={event => { setSearch(event.target.value); set('q', event.target.value || null); }} placeholder="Name, ticker, OP- tag or hash…" className="w-full pl-11"/></div>
        <div className="flex flex-wrap gap-1.5">{[['all', 'All'], ['live', 'Live'], ['memes', 'Memes'], ['toys', 'Toys'], ['desk', 'Desk & other']].map(([v, l]) => <button key={v} onClick={() => setKind(v)} className={cn('press min-h-9 rounded-full px-3.5 text-xs font-extrabold', kind === v ? 'raised' : 'text-ink/65 hover:text-ink')}>{l}</button>)}</div>
        <SegmentedTabs label="Sort" size="sm" value={sort} onChange={value => set('sort', value === 'trending' ? null : value)} items={SORTS.map(s => ({ ...s, icon: s.value === 'trending' ? <TrendingUp size={12}/> : undefined }))}/></div>
      {query.isPending ? <Loading label="Reading live object coins…"/> : <>
        {query.isError && <div className="mt-6"><ErrorState message="Live coins couldn’t load right now. Lab specimens are still shown below." retry={() => void query.refetch()}/></div>}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map(item => <ObjectCard key={item.record.objectId} object={item.record} curve={item.curve} ethUsd={ethUsd}/>)}
          {previews.map((coin, i) => <SpecimenCard key={coin.ticker} coin={coin} ethUsd={ethUsd} index={i}/>)}
          {!deferred && <LaunchTile/>}
        </div>
        {deferred && !items.length && !previews.length && <div className="py-16 text-center"><p className="text-xl font-bold">No matching coins.</p><p className="mt-2 text-sm text-muted">Try a different name, ticker or tag.</p></div>}
      </>}
      {query.data?.partial && <p className="mt-6 text-center text-xs text-muted">Showing the newest 25 live coins.</p>}
    </>}
  </div>;
}
