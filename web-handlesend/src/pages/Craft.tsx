import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { encodeFunctionData, formatUnits, type Address } from 'viem';
import { ArrowUpRight, Flame, Hammer, Lock, Minus, Plus, Sparkles, TrendingUp, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, Loading } from '@/components/Feedback';
import { LockedFeature } from '@/components/LockedFeature';
import { useSession } from '@/lib/session';
import { useArchive, useHoldings } from '@/lib/objects';
import { compact, ECONOMY, ensureAllowance, formatTokens, parseAmount, prepareTx, waitForReceipt } from '@/lib/chain';
import { usePreferences } from '@/hooks/use-preferences';
import { cn } from '@/lib/utils';
import { CRAFT, craftMultiplierBps, FORGE_ABI, rarityOf, type Rarity } from '@/shared/economy';
import type { ObjectRecord } from '@/shared/domain';

export const RARITY_STYLE: Record<Rarity, string> = { Common: 'text-muted border-ink/20', Uncommon: 'text-moss border-moss/40', Rare: 'text-sky-700 border-sky-700/40', Epic: 'text-violet-700 border-violet-700/40', Mythic: 'text-clay border-clay/50' };
interface Slot { record: ObjectRecord; amount: string; }

function ArtifactPreview({ slots, multiplier }: { slots: Slot[]; multiplier: number | null }) {
  const rarity = multiplier ? rarityOf(multiplier) : null;
  return <div className="relative overflow-hidden rounded-[28px] bg-white p-6">
    <div className="forge-glow pointer-events-none absolute inset-0" aria-hidden="true"/>
    <div className="relative flex items-center justify-between"><span className={cn('eyebrow', rarity ? 'text-ember' : 'text-paper/50')}>{rarity ? `Artifact · ${rarity}` : 'Artifact preview'}</span><span className="font-mono text-sm tnum">{multiplier ? `${(multiplier / 10_000).toFixed(2)}×` : '—'}</span></div>
    <div className="relative mt-6 flex h-28 items-center justify-center">{slots.length ? slots.map((slot, i) => <img key={slot.record.objectId} src={slot.record.model.thumbnailUrl} alt="" className="size-20 rounded-full border-4 border-ink object-cover shadow-xl" style={{ transform: `translateX(${(i - (slots.length - 1) / 2) * -14}px) rotate(${(i - 1) * 6}deg)`, zIndex: 3 - i }}/>) : <div className="flex size-20 items-center justify-center rounded-full border border-dashed border-white/25"><Hammer className="text-paper/40"/></div>}</div>
    <p className="relative mt-5 text-center text-lg font-bold tracking-tight">{slots.length ? slots.map(s => `$${s.record.symbol}`).join(' + ') : 'Add 2–3 object coins'}</p>
    <p className="relative mt-1 text-center font-mono text-[11.5px] uppercase text-paper/50">Transferable ERC-721 · earns ETH from every coin inside</p>
  </div>;
}

/** The Crafting Table stays locked while the Forge contract is in production. */
export default function Craft() {
  return <LockedFeature eyebrow="The Crafting Table" title="Mix real objects into rarer rewards." lines={['Pick two or three object coins you hold.', 'Lock them into one Artifact.', 'It earns from every coin inside.', 'Longer locks and burns make it rarer.']}/>;
}

