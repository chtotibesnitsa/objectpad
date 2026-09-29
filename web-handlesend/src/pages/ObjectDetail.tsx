import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { encodeFunctionData, type Address } from 'viem';
import { ArrowUpRight, Bookmark, Camera, Check, Coins, Copy, Cpu, Cuboid, ExternalLink, Fingerprint, Flag, Hammer, ScanLine, ShieldCheck, Sparkles } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useCurveTrades, useMarket } from '@/lib/market';
import { useCurve } from '@/lib/objects';
import { chain, formatEth, prepareTx, waitForReceipt } from '@/lib/chain';
import { compactNumber, copyText, eth, shortAddress, timeAgo, tinyUsd, usd } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, Loading } from '@/components/Feedback';
import { PriceChart } from '@/components/PriceChart';
import { TradePanel } from '@/components/TradePanel';
import { PairBadge } from '@/components/PairBadge';
import { usePair, isEthPair } from '@/lib/pairs';
import { ObjectKey } from '@/components/ObjectKey';
import { CreatorProof } from '@/components/CreatorProof';
import { TxPanel, useLaunchTx } from '@/components/TxProof';
import { ShareCardDialog } from '@/components/ShareCardDialog';
import type { ObjectRecord, Profile } from '@/shared/domain';
import { ESCROW_ABI, PONS_FEE_ESCROW } from '@/shared/economy';
import { explorerTx } from '@/shared/pons';
import { shortHash } from '@/shared/security';
import { cn } from '@/lib/utils';
import { CoinUpdates } from '@/components/social/CoinUpdates';

const ModelViewer = lazy(() => import('@/components/ModelViewer'));
const reportSchema = z.object({ reason: z.string().trim().min(10, 'Please describe the concern.').max(1500) });

/** Creator-fee balance waiting in the Pons fee escrow for this coin's fee wallet. Only that wallet can claim it. */
function CreatorFees({ record }: { record: ObjectRecord }) {
  const auth = useSession(); const qc = useQueryClient(); const wallet = (record.feeVault ?? record.creatorWallet) as Address;
  const balance = useQuery({ queryKey: ['objectpad', 'escrow', wallet], queryFn: () => chain.readContract({ address: PONS_FEE_ESCROW, abi: ESCROW_ABI, functionName: 'balanceOf', args: [wallet] }), refetchInterval: 30_000, retry: 1 });
  const isCreatorWallet = auth.wallet?.toLowerCase() === wallet.toLowerCase();
  const claim = useMutation({ mutationFn: async () => { if (!auth.wallet) throw new Error('Sign in first.'); const hash = await auth.send(await prepareTx(auth.wallet, { to: PONS_FEE_ESCROW, data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'claim' }) })); await waitForReceipt(hash); return hash; }, onSuccess: () => void qc.invalidateQueries({ queryKey: ['objectpad', 'escrow', wallet] }) });
  return <section className="glass rounded-[24px] p-5">
    <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Coins size={15}/>Creator fees</h2><span className="font-mono text-[11.5px] text-ink/65">1.5% of every trade</span></div>
    <p className="display mt-3 text-3xl tnum">{balance.data !== undefined ? `${formatEth(balance.data)} ETH` : balance.isError ? '—' : '…'}</p>
    <p className="mt-1 text-xs text-ink/65">Claimable by <a className="font-mono hover:underline" href={`https://robinhoodchain.blockscout.com/address/${wallet}`} target="_blank" rel="noreferrer">{shortAddress(wallet)}</a></p>
    {isCreatorWallet && <Button className="press mt-4 w-full" disabled={claim.isPending || !balance.data} onClick={() => claim.mutate()}>{claim.isPending ? 'Claiming…' : 'Claim to my wallet'}</Button>}
    {claim.isError && <p role="alert" className="mt-2 text-xs text-down">{claim.error.message.split('\n')[0]}</p>}
    {claim.data && <a href={explorerTx(claim.data)} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 font-mono text-[11px] text-up">Claimed · receipt<ArrowUpRight size={12}/></a>}
  </section>;
}

