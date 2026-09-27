import { memo, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseEther, type Address, type Hex } from 'viem';
import { ArrowUpRight, Boxes, Calculator, Check, Coins, Crown, Landmark, Layers, Loader2, Plus, Receipt, ShieldCheck, ShoppingBasket, Sparkles, Trophy, Wallet, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useMarket } from '@/lib/market';
import { usePairs } from '@/lib/pairs';
import { executeBasketBuy, executeBasketSell, forTab, partnerMessage, quoteBasket, recordReceipt, TABS, useLeaderboard, useMyVaultStats, useUniverse, useVault, useVaults, VAULT_CONCEPTS, VAULT_KINDS, type BasketQuote, type BasketReceipt, type CombinedReceipt, type TabId, type Vault, type VaultKind } from '@/lib/vaults';
import { IndexChart } from '@/components/IndexChart';
import { ErrorState, Loading } from '@/components/Feedback';
import { SideSwitch } from '@/components/TradePanel';
import { AffiliationBadge, Change, CountUp, Drawer, HealthPill, Logos, ProductTag, Sheet, pct } from '@/components/vaults/VaultBits';
import { eth, shortAddress, timeAgo, usd } from '@/lib/format';
import { explorerTx } from '@/shared/pons';
import { cn } from '@/lib/utils';

function useToken(): string | null { const auth = useSession(); const q = useQuery({ queryKey: ['objectpad', 'token', auth.authenticated], enabled: auth.authenticated, queryFn: () => auth.token() }); return q.data ?? null; }
function useMoney(): (e: number, d?: number) => string { const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null; return (e: number, d = 0) => ethUsd ? usd(e * ethUsd, e * ethUsd < 10 ? 2 : d) : eth(e, 4); }

/** The three products, side by side: the single most important thing to understand on this page. */
const PRODUCTS = [
  { id: 'index', icon: Calculator, name: 'Index', line: 'Tracks prices only.', body: 'A published, rules-based level (base 1000). Nothing is bought or held.', status: 'Live' },
  { id: 'basket', icon: ShoppingBasket, name: 'Object Basket', line: 'One transaction, coins to you.', body: 'A router buys every constituent in one atomic transaction. The coins land in your wallet.', status: 'Live' },
  { id: 'vault', icon: Landmark, name: 'Backed Vault', line: 'Contract-held, redeemable shares.', body: 'A contract holds the assets, mints shares, publishes NAV and redeems pro-rata.', status: 'Awaiting audit' },
] as const;

const EXPLAINERS = {
  calc: { title: 'How is this calculated?', icon: Calculator },
  buy: { title: 'What happens when I buy?', icon: ShoppingBasket },
  held: { title: 'Where are the assets held?', icon: Wallet },
} as const;
type ExplainerId = keyof typeof EXPLAINERS;

function Explainer({ id, onClose, vault }: { id: ExplainerId | null; onClose: () => void; vault?: Vault }) {
  return <Sheet open={id !== null} onOpenChange={v => { if (!v) onClose(); }} title={id ? EXPLAINERS[id].title : ''}>
    {id === 'calc' && <div className="space-y-3 text-[14.5px] font-semibold leading-6 text-ink/75">
      <p>Every index follows one published rulebook. A coin is only <b>eligible</b> if its proof is valid, its price source is fresh, it has at least 2 unique traders, it traded in the last 7 days, its 2% depth is at least 0.005 ETH and no single wallet holds over 5% of supply.</p>
      <div className="sunk rounded-2xl p-4 font-mono text-[12.5px] font-bold leading-6 text-ink">score = √free-float cap × √2%-depth × ln(1 + 7d volume)<br/>weight = min(score / Σscore, 25%)<br/>level(t) = L(r) × Σ wᵢ · Pᵢ(t) / Pᵢ(r)</div>
      <p>Rebalances are computed daily, <b>announced</b>, and take effect 24 hours later. Every rebalance and the rulebook itself are SHA-256 hashed so anyone can check nothing changed silently.</p>
      {vault && <p className="font-mono text-[11.5px] text-ink/55">methodology {vault.methodology.version} · {vault.methodology.hash.slice(0, 16)}…</p>}
      <Link to="/whitepaper#vault-calculation" className="btn press min-h-12 w-full" onClick={onClose}>Read the full math in the white paper</Link>
    </div>}
    {id === 'buy' && <div className="space-y-3 text-[14.5px] font-semibold leading-6 text-ink/75">
      <p><b>Today you buy an Object Basket.</b> Your ETH is split by the index weights and <b>one atomic transaction</b> buys each coin on its own Pons curve. Either every leg fills at or above its minimum, or the whole thing reverts.</p>
      <p>You receive the <b>underlying coins</b> directly, not vault shares. You can sell any of them individually at any time.</p>
      <p>Before you sign you see every leg’s quote, the aggregate price impact and your slippage ceiling. Quotes older than 30 seconds are re-quoted automatically. Stale or unavailable routes are rejected.</p>
      {vault && vault.creatorFee.bps > 0 && <p className="rounded-2xl bg-blue/10 p-3 text-blue">This vault’s creator earns {(vault.creatorFee.bps / 100).toFixed(2)}% of basket volume, paid in the same transaction and shown before you sign.</p>}
      <p className="text-[13px] text-ink/55">Backed vault shares (one token, redeemable for the underlying basket) arrive once the vault contracts pass audit.</p>
    </div>}
    {id === 'held' && <div className="space-y-3 text-[14.5px] font-semibold leading-6 text-ink/75">
      {[['Index', 'Nothing is held. It’s a number computed from on-chain prices.'], ['Object Basket', 'In your wallet. The router (Multicall3, 0xcA11…CA11) only forwards your ETH to each curve inside one transaction and never holds the coins.'], ['Backed Vault', 'In the vault contract, visible on-chain. Status: not deployed. Contracts must pass audit before launch.']].map(([a, b]) => <div key={a} className="sunk rounded-2xl p-3.5"><p className="text-[13px] font-extrabold uppercase tracking-wide text-ink">{a}</p><p className="mt-1">{b}</p></div>)}
      <p className="text-[13px] text-ink/55">Creating can be free. Ownership is transparent. Trading remains a market decision.</p>
    </div>}
  </Sheet>;
}

