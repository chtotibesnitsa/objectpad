import { memo, useRef } from 'react';
import { useInView } from '@/hooks/use-in-view';
import { cn } from '@/lib/utils';

export interface Slice { label: string; value: number; color: string; }

/** Animated donut chart. Slices sweep in the first time the chart scrolls into view. */
export const Donut = memo(function Donut({ slices, size = 220, thickness = 34, center, className }: { slices: Slice[]; size?: number; thickness?: number; center?: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null); const visible = useInView(ref, '0px', true);
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1; const r = (size - thickness) / 2; const c = 2 * Math.PI * r; let offset = 0;
  return <div ref={ref} className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0C0D10" strokeOpacity=".06" strokeWidth={thickness}/>
      {slices.map((slice, i) => { const length = (slice.value / total) * c; const dash = visible ? length : 0; const el = <circle key={slice.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={slice.color} strokeWidth={thickness} strokeDasharray={`${Math.max(0, dash - 2)} ${c}`} strokeDashoffset={-offset} style={{ transition: `stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1) ${i * 180}ms` }}/>; offset += length; return el; })}
          </svg>
    {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
  </div>;
});

/** Horizontal bar chart with labels, used for live volume leaders. */
export const Bars = memo(function Bars({ rows, format }: { rows: { label: string; value: number; color?: string; icon?: React.ReactNode }[]; format: (v: number) => string }) {
  const ref = useRef<HTMLDivElement>(null); const visible = useInView(ref, '0px', true); const max = Math.max(...rows.map(r => r.value), 1e-12);
  return <div ref={ref} className="space-y-2.5">{rows.map((row, i) => <div key={row.label} className="flex items-center gap-3">
    {row.icon}<span className="w-20 shrink-0 truncate text-sm font-semibold">{row.label}</span>
    <span className="relative h-6 flex-1 overflow-hidden rounded-full bg-ink/[0.05]"><span className="absolute inset-y-0 left-0 rounded-full" style={{ width: visible ? `${Math.max(3, (row.value / max) * 100)}%` : '0%', background: row.color ?? '#0C0D10', transition: `width 1s cubic-bezier(.2,.8,.2,1) ${i * 90}ms` }}/></span>
    <span className="w-20 shrink-0 text-right font-mono text-xs font-bold tnum">{format(row.value)}</span>
  </div>)}</div>;
});
