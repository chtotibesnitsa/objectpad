import { memo, useState } from 'react';
import { pct } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Company / token logo for a pair asset, with a monogram fallback if the image can't load. */
export const PairLogo = memo(function PairLogo({ src, symbol, size = 20, className }: { src?: string | null; symbol: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState<boolean>(false);
  if (!src || failed) return <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-mono font-black text-white', className)} style={{ width: size, height: size, fontSize: Math.max(8, size * 0.36) }} aria-hidden="true">{symbol.slice(0, 2)}</span>;
  return <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn('shrink-0 rounded-full bg-white object-contain shadow-[0_0_0_1px_rgba(12,13,16,.1)]', className)} style={{ width: size, height: size }}/>;
});

/** "Paired with NVDA" badge used on coin cards, market rows and coin pages. */
export const PairBadge = memo(function PairBadge({ symbol, logo, change, className, label = false }: { symbol: string; logo?: string | null; change?: number | null; className?: string; label?: boolean }) {
  return <span className={cn('pair-badge', className)} title={`Paired with ${symbol}`}>
    <PairLogo src={logo} symbol={symbol} size={18}/>
    {label && <span className="font-semibold text-ink/55">Paired</span>}
    <span>{symbol}</span>
    {change !== null && change !== undefined && <span className={change >= 0 ? 'text-up' : 'text-down'}>{change >= 0 ? '▲' : '▼'}{pct(Math.abs(change))}</span>}
  </span>;
});