function ExplainerRow({ onOpen }: { onOpen: (id: ExplainerId) => void }) {
  return <div className="grid gap-2 sm:grid-cols-3">{(Object.keys(EXPLAINERS) as ExplainerId[]).map((k, i) => { const E = EXPLAINERS[k]; return <button key={k} type="button" onClick={() => onOpen(k)} className="raised lift press card-pop group flex min-h-16 items-center gap-3 rounded-[22px] px-4 text-left" style={{ ['--delay' as string]: `${i * 70}ms` }}><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-transform group-hover:rotate-[-8deg]"><E.icon size={17}/></span><span className="flex-1 text-[15px] font-extrabold">{E.title}</span><ArrowUpRight size={16} className="text-ink/40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"/></button>; })}</div>;
}

/** Animated flow: capture → proof → token → market → vault. */
const ThesisLoop = memo(function ThesisLoop() {
  const steps = ['Photograph', 'Prove unique', 'Launch coin', 'Creator market', 'Group into vault'];
  return <div className="vault-loop no-scrollbar flex items-center gap-1.5 overflow-x-auto py-1">{steps.map((s, i) => <div key={s} className="flex shrink-0 items-center gap-1.5"><span className="vault-loop-step rounded-full bg-white/80 px-3 py-1.5 font-mono text-[11.5px] font-extrabold uppercase tracking-wide text-ink ring-1 ring-ink/10" style={{ ['--i' as string]: i }}>{i + 1}. {s}</span>{i < steps.length - 1 && <span className="vault-loop-arrow text-ink/30" style={{ ['--i' as string]: i }}>→</span>}</div>)}</div>;
});

function VaultCard({ v, i }: { v: Vault; i: number }) {
  const money = useMoney();
  return <Link to={`/vaults/${v.slug}`} className="raised lift card-pop group relative block overflow-hidden rounded-[28px] p-5" style={{ ['--delay' as string]: `${Math.min(i, 8) * 55}ms` }}>
    <div className="vault-card-glow pointer-events-none absolute -right-16 -top-16 size-44 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: v.change24h >= 0 ? 'radial-gradient(circle, rgba(18,161,80,.18), transparent 70%)' : 'radial-gradient(circle, rgba(229,72,77,.16), transparent 70%)' }}/>
    <div className="flex flex-wrap items-center gap-1.5"><ProductTag vault={v}/><AffiliationBadge vault={v}/></div>
    <div className="mt-3 flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-[21px] font-extrabold leading-tight">{v.name}</h2><p className="mt-0.5 text-[12.5px] font-bold text-ink/50">by {v.system ? 'ObjectPad' : v.owner.handle ? `@${v.owner.handle}` : 'a creator'}{v.creatorFee.bps > 0 ? ` · creator earns ${(v.creatorFee.bps / 100).toFixed(2)}%` : ''}</p></div><Logos vault={v} size={30}/></div>
    <div className="mt-4 flex items-end justify-between gap-3"><div><p className="stat-label !text-[10.5px]">Index level</p><p className="display text-[38px] leading-none"><CountUp value={v.level}/></p></div><Change v={v.change7d}/></div>
    <IndexChart points={v.history} height={70} compact className="mt-2"/>
    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-ink/[0.07] pt-3 text-[12px]">
      <div><dt className="stat-label !text-[10px]">24h volume</dt><dd className="font-extrabold tnum">{money(v.volume24hEth, 2)}</dd></div>
      <div><dt className="stat-label !text-[10px]">Exec. liquidity</dt><dd className="font-extrabold tnum">{money(v.liquidityEth, 2)}</dd></div>
      <div><dt className="stat-label !text-[10px]">Health</dt><dd><HealthPill vault={v}/></dd></div>
    </dl>
  </Link>;
}

/** /vaults — "Buy a category, not a ticker." */
export default function Vaults() {
  const token = useToken(); const vaults = useVaults(token); const [tab, setTab] = useState<TabId>('trending'); const [open, setOpen] = useState<boolean>(false); const [concept, setConcept] = useState<{ name: string; kind: VaultKind } | null>(null); const [explain, setExplain] = useState<ExplainerId | null>(null);
  const items = useMemo(() => forTab(vaults.data?.items ?? [], tab), [vaults.data, tab]);
  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.id, forTab(vaults.data?.items ?? [], t.id).length])), [vaults.data]);
  return <div className="page py-6 sm:py-10">
    <section className="vault-hero relative overflow-hidden rounded-[36px] px-5 py-8 sm:px-10 sm:py-12">
      <div className="vault-hero-orbs pointer-events-none absolute inset-0" aria-hidden><span/><span/><span/></div>
      <div className="relative grid items-end gap-6 lg:grid-cols-[1fr_auto]">
        <div><p className="lab">Object Vaults · V2</p><h1 className="display mt-4 text-[46px] leading-[0.9] sm:text-[84px]"><span className="word-in inline-block">Buy a category,</span><br/><span className="word-in inline-block text-ink/45" style={{ animationDelay: '120ms' }}>not a ticker.</span></h1>
          <p className="mt-5 max-w-2xl text-[17px] font-bold text-ink/65">Photograph a thing. Launch its market. Group markets into a vault. Buy or sell the whole category in one transaction.</p>
          <div className="mt-5"><ThesisLoop/></div></div>
        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col"><button onClick={() => { setConcept(null); setOpen(true); }} className="btn press min-h-14 px-7 text-[16px]"><Plus size={18}/>Create a vault</button><a href="#earn" className="btn-ghost press flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[14px] font-extrabold"><Trophy size={16}/>Earn points & fees</a></div>
      </div>
    </section>

    <section className="mt-5 grid gap-3 md:grid-cols-3">{PRODUCTS.map((p, i) => <div key={p.id} className={cn('card-pop relative overflow-hidden rounded-[26px] p-5', p.id === 'vault' ? 'sunk' : 'raised')} style={{ ['--delay' as string]: `${i * 80}ms` }}>
      <div className="flex items-center justify-between"><span className={cn('flex size-11 items-center justify-center rounded-2xl', p.id === 'basket' ? 'bg-up text-white' : p.id === 'index' ? 'bg-ink text-white' : 'bg-ink/10 text-ink/60')}><p.icon size={19}/></span><span className={cn('rounded-full px-2.5 py-1 font-mono text-[10.5px] font-extrabold uppercase', p.status === 'Live' ? 'bg-up/12 text-up' : 'bg-ink/[0.07] text-ink/55')}>{p.status}</span></div>
      <p className="mt-4 text-[19px] font-extrabold">{i + 1}. {p.name}</p><p className="text-[14px] font-extrabold text-ink/70">{p.line}</p><p className="mt-1.5 text-[13px] font-semibold leading-5 text-ink/55">{p.body}</p>
    </div>)}</section>

    <section className="mt-3"><ExplainerRow onOpen={setExplain}/></section>

    <div className="sticky top-[64px] z-20 -mx-4 mt-8 px-4 py-2 backdrop-blur-xl sm:static sm:mx-0 sm:px-0 sm:backdrop-blur-none">
      <div role="tablist" aria-label="Vault categories" className="no-scrollbar flex gap-1.5 overflow-x-auto">{TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn('press flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-extrabold transition-colors', tab === t.id ? 'bg-ink text-white shadow-lg' : 'bg-white/70 text-ink/65 ring-1 ring-ink/10 hover:bg-white')}>{t.label}<span className={cn('rounded-full px-1.5 font-mono text-[11px]', tab === t.id ? 'bg-white/20' : 'bg-ink/[0.07]')}>{counts[t.id] ?? 0}</span></button>)}</div>
    </div>

    {vaults.isPending ? <Loading label="Computing indexes from on-chain trades…"/> : vaults.isError ? <ErrorState message="Vaults are unavailable right now." retry={() => void vaults.refetch()}/> :
      items.length ? <section key={tab} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((v, i) => <VaultCard key={v.id} v={v} i={i}/>)}</section>
        : <div className="raised mt-4 rounded-[28px] p-8 text-center"><p className="text-[18px] font-extrabold">Nothing here yet.</p><p className="mt-1 text-[14px] font-semibold text-ink/55">Be the first — pick a concept below and create it in under a minute.</p></div>}

    <section className="mt-12">
      <div className="flex items-end justify-between gap-4"><div><p className="lab">Start a vault</p><h2 className="display mt-3 text-[34px] sm:text-[48px]">Ideas that travel.</h2></div></div>
      <div className="no-scrollbar -mx-4 mt-5 flex snap-x gap-3 overflow-x-auto px-4 pb-2">{VAULT_CONCEPTS.map((c, i) => <button key={c.name} onClick={() => { setConcept({ name: c.name, kind: c.kind }); setOpen(true); }} className="raised lift press card-pop group flex w-[230px] shrink-0 snap-start flex-col rounded-[26px] p-5 text-left" style={{ ['--delay' as string]: `${i * 50}ms` }}>
        <span className="flex size-10 items-center justify-center rounded-2xl bg-ink/[0.06] transition-transform group-hover:scale-110">{c.kind === 'partner' ? <Crown size={18}/> : <Boxes size={18}/>}</span>
        <span className="mt-4 text-[17px] font-extrabold">{c.name}</span><span className="mt-1 flex-1 text-[13px] font-semibold leading-5 text-ink/55">{c.pitch}</span>
        <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-extrabold">Create <ArrowUpRight size={14}/></span>
      </button>)}</div>
    </section>

    <EarnSection token={token}/>

    <p className="mx-auto mt-10 max-w-2xl text-center text-[12.5px] font-semibold leading-5 text-ink/50">Creating can be free. Ownership is transparent. Trading remains a market decision. Object coins track their own markets — not legal ownership of any company, stock or physical object. Nothing here is investment advice.</p>
    <CreateVault open={open} onOpenChange={setOpen} token={token} concept={concept}/>
    <Explainer id={explain} onClose={() => setExplain(null)}/>
  </div>;
}

