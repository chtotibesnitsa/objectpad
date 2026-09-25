import { memo, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { pct, shortAddress, tinyUsd } from '@/lib/format';
import { copyText } from '@/lib/format';
import { OBJECTPAD_CA, OBJECTPAD_COIN_PATH } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { usePlatformMarket } from './MarketBoard';
import { BurnChip } from './BurnToasts';

/** Minimum items per half of the loop, so the strip is always full edge to edge on any screen width. */
const MIN_ITEMS = 24;

/** $OBJECTPAD chip: opens our own coin page; the CA copies in one tap. */
export function ObjectPadCa({ className, dark = false }: { className?: string; dark?: boolean }) {
  const [copied, setCopied] = useState<boolean>(false);
  return <span className={cn('flex items-center gap-1.5', className)}>
    <Link to={OBJECTPAD_COIN_PATH} className="flex items-center gap-1.5 font-extrabold hover:opacity-80"><img src="/brand/x-profile-96.png" alt="" width={20} height={20} decoding="async" className="size-5 rounded-md object-cover"/>$OBJECTPAD</Link>
    {OBJECTPAD_CA ? <button onClick={() => void copyText(OBJECTPAD_CA ?? '').then(setCopied)} className={cn('flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono font-bold', dark ? 'bg-white/10' : 'bg-ink/[0.06] hover:bg-ink/10')} title="Copy contract address">CA {shortAddress(OBJECTPAD_CA, 6, 4)}{copied ? <Check size={11}/> : <Copy size={11}/>}</button>
      : <span className={cn('rounded-md px-1.5 py-0.5 font-mono font-bold', dark ? 'bg-white/10' : 'bg-ink/[0.06] text-ink/65')}>CA · launching on ObjectPad</span>}
  </span>;
}

/** Endless strip of ObjectPad coins on a tinted glass rail, each in its own chip. Never shows a gap. */
export const LiveTicker = memo(function LiveTicker() {
  const board = usePlatformMarket(); const ethUsd = board.ethUsd;
  const items = useMemo(() => { const base = board.coins; const out: typeof base = []; if (!base.length) return out; while (out.length < MIN_ITEMS) out.push(...base); return out; }, [board.coins]);
  const row = (copy: number) => items.map((item, i) => { const up = item.changePct >= 0; return <Link key={`${copy}-${i}-${item.key}`} to={item.to} tabIndex={-1} aria-hidden={copy === 1 ? true : undefined} className="mr-2 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white/85 py-1 pl-1 pr-2.5 shadow-[0_0_0_1px_rgba(12,13,16,.08),0_4px_10px_-6px_rgba(20,24,40,.35)] transition-transform hover:-translate-y-px">
    <span className="[&_img]:!size-5 [&>*]:!size-5">{item.icon}</span><span className="font-extrabold text-ink">${item.symbol}</span>
    <span className="font-semibold text-ink/60 tnum">{ethUsd ? tinyUsd(item.priceEth * ethUsd) : `${item.priceEth.toPrecision(3)} ETH`}</span>
    <span className={cn('rounded-full px-1.5 py-px font-bold tnum', up ? 'bg-up/15 text-up' : 'bg-down/15 text-down')}>{up ? '▲' : '▼'} {pct(item.changePct)}</span>
  </Link>; });
  return <div className="relative flex h-11 items-center overflow-hidden border-b border-white/70 bg-[linear-gradient(180deg,#F7F8FA,#E6E9EE)] font-mono text-[12px] font-bold uppercase tracking-wide shadow-[inset_0_-1px_0_rgba(12,13,16,.08)]" aria-label="ObjectPad coins">
    <span className="relative z-10 flex h-full shrink-0 items-center gap-2 border-r border-ink/[0.08] bg-white/80 pl-3 pr-3 text-ink backdrop-blur-md sm:pl-5"><span className="pulse-dot size-1.5 rounded-full bg-up"/><ObjectPadCa/><span className="hidden md:flex"><BurnChip/></span></span>
    <div className="marquee-mask min-w-0 flex-1 overflow-hidden"><div className="marquee-run flex w-max hover:[animation-play-state:paused] motion-reduce:animate-none" style={{ '--marquee': `${Math.max(40, items.length * 3.4)}s` } as CSSProperties}><div className="flex pl-3">{row(0)}</div><div className="flex pl-3">{row(1)}</div></div></div>
  </div>;
});
