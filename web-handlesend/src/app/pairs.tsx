import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search, Sparkles } from 'lucide-react';
import type { CoinPair, PairSuggestion } from '@/shared/domain';
import { POPULAR, PAIR_KINDS } from '@/lib/pairs';
import { isEthPair } from '@/shared/pairs';
import { cn } from '@/lib/utils';
import { Feedback } from './feedback';
import { Fmt } from './format';
import { useApp } from './store';
import { CoinAvatar, img, PAD, Pill, Sparkline } from './ui';
import { Sheet, SheetHeader } from './chrome';

/** Gold "V2" pill next to the wordmark. Opens the V2 release notes. */
export function V2Pill({ small = false }: { small?: boolean }) {
  const app = useApp();
  return <button type="button" aria-label="ObjectPad V2: what's new" onPointerDown={() => Feedback.tap()} onClick={() => app.setV2(true)} className="ap-press ap-gold relative inline-flex shrink-0 items-center gap-1 overflow-hidden rounded-full ring-1 ring-[#96690A]/50 shadow-[0_3px_6px_rgba(245,197,66,.6)]" style={{ height: small ? 20 : 24, padding: `0 ${small ? 7 : 9}px` }}>
    <span className="ap-mono relative z-10 font-black" style={{ fontSize: small ? 10 : 11.5 }}>V2</span><span className="relative z-10 size-[5px] rounded-full bg-[#3A2A05]/70"/><span className="ap-shine"/>
  </button>;
}
export function V2Tag({ className }: { className?: string }) { return <span className={cn('ap-gold ap-mono inline-flex h-[18px] items-center rounded-full px-1.5 text-[9.5px] font-black', className)}>V2</span>; }

/** "Paired with NVDA" capsule used on coin rows and coin pages. */
export function PairBadge({ pair, showChange = false }: { pair: CoinPair; showChange?: boolean }) {
  return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white py-0.5 pl-0.5 pr-[7px] ring-1 ring-ink/12">
    <CoinAvatar url={pair.logo} symbol={pair.symbol} size={16}/><span className="ap-mono text-[10.5px] font-extrabold text-ink">{pair.symbol}</span>
    {showChange && pair.change24h !== null && <span className="ap-mono text-[10px] font-extrabold" style={{ color: pair.change24h >= 0 ? PAD.up : PAD.down }}>{Fmt.pct(pair.change24h)}</span>}
  </span>;
}