function EarnSection({ token }: { token: string | null }) {
  const board = useLeaderboard(); const auth = useSession(); const me = useMyVaultStats(token, auth.wallet ?? null); const money = useMoney();
  return <section id="earn" className="mt-14 scroll-mt-24">
    <p className="lab">Earn on vaults</p><h2 className="display mt-3 text-[34px] sm:text-[48px]">Creators earn fees. Traders earn points.</h2>
    <div className="mt-6 grid gap-3 lg:grid-cols-3">
      <div className="raised card-pop rounded-[26px] p-5"><span className="flex size-11 items-center justify-center rounded-2xl bg-blue text-white"><Crown size={19}/></span><p className="mt-4 text-[18px] font-extrabold">Vault creators</p><p className="mt-1 text-[13.5px] font-semibold leading-5 text-ink/60">Set a creator fee from 0% to 1%. It’s paid in ETH to your wallet on every basket buy (inside the same transaction) and settled at the end of every basket sell. Every payment is verified on-chain.</p></div>
      <div className="raised card-pop rounded-[26px] p-5" style={{ ['--delay' as string]: '80ms' }}><span className="flex size-11 items-center justify-center rounded-2xl bg-up text-white"><Zap size={19}/></span><p className="mt-4 text-[18px] font-extrabold">Traders</p><p className="mt-1 text-[13.5px] font-semibold leading-5 text-ink/60">Earn 1 point per 0.001 ETH of verified basket volume. Points power the weekly leaderboard. They’re an activity record, not a token, and carry no promised value.</p></div>
      <div className="steel card-pop rounded-[26px] p-5 text-white" style={{ ['--delay' as string]: '160ms' }}>
        <p className="font-mono text-[11px] font-extrabold uppercase tracking-widest text-white/60">Your standing</p>
        {!auth.authenticated ? <><p className="mt-3 text-[15px] font-bold text-white/80">Sign in to track your points and creator fees.</p><button onClick={() => auth.login()} className="press mt-4 min-h-12 w-full rounded-full bg-white text-[14px] font-extrabold text-ink">Sign in</button></> :
          <div className="mt-3 grid grid-cols-2 gap-3">{[['Points', (me.data?.points ?? 0).toLocaleString()], ['Basket volume', money(me.data?.volumeEth ?? 0, 2)], ['Creator fees', money(me.data?.creator.feesEth ?? 0, 2)], ['Your vaults', String(me.data?.creator.vaults ?? 0)]].map(([a, b]) => <div key={a}><p className="text-[11px] font-bold uppercase text-white/55">{a}</p><p className="text-[22px] font-extrabold tnum">{b}</p></div>)}</div>}
      </div>
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div className="raised rounded-[26px] p-5"><h3 className="flex items-center gap-2 text-[16px] font-extrabold"><Trophy size={16}/>Top traders · 7 days</h3>
        {board.data?.traders.length ? <ol className="mt-3 space-y-1.5">{board.data.traders.slice(0, 8).map((t, i) => <li key={t.wallet} className="flex items-center gap-3 rounded-xl bg-ink/[0.035] px-3 py-2 text-[13.5px]"><span className={cn('flex size-7 items-center justify-center rounded-full font-mono text-[12px] font-extrabold', i < 3 ? 'bg-ink text-white' : 'bg-ink/[0.07]')}>{i + 1}</span><span className="flex-1 font-mono font-bold">{shortAddress(t.wallet)}</span><span className="font-extrabold tnum">{t.points.toLocaleString()} pts</span></li>)}</ol> : <p className="mt-3 text-[13.5px] font-semibold text-ink/55">No basket trades verified yet this week. The first buyer takes #1.</p>}</div>
      <div className="raised rounded-[26px] p-5"><h3 className="flex items-center gap-2 text-[16px] font-extrabold"><Coins size={16}/>Top vault creators</h3>
        {board.data?.creators.length ? <ol className="mt-3 space-y-1.5">{board.data.creators.slice(0, 8).map((c, i) => <li key={c.slug}><Link to={`/vaults/${c.slug}`} className="flex items-center gap-3 rounded-xl bg-ink/[0.035] px-3 py-2 text-[13.5px] hover:bg-ink/[0.06]"><span className="flex size-7 items-center justify-center rounded-full bg-ink/[0.07] font-mono text-[12px] font-extrabold">{i + 1}</span><span className="min-w-0 flex-1 truncate font-extrabold">{c.vault}<span className="font-semibold text-ink/50">{c.handle ? ` · @${c.handle}` : ''}</span></span><span className="font-extrabold tnum">{money(c.feesEth, 2)}</span></Link></li>)}</ol> : <p className="mt-3 text-[13.5px] font-semibold text-ink/55">Create a vault with a creator fee and it appears here as soon as someone buys it.</p>}
        {board.data && <p className="mt-3 font-mono text-[11.5px] font-bold text-ink/45">All-time: {money(board.data.totals.volumeEth, 2)} volume · {money(board.data.totals.feesEth, 2)} creator fees · {board.data.totals.receipts} verified receipts</p>}</div>
    </div>
  </section>;
}

function CreateVault({ open, onOpenChange, token, concept }: { open: boolean; onOpenChange: (v: boolean) => void; token: string | null; concept: { name: string; kind: VaultKind } | null }) {
  const auth = useSession(); const universe = useUniverse(open); const nav = useNavigate(); const qc = useQueryClient();
  const [name, setName] = useState<string>(''); const [kind, setKind] = useState<VaultKind>('collection'); const [weighting, setWeighting] = useState<'score' | 'equal'>('score'); const [desc, setDesc] = useState<string>(''); const [picked, setPicked] = useState<string[]>([]); const [q, setQ] = useState<string>(''); const [feeBps, setFeeBps] = useState<number>(50);
  const [partnerName, setPartnerName] = useState<string>(''); const [partnerWallet, setPartnerWallet] = useState<string>(''); const [partnerSig, setPartnerSig] = useState<string>('');
  useEffect(() => { if (open && concept) { setName(concept.name); setKind(concept.kind); } }, [open, concept]);
  const list = useMemo(() => (universe.data?.items ?? []).filter(c => `${c.name} ${c.symbol}`.toLowerCase().includes(q.toLowerCase())).slice(0, 80), [universe.data, q]);
  const eligible = picked.filter(t => universe.data?.items.find(c => c.token === t)?.metrics.eligible).length;
  const signSelf = useMutation({ mutationFn: async () => { if (!auth.wallet) throw new Error('Connect the partner wallet first.'); const sig = await auth.sign(partnerMessage(name, partnerName, auth.wallet)); setPartnerWallet(auth.wallet); setPartnerSig(sig); } });
  const create = useMutation({ mutationFn: async () => api<Vault>('/vaults', { method: 'POST', token: token ?? await auth.token(), body: { name, kind, weighting, description: desc, tokens: picked, feeBps, ...(partnerName.trim() ? { partnerName, partnerWallet: partnerWallet || undefined, partnerSignature: partnerSig || undefined } : {}) } }), onSuccess: v => { void qc.invalidateQueries({ queryKey: ['objectpad', 'vaults'] }); onOpenChange(false); nav(`/vaults/${v.slug}`); } });
  return <Sheet open={open} onOpenChange={onOpenChange} title="Create an Object Vault">
    {!auth.authenticated ? <div className="space-y-3"><p className="text-[14px] font-semibold text-ink/60">Creating is free. Sign in so the vault and its creator fees are tied to you.</p><button className="btn press min-h-12 w-full" onClick={() => auth.login()}>Sign in to create</button></div> : <div className="space-y-4">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Vault name, e.g. Desk Setup" maxLength={40} className="w-full"/>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{VAULT_KINDS.map(k => <button key={k.id} type="button" onClick={() => setKind(k.id)} className={cn('press rounded-2xl p-3 text-left', kind === k.id ? 'bg-ink text-white' : 'bg-ink/[0.06]')}><p className="text-[13.5px] font-extrabold">{k.label}</p><p className={cn('text-[11px] font-semibold leading-4', kind === k.id ? 'text-white/70' : 'text-ink/55')}>{k.note}</p></button>)}</div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-ink/[0.06] p-1">{(['score', 'equal'] as const).map(w => <button key={w} type="button" onClick={() => setWeighting(w)} className={cn('min-h-10 rounded-xl text-[13px] font-extrabold', weighting === w ? 'bg-white shadow' : 'text-ink/60')}>{w === 'score' ? 'Capped score (recommended)' : 'Equal weight'}</button>)}</div>
      <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} maxLength={240} placeholder="What ties these objects together? (optional)" className="w-full"/>

      <div className="sunk rounded-2xl p-4"><div className="flex items-center justify-between"><p className="text-[14px] font-extrabold">Your creator fee</p><p className="font-mono text-[18px] font-extrabold tnum">{(feeBps / 100).toFixed(2)}%</p></div>
        <input type="range" min={0} max={100} step={5} value={feeBps} onChange={e => setFeeBps(Number(e.target.value))} className="vault-range mt-2 w-full" aria-label="Creator fee"/>
        <p className="mt-1 text-[12px] font-semibold text-ink/55">Paid in ETH to your wallet on every basket buy and sell of this vault. Buyers see it before signing. Max 1%.</p></div>

      {kind === 'partner' && <div className="rounded-2xl border-2 border-dashed border-blue/30 p-4">
        <p className="text-[14px] font-extrabold">Partner verification</p><p className="mt-1 text-[12px] font-semibold leading-5 text-ink/60">Only a signature from the project’s official wallet earns the “Official partner vault” label. Without one, it shows as <b>Unaffiliated</b>. A ticker or logo alone never implies a relationship.</p>
        <input value={partnerName} onChange={e => { setPartnerName(e.target.value); setPartnerSig(''); }} placeholder="Partner project, e.g. $PEPE" maxLength={40} className="mt-3 w-full"/>
        {partnerName.trim() && <><div className="mt-2 flex gap-2"><button type="button" disabled={signSelf.isPending || name.trim().length < 3} onClick={() => signSelf.mutate()} className="btn-ghost press min-h-11 flex-1 rounded-full text-[13px] font-extrabold disabled:opacity-40">{signSelf.isPending ? 'Signing…' : 'I’m the official wallet — sign'}</button></div>
          <details className="mt-2 text-[12px] font-semibold text-ink/60"><summary className="cursor-pointer font-extrabold">Partner signs elsewhere</summary><pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-2 font-mono text-[11px]">{partnerMessage(name || '<vault name>', partnerName, partnerWallet || '<partner wallet>')}</pre><input value={partnerWallet} onChange={e => setPartnerWallet(e.target.value.trim())} placeholder="Partner wallet 0x…" className="mt-2 w-full"/><input value={partnerSig} onChange={e => setPartnerSig(e.target.value.trim())} placeholder="Signature 0x…" className="mt-2 w-full"/></details>
          {partnerSig && <p className="mt-2 flex items-center gap-1 text-[12px] font-extrabold text-up"><Check size={14}/>Signature attached · verified on submit</p>}</>}
      </div>}

      <div><div className="flex items-center justify-between"><p className="text-[14px] font-extrabold">Pick 2–12 coins</p><p className="font-mono text-[12px] font-bold text-ink/55">{picked.length} picked · {eligible} eligible</p></div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search coins" className="mt-2 w-full"/>
        <div className="mt-2 max-h-64 space-y-1 overflow-auto pr-1">{universe.isPending ? <Loading label="Scoring every coin…"/> : list.map(c => { const on = picked.includes(c.token); return <button key={c.token} type="button" onClick={() => setPicked(p => on ? p.filter(t => t !== c.token) : p.length >= 12 ? p : [...p, c.token])} className={cn('press flex w-full items-center gap-3 rounded-2xl p-2 text-left', on ? 'bg-up/12' : 'hover:bg-ink/[0.05]')}><img src={c.logo} alt="" className="size-9 rounded-full bg-white object-cover"/><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-extrabold">{c.name}</span><span className="font-mono text-[11px] text-ink/55">${c.symbol} · {c.quoteAsset}</span></span><span className={cn('rounded-full px-2 py-0.5 font-mono text-[10.5px] font-extrabold', c.metrics.eligible ? 'bg-up/12 text-up' : 'bg-ink/[0.06] text-ink/50')} title={c.metrics.reason ?? 'Eligible'}>{c.metrics.eligible ? 'eligible' : c.metrics.reason}</span>{on && <Check size={16} className="text-up"/>}</button>; })}</div>
        {picked.length >= 2 && eligible < 2 && <p className="mt-2 text-[12px] font-bold text-amber-700">Fewer than 2 eligible coins: your vault will track as an index but won’t be buyable as a basket until more coins qualify.</p>}</div>

      <button disabled={picked.length < 2 || name.trim().length < 3 || create.isPending} onClick={() => create.mutate()} className="btn press min-h-14 w-full disabled:opacity-40">{create.isPending ? <Loader2 className="animate-spin" size={16}/> : <Layers size={16}/>}Create vault · {picked.length} coins · {(feeBps / 100).toFixed(2)}% fee</button>
      {create.isError && <p role="alert" className="text-sm font-bold text-down">{create.error.message}</p>}
    </div>}
  </Sheet>;
}

/** /vaults/:slug — top 5, drawers for everything else, sticky buy on phones. */
export function VaultDetail() {
  const { slug = '' } = useParams(); const token = useToken(); const vault = useVault(slug, token); const money = useMoney(); const [explain, setExplain] = useState<ExplainerId | null>(null); const [sheet, setSheet] = useState<boolean>(false);
  if (vault.isPending) return <Loading label="Rebuilding the index from chain trades…"/>;
  if (vault.isError) return <div className="page max-w-2xl py-16"><ErrorState message="This vault doesn’t exist or has no live coins." retry={() => void vault.refetch()}/></div>;
  const v = vault.data; const top = v.constituents.slice(0, 5); const buyable = v.execution === 'basket';
  return <div className="page pb-32 pt-5 sm:py-8">
    <Link to="/vaults" className="font-mono text-[12px] font-extrabold text-ink/60">← All vaults</Link>
    <div className="mt-3 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
      <section className="raised rounded-[30px] p-5 sm:p-7">
        <div className="flex flex-wrap gap-1.5"><ProductTag vault={v}/><AffiliationBadge vault={v}/><HealthPill vault={v}/></div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="display text-[34px] leading-[0.95] sm:text-[52px]">{v.name}</h1><p className="mt-1 text-[13px] font-bold text-ink/50">by {v.system ? 'ObjectPad' : v.owner.handle ? `@${v.owner.handle}` : 'a creator'} · {v.weighting === 'score' ? 'capped score weighting' : 'equal weight'}{v.creatorFee.bps > 0 ? ` · creator fee ${(v.creatorFee.bps / 100).toFixed(2)}%` : ' · no creator fee'}</p>{v.description && <p className="mt-2 max-w-xl text-[15px] font-semibold text-ink/65">{v.description}</p>}</div><Logos vault={v} size={38}/></div>
        <div className="mt-6 flex flex-wrap items-end gap-4"><p className="display text-[56px] leading-none sm:text-[72px]"><CountUp value={v.level}/></p><div className="mb-2 flex gap-2"><Change v={v.change24h} big/><span className="rounded-full bg-ink/[0.06] px-3 py-1 font-mono text-[13px] font-extrabold">7d {pct(v.change7d)}</span></div></div>
        <IndexChart points={v.history} height={280} className="mt-4"/>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['24h volume', money(v.volume24hEth, 2)], ['Exec. liquidity (2%)', money(v.liquidityEth, 2)], ['Free-float cap', money(v.freeFloatEth, 2)], ['Basket volume', money(v.basketVolumeEth, 2)]].map(([a, b]) => <div key={a} className="rounded-2xl bg-ink/[0.04] px-3.5 py-3"><dt className="stat-label !text-[10.5px]">{a}</dt><dd className="mt-1 text-lg font-extrabold tnum">{b}</dd></div>)}</dl>
        <p className="mt-3 font-mono text-[11px] font-bold text-ink/45">Calculated {new Date(v.calculatedAt).toLocaleTimeString()} · methodology {v.methodology.hash.slice(0, 12)}… · rebalance {v.rebalance.current.hash.slice(0, 12)}…</p>
      </section>
      <aside className="hidden space-y-4 lg:block"><div className="raised sticky top-24 rounded-[30px] p-5 sm:p-6"><h2 className="mb-4 flex items-center gap-2 text-[18px] font-extrabold"><ShoppingBasket size={18}/>Buy the basket</h2><BasketPanel vault={v} token={token}/></div></aside>
    </div>

    <section className="mt-4"><ExplainerRow onOpen={setExplain}/></section>

    {v.stock && <div className="mt-4 rounded-[22px] border-2 border-blue/20 bg-blue/[0.06] p-4 text-[13.5px] font-semibold leading-5 text-ink/75"><b>Stock-paired disclosure.</b> {v.stock.note} {v.stock.halted && <b className="text-down">Calculation halted: a stock-token price source is stale.</b>}</div>}

    <section className="glass mt-4 rounded-[28px] p-3 sm:p-4">
      <div className="flex items-center justify-between px-2 py-1"><h2 className="flex items-center gap-2 text-lg font-extrabold"><Boxes size={18}/>Top constituents</h2><span className="font-mono text-[12px] font-bold text-ink/55">{v.constituents.length} coins · cap {Math.round(v.methodology.cap * 100)}%</span></div>
      <div className="mt-2 grid gap-2 sm:grid-cols-5">{top.map((c, i) => <Link key={c.token} to={c.path} className="raised lift card-pop rounded-[20px] p-3" style={{ ['--delay' as string]: `${i * 60}ms` }}>
        <div className="flex items-center gap-2.5 sm:flex-col sm:items-start"><img src={c.logo} alt="" className="size-11 rounded-full bg-white object-cover"/><div className="min-w-0 flex-1"><p className="truncate text-[14px] font-extrabold">{c.name}</p><p className="font-mono text-[11px] text-ink/50">${c.symbol}{c.quoteAsset !== 'ETH' ? ` · ${c.quoteAsset}` : ''}</p></div><p className="font-mono text-[16px] font-extrabold tnum sm:hidden">{(c.weight * 100).toFixed(1)}%</p></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.07]"><span className="bar-grow block h-full origin-left rounded-full bg-ink" style={{ width: `${Math.max(3, c.weight * 100 / v.methodology.cap)}%`, animationDelay: `${200 + i * 80}ms` }}/></div>
        <div className="mt-2 flex items-center justify-between"><span className="hidden font-mono text-[13px] font-extrabold tnum sm:inline">{(c.weight * 100).toFixed(1)}%</span><Change v={c.change24h}/></div>
      </Link>)}</div>
    </section>

    <div className="mt-4 space-y-3">
      <Drawer title="All constituents & eligibility" meta={`${v.constituents.length + v.excluded.length} coins`}>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[13px]"><thead className="stat-label"><tr><th className="py-2 font-normal">Coin</th><th className="font-normal">Weight</th><th className="font-normal">Target</th><th className="font-normal">Free float</th><th className="font-normal">2% depth</th><th className="font-normal">7d vol</th><th className="font-normal">Traders</th><th className="text-right font-normal">Proof</th></tr></thead>
          <tbody>{v.constituents.map(c => <tr key={c.token} className="border-t border-ink/[0.06]"><td className="py-2"><Link to={c.path} className="flex items-center gap-2"><img src={c.logo} alt="" className="size-7 rounded-full"/><span className="font-extrabold">${c.symbol}</span></Link></td><td className="font-mono font-bold">{(c.weight * 100).toFixed(1)}%</td><td className="font-mono text-ink/55">{(c.targetWeight * 100).toFixed(1)}%</td><td className="tnum">{money(c.metrics.freeFloatEth, 2)}</td><td className="tnum">{money(c.metrics.depthEth, 3)}<span className="ml-1 text-[10px] text-ink/40">{c.metrics.depthSource}</span></td><td className="tnum">{money(c.metrics.volume7dEth, 2)}</td><td>{c.metrics.traders}</td><td className="text-right">{c.objectId ? <Link to={`/verify/${c.objectId}`} className="chip"><ShieldCheck size={12}/>Verify</Link> : <span className="chip">Original</span>}</td></tr>)}
            {v.excluded.map(c => <tr key={c.token} className="border-t border-ink/[0.06] text-ink/45"><td className="py-2"><span className="flex items-center gap-2"><img src={c.logo} alt="" className="size-7 rounded-full grayscale"/>${c.symbol}</span></td><td colSpan={7}>Excluded · {c.reason}</td></tr>)}</tbody></table></div>
      </Drawer>
      <Drawer title="Contracts & custody" meta={v.backed.status === 'deployed' ? 'vault live' : 'basket router'}>
        <ul className="space-y-2 text-[13px] font-semibold">{[['Basket router', 'Multicall3 · 0xcA11bde05977b3631167028862bE2a173976CA11', 'https://robinhoodchain.blockscout.com/address/0xcA11bde05977b3631167028862bE2a173976CA11'], ['Backed vault factory', v.backed.factory ?? 'Not deployed — awaiting audit', v.backed.factory ? `https://robinhoodchain.blockscout.com/address/${v.backed.factory}` : null], ...(v.creatorFee.wallet ? [['Creator fee wallet', v.creatorFee.wallet, `https://robinhoodchain.blockscout.com/address/${v.creatorFee.wallet}`]] : []), ...v.constituents.map(c => [`$${c.symbol} curve`, c.curve, `https://robinhoodchain.blockscout.com/address/${c.curve}`])].map(([a, b, href]) => <li key={`${a}${b}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink/[0.04] px-3 py-2"><span className="font-extrabold">{a}</span>{href ? <a href={href} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] underline decoration-ink/20">{shortAddress(b as string, 10, 6)}</a> : <span className="font-mono text-[11.5px] text-ink/50">{b}</span>}</li>)}</ul>
      </Drawer>
      <Drawer title="Methodology" meta={v.methodology.version}>
        <div className="space-y-2 text-[13.5px] font-semibold leading-6 text-ink/70"><p className="sunk rounded-xl p-3 font-mono text-[12px] text-ink">score = √free-float × √depth₂% × ln(1+vol₇d)<br/>w = min(score/Σ, {Math.round(v.methodology.cap * 100)}%) · redistributed<br/>L(t) = L(r) · Σ wᵢ Pᵢ(t)/Pᵢ(r)</p><p>Eligibility: valid proof · fresh price source · ≥2 unique traders · traded in 7 days · 2% depth ≥ 0.005 ETH · no wallet over 5% of supply.</p><p className="break-all font-mono text-[11px] text-ink/50">methodology sha256 {v.methodology.hash}</p><Link to="/whitepaper#vault-calculation" className="inline-flex items-center gap-1 font-extrabold text-ink underline">Full derivation in the white paper <ArrowUpRight size={13}/></Link></div>
      </Drawer>
      <Drawer title="Rebalance history" meta={v.rebalance.pending ? 'change announced' : `${v.rebalance.history.length} snapshots`}>
        {v.rebalance.pending && <div className="mb-3 rounded-2xl bg-blue/10 p-3 text-[13px] font-semibold text-ink/75"><b>Announced:</b> new weights take effect {new Date(v.rebalance.pending.effectiveAt).toLocaleString()} — {v.rebalance.pending.weights.map(w => `$${w.symbol} ${(w.weight * 100).toFixed(1)}%`).join(' · ')}</div>}
        <ol className="space-y-2">{v.rebalance.history.map(r => <li key={r.at} className="rounded-xl bg-ink/[0.04] px-3 py-2 text-[12.5px]"><div className="flex justify-between font-extrabold"><span>{new Date(r.at).toLocaleString()}</span><span className="tnum">L = {r.level.toFixed(2)}</span></div><p className="mt-0.5 font-semibold text-ink/60">{r.weights.map(w => `$${w.symbol} ${(w.weight * 100).toFixed(1)}%`).join(' · ')}</p><p className="font-mono text-[10.5px] text-ink/40">{r.hash}</p></li>)}</ol>
        <p className="mt-2 text-[11.5px] font-semibold text-ink/45">Index and basket rebalances are content-hashed snapshots. On-chain rebalance transactions apply to backed vaults once deployed.</p>
      </Drawer>
      {Boolean(v.receipts?.length) && <Drawer title="Verified basket trades" meta={`${v.receipts?.length ?? 0} recent`}>
        <ul className="space-y-1.5">{v.receipts?.map(r => <li key={r.hash} className="flex items-center gap-3 rounded-xl bg-ink/[0.04] px-3 py-2 text-[12.5px]"><span className={cn('rounded-full px-2 py-0.5 font-mono text-[10.5px] font-extrabold uppercase', r.side === 'buy' ? 'bg-up/12 text-up' : 'bg-down/10 text-down')}>{r.side}</span><span className="font-mono">{shortAddress(r.trader)}</span><span className="flex-1 text-right font-extrabold tnum">{money(r.volumeEth, 2)}</span><span className="text-ink/45">{timeAgo(r.at)}</span><a href={explorerTx(r.hash)} target="_blank" rel="noreferrer"><ArrowUpRight size={14}/></a></li>)}</ul>
      </Drawer>}
    </div>

    <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 px-4 pb-3 lg:hidden">
      <button onClick={() => setSheet(true)} disabled={!buyable} className="vault-sticky press flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-up text-[16px] font-extrabold text-white shadow-[0_20px_40px_-16px_rgba(18,161,80,.7)] disabled:bg-ink/40 disabled:shadow-none"><ShoppingBasket size={18}/>{buyable ? `Buy basket · ${v.constituents.length} coins` : v.execution === 'halted' ? 'Halted — sources stale' : 'Track only'}</button>
    </div>
    <Sheet open={sheet} onOpenChange={setSheet} title={`Buy ${v.name}`}><BasketPanel vault={v} token={token}/></Sheet>
    <Explainer id={explain} onClose={() => setExplain(null)} vault={v}/>
  </div>;
}

const CEILINGS = [100, 300, 500] as const;
function BasketPanel({ vault, token }: { vault: Vault; token: string | null }) {
  const auth = useSession(); const pairs = usePairs(); const qc = useQueryClient(); const money = useMoney();
  const [side, setSide] = useState<'buy' | 'sell'>('buy'); const [amount, setAmount] = useState<string>('0.01'); const [percent, setPercent] = useState<number>(100); const [ceiling, setCeiling] = useState<number>(300); const [phase, setPhase] = useState<string>(''); const [receipt, setReceipt] = useState<{ tx: CombinedReceipt; credited: BasketReceipt | null } | null>(null);
  const wei = useMemo(() => { try { const w = parseEther(amount || '0'); return w > 0n ? w : 0n; } catch { return 0n; } }, [amount]);
  const quote = useQuery<BasketQuote>({ queryKey: ['objectpad', 'basket-quote', vault.slug, wei.toString(), ceiling], enabled: side === 'buy' && wei > 0n && vault.execution === 'basket', queryFn: () => quoteBasket(vault, wei, ceiling), refetchInterval: 15_000, retry: 0 });
  const run = useMutation({ mutationFn: async () => {
    if (!auth.wallet) throw new Error('Connect a wallet first.'); setReceipt(null);
    const send = (tx: { to: Address; data: Hex; value: bigint; gas: bigint }) => auth.send(tx);
    const tx = side === 'buy' ? await executeBasketBuy({ wallet: auth.wallet, vault, quote: quote.data ?? await quoteBasket(vault, wei, ceiling), send, pairs: pairs.data?.assets ?? [], router: pairs.data?.router.swapRouter, quoter: pairs.data?.router.quoter, ceilingBps: ceiling, onPhase: setPhase }) : await executeBasketSell({ wallet: auth.wallet, vault, percent, ceilingBps: ceiling, send, onPhase: setPhase });
    setPhase('Verifying receipt on-chain…'); const credited = await recordReceipt(vault.slug, tx, token ?? await auth.token()); setReceipt({ tx, credited }); return tx;
  }, onSettled: () => { setPhase(''); void qc.invalidateQueries({ queryKey: ['objectpad', 'vault'] }); void qc.invalidateQueries({ queryKey: ['objectpad', 'vault-me'] }); void qc.invalidateQueries({ queryKey: ['objectpad', 'vault-leaderboard'] }); } });
  if (vault.execution !== 'basket') return <div className="rounded-2xl bg-ink/[0.05] p-4 text-[14px] font-semibold leading-6 text-ink/70">{vault.executionNote}</div>;
  const q = quote.data; const legs = q?.legs ?? [];
  return <div>
    <SideSwitch side={side} onChange={s => { setSide(s); setReceipt(null); }}/>
    {side === 'buy' ? <div className="mt-4 rounded-[18px] border-2 border-ink/10 bg-white p-4"><p className="text-[13px] font-extrabold text-ink/70">You pay</p><div className="mt-1 flex items-center gap-2"><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-label="ETH amount" className="min-w-0 flex-1 !border-0 !bg-transparent !p-0 text-[28px] font-extrabold !shadow-none"/><span className="rounded-full bg-ink px-3 py-1.5 text-[14px] font-extrabold text-white">ETH</span></div><div className="mt-2 flex gap-1.5">{['0.005', '0.01', '0.05', '0.1'].map(a => <button key={a} onClick={() => setAmount(a)} className={cn('press min-h-9 flex-1 rounded-xl text-[12.5px] font-extrabold', amount === a ? 'bg-ink text-white' : 'bg-ink/[0.06]')}>{a}</button>)}</div></div>
      : <div className="mt-4 grid grid-cols-4 gap-1.5">{[25, 50, 75, 100].map(p => <button key={p} onClick={() => setPercent(p)} className={cn('press min-h-12 rounded-xl text-[14px] font-extrabold', percent === p ? 'bg-ink text-white' : 'bg-ink/[0.07]')}>{p === 100 ? 'All' : `${p}%`}</button>)}</div>}
    <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[12.5px] font-extrabold text-ink/60">Slippage ceiling</span><div className="flex gap-1">{CEILINGS.map(c => <button key={c} onClick={() => setCeiling(c)} className={cn('press min-h-9 rounded-lg px-3 font-mono text-[12px] font-extrabold', ceiling === c ? 'bg-ink text-white' : 'bg-ink/[0.06]')}>{c / 100}%</button>)}</div></div>

    {side === 'buy' && <div className="mt-3 rounded-2xl bg-ink/[0.035] p-3">
      <div className="space-y-1">{(legs.length ? legs : vault.constituents.map(c => ({ token: c.token, symbol: c.symbol, logo: c.logo, weight: c.weight, impact: 0, route: 'atomic' as const, note: undefined }))).map(l => <div key={l.token} className="flex items-center gap-2 text-[12.5px]"><img src={l.logo} alt="" className="size-5 rounded-full"/><span className="flex-1 font-extrabold">${l.symbol}</span><span className="font-mono text-ink/55">{(l.weight * 100).toFixed(1)}%</span><span className={cn('w-16 text-right font-mono font-bold', l.route !== 'atomic' ? 'text-ink/40' : l.impact > ceiling / 10_000 ? 'text-down' : 'text-ink/70')}>{l.route === 'atomic' ? (quote.isFetching && !legs.length ? '…' : `${(l.impact * 100).toFixed(2)}%`) : l.route}</span></div>)}</div>
      <div className="mt-2 space-y-1 border-t border-ink/[0.08] pt-2 text-[12.5px] font-bold">
        <div className="flex justify-between"><span className="text-ink/60">Aggregate price impact</span><span className={cn('font-mono', q && !q.ok ? 'text-down' : 'text-ink')}>{q ? `${(q.impact * 100).toFixed(2)}%` : quote.isFetching ? 'quoting…' : '—'}</span></div>
        {vault.creatorFee.bps > 0 && <div className="flex justify-between"><span className="text-ink/60">Creator fee ({(vault.creatorFee.bps / 100).toFixed(2)}%)</span><span className="font-mono">{q ? money(Number(q.feeWei) / 1e18, 4) : '—'}</span></div>}
        <div className="flex justify-between"><span className="text-ink/60">Points earned</span><span className="font-mono text-up">+{Math.floor(Number(wei) / 1e15).toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-ink/60">Wallet confirmations</span><span className="font-mono">1{legs.some(l => l.route === 'paired') ? ` + ${legs.filter(l => l.route === 'paired').length} paired` : ''}</span></div>
      </div>
      {q?.problem && <p className="mt-2 text-[12px] font-bold text-down">{q.problem}</p>}
      {quote.isError && <p className="mt-2 text-[12px] font-bold text-down">{quote.error.message}</p>}
    </div>}

    {!auth.authenticated ? <button className="btn press mt-4 min-h-14 w-full" onClick={() => auth.login()}>Connect to buy the basket</button>
      : <button disabled={run.isPending || (side === 'buy' && (!q?.ok || quote.isFetching && !q))} onClick={() => run.mutate()} className={cn('press mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] text-[16px] font-extrabold text-white disabled:opacity-50', side === 'buy' ? 'bg-up' : 'bg-down')}>{run.isPending ? <><Loader2 size={16} className="animate-spin"/>{phase || 'Working…'}</> : side === 'buy' ? <>Buy basket · 1 transaction</> : `Sell ${percent}% of every coin`}</button>}
    {run.isError && <p role="alert" className="mt-2 text-[13px] font-bold text-down">{run.error.message.split('\n')[0]}</p>}
    {receipt && <ReceiptCard r={receipt.tx} credited={receipt.credited}/>}
    <p className="mt-3 text-[11.5px] font-semibold leading-5 text-ink/50">{side === 'buy' ? 'One atomic transaction: every leg fills at or above its minimum or nothing happens. Coins go straight to your wallet. ObjectPad never holds them.' : 'Pons curves sell from your own wallet, so each coin is its own transaction (plus a one-time approval per coin).'}</p>
  </div>;
}

function ReceiptCard({ r, credited }: { r: CombinedReceipt; credited: BasketReceipt | null }) {
  const money = useMoney();
  return <div className="vault-receipt mt-4 overflow-hidden rounded-[20px] border border-ink/10 bg-white">
    <div className="flex items-center justify-between bg-ink px-4 py-3 text-white"><span className="flex items-center gap-2 text-[14px] font-extrabold"><Receipt size={16}/>Combined receipt</span><a href={explorerTx(r.hash)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-[11.5px] underline">{shortAddress(r.hash, 8, 6)}<ArrowUpRight size={12}/></a></div>
    <div className="space-y-1 p-4 text-[12.5px]">{r.legs.map(l => <div key={l.symbol} className="flex items-center gap-2"><Check size={13} className="text-up"/><img src={l.logo} alt="" className="size-5 rounded-full"/><span className="flex-1 font-extrabold">${l.symbol}</span><span className="font-mono">{r.side === 'buy' ? `${l.tokensOut.toLocaleString(undefined, { maximumFractionDigits: 0 })} for ${eth(l.ethIn, 5)}` : `${eth(l.ethIn, 5)} out`}</span></div>)}
      <div className="mt-2 space-y-0.5 border-t border-dashed border-ink/15 pt-2 font-bold"><div className="flex justify-between"><span className="text-ink/55">Total {r.side === 'buy' ? 'in' : 'out'}</span><span className="font-mono">{eth(r.totalEth, 5)} · {money(r.totalEth, 2)}</span></div>{r.vaultFeeEth > 0 && <div className="flex justify-between"><span className="text-ink/55">Creator fee</span><span className="font-mono">{eth(r.vaultFeeEth, 6)}</span></div>}<div className="flex justify-between"><span className="text-ink/55">Gas</span><span className="font-mono">{eth(r.gasEth, 6)}</span></div><div className="flex justify-between"><span className="text-ink/55">Block</span><span className="font-mono">{r.block.toString()}</span></div></div>
      {credited ? <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-up/10 px-3 py-2 font-extrabold text-up"><Sparkles size={14}/>Verified on-chain · +{credited.points.toLocaleString()} points</p> : <p className="mt-2 rounded-xl bg-ink/[0.05] px-3 py-2 font-semibold text-ink/55">Trade settled. Points are credited once the receipt is verified.</p>}
    </div>
  </div>;
}