/** How this exact object became a coin: physically scanned, rebuilt by AI, impossible to copy, named on-chain. */
function Provenance({ object }: { object: ObjectRecord }) {
  const cards = [
    { icon: Camera, title: 'Physically scanned', stat: `${object.acceptedViewCount} photos`, body: 'Shot on a phone around the real object. Location data stripped, every frame screened.' },
    { icon: Cpu, title: 'Rebuilt by AI', stat: `${object.model.triangles.toLocaleString()} tris`, body: 'Full-colour 3D reconstruction from the photos, validated before launch.' },
    { icon: Fingerprint, title: 'Can’t be copied', stat: object.uniqueness ? `vs ${object.uniqueness.compared.toLocaleString()}` : 'Checked', body: 'AI compared the object with the archive. Reused frames, models and captures are rejected.' },
    { icon: Cuboid, title: 'SHA-256 on-chain', stat: object.objectTag ?? 'In description', body: 'The 3D model and capture fingerprints, AI name and tag are written into the launch transaction itself, so it can’t be vamped.' },
  ];
  return <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <div key={card.title} className="glass rounded-[22px] p-5"><div className="flex items-center justify-between"><span className="flex size-9 items-center justify-center rounded-full bg-ink/[0.05]"><card.icon size={16}/></span><span className="font-mono text-[11px] font-medium">{card.stat}</span></div><p className="mt-4 font-semibold">{card.title}</p><p className="mt-1 text-[13px] leading-5 text-ink/65">{card.body}</p></div>)}</section>;
}