/** Pair selector for the coin form: ETH by default, the AI pick as a one-tap suggestion, and every approved Pons V2 asset. */
export function PairPickerCard({ selection, onChange, suggestion, disabled = false }: { selection: string; onChange: (v: string) => void; suggestion?: PairSuggestion; disabled?: boolean }) {
  const app = useApp(); const [browsing, setBrowsing] = useState<boolean>(false);
  const selected = app.pair(selection); const paired = !isEthPair(selection);
  const suggested = suggestion ? app.pairs?.assets.find(a => a.address.toLowerCase() === suggestion.address.toLowerCase() && a.approved) : undefined;
  return <div className="flex flex-col gap-2.5 rounded-[22px] p-3.5 transition-colors" style={{ background: paired ? '#FFF8E6' : '#fff', boxShadow: `inset 0 0 0 1.5px ${paired ? 'rgba(245,197,66,.6)' : 'rgba(12,13,16,.08)'}` }}>
    <div className="flex items-center gap-2"><p className="text-[14.5px] font-extrabold">Pair with a stock</p><V2Tag/><span className="ap-mono ml-auto text-[10px] font-extrabold text-[#6A6E78]">{app.pairs?.assets.filter(a => a.approved).length ?? 0} LIVE</span></div>
    <button type="button" disabled={disabled} onPointerDown={() => Feedback.tap()} onClick={() => setBrowsing(true)} className="ap-press ap-sunk flex items-center gap-3 rounded-[18px] p-3 text-left disabled:opacity-60">
      <CoinAvatar url={selected?.logo} symbol={selected?.symbol ?? 'ETH'} size={38}/>
      <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-extrabold">{selected ? `${selected.symbol} · ${selected.name}` : 'ETH · Ether'}</span><span className="block text-[12px] font-semibold text-[#6A6E78]">{paired ? 'Coin trades against this asset' : 'Default · coin trades against ETH'}</span></span>
      {paired && selected?.priceUsd ? <span className="ap-mono text-[12px] font-extrabold">{Fmt.usd(selected.priceUsd)}</span> : null}<ChevronsUpDown size={14} className="text-[#6A6E78]"/>
    </button>
    {suggestion && suggested && suggested.address.toLowerCase() !== selection.toLowerCase() && !disabled && <button type="button" onClick={() => { Feedback.success(); onChange(suggested.address.toLowerCase()); }} className="ap-press ap-pop flex items-center gap-2.5 rounded-[18px] bg-ink p-3 text-left">
      <Sparkles size={16} className="shrink-0 text-[#F5C542]"/><CoinAvatar url={suggested.logo} symbol={suggested.symbol} size={26}/>
      <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-extrabold text-white">AI suggests {suggested.symbol}</span><span className="line-clamp-2 block text-[11.5px] font-semibold text-white/70">{suggestion.reason}</span></span>
      <span className="flex h-7 items-center rounded-full bg-white px-3 text-[12px] font-extrabold text-ink">Use</span>
    </button>}
    {paired && !disabled && <button type="button" onClick={() => onChange('')} className="self-start text-[12.5px] font-extrabold text-[#6A6E78]">Switch back to ETH</button>}
    <p className="text-[11px] font-semibold text-[#6A6E78]">Buyers pay in ETH; it routes on-chain into the pair asset. Pairing gives no claim on the company or asset.</p>
    <PairBrowser open={browsing} onClose={() => setBrowsing(false)} selection={selection} onChange={v => { onChange(v); setBrowsing(false); }} suggestion={suggestion}/>
  </div>;
}

/** Searchable list of every approved pair asset with company logos and live on-chain prices. */
export function PairBrowser({ open, onClose, selection, onChange, suggestion }: { open: boolean; onClose: () => void; selection: string; onChange: (v: string) => void; suggestion?: PairSuggestion }) {
  const app = useApp(); const [q, setQ] = useState<string>(''); const [kind, setKind] = useState<string>('popular');
  const list = useMemo(() => {
    const all = (app.pairs?.assets ?? []).filter(a => a.approved); const term = q.trim().toLowerCase();
    if (term) return all.filter(a => `${a.symbol} ${a.name} ${a.sector ?? ''}`.toLowerCase().includes(term));
    if (kind === 'popular') return POPULAR.map(s => all.find(a => a.symbol === s)).filter((a): a is NonNullable<typeof a> => Boolean(a));
    return kind === 'all' ? all : all.filter(a => a.kind === kind);
  }, [app.pairs, q, kind]);
  return <Sheet open={open} onClose={onClose}>
    <SheetHeader title="Pair with" onDone={onClose}/>
    <div className="px-4">
      <div className="ap-glass flex h-11 items-center gap-2 rounded-full px-3.5"><Search size={16} className="text-[#6A6E78]"/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search NVDA, Tesla, gold…" className="ap-bare min-w-0 flex-1 text-[15px] font-semibold"/></div>
      {!q && <div className="ap-scroll -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 py-1">{PAIR_KINDS.map(k => <Pill key={k.id} title={k.label} on={kind === k.id} onClick={() => setKind(k.id)}/>)}</div>}
      <ul className="mt-2 divide-y divide-ink/[0.06] rounded-[22px] bg-white px-3">{list.map(a => { const on = isEthPair(selection) ? a.kind === 'native' : a.address.toLowerCase() === selection.toLowerCase(); return <li key={a.address}><button type="button" onClick={() => { Feedback.selection(); onChange(a.kind === 'native' ? '' : a.address.toLowerCase()); }} className="flex min-h-[60px] w-full items-center gap-3 text-left">
        <CoinAvatar url={a.logo} symbol={a.symbol} size={36}/>
        <span className="min-w-0 flex-1"><span className="flex items-center gap-1 text-[15px] font-extrabold">{a.symbol}{suggestion?.address.toLowerCase() === a.address.toLowerCase() && <Sparkles size={11} className="text-[#F5C542]"/>}</span><span className="block truncate text-[12px] font-semibold text-[#6A6E78]">{[a.name, a.sector].filter(Boolean).join(' · ')}</span></span>
        <span className="text-right"><span className="ap-mono block text-[12.5px] font-extrabold">{a.priceUsd ? Fmt.usd(a.priceUsd) : '—'}</span>{a.change24h !== null && <span className="ap-mono block text-[11px] font-extrabold" style={{ color: a.change24h >= 0 ? PAD.up : PAD.down }}>{Fmt.pct(a.change24h)}</span>}</span>
        {on && <Check size={15} strokeWidth={3}/>}
      </button></li>; })}{!list.length && <li className="py-8 text-center text-[13px] font-bold text-[#6A6E78]">No matching asset.</li>}</ul>
    </div>
  </Sheet>;
}

const NVDA = '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec';
/** Looping visual: an object and a stock chart slam together and become one paired coin. */
export function MergeAnimation() {
  const app = useApp(); const q = app.pair(NVDA); const [phase, setPhase] = useState<number>(0);
  useEffect(() => {
    let cancelled = false; const timers: ReturnType<typeof setTimeout>[] = [];
    const loop = () => { if (cancelled) return; setPhase(0); timers.push(setTimeout(() => setPhase(1), 1200)); timers.push(setTimeout(() => { Feedback.softImpact(); setPhase(2); }, 1650)); timers.push(setTimeout(() => setPhase(3), 2050)); timers.push(setTimeout(loop, 4450)); };
    loop(); return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, []);
  return <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
    {phase < 2 && <>
      <div className="absolute rounded-[20px] bg-white p-2.5 transition-transform duration-[450ms] ease-in" style={{ width: '26%', transform: `translateX(${phase === 0 ? -108 : -16}%)`, left: '37%' }}><img src={img('duck_mark')} alt="" className="mx-auto h-auto w-full object-contain"/></div>
      <div className="absolute flex flex-col gap-1 rounded-[20px] bg-white p-2.5 transition-transform duration-[450ms] ease-in" style={{ width: '30%', left: '35%', transform: `translateX(${phase === 0 ? 95 : 14}%)` }}>
        <span className="flex items-center gap-1.5"><CoinAvatar url={q?.logo} symbol="NVDA" size={18}/><span className="text-[12px] font-extrabold">NVDA</span></span>
        <Sparkline points={[1, 1.2, 1.1, 1.5, 1.4, 1.9, 1.8, 2.4]} className="h-[30px] w-full"/>
        <span className="ap-mono text-[11px] font-extrabold">{q?.priceUsd ? Fmt.usd(q.priceUsd) : '—'}</span>
      </div>
    </>}
    {phase === 2 && <div className="ap-pop absolute aspect-square w-[60%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(18,161,80,.5), transparent 70%)' }}/>}
    {phase >= 2 && <div className="ap-pop relative flex flex-col items-center gap-1.5 rounded-[22px] bg-white p-2 ring-2 ring-[#12A150]">
      <img src={img('duck_stock_coin_fusion')} alt="" className="aspect-[3/2] w-[150px] rounded-[18px] object-cover"/>
      <span className="text-[12.5px] font-extrabold">$DUCK · paired with NVDA</span>
    </div>}
  </div>;
}
