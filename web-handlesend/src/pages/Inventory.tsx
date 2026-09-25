import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { encodeFunctionData } from 'viem';
import { ArrowUpRight, Box, ChevronRight, Coins, Hammer, Lock, ScanLine, Unlock, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, ErrorState, Loading } from '@/components/Feedback';
import { useSession } from '@/lib/session';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCreator } from '@/lib/creator';
import { timeAgo } from '@/lib/format';
import type { CaptureSession } from '@/shared/domain';
import { useArchive, useArtifacts, useHoldings, type ArtifactView } from '@/lib/objects';
import { compact, ECONOMY, formatEth, formatTokens, prepareTx, priceLabel, waitForReceipt } from '@/lib/chain';
import { usePreferences } from '@/hooks/use-preferences';
import { cn } from '@/lib/utils';
import { FORGE_ABI, rarityOf } from '@/shared/economy';
import type { ObjectRecord } from '@/shared/domain';
import { RARITY_STYLE } from './Craft';

function ArtifactCard({ item, records }: { item: ArtifactView; records: Map<string, ObjectRecord> }) {
  const auth = useSession(); const qc = useQueryClient(); const { play } = usePreferences();
  const rarity = rarityOf(item.multiplierBps); const unlocked = Date.now() / 1000 >= item.unlockAt; const days = Math.max(0, Math.ceil((item.unlockAt - Date.now() / 1000) / 86_400));
  const act = useMutation({ mutationFn: async (fn: 'claim' | 'dissolve') => { if (!auth.wallet || !ECONOMY.forge) throw new Error('Connect a wallet.'); const hash = await auth.send(await prepareTx(auth.wallet, { to: ECONOMY.forge, data: encodeFunctionData({ abi: FORGE_ABI, functionName: fn, args: [item.id] }) })); await waitForReceipt(hash); return fn; }, onSuccess: fn => { play(fn === 'claim' ? 'launch' : 'retry'); void qc.invalidateQueries({ queryKey: ['objectpad'] }); } });
  return <article className="overflow-hidden card-brut">
    <div className="relative border-b border-ink/[0.06] bg-ink/[0.03] p-5"><div className="forge-glow pointer-events-none absolute inset-0 opacity-60" aria-hidden="true"/><div className="relative flex items-center justify-between"><span className={cn('rounded-full border bg-paper px-2.5 py-1 font-mono text-[11.5px] uppercase', RARITY_STYLE[rarity])}>{rarity}</span><span className="font-mono text-sm tnum">{(item.multiplierBps / 10_000).toFixed(2)}×</span></div>
      <div className="relative mt-5 flex justify-center -space-x-4">{item.tokens.map(token => { const record = records.get(token.toLowerCase()); return record ? <img key={token} src={record.model.thumbnailUrl} alt={record.verifiedName} className="size-16 rounded-full object-cover ring-4 ring-white"/> : <span key={token} className="flex size-16 items-center justify-center rounded-full bg-white font-mono text-[11.5px] ring-4 ring-white">?</span>; })}</div>
      <p className="relative mt-4 text-center text-lg font-bold tracking-tight">Artifact #{item.id.toString()}</p></div>
    <div className="p-5"><ul className="space-y-2 text-sm">{item.tokens.map((token, i) => { const record = records.get(token.toLowerCase()); return <li key={token} className="flex justify-between gap-3"><span className="font-semibold">{record ? `$${record.symbol}` : token.slice(0, 8)}</span><span className="font-mono text-xs text-muted">{formatTokens(item.amounts[i])} locked</span></li>; })}</ul>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/10 pt-4"><div><p className="stat-label">Claimable</p><p className="mt-1 text-lg font-bold tnum">{formatEth(item.pending, 6)} ETH</p></div><div><p className="stat-label">{unlocked ? 'Unlocked' : 'Unlocks in'}</p><p className="mt-1 flex items-center gap-1.5 text-lg font-bold">{unlocked ? <Unlock size={15} className="text-moss"/> : <Lock size={15}/>}{unlocked ? 'Ready' : `${days}d`}</p></div></div>
      {item.burned > 0n && <p className="mt-3 font-mono text-[11.5px] uppercase text-clay">{formatTokens(item.burned)} $OBJECTPAD burned to craft</p>}
      <div className="mt-4 grid grid-cols-2 gap-2"><Button size="sm" disabled={item.pending === 0n || act.isPending} onClick={() => act.mutate('claim')}><Coins/>Claim</Button><Button size="sm" variant="outline" disabled={!unlocked || act.isPending} onClick={() => act.mutate('dissolve')}>Dissolve</Button></div>
      {act.isError && <p role="alert" className="mt-2 text-xs text-red-800">{act.error.message.split('\n')[0]}</p>}</div>
  </article>;
}