/** Full coin page for one confirmed object. Rendered at /objects/:id and at the permanent /o/:code link. */
export function ObjectView({ id }: { id: string }) {
  const auth = useSession(); const qc = useQueryClient(); const market = useMarket();
  const [reportOpen, setReportOpen] = useState<boolean>(false); const [copied, setCopied] = useState<boolean>(false); const [shareOpen, setShareOpen] = useState<boolean>(false);
  const form = useForm<z.infer<typeof reportSchema>>({ resolver: zodResolver(reportSchema) });
  const query = useQuery({ queryKey: ['objectpad', 'object', id], queryFn: () => api<ObjectRecord>(`/objects/${id}`), retry: false });
  const curve = useCurve(query.data?.curveAddress as Address | undefined); const trades = useCurveTrades(query.data?.curveAddress); const tx = useLaunchTx(query.data?.launchTransactionHash);
  const profile = useQuery({ queryKey: ['objectpad', 'profile'], enabled: auth.authenticated, queryFn: async () => api<Profile | null>('/profile', { token: await auth.token() }) });
  const watchlist = useQuery({ queryKey: ['objectpad', 'watchlist'], enabled: auth.authenticated, queryFn: async () => api<{ ids: string[] }>('/watchlist', { token: await auth.token() }) });
  const save = useMutation({ mutationFn: async () => api('/watchlist', { method: 'POST', token: await auth.token(), body: { objectId: id, saved: !watchlist.data?.ids.includes(id) } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['objectpad', 'watchlist'] }) });
  const report = useMutation({ mutationFn: async (values: z.infer<typeof reportSchema>) => api('/reports', { method: 'POST', token: await auth.token(), body: { ...values, objectId: id } }) });
  useEffect(() => { if (!query.data) return; void api(`/objects/${id}/signal`, { method: 'POST', body: { kind: 'view' } }).catch(() => undefined); }, [id, query.data]);
  const list = useMemo(() => trades.data?.trades ?? [], [trades.data]);
  const stats = useMemo(() => ({ volume: list.reduce((sum, t) => sum + t.eth, 0), buyers: new Set(list.filter(t => t.side === 'buy').map(t => t.trader)).size, buys: list.filter(t => t.side === 'buy').length }), [list]);
  if (query.isPending) return <Loading label="Opening the coin…"/>;
  if (query.isError) return <div className="page max-w-2xl py-16"><ErrorState message="This coin is unavailable, not confirmed yet or under review. ObjectPad never shows a substitute." retry={() => void query.refetch()}/></div>;
  const object = query.data; const state = curve.data; const ethUsd = market.data?.ethUsd ?? null;
  const isCreator = Boolean(profile.data && object.creatorDid === `did:objectpad:${profile.data.publicId}`);
  const price = state ? (ethUsd ? tinyUsd(state.priceEth * ethUsd) : `${state.priceEth.toPrecision(3)} ETH`) : '—';
  const cap = state ? (ethUsd ? usd(state.marketCapEth * ethUsd) : eth(state.marketCapEth, 2)) : '—';
  const share = `$${object.symbol} is a real ${object.category || 'object'}, scanned in 3D and named on-chain on @ObjectPad.`;
  return <div className="page py-5 sm:py-8">
    <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
      <div className="relative">
        <Suspense fallback={<div className="glass h-[420px] rounded-[28px] sm:h-[600px]"/>}><ModelViewer src={object.model.modelUrl} poster={object.model.thumbnailUrl} height="h-[420px] sm:h-[600px]" autoLoad label={`Real 3D scan · ${object.model.triangles.toLocaleString()} triangles`}/></Suspense>
        <div className="glass-strong pointer-events-none absolute right-4 top-4 hidden rounded-2xl px-3.5 py-2.5 text-right sm:block"><p className="spec !text-[11px]">Object on-chain</p><p className="mt-0.5 max-w-[240px] truncate text-sm font-semibold">{object.objectName ?? object.category}</p>{object.objectTag && <span className="chip-dark mt-1">{object.objectTag}</span>}</div>
      </div>
      <div className="space-y-4">
        <div className="glass rounded-[28px] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><img src={object.iconUrl ?? object.model.thumbnailUrl} alt="" className="size-14 rounded-full bg-white object-cover shadow-[0_0_0_1px_rgba(12,13,16,.08)]"/><div><h1 className="display text-3xl sm:text-4xl">{object.verifiedName}</h1><p className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-xs text-ink/65"><span className="btn px-2 py-0.5 font-medium ">${object.symbol}</span><ShieldCheck size={13} className="text-up"/>Verified launch{object.checkin && <span className="rounded-full bg-up/10 px-2 py-0.5 text-up">Object Key ✓</span>}</p>{!isEthPair(object.pairToken) && <PairLine address={object.pairToken as string}/>}</div></div>
            <div className="flex gap-1"><button className="press flex size-10 items-center justify-center rounded-full bg-white/70 shadow-[0_0_0_1px_rgba(12,13,16,.07)] disabled:opacity-40" aria-label="Save to watchlist" aria-pressed={watchlist.data?.ids.includes(id) ?? false} disabled={!auth.authenticated || save.isPending} onClick={() => save.mutate()}><Bookmark size={15} className={watchlist.data?.ids.includes(id) ? 'fill-current' : ''}/></button><button className="press flex size-10 items-center justify-center rounded-full bg-white/70 shadow-[0_0_0_1px_rgba(12,13,16,.07)]" aria-label="Copy link" onClick={() => void copyText(object.canonicalUrl).then(setCopied)}>{copied ? <Check size={15}/> : <Copy size={15}/>}</button><button className="press flex size-10 items-center justify-center rounded-full bg-white/70 shadow-[0_0_0_1px_rgba(12,13,16,.07)]" aria-label="Share on X" onClick={() => setShareOpen(true)}><ExternalLink size={15}/></button></div></div>
          <dl className="mt-5 grid grid-cols-2 gap-2">{[['Price', price], ['Market cap', cap], ['Curve reserve', state ? eth(state.realReserveEth, 4) : '—'], ['Graduation', state ? (state.graduated ? 'Graduated' : `${(state.progress * 100).toFixed(1)}%`) : '—']].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/60 px-3.5 py-3 shadow-[0_0_0_1px_rgba(12,13,16,.04)]"><dt className="spec !text-[11px]">{label}</dt><dd className="mt-1 text-lg font-semibold tnum">{curve.isError ? 'Unavailable' : value}</dd>{label === 'Graduation' && state && !state.graduated && <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/[0.07]"><div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(2, state.progress * 100)}%` }}/></div>}</div>)}</dl>
        </div>
        {tx.isError ? <div className="glass rounded-[24px] p-5 text-sm font-semibold text-ink/65">The launch transaction couldn’t be read right now. <a className="font-extrabold text-ink underline" href={explorerTx(object.launchTransactionHash)} target="_blank" rel="noreferrer">Open it in the explorer</a>.</div> : <TxPanel view={tx.data} loading={tx.isPending} expected={{ objectTag: object.objectTag }}/>}
      </div>
    </div>

    <div className="mt-4"><CreatorProof object={object}/></div>
    <div className="mt-4"><Provenance object={object}/></div>


    <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
      <div className="space-y-4">
        <CoinUpdates recordId={id} isCreator={isCreator}/>
        <section className="glass rounded-[26px] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Chart</h2><span className="font-mono text-[11.5px] uppercase text-ink/65">{trades.data ? `${list.length} trades · last ~3 days` : trades.isError ? 'Unavailable' : 'Reading chain logs…'}</span></div>
          {trades.isError ? <p className="mt-4 text-sm text-ink/65">Trade history is unavailable right now.</p> : trades.isPending ? <div className="mt-4 h-64 animate-pulse rounded-2xl bg-white/50"/> : <PriceChart trades={list} ethUsd={ethUsd} className="mt-4 h-[360px]"/>}
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-ink/[0.06] pt-4 text-sm"><div><p className="stat-label">Volume</p><p className="mt-1 font-semibold tnum">{ethUsd ? usd(stats.volume * ethUsd) : eth(stats.volume, 4)}</p></div><div><p className="stat-label">Unique buyers</p><p className="mt-1 font-semibold tnum">{stats.buyers}</p></div><div><p className="stat-label">Buys / sells</p><p className="mt-1 font-semibold tnum">{stats.buys} / {list.length - stats.buys}</p></div></div>
          {list.length > 0 && <div className="mt-4 max-h-72 overflow-auto rounded-2xl bg-ink/[0.025]"><table className="w-full text-left text-xs"><thead className="stat-label sticky top-0 bg-paper/90 backdrop-blur"><tr><th className="px-3 py-2 font-normal">Side</th><th className="font-normal">Amount</th><th className="font-normal">Tokens</th><th className="font-normal">Trader</th><th className="px-3 text-right font-normal">When</th></tr></thead><tbody>{[...list].reverse().slice(0, 50).map(t => <tr key={t.id} className="border-t border-ink/[0.04]"><td className={cn('px-3 py-2 font-medium uppercase', t.side === 'buy' ? 'text-up' : 'text-down')}>{t.side}</td><td className="tnum">{ethUsd ? usd(t.eth * ethUsd) : eth(t.eth, 5)}</td><td className="tnum">{compactNumber(t.tokens)}</td><td className="font-mono text-ink/65">{shortAddress(t.trader, 5, 3)}</td><td className="px-3 text-right"><a className="font-mono text-ink/65 hover:underline" href={explorerTx(t.hash)} target="_blank" rel="noreferrer">{timeAgo(t.at)}</a></td></tr>)}</tbody></table></div>}
        </section>
        <section className="glass rounded-[26px] p-6"><h2 className="text-lg font-semibold">The object</h2><p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-ink/80">{object.story}</p><div className="mt-4 flex flex-wrap gap-2">{object.xUrl && object.creatorIdentity?.linkStatus === 'verified' && <a href={object.xUrl} target="_blank" rel="noreferrer nofollow" className="chip">X<ArrowUpRight size={11}/></a>}{object.telegram && <a href={object.telegram} target="_blank" rel="noreferrer nofollow" className="chip">Telegram<ArrowUpRight size={11}/></a>}<span className="chip">{object.category || 'Object'}</span></div></section>
      </div>
      <aside className="space-y-4">
        <div className="raised rounded-[30px] p-5 sm:p-6"><h2 className="mb-4 text-[18px] font-extrabold">Trade ${object.symbol}</h2><TradePanel token={object.tokenAddress as Address} curve={object.curveAddress as Address} symbol={object.symbol} state={state} pairToken={object.pairToken}/></div>
        <CreatorFees record={object}/>
        <ObjectKey objectId={object.objectId} checkin={object.checkin} isCreator={isCreator}/>
        <Link to={`/craft?add=${object.tokenAddress}`} className="lift steel group flex items-center gap-4 rounded-[24px] p-5"><span className="raised flex size-10 items-center justify-center rounded-xl"><Hammer size={18}/></span><div className="flex-1"><p className="font-extrabold">Craft with ${object.symbol}</p><p className="text-xs font-semibold text-ink/65">Crafting Table · in production</p></div><ArrowUpRight size={17}/></Link>
        <section className="glass rounded-[24px] p-5">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Scan certificate</h2><Fingerprint size={15} className="text-ink/65"/></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><a href={explorerTx(object.launchTransactionHash)} target="_blank" rel="noreferrer" className="btn-ghost press min-h-11 text-[12.5px]"><ShieldCheck size={14}/>Verify onchain</a><button onClick={() => setShareOpen(true)} className="btn press min-h-11 text-[12.5px]">Share on X</button></div>
          <dl className="mt-3 divide-y divide-ink/[0.06] text-sm">{[['Object tag', object.objectTag ?? '—'], ['Photos accepted', String(object.acceptedViewCount)], ['3D model', `${object.model.triangles.toLocaleString()} tris · ${object.model.textures} textures`], ['Duplicate check', object.uniqueness ? `Passed · ${object.uniqueness.compared} compared` : 'Passed'], ['Model sha256', shortHash(object.originalModelHash)], ['Capture sha256', shortHash(object.captureManifestHash)], ['Launched', object.confirmedAt ? timeAgo(object.confirmedAt) : '—']].map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2.5"><dt className="text-ink/65">{k}</dt><dd className="text-right font-mono text-xs">{v}</dd></div>)}</dl>
          <a href={`https://robinhoodchain.blockscout.com/token/${object.tokenAddress}`} target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center justify-between rounded-2xl bg-ink/[0.035] px-3 text-xs"><span>Token contract</span><span className="flex items-center gap-1 font-mono">{shortHash(object.tokenAddress)}<ArrowUpRight size={12}/></span></a>
          {object.launchMode === 'sponsored' && <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-ink/65"><Sparkles size={13} className="mt-0.5 shrink-0"/>Free launch: the ObjectPad treasury paid the launch and burned the minimum first buy, so nobody started with a bag.</p>}
          <div className="mt-2 flex justify-between gap-2"><Button variant="ghost" size="sm" disabled={!auth.authenticated} onClick={() => setReportOpen(true)}><Flag/>Report</Button><Link to="/launch" className="flex min-h-11 items-center gap-1.5 text-xs font-medium"><ScanLine size={13}/>Tokenize yours</Link></div>
          <p className="mt-1 text-[11px] leading-5 text-ink/65">A scan record does not prove legal ownership, authenticity or physical uniqueness. Coins carry no redemption right.</p>
        </section>
      </aside>
    </div>
    <ShareCardDialog open={shareOpen} onOpenChange={setShareOpen} url={object.canonicalUrl} postText={share} input={{ name: object.verifiedName, symbol: object.symbol, ca: object.tokenAddress, imageUrl: object.iconUrl ?? object.model.thumbnailUrl, creator: object.checkin ? 'a verified creator' : null, category: object.category || undefined }}/>
    <Dialog open={reportOpen} onOpenChange={setReportOpen} title="Report this coin" description="Reports go to the operator queue. Don’t include private keys or unnecessary personal information."><form onSubmit={form.handleSubmit(values => report.mutate(values))} className="space-y-4"><textarea {...form.register('reason')} rows={4} className="w-full" placeholder="Describe the rights, safety or accuracy concern."/>{form.formState.errors.reason && <p role="alert" className="text-sm text-down">{form.formState.errors.reason.message}</p>}{report.isSuccess ? <p role="status" className="text-sm text-up">Report received.</p> : <Button className="w-full" disabled={report.isPending}>Submit report</Button>}{report.isError && <p role="alert" className="text-sm text-down">{report.error.message}</p>}</form></Dialog>
  </div>;
}

/** "Paired with NVDA" line under the coin name, with the asset's live price and 24h move. */
function PairLine({ address }: { address: string }) {
  const pair = usePair(address); if (!pair) return null;
  return <p className="mt-2 flex flex-wrap items-center gap-2"><PairBadge symbol={pair.symbol} logo={pair.logo} change={pair.change24h} label/>{pair.priceUsd && <span className="font-mono text-[11.5px] font-bold text-ink/60">{pair.name} · {usd(pair.priceUsd)}</span>}</p>;
}

export default function ObjectDetail() { const { id = '' } = useParams(); return <ObjectView id={id}/>; }
