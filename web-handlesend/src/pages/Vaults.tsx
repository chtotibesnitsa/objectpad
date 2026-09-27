import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseEther, type Address, type Hex } from 'viem';
import { ArrowUpRight, Boxes, Check, Layers, Loader2, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useCoins } from '@/lib/coins';
import { useMarket } from '@/lib/market';
import { usePairs } from '@/lib/pairs';
import { buyBasket, sellBasket, useVault, useVaults, VAULT_KINDS, type BasketStep, type Vault } from '@/lib/vaults';
import { IndexChart } from '@/components/IndexChart';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, Loading } from '@/components/Feedback';
import { SideSwitch } from '@/components/TradePanel';
import { eth, usd } from '@/lib/format';
import { explorerTx } from '@/shared/pons';
import { cn } from '@/lib/utils';

const pct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
function useToken(): string | null { const auth = useSession(); const q = useQuery({ queryKey: ['objectpad', 'token', auth.authenticated], enabled: auth.authenticated, queryFn: () => auth.token() }); return q.data ?? null; }
function Change({ v, big = false }: { v: number; big?: boolean }) { return <span className={cn('rounded-full font-mono font-extrabold', big ? 'px-3 py-1 text-[15px]' : 'px-2 py-0.5 text-[12px]', v >= 0 ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>{v >= 0 ? '▲' : '▼'} {pct(v)}</span>; }
function Logos({ vault, size = 34 }: { vault: Vault; size?: number }) { return <div className="flex -space-x-2.5">{vault.constituents.slice(0, 6).map(c => <img key={c.token} src={c.logo} alt="" className="rounded-full bg-white object-cover ring-2 ring-white" style={{ width: size, height: size }}/>)}{vault.constituents.length > 6 && <span className="flex items-center justify-center rounded-full bg-ink font-mono text-[11px] font-bold text-white ring-2 ring-white" style={{ width: size, height: size }}>+{vault.constituents.length - 6}</span>}</div>; }

/** /vaults: every Object Vault with its live index. */
export default function Vaults() {
  const token = useToken(); const vaults = useVaults(token); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null; const [open, setOpen] = useState<boolean>(false);
  const money = (e: number) => ethUsd ? usd(e * ethUsd, 0) : eth(e, 3);
  return <div className="page py-6 sm:py-10">
    <section className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
      <div><p className="lab">New · Object Vaults</p><h1 className="display mt-4 text-[48px] leading-[0.92] sm:text-[80px]">Buy the whole shelf.</h1><p className="mt-4 max-w-2xl text-[18px] font-bold text-ink/65">Group real-object coins into a vault. Each vault is a live index built from its coins’ market caps, and you can buy or sell the entire basket in one flow, straight into your wallet.</p></div>
      <button onClick={() => setOpen(true)} className="btn press min-h-14 px-7 text-[16px]"><Plus size={18}/>Create a vault</button>
    </section>
    <section className="steel mt-8 grid gap-3 rounded-[32px] p-3 sm:grid-cols-3 sm:p-4">
      {[['I(t) = 1000 · ΣMC(t) / ΣMC(t₀)', 'Cap-weighted index from on-chain prices'], ['1 ETH → N curve buys', 'Weights split your ETH across every coin'], ['0 custody', 'Every leg lands in your own wallet']].map(([a, b]) => <div key={a} className="raised rounded-[22px] p-4"><p className="font-mono text-[15px] font-extrabold">{a}</p><p className="mt-1 text-[13px] font-bold text-ink/60">{b}</p></div>)}
    </section>
    {vaults.isPending ? <Loading label="Computing indexes…"/> : vaults.isError ? <ErrorState message="Vaults are unavailable right now." retry={() => void vaults.refetch()}/> :
      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{vaults.data.items.map((v, i) => <Link key={v.id} to={`/vaults/${v.slug}`} className="raised lift card-pop group block overflow-hidden rounded-[28px] p-5" style={{ ['--delay' as string]: `${i * 60}ms` }}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-2 font-mono text-[11.5px] font-extrabold uppercase text-ink/60">{v.system && <Sparkles size={12}/>}{v.kind} · {v.weighting === 'cap' ? 'cap-weighted' : 'equal-weighted'}</p><h2 className="mt-1.5 truncate text-[22px] font-extrabold">{v.name}</h2><p className="mt-0.5 text-[12.5px] font-bold text-ink/55">by {v.owner.handle ? (v.system ? v.owner.handle : `@${v.owner.handle}`) : 'a creator'}</p></div><Change v={v.change24h}/></div>
        <div className="mt-4 flex items-end justify-between"><p className="display text-[40px] tnum">{v.level.toFixed(2)}</p><Logos vault={v}/></div>
        <IndexChart points={v.history} height={90} compact className="mt-2"/>
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-ink/[0.07] pt-3 text-[12px]"><div><dt className="stat-label !text-[10.5px]">Coins</dt><dd className="font-extrabold">{v.constituents.length}</dd></div><div><dt className="stat-label !text-[10.5px]">Avg cap</dt><dd className="font-extrabold">{money(v.avgCapEth)}</dd></div><div><dt className="stat-label !text-[10.5px]">7d</dt><dd className={cn('font-extrabold', v.change7d >= 0 ? 'text-up' : 'text-down')}>{pct(v.change7d)}</dd></div></dl>
      </Link>)}</section>}
    <CreateVault open={open} onOpenChange={setOpen} token={token}/>
  </div>;
}

function CreateVault({ open, onOpenChange, token }: { open: boolean; onOpenChange: (v: boolean) => void; token: string | null }) {
  const auth = useSession(); const coins = useCoins(); const nav = useNavigate(); const qc = useQueryClient();
  const [name, setName] = useState<string>(''); const [kind, setKind] = useState<string>('collection'); const [weighting, setWeighting] = useState<'cap' | 'equal'>('cap'); const [desc, setDesc] = useState<string>(''); const [picked, setPicked] = useState<string[]>([]); const [q, setQ] = useState<string>('');
  const list = useMemo(() => (coins.data?.items ?? []).filter(c => c.token && c.priceEth > 0 && !c.nsfw && `${c.name} ${c.symbol}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60), [coins.data, q]);
  const create = useMutation({ mutationFn: async () => api<Vault>('/vaults', { method: 'POST', token: token ?? await auth.token(), body: { name, kind, weighting, description: desc, tokens: picked } }), onSuccess: v => { void qc.invalidateQueries({ queryKey: ['objectpad', 'vaults'] }); onOpenChange(false); nav(`/vaults/${v.slug}`); } });
  return <Dialog open={open} onOpenChange={onOpenChange} title="Create an Object Vault" description="Pick 2–12 live coins. The index starts at 1000 and tracks their combined market cap.">
    {!auth.authenticated ? <button className="btn press min-h-12 w-full" onClick={() => auth.login()}>Sign in to create a vault</button> : <div className="space-y-3">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Vault name, e.g. Desk Setup" maxLength={40} className="w-full"/>
      <div className="grid grid-cols-2 gap-2">{VAULT_KINDS.map(k => <button key={k.id} type="button" onClick={() => setKind(k.id)} className={cn('rounded-2xl p-3 text-left', kind === k.id ? 'bg-ink text-white' : 'bg-ink/[0.06]')}><p className="text-[14px] font-extrabold">{k.label}</p><p className={cn('text-[11.5px] font-semibold', kind === k.id ? 'text-white/70' : 'text-ink/55')}>{k.note}</p></button>)}</div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-ink/[0.06] p-1">{(['cap', 'equal'] as const).map(w => <button key={w} type="button" onClick={() => setWeighting(w)} className={cn('min-h-10 rounded-xl text-[13px] font-extrabold', weighting === w ? 'bg-white shadow' : 'text-ink/60')}>{w === 'cap' ? 'Market-cap weighted' : 'Equal weighted'}</button>)}</div>
      <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} maxLength={240} placeholder="What ties these objects together? (optional)" className="w-full"/>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search coins" className="w-full"/>
      <div className="max-h-60 space-y-1 overflow-auto">{list.map(c => { const on = picked.includes(c.token); return <button key={c.token} type="button" onClick={() => setPicked(p => on ? p.filter(t => t !== c.token) : p.length >= 12 ? p : [...p, c.token])} className={cn('flex w-full items-center gap-3 rounded-2xl p-2 text-left', on ? 'bg-up/12' : 'hover:bg-ink/[0.05]')}><img src={c.logo} alt="" className="size-9 rounded-full bg-white object-cover"/><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-extrabold">{c.name}</span><span className="font-mono text-[11.5px] text-ink/55">${c.symbol}</span></span>{on ? <Check size={18} className="text-up"/> : <Plus size={16} className="text-ink/40"/>}</button>; })}</div>
      <button disabled={picked.length < 2 || name.trim().length < 3 || create.isPending} onClick={() => create.mutate()} className="btn press min-h-12 w-full disabled:opacity-40">{create.isPending ? <Loader2 className="animate-spin" size={16}/> : <Layers size={16}/>}Create vault · {picked.length} coins</button>
      {create.isError && <p role="alert" className="text-sm font-bold text-down">{create.error.message}</p>}
    </div>}
  </Dialog>;
}

/** /vaults/:slug: index chart, constituents with proof status, and one-flow basket trading. */
export function VaultDetail() {
  const { slug = '' } = useParams(); const token = useToken(); const vault = useVault(slug, token); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null;
  const money = (e: number, d = 0) => ethUsd ? usd(e * ethUsd, d) : eth(e, 4);
  if (vault.isPending) return <Loading label="Rebuilding the index from chain trades…"/>;
  if (vault.isError) return <div className="page max-w-2xl py-16"><ErrorState message="This vault doesn’t exist or has no live coins." retry={() => void vault.refetch()}/></div>;
  const v = vault.data;
  return <div className="page py-5 sm:py-8">
    <Link to="/vaults" className="font-mono text-[12px] font-extrabold text-ink/60">← All vaults</Link>
    <div className="mt-3 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
      <section className="raised rounded-[30px] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[12px] font-extrabold uppercase text-ink/60">{v.kind} vault · {v.weighting === 'cap' ? 'market-cap weighted' : 'equal weighted'} · by {v.system ? 'ObjectPad' : v.owner.handle ? `@${v.owner.handle}` : 'a creator'}</p><h1 className="display mt-2 text-[36px] sm:text-[52px]">{v.name}</h1>{v.description && <p className="mt-2 max-w-xl text-[15px] font-semibold text-ink/65">{v.description}</p>}</div><Logos vault={v} size={40}/></div>
        <div className="mt-6 flex flex-wrap items-end gap-4"><p className="display text-[56px] leading-none tnum sm:text-[72px]">{v.level.toFixed(2)}</p><div className="mb-2 flex gap-2"><Change v={v.change24h} big/><span className="rounded-full bg-ink/[0.06] px-3 py-1 font-mono text-[13px] font-extrabold">7d {pct(v.change7d)}</span></div></div>
        <IndexChart points={v.history} height={300} className="mt-4"/>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Combined cap', money(v.totalCapEth)], ['Average cap', money(v.avgCapEth)], ['24h volume', money(v.volume24hEth, 2)], ['Holders (sum)', v.holders.toLocaleString()]].map(([a, b]) => <div key={a} className="rounded-2xl bg-ink/[0.04] px-3.5 py-3"><dt className="stat-label !text-[11px]">{a}</dt><dd className="mt-1 text-lg font-extrabold tnum">{b}</dd></div>)}</dl>
        <p className="mt-4 rounded-2xl bg-ink/[0.04] p-3 font-mono text-[12px] font-bold leading-5 text-ink/65">{v.weighting === 'cap' ? 'I(t) = 1000 × Σ MCᵢ(t) / Σ MCᵢ(t₀)' : 'I(t) = 1000 × (1/N) × Σ Pᵢ(t) / Pᵢ(t₀)'} · rebuilt hourly from every indexed trade on Robinhood Chain · base t₀ = {new Date(v.history[0]?.t ?? v.createdAt).toLocaleDateString()}</p>
      </section>
      <aside className="space-y-4"><div className="raised rounded-[30px] p-5 sm:p-6"><h2 className="mb-4 text-[18px] font-extrabold">Trade the index</h2><BasketPanel vault={v}/></div></aside>
    </div>
    <section className="glass mt-4 overflow-hidden rounded-[28px] p-2 sm:p-3">
      <div className="flex items-center justify-between px-3 py-2"><h2 className="flex items-center gap-2 text-lg font-extrabold"><Boxes size={18}/>Constituents</h2><span className="font-mono text-[12px] font-bold text-ink/55">{v.constituents.length} objects</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[13.5px]"><thead className="stat-label"><tr><th className="px-3 py-2 font-normal">Object</th><th className="font-normal">Weight</th><th className="font-normal">Market cap</th><th className="font-normal">24h</th><th className="font-normal">Holders</th><th className="px-3 text-right font-normal">Proof</th></tr></thead>
        <tbody>{v.constituents.map(c => <tr key={c.token} className="border-t border-ink/[0.06]"><td className="px-3 py-2.5"><Link to={c.path} className="flex items-center gap-3"><img src={c.logo} alt="" className="size-10 rounded-full bg-white object-cover"/><span><span className="block font-extrabold">{c.name}</span><span className="font-mono text-[11.5px] text-ink/55">${c.symbol}</span></span></Link></td>
          <td><div className="flex items-center gap-2"><span className="h-2 w-20 overflow-hidden rounded-full bg-ink/[0.07]"><span className="block h-full rounded-full bg-ink" style={{ width: `${Math.max(3, c.weight * 100)}%` }}/></span><span className="font-mono font-bold">{(c.weight * 100).toFixed(1)}%</span></div></td>
          <td className="font-bold tnum">{money(c.marketCapEth)}</td><td><Change v={c.change24h}/></td><td className="font-bold">{c.holders}</td>
          <td className="px-3 text-right">{c.objectId ? <Link to={`/verify/${c.objectId}`} className="chip"><ShieldCheck size={12}/>Verify</Link> : <span className="chip">Original</span>}</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}

function BasketPanel({ vault }: { vault: Vault }) {
  const auth = useSession(); const pairs = usePairs(); const qc = useQueryClient();
  const [side, setSide] = useState<'buy' | 'sell'>('buy'); const [amount, setAmount] = useState<string>('0.01'); const [percent, setPercent] = useState<number>(100); const [steps, setSteps] = useState<BasketStep[]>([]);
  const run = useMutation({ mutationFn: async () => {
    if (!auth.wallet) throw new Error('Connect a wallet first.');
    setSteps(vault.constituents.map(c => ({ symbol: c.symbol, state: 'waiting' })));
    const onStep = (i: number, s: BasketStep) => setSteps(prev => prev.map((p, j) => j === i ? s : p));
    const send = (tx: { to: Address; data: Hex; value: bigint; gas: bigint }) => auth.send(tx);
    if (side === 'buy') { let wei: bigint; try { wei = parseEther(amount || '0'); } catch { throw new Error('Enter an ETH amount.'); } if (wei <= 0n) throw new Error('Enter an ETH amount.'); return buyBasket({ wallet: auth.wallet, vault, ethIn: wei, slippageBps: 500, send, pairs: pairs.data?.assets ?? [], router: pairs.data?.router.swapRouter, quoter: pairs.data?.router.quoter, onStep }); }
    return sellBasket({ wallet: auth.wallet, vault, percent, slippageBps: 500, send, onStep });
  }, onSettled: () => { void qc.invalidateQueries({ queryKey: ['objectpad', 'vault'] }); } });
  const legs = vault.constituents.length; const paired = vault.constituents.filter(c => c.pairToken).length;
  return <div>
    <SideSwitch side={side} onChange={s => { setSide(s); setSteps([]); }}/>
    {side === 'buy' ? <div className="mt-4 rounded-[18px] border-2 border-ink/10 bg-white p-4"><p className="text-[13px] font-extrabold text-ink/70">You pay</p><div className="mt-1 flex items-center gap-2"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="min-w-0 flex-1 !border-0 !bg-transparent !p-0 text-[28px] font-extrabold !shadow-none"/><span className="rounded-full bg-ink px-3 py-1.5 text-[14px] font-extrabold text-white">ETH</span></div></div>
      : <div className="mt-4 grid grid-cols-4 gap-1.5">{[25, 50, 75, 100].map(p => <button key={p} onClick={() => setPercent(p)} className={cn('min-h-12 rounded-xl text-[14px] font-extrabold', percent === p ? 'bg-ink text-white' : 'bg-ink/[0.07]')}>{p === 100 ? 'All' : `${p}%`}</button>)}</div>}
    <div className="mt-3 space-y-1">{vault.constituents.map((c, i) => { const s = steps[i]; return <div key={c.token} className="flex items-center gap-2 rounded-xl bg-ink/[0.04] px-3 py-2 text-[13px]"><img src={c.logo} alt="" className="size-6 rounded-full"/><span className="flex-1 font-extrabold">${c.symbol}</span><span className="font-mono font-bold text-ink/60">{side === 'buy' ? `${(c.weight * 100).toFixed(1)}%` : `${percent}%`}</span>
      {s?.state === 'active' && <Loader2 size={14} className="animate-spin"/>}{s?.state === 'done' && (s.hash ? <a href={explorerTx(s.hash)} target="_blank" rel="noreferrer" className="text-up"><ArrowUpRight size={14}/></a> : <Check size={14} className="text-up"/>)}{s?.state === 'failed' && <span title={s.note}><X size={14} className="text-down"/></span>}{s?.state === 'skipped' && <span className="text-[11px] text-ink/45">skip</span>}</div>; })}</div>
    {!auth.authenticated ? <button className="btn press mt-4 min-h-14 w-full" onClick={() => auth.login()}>Connect to trade the index</button>
      : <button disabled={run.isPending} onClick={() => run.mutate()} className={cn('press mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] text-[16px] font-extrabold text-white disabled:opacity-50', side === 'buy' ? 'bg-up' : 'bg-down')}>{run.isPending ? <><Loader2 size={16} className="animate-spin"/>Confirm each leg in your wallet…</> : side === 'buy' ? `Buy the index · ${legs} coins` : `Sell ${percent}% of every coin`}</button>}
    {run.data !== undefined && <p className="mt-2 text-[13px] font-extrabold text-up">{run.data} of {legs} legs filled.</p>}
    {run.isError && <p role="alert" className="mt-2 text-[13px] font-bold text-down">{run.error.message}</p>}
    <p className="mt-3 text-[12px] font-semibold leading-5 text-ink/55">One wallet confirmation per coin{paired ? ` (${paired} stock-paired coin${paired > 1 ? 's' : ''} add a swap + approve)` : ''}. Every leg buys on that coin’s own bonding curve with 5% max slippage and lands in your wallet. ObjectPad never holds the basket.</p>
  </div>;
}
