import { memo } from 'react';
import { usePair } from '@/lib/pairs';
import { PairLogo } from './PairBadge';
import { pct, usd } from '@/lib/format';

const NVDA = '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec';

/** Looping visual: a real object and a live stock chart slam together and become one paired coin. */
export const MergeExplainer = memo(function MergeExplainer({ compact = false }: { compact?: boolean }) {
  const nvda = usePair(NVDA);
  const chart = 'M0,40 L12,36 L24,38 L36,28 L48,31 L60,20 L72,23 L84,12 L100,6';
  return <div className={compact ? '' : 'grid gap-4 lg:grid-cols-[1.3fr_1fr]'}>
    <div className="steel relative overflow-hidden rounded-[28px]" style={{ aspectRatio: compact ? '16/10' : '16/9' }}>
      <div className="grid-paper absolute inset-0 opacity-60" aria-hidden="true"/>
      <div className="merge-left absolute left-[6%] top-1/2 w-[36%] -translate-y-1/2"><div className="raised rounded-[22px] p-3"><img src="/assets/objects/duck.webp" alt="Rubber duck" className="mx-auto aspect-square w-full object-contain"/><p className="mt-1 text-center font-mono text-[11px] font-extrabold uppercase">Object</p></div></div>
      <div className="merge-right absolute right-[6%] top-1/2 w-[36%] -translate-y-1/2"><div className="raised rounded-[22px] p-3"><div className="flex items-center gap-2"><PairLogo src={nvda?.logo} symbol="NVDA" size={22}/><span className="font-extrabold">NVDA</span></div><p className="mt-1 font-mono text-[13px] font-extrabold tnum">{nvda?.priceUsd ? usd(nvda.priceUsd) : '—'} <span className={(nvda?.change24h ?? 0) >= 0 ? 'text-up' : 'text-down'}>{nvda?.change24h === null || nvda?.change24h === undefined ? '' : pct(nvda.change24h)}</span></p><svg viewBox="0 0 100 44" className="mt-1 h-16 w-full" preserveAspectRatio="none"><path d={chart} fill="none" stroke="#12A150" strokeWidth="2.4" vectorEffect="non-scaling-stroke"/></svg><p className="text-center font-mono text-[11px] font-extrabold uppercase">Stock</p></div></div>
      <div className="merge-burst pointer-events-none absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(circle, rgba(18,161,80,.45), rgba(18,161,80,0) 65%)' }} aria-hidden="true"/>
      <div className="merge-result absolute left-1/2 top-1/2 w-[42%] -translate-x-1/2 -translate-y-1/2"><div className="raised rounded-[24px] p-3 shadow-[0_0_0_2px_#12A150]"><div className="relative"><img src="/assets/objects/coin-duck.webp" alt="" className="mx-auto aspect-square w-[78%] object-contain"/><span className="pair-badge absolute bottom-1 right-1"><PairLogo src={nvda?.logo} symbol="NVDA" size={18}/>NVDA</span></div><p className="mt-1 text-center text-[15px] font-extrabold">$DUCK · paired with NVDA</p></div></div>
    </div>
    {!compact && <ol className="grid gap-2">{[['1', 'Scan any object', 'Six photos from your phone. We build the 3D model and name it.'], ['2', 'Pick a stock, or let AI pick', 'The AI suggests a pair that fits the object’s story. ETH stays the default.'], ['3', 'Launch the paired coin', 'The coin trades against that stock on its own curve, free to launch.'], ['4', 'Trade with ETH', 'Buyers pay in ETH; it routes on-chain into the pair asset and the curve.']].map(([n, t, d]) => <li key={n} className="raised flex gap-3 rounded-[20px] p-4"><span className="display flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-[18px] text-white">{n}</span><div><p className="font-extrabold">{t}</p><p className="text-[13.5px] font-medium text-ink/65">{d}</p></div></li>)}</ol>}
  </div>;
});
