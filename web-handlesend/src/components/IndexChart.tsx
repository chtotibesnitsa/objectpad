import { memo, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/** Animated SVG line chart for an index series ({t, v}). Draws in on mount, with a hover crosshair. */
export const IndexChart = memo(function IndexChart({ points, className, height = 280, compact = false }: { points: { t: number; v: number }[]; className?: string; height?: number; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000; const H = height; const pad = compact ? 4 : 18;
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vs = points.map(p => p.v); const min = Math.min(...vs); const max = Math.max(...vs); const span = max - min || 1;
    const xy = points.map((p, i) => [pad + (i / (points.length - 1)) * (W - pad * 2), pad + (1 - (p.v - min) / span) * (H - pad * 2)] as const);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    return { xy, line, area: `${line}L${xy[xy.length - 1][0]},${H}L${xy[0][0]},${H}Z`, min, max };
  }, [points, H, pad]);
  if (!geo) return <div className={cn('flex items-center justify-center text-sm font-bold text-ink/50', className)} style={{ height }}>Collecting index history…</div>;
  const up = points[points.length - 1].v >= points[0].v; const color = up ? '#12A150' : '#E0453A';
  const h = hover !== null ? points[hover] : null; const hp = hover !== null ? geo.xy[hover] : null;
  return <div className={cn('relative', className)}>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height }} onMouseLeave={() => setHover(null)} onMouseMove={e => { if (compact) return; const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)); setHover(Math.max(0, Math.min(points.length - 1, i))); }}>
      <defs><linearGradient id={`ig-${up}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      {!compact && [0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#0C0D10" strokeOpacity=".06" strokeDasharray="4 6"/>)}
      <path d={geo.area} fill={`url(#ig-${up})`} className="chart-fade"/>
      <path d={geo.line} fill="none" stroke={color} strokeWidth={compact ? 3 : 3.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} className="chart-draw"/>
      {hp && <><line x1={hp[0]} x2={hp[0]} y1="0" y2={H} stroke="#0C0D10" strokeOpacity=".25"/><circle cx={hp[0]} cy={hp[1]} r="7" fill={color} stroke="#fff" strokeWidth="3" vectorEffect="non-scaling-stroke"/></>}
    </svg>
    {h && <div className="pointer-events-none absolute left-3 top-3 rounded-xl bg-ink px-3 py-2 font-mono text-[12px] font-bold text-white">{h.v.toFixed(2)} · {new Date(h.t).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric' })}</div>}
  </div>;
});