const SCAN_STATE: Record<string, string> = { awaiting_mobile: 'Waiting for phone', capturing: 'Scanning', review: 'Photos in', screening: 'AI check', reconstructing: 'Building 3D', validating: 'Checking model', model_review: '3D ready · not launched', approved: 'Launching', blocked: 'On hold', failed: 'Needs rescan', expired: 'Expired' };
/** 3D scans this browser (guest) or account made, including ones saved to launch later. */
function SavedScans() {
  const creator = useCreator();
  const query = useQuery({ queryKey: ['objectpad', 'my-sessions', creator.signedIn], queryFn: async () => api<{ items: CaptureSession[] }>('/sessions', { token: await creator.token() }), retry: false, enabled: creator.ready || !creator.configured });
  const items = (query.data?.items ?? []).filter(s => s.state !== 'expired');
  return <section className="mt-8"><div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Saved scans</h2><p className="text-sm text-muted">{creator.signedIn ? 'Every 3D scan on your account. Launch any of them whenever you like.' : 'Scans made in this browser. Sign in to keep them on every device.'}</p></div><Link to="/launch" className="press flex min-h-10 items-center gap-2 btn px-4 text-[13px] font-semibold "><ScanLine size={14}/>New scan</Link></div>
    {query.isPending ? <Loading/> : query.isError ? <div className="mt-4"><ErrorState message={query.error.message} retry={() => void query.refetch()}/></div> : items.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(s => { const live = s.launch?.recordState === 'confirmed'; const to = live && s.coinUrl ? new URL(s.coinUrl).pathname : `/launch/${s.id}`; return <Link key={s.id} to={to} className="lift glass flex items-center gap-3 rounded-[22px] p-3">
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ink/[0.05]">{live && s.model?.thumbnailUrl ? <img src={s.model.thumbnailUrl} alt="" className="size-full object-cover"/> : <Box size={18} className="text-ink/60"/>}</span>
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{s.launchDraft?.publicName ?? s.suggestion?.name ?? `Scan · ${s.views.length}/6 photos`}</span><span className="block truncate font-mono text-[12px] text-muted">{live ? 'Coin live' : s.launch ? 'Launching' : SCAN_STATE[s.state] ?? s.state} · {timeAgo(s.createdAt)}</span>{s.onchain && <span className="block truncate font-mono text-[11.5px] text-signal">{s.onchain.objectTag}</span>}</span>
      <ChevronRight size={16} className="text-muted"/></Link>; })}</div> : <div className="glass mt-4 flex flex-col items-center rounded-[24px] px-6 py-12 text-center"><Box size={26} className="text-muted"/><p className="mt-3 font-semibold">No scans yet</p><p className="mt-1 text-sm text-muted">Scan any object. It stays here until you launch it.</p></div>}
  </section>;
}

