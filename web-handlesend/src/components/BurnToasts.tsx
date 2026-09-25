import { useEffect, useRef, useState } from 'react';
import { Flame, X } from 'lucide-react';
import { explorerTx } from '@/shared/pons';
import { useBurnFeed, type BurnEntry } from '@/lib/burns';

const fmtEth = (wei: string): string => { const v = Number(BigInt(wei)) / 1e18; return v >= 0.01 ? v.toFixed(3) : v.toFixed(5); };
const fmtTokens = (wei: string): string => { const v = Number(BigInt(wei) / 10n ** 12n) / 1e6; return new Intl.NumberFormat('en', { notation: v >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v); };

/**
 * Small on-site notice each time an automatic $OBJECTPAD burn confirms: amount, tokens burned and which coins funded it.
 * One at a time, bottom corner, gone after six seconds. Only burns that happen while the page is open are announced.
 */
export function BurnToasts() {
  const feed = useBurnFeed(); const seen = useRef<Set<string> | null>(null); const [toast, setToast] = useState<BurnEntry | null>(null);
  useEffect(() => {
    const items = (feed.data?.items ?? []).filter(b => b.state === 'confirmed');
    if (!seen.current) { seen.current = new Set(items.map(b => b.id)); return; }
    const fresh = items.find(b => !seen.current!.has(b.id)); items.forEach(b => seen.current!.add(b.id));
    if (fresh) { setToast(fresh); const t = setTimeout(() => setToast(c => (c?.id === fresh.id ? null : c)), 6000); return () => clearTimeout(t); }
  }, [feed.data]);
  if (!toast) return null;
  const funders = toast.coins.slice(0, 3).map(c => `$${c.symbol}`).join(', ');
  return <div role="status" className="burn-toast fixed bottom-[calc(96px+env(safe-area-inset-bottom))] right-3 z-[60] w-[min(340px,calc(100vw-24px))] lg:bottom-6 lg:right-6">
    <div className="raised flex items-start gap-3 rounded-[22px] p-3 pr-2">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-ink text-white"><Flame size={18}/></span>
      <a href={toast.hash ? explorerTx(toast.hash) : '/burn'} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
        <p className="text-[14px] font-extrabold">{fmtTokens(toast.tokensBurned)} $OBJECTPAD burned</p>
        <p className="truncate font-mono text-[11.5px] font-bold text-ink/60">{fmtEth(toast.ethIn)} ETH buyback{funders ? ` · from ${funders}` : ''}</p>
      </a>
      <button onClick={() => setToast(null)} className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink/50 hover:bg-ink/5" aria-label="Dismiss"><X size={14}/></button>
    </div>
  </div>;
}

/** Ticker chip for the top rail: latest confirmed burn, or the next round's countdown. */
export function BurnChip() {
  const feed = useBurnFeed(); const [now, setNow] = useState<number>(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const data = feed.data; if (!data) return null;
  const last = data.items.find(b => b.state === 'confirmed');
  const left = data.nextAt ? Math.max(0, Math.round((data.nextAt - now) / 1000)) : null;
  return <a href="/burn" className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 text-white"><Flame size={12}/>{!data.live ? 'Burn · launching soon' : last ? `${fmtTokens(last.tokensBurned)} burned${last.coins[0] ? ` · $${last.coins[0].symbol}` : ''}` : 'Burn engine live'}{data.live && left !== null && <span className="text-white/60 tnum">· next {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>}</a>;
}

/** Full list of real burns for the burn page. */
export function BurnHistory() {
  const feed = useBurnFeed(); const data = feed.data;
  if (!data) return null;
  return <div className="raised rounded-[26px] p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-extrabold"><Flame size={18}/>Automatic burns</h2><span className="chip">{data.live ? `every ${data.intervalSec / 60} min · ${data.burns} so far` : 'starts at launch'}</span></div>
    {data.live && <p className="mt-2 font-mono text-[12px] font-bold text-ink/60">{fmtEth(data.totalEth)} ETH spent · {fmtTokens(data.totalTokens)} $OBJECTPAD burned · {fmtEth(data.pendingEth)} ETH queued for the next round</p>}
    {!data.live && <p className="mt-2 text-sm font-semibold text-ink/65">Every 5 minutes, 0.5% of all trading volume on ObjectPad coins buys $OBJECTPAD and sends it to the dead address. The first round runs as soon as $OBJECTPAD is live.</p>}
    <ul className="mt-4 space-y-2">{data.items.map(b => <li key={b.id} className="sunk flex items-center gap-3 rounded-2xl px-3 py-2.5">
      <span className={b.state === 'confirmed' ? 'size-2 rounded-full bg-up' : b.state === 'failed' ? 'size-2 rounded-full bg-down' : 'pulse-dot size-2 rounded-full bg-ink/50'}/>
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-extrabold">{b.state === 'confirmed' ? `${fmtTokens(b.tokensBurned)} $OBJECTPAD burned` : b.state === 'failed' ? 'Burn did not confirm' : 'Burn confirming…'}</span><span className="block truncate font-mono text-[11.5px] text-ink/60">{fmtEth(b.ethIn)} ETH · {b.coins.map(c => `$${c.symbol} ${c.share}%`).join(' · ') || 'ObjectPad coins'}</span></span>
      {b.hash && <a href={explorerTx(b.hash)} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] font-bold underline underline-offset-2">tx</a>}
    </li>)}</ul>
  </div>;
}
