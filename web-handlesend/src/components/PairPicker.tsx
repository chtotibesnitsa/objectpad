import { useDeferredValue, useMemo, useState } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import { PAIR_KINDS, POPULAR, usePairs, type PairQuote } from '@/lib/pairs';
import { ETH_PAIR, isEthPair } from '@/shared/pairs';
import type { PairSuggestion } from '@/shared/domain';
import { PairLogo } from './PairBadge';
import { pct, usd } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * V2 pair selector for the coin form: ETH by default, the AI's recommended stock as a one-tap suggestion, and a searchable
 * list of every asset the Pons V2 factory approves, with company logos and live on-chain prices.
 */
export function PairPicker({ value, onChange, suggestion, disabled = false, className }: { value: string; onChange: (address: string) => void; suggestion?: PairSuggestion; disabled?: boolean; className?: string }) {
  const board = usePairs(); const [open, setOpen] = useState<boolean>(false); const [kind, setKind] = useState<string>('popular'); const [q, setQ] = useState<string>(''); const query = useDeferredValue(q);
  const assets = useMemo(() => (board.data?.assets ?? []).filter(a => a.approved), [board.data]);
  const selected = assets.find(a => a.address.toLowerCase() === (value || ETH_PAIR.address).toLowerCase()) ?? null;
  const suggested = suggestion ? assets.find(a => a.address.toLowerCase() === suggestion.address.toLowerCase()) : undefined;
  const list = useMemo(() => {
    const term = query.trim().toLowerCase();
    let out = assets.filter(a => !term || `${a.symbol} ${a.name} ${a.sector ?? ''}`.toLowerCase().includes(term));
    if (!term) out = kind === 'popular' ? POPULAR.map(s => out.find(a => a.symbol === s)).filter((a): a is PairQuote => Boolean(a)) : kind === 'all' ? out : out.filter(a => a.kind === kind);
    return out;
  }, [assets, kind, query]);
  const pick = (address: string) => { onChange(isEthPair(address) ? '' : address.toLowerCase()); setOpen(false); };
  const paired = !isEthPair(value);
  return <div className={cn('rounded-[22px] border-2 p-3.5 transition-colors', paired ? 'border-[#D9A521]/60 bg-[#FFF8E6]' : 'border-ink/10 bg-white', className)}>
    <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-[14px] font-extrabold">Pair with a stock<span className="v2-pill relative inline-flex h-[18px] items-center rounded-full px-1.5 font-mono text-[10px] font-black text-[#3A2A05]">V2</span></p><span className="font-mono text-[10.5px] font-extrabold uppercase text-ink/55">{assets.length ? `${assets.length} assets live` : 'Loading…'}</span></div>
    <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)} className="press sunk mt-2.5 flex min-h-[58px] w-full items-center gap-3 rounded-2xl px-3 text-left disabled:opacity-60" aria-expanded={open}>
      <PairLogo src={selected?.logo} symbol={selected?.symbol ?? 'ETH'} size={34}/>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-extrabold">{selected ? `${selected.symbol} · ${selected.name}` : 'ETH · Ether'}</span><span className="block font-mono text-[11.5px] font-bold text-ink/60">{selected?.priceUsd ? `${usd(selected.priceUsd)} ${selected.change24h === null ? '' : pct(selected.change24h)} · ` : ''}{paired ? 'Coin trades against this asset' : 'Default · coin trades against ETH'}</span></span>
      <span className="font-mono text-[11px] font-extrabold uppercase text-ink/60">{open ? 'Close' : 'Change'}</span>
    </button>
    {suggested && !open && value.toLowerCase() !== suggested.address.toLowerCase() && <button type="button" disabled={disabled} onClick={() => pick(suggested.address)} className="press slide-in mt-2 flex w-full items-center gap-2.5 rounded-2xl bg-ink px-3 py-2.5 text-left text-white">
      <Sparkles size={15} className="shrink-0 text-[#F2C94C]"/><PairLogo src={suggested.logo} symbol={suggested.symbol} size={24}/>
      <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-extrabold">AI suggests {suggested.symbol}</span><span className="block truncate text-[12px] font-semibold text-white/70">{suggestion?.reason}</span></span>
      <span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-extrabold text-ink">Use</span>
    </button>}
    {paired && !open && <button type="button" onClick={() => pick(ETH_PAIR.address)} className="mt-2 flex min-h-9 items-center gap-1 text-[12.5px] font-extrabold text-ink/65"><X size={13}/>Switch back to ETH</button>}
    {open && <div className="slide-in mt-2.5">
      <div className="relative"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/50"/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search NVDA, Tesla, gold…" className="w-full pl-10 text-[14px]" autoFocus/></div>
      {!query && <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">{PAIR_KINDS.map(k => <button key={k.id} type="button" onClick={() => setKind(k.id)} className={cn('min-h-8 shrink-0 rounded-full px-3 text-[12px] font-extrabold', kind === k.id ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink/70')}>{k.label}</button>)}</div>}
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">{list.map(a => { const on = (value || ETH_PAIR.address).toLowerCase() === a.address.toLowerCase(); const up = (a.change24h ?? 0) >= 0; return <li key={a.address}><button type="button" onClick={() => pick(a.address)} className={cn('flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2.5 text-left transition-colors', on ? 'bg-ink/[0.07]' : 'hover:bg-ink/[0.04]')}>
        <PairLogo src={a.logo} symbol={a.symbol} size={30}/>
        <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[14px] font-extrabold">{a.symbol}{suggestion?.address.toLowerCase() === a.address.toLowerCase() && <Sparkles size={12} className="text-[#D9A521]"/>}</span><span className="block truncate text-[12px] font-semibold text-ink/60">{a.name}{a.sector ? ` · ${a.sector}` : ''}</span></span>
        <span className="text-right"><span className="block font-mono text-[12.5px] font-extrabold tnum">{a.priceUsd ? usd(a.priceUsd) : '—'}</span>{a.change24h !== null && <span className={cn('block font-mono text-[11px] font-bold', up ? 'text-up' : 'text-down')}>{pct(a.change24h)}</span>}</span>
        {on && <Check size={16} strokeWidth={3} className="shrink-0"/>}
      </button></li>; })}{!list.length && <li className="py-6 text-center text-[13px] font-bold text-ink/55">No matching asset.</li>}</ul>
    </div>}
    <p className="mt-2 text-[11px] font-medium leading-4 text-ink/55">Buyers pay in ETH. It routes on-chain into the pair asset. Pairing gives no claim on the company or asset.</p>
  </div>;
}