/** Full crafting flow, enabled once the Forge contract is deployed and audited. */
export function CraftingTable() {
  const auth = useSession(); const qc = useQueryClient(); const navigate = useNavigate(); const { play } = usePreferences(); const [params] = useSearchParams();
  const archive = useArchive({ sort: 'newest' }); const records = useMemo(() => archive.data?.items.map(i => i.record), [archive.data]);
  const holdings = useHoldings(auth.wallet, records);
  const [slots, setSlots] = useState<Slot[]>(() => []); const [lockTier, setLockTier] = useState<number>(0); const [burnTier, setBurnTier] = useState<number>(0); const [stage, setStage] = useState<string>('');
  const preselect = params.get('add')?.toLowerCase();
  const available = useMemo(() => (archive.data?.items ?? []).map(item => ({ record: item.record, balance: holdings.data?.find(h => h.record.objectId === item.record.objectId)?.balance ?? null })).sort((a, b) => Number((b.balance ?? 0n) > (a.balance ?? 0n)) - Number((b.balance ?? 0n) < (a.balance ?? 0n))), [archive.data, holdings.data]);
  const multiplier = slots.length >= CRAFT.minIngredients ? craftMultiplierBps(slots.length, lockTier, burnTier) : null;
  const parsed = slots.map(slot => parseAmount(slot.amount));
  const problems = slots.map((slot, i) => { const units = parsed[i]; const balance = holdings.data?.find(h => h.record.objectId === slot.record.objectId)?.balance; if (!units) return 'Enter an amount'; if (units < CRAFT.minIngredientAmount) return `Minimum ${compact(Number(formatUnits(CRAFT.minIngredientAmount, 18)))}`; if (balance !== undefined && units > balance) return 'Exceeds balance'; return null; });
  const toggle = (record: ObjectRecord) => setSlots(current => current.some(s => s.record.objectId === record.objectId) ? current.filter(s => s.record.objectId !== record.objectId) : current.length >= CRAFT.maxIngredients ? current : [...current, { record, amount: formatUnits(CRAFT.minIngredientAmount, 18) }]);
  const craft = useMutation({ mutationFn: async () => {
    if (!auth.wallet || !ECONOMY.forge) throw new Error('The Crafting Table is not deployed yet.');
    const tokens = slots.map(s => s.record.tokenAddress as Address); const amounts = parsed.map(p => p!);
    for (let i = 0; i < tokens.length; i++) { setStage(`Approving $${slots[i].record.symbol} (${i + 1}/${tokens.length})`); await ensureAllowance(auth.wallet, tokens[i], ECONOMY.forge, amounts[i], auth.send); }
    const burn = CRAFT.burns[burnTier].amount; if (burn > 0n) { if (!ECONOMY.objectpadToken) throw new Error('$OBJECTPAD is not deployed yet, so burn boosts are unavailable.'); setStage('Approving $OBJECTPAD burn'); await ensureAllowance(auth.wallet, ECONOMY.objectpadToken, ECONOMY.forge, burn, auth.send); }
    setStage('Crafting your Artifact');
    const hash = await auth.send(await prepareTx(auth.wallet, { to: ECONOMY.forge, data: encodeFunctionData({ abi: FORGE_ABI, functionName: 'craft', args: [tokens, amounts, lockTier, burnTier] }) }));
    await waitForReceipt(hash); return hash;
  }, onSuccess: () => { play('seal'); setStage(''); void qc.invalidateQueries({ queryKey: ['objectpad'] }); navigate('/inventory'); }, onError: () => setStage('') });
  const ready = Boolean(multiplier && problems.every(p => !p) && auth.wallet && ECONOMY.forge);
  useEffect(() => { if (!preselect || !archive.data) return; const hit = archive.data.items.find(i => i.record.tokenAddress.toLowerCase() === preselect); if (hit) setSlots(current => current.length ? current : [{ record: hit.record, amount: formatUnits(CRAFT.minIngredientAmount, 18) }]); }, [preselect, archive.data]);

  return <div className="page py-10 sm:py-14">
    <div className="flex flex-wrap items-end justify-between gap-6"><div><div className="spec">The Crafting Table</div><h1 className="mt-3 display text-[40px] sm:text-6xl">Forge an Artifact.</h1><p className="mt-4 max-w-xl text-base leading-7 text-muted">Lock 2–3 object coins into one Artifact. It earns 25% of each coin's harvested creator fees, shared by weight with other Artifacts holding that coin. Dissolve it after the lock to get every coin back.</p></div><Button asChild variant="outline"><Link to="/inventory">Your inventory<ArrowUpRight/></Link></Button></div>
    {!ECONOMY.forge && <div className="mt-8 flex gap-3 rounded-2xl border border-clay/30 bg-clay/5 p-5 text-sm leading-6"><Hammer size={18} className="mt-0.5 shrink-0 text-clay"/><p><span className="font-semibold">The Crafting Table contract is not deployed yet.</span> <span className="text-muted">You can plan a recipe and preview its exact multiplier. Crafting unlocks once the Forge contract address is configured.</span></p></div>}
    <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-8">
        <section><div className="flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight">1 · Choose ingredients</h2><span className="font-mono text-xs text-muted">{slots.length}/{CRAFT.maxIngredients}</span></div>
          {archive.isPending ? <Loading label="Reading object coins…"/> : archive.isError ? <div className="mt-4"><ErrorState message="The archive is not connected, so there are no object coins to craft with yet." retry={() => void archive.refetch()}/></div> : available.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-ink/20 p-8 text-center text-sm text-muted">No confirmed object coins exist yet. The first launch unlocks the table.</p> :
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{available.map(({ record, balance }) => { const on = slots.some(s => s.record.objectId === record.objectId); return <button key={record.objectId} onClick={() => toggle(record)} aria-pressed={on} disabled={!on && slots.length >= CRAFT.maxIngredients} className={cn('group relative overflow-hidden rounded-2xl border p-2 text-left transition-all disabled:opacity-40', on ? 'border-clay bg-clay/5 ring-2 ring-clay/30' : 'border-ink/10 bg-white/50 hover:border-ink/30')}><img src={record.model.thumbnailUrl} alt="" className="aspect-square w-full rounded-xl object-cover"/><p className="mt-2 truncate px-1 text-sm font-bold">${record.symbol}</p><p className="truncate px-1 font-mono text-[11.5px] text-muted">{balance === null ? (auth.wallet ? '…' : 'Connect to see balance') : `Held ${formatTokens(balance)}`}</p>{on && <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-clay text-white"><X size={12}/></span>}</button>; })}</div>}
        </section>
        {slots.length > 0 && <section><h2 className="text-xl font-bold tracking-tight">2 · Set amounts</h2><div className="mt-4 space-y-3">{slots.map((slot, i) => { const balance = holdings.data?.find(h => h.record.objectId === slot.record.objectId)?.balance; return <div key={slot.record.objectId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink/10 bg-white/50 p-3"><img src={slot.record.model.thumbnailUrl} alt="" className="size-11 rounded-xl object-cover"/><div className="min-w-24"><p className="text-sm font-bold">${slot.record.symbol}</p>{balance !== undefined && <button className="font-mono text-[11.5px] text-muted underline-offset-2 hover:underline" onClick={() => setSlots(cur => cur.map(s => s.record.objectId === slot.record.objectId ? { ...s, amount: formatUnits(balance, 18) } : s))}>Max {formatTokens(balance)}</button>}</div><input value={slot.amount} onChange={event => setSlots(cur => cur.map(s => s.record.objectId === slot.record.objectId ? { ...s, amount: event.target.value } : s))} inputMode="decimal" aria-label={`Amount of ${slot.record.symbol}`} className="min-w-0 flex-1 tnum"/>{problems[i] && <p className="w-full text-xs text-red-800">{problems[i]}</p>}</div>; })}</div></section>}
        <section><h2 className="text-xl font-bold tracking-tight">{slots.length > 0 ? '3' : '2'} · Lock and boost</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">{CRAFT.locks.map(lock => <button key={lock.tier} onClick={() => setLockTier(lock.tier)} aria-pressed={lockTier === lock.tier} className={cn('rounded-2xl border p-4 text-left', lockTier === lock.tier ? 'border-ink bg-ink text-paper' : 'border-ink/10 bg-white/50')}><Lock size={16}/><p className="mt-3 font-bold">{lock.label}</p><p className={cn('font-mono text-[11px]', lockTier === lock.tier ? 'text-paper/70' : 'text-muted')}>+{lock.bonusBps / 100}% weight</p></button>)}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{CRAFT.burns.map(burn => <button key={burn.tier} onClick={() => setBurnTier(burn.tier)} aria-pressed={burnTier === burn.tier} disabled={burn.tier > 0 && !ECONOMY.objectpadToken && Boolean(ECONOMY.forge)} className={cn('rounded-2xl border p-4 text-left disabled:opacity-40', burnTier === burn.tier ? 'border-clay bg-clay text-white' : 'border-ink/10 bg-white/50')}><Flame size={16}/><p className="mt-3 font-bold">{burn.label}</p><p className={cn('font-mono text-[11px]', burnTier === burn.tier ? 'text-white/80' : 'text-muted')}>{burn.tier ? `+${burn.bonusBps / 100}% · burned forever` : 'Keep your $OBJECTPAD'}</p></button>)}</div>
        </section>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <ArtifactPreview slots={slots} multiplier={multiplier}/>
        <div className="panel p-5"><h2 className="font-bold">Powerups</h2><ul className="mt-3 space-y-2.5 text-sm">{[{ icon: TrendingUp, label: 'Fee yield from each coin', on: slots.length >= 2 }, { icon: Sparkles, label: `Trio bonus +${CRAFT.trioBonusBps / 100}%`, on: slots.length === 3 }, { icon: Lock, label: `Lock boost +${CRAFT.locks[lockTier].bonusBps / 100}%`, on: lockTier > 0 }, { icon: Flame, label: `Burn boost +${CRAFT.burns[burnTier].bonusBps / 100}%`, on: burnTier > 0 }].map(p => <li key={p.label} className={cn('flex items-center gap-3', p.on ? 'text-ink' : 'text-muted/60')}><span className={cn('flex size-7 items-center justify-center rounded-full', p.on ? 'bg-moss text-white' : 'bg-ink/5')}><p.icon size={13}/></span>{p.label}</li>)}</ul>
          <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-4"><span className="stat-label">Weight multiplier</span><span className="text-xl font-extrabold tnum">{multiplier ? `${(multiplier / 10_000).toFixed(2)}×` : '—'}</span></div>
          <p className="mt-2 text-[11px] leading-5 text-muted">Weighted shares = amount × multiplier, per coin. Unlocks {CRAFT.locks[lockTier].days} days after crafting.</p></div>
        {!auth.configured ? <p className="glass rounded-2xl p-4 text-sm text-muted">Sign-in is not configured for this deployment yet.</p> : !auth.authenticated ? <Button className="w-full" size="lg" onClick={() => auth.login()}><Wallet/>Connect to craft</Button> :
          <Button size="lg" className="w-full bg-clay hover:bg-ink" disabled={!ready || craft.isPending} onClick={() => craft.mutate()}><Hammer/>{craft.isPending ? stage || 'Working…' : !ECONOMY.forge ? 'Forge not deployed yet' : slots.length < 2 ? 'Add at least 2 coins' : 'Craft Artifact'}</Button>}
        {craft.isError && <p role="alert" className="text-sm leading-6 text-red-800">{craft.error.message.split('\n')[0]}</p>}
        <p className="text-[11px] leading-5 text-muted">Each approval and the craft are separate wallet signatures. Locked coins stay in the Forge contract; nobody but the Artifact holder can dissolve them. Artifacts carry no promise of returns.</p>
        <div className="flex items-center gap-2 font-mono text-[11.5px] uppercase text-muted"><Minus size={10}/>Min {compact(Number(formatUnits(CRAFT.minIngredientAmount, 18)))} per coin<Plus size={10}/>Max 3 coins</div>
      </aside>
    </div>
  </div>;
}