/** Everything the connected wallet holds on ObjectPad: object coins and crafted Artifacts, all read from chain. */
export default function Inventory() {
  const auth = useSession(); const archive = useArchive({ sort: 'newest' });
  const records = useMemo(() => archive.data?.items.map(i => i.record), [archive.data]);
  const byToken = useMemo(() => new Map((records ?? []).map(r => [r.tokenAddress.toLowerCase(), r])), [records]);
  const curves = useMemo(() => new Map((archive.data?.items ?? []).map(i => [i.record.objectId, i.curve])), [archive.data]);
  const holdings = useHoldings(auth.wallet, records); const artifacts = useArtifacts(auth.wallet);
  const held = (holdings.data ?? []).filter(h => h.balance > 0n);
  const totalPending = (artifacts.data ?? []).reduce((sum, a) => sum + a.pending, 0n);
  return <div className="page py-6 sm:py-10">
    <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="spec flex items-center gap-2">Inventory</p><h1 className="display mt-3 text-[40px] sm:text-6xl">Your objects.</h1><p className="mt-2 max-w-lg text-[15px] text-muted">Saved 3D scans, object coins and Artifacts, read from ObjectPad and Robinhood Chain.</p></div><Button asChild variant="outline"><Link to="/craft"><Hammer/>Crafting Table</Link></Button></div>
    <SavedScans/>
    {!auth.configured ? null : !auth.authenticated ? <div className="glass mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[24px] p-5"><div><p className="font-semibold">Coins & Artifacts</p><p className="text-sm text-muted">Connect a wallet to read your balances.</p></div><Button onClick={() => auth.login(['wallet', 'twitter', 'email'])}><Wallet/>Connect</Button></div> : !auth.wallet ? <Empty title="No wallet connected." description="Connect a wallet in your account to read balances." action={false}/> : <>
      <dl className="glass mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl sm:grid-cols-3">{[['Object coins held', holdings.data ? String(held.length) : '—'], ['Artifacts', ECONOMY.forge ? (artifacts.data ? String(artifacts.data.length) : '—') : 'Not deployed'], ['Claimable fees', ECONOMY.forge ? `${formatEth(totalPending, 6)} ETH` : '—']].map(([k, v]) => <div key={k} className="px-5 py-4"><dt className="stat-label">{k}</dt><dd className="mt-1 text-xl font-bold tnum">{v}</dd></div>)}</dl>
      <section className="mt-12"><h2 className="text-xl font-semibold">Artifacts</h2>
        {!ECONOMY.forge ? <p className="glass mt-4 rounded-2xl p-8 text-center text-sm text-muted">The Crafting Table is not deployed yet. Artifacts you craft will appear here.</p> : artifacts.isPending ? <Loading/> : artifacts.isError ? <div className="mt-4"><ErrorState message="Artifacts could not be read. A failed read is never shown as an empty inventory." retry={() => void artifacts.refetch()}/></div> : artifacts.data.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{artifacts.data.map(item => <ArtifactCard key={item.id.toString()} item={item} records={byToken}/>)}</div> : <Empty title="No Artifacts yet." description="Lock two or three object coins on the Crafting Table to mint your first." action={false}/>}
      </section>
      <section className="mt-12"><h2 className="text-xl font-semibold">Object coins</h2>
        {archive.isError ? <div className="mt-4"><ErrorState message="The archive is not connected." retry={() => void archive.refetch()}/></div> : holdings.isPending ? <Loading/> : holdings.isError ? <div className="mt-4"><ErrorState message="Balances are unavailable. A failed RPC is not shown as zero." retry={() => void holdings.refetch()}/></div> : held.length ? <div className="glass mt-5 divide-y divide-ink/[0.06] rounded-3xl">{held.map(({ record, balance }) => { const curve = curves.get(record.objectId); const value = curve ? Number(balance / 10n ** 12n) / 1e6 * curve.priceEth : null; return <Link key={record.objectId} to={`/objects/${record.objectId}`} className="flex items-center gap-4 p-4"><img src={record.model.thumbnailUrl} alt="" className="size-12 rounded-xl object-cover"/><div className="min-w-0 flex-1"><p className="truncate font-bold">{record.verifiedName}</p><p className="font-mono text-xs text-muted">${record.symbol} · {curve ? priceLabel(curve.priceEth) : 'price unavailable'}</p></div><div className="text-right"><p className="font-bold tnum">{formatTokens(balance)}</p><p className="font-mono text-[11px] text-muted">{value !== null ? `≈ ${compact(value, 5)} ETH at spot` : '—'}</p></div><ArrowUpRight size={16}/></Link>; })}</div> : <Empty title="No object coins yet." description="Buy a coin on any object page to start." action={false}/>}
        <p className="mt-3 text-xs text-muted">Spot value uses the live curve price and ignores fees and slippage. It is not a sale quote.</p>
      </section>
    </>}
  </div>;
}
