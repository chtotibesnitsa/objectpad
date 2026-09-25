import { memo, useMemo, useState } from 'react';
import { tinyUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One decoded curve trade. `price` is ETH per token. */
export interface ChartTrade { id: string; side: 'buy' | 'sell'; price: number; eth: number; at: number; }
interface Candle { open: number; high: number; low: number; close: number; volume: number; buys: number; start: number; end: number; }

const priceText = (eth: number, ethUsd: number | null): string => ethUsd ? tinyUsd(eth * ethUsd) : eth >= 0.0001 ? `${eth.toPrecision(3)} ETH` : `${eth.toExponential(2)} ETH`;
const W = 1000; const H = 460; const PAD_R = 86; const TOP = 14; const PRICE_H = 310; const VOL_TOP = 342; const VOL_H = 88; const AXIS_Y = H - 6;
const UP = '#0E9F6E'; const DOWN = '#E5484D';
const RANGES: { label: string; hours: number; count: number }[] = [{ label: '1H', hours: 1, count: 40 }, { label: '6H', hours: 6, count: 60 }, { label: '1D', hours: 24, count: 72 }, { label: 'ALL', hours: 0, count: 90 }];

/** Buckets trades into OHLC candles by time. Buckets without trades carry the previous close forward as a flat doji. */
function candles(trades: ChartTrade[], count: number): Candle[] {
  const first = trades[0].at; const last = trades[trades.length - 1].at; const span = Math.max(1, last - first) / count; const out: Candle[] = []; let k = 0; let prev = trades[0].price;
  for (let i = 0; i < count; i++) {
    const start = first + i * span; const end = i === count - 1 ? last + 1 : start + span; const open = prev; let high = open; let low = open; let close = open; let volume = 0; let buys = 0;
    while (k < trades.length && trades[k].at < end) { const t = trades[k]; high = Math.max(high, t.price); low = Math.min(low, t.price); close = t.price; volume += t.eth; if (t.side === 'buy') buys += t.eth; k++; }
    out.push({ open, high, low, close, volume, buys, start, end }); prev = close;
  }
  return out;
}
const ma = (list: Candle[], n: number): (number | null)[] => list.map((_, i) => i < n - 1 ? null : list.slice(i - n + 1, i + 1).reduce((s, c) => s + c.close, 0) / n);
const timeLabel = (ms: number, spanHours: number): string => new Date(ms).toLocaleString(undefined, spanHours > 30 ? { month: 'short', day: 'numeric' } : { hour: '2-digit', minute: '2-digit' });

/**
 * Trading-terminal candlestick chart drawn only from decoded curve trades: OHLC candles, MA7/MA25, a volume pane, a
 * time axis, a live last-price tag and a crosshair with price and time readouts. An empty history is shown as empty.
 */
export const PriceChart = memo(function PriceChart({ trades, ethUsd, className }: { trades: ChartTrade[]; ethUsd: number | null; className?: string }) {
  const [hover, setHover] = useState<{ i: number; y: number } | null>(null); const [range, setRange] = useState<number>(3);
  const series = useMemo(() => trades.filter(t => t.price > 0).sort((a, b) => a.at - b.at), [trades]);
  const model = useMemo(() => {
    const r = RANGES[range]; const cut = r.hours ? series[series.length - 1]?.at - r.hours * 3_600_000 : -Infinity;
    const scoped = series.filter(t => t.at >= cut); const use = scoped.length >= 2 ? scoped : series;
    if (use.length < 2) return null;
    const list = candles(use, Math.min(r.count, Math.max(8, use.length)));
    const hi = Math.max(...list.map(c => c.high)); const lo = Math.min(...list.map(c => c.low)); const pad = (hi - lo || hi * 0.05) * 0.1; const top = hi + pad; const bottom = Math.max(0, lo - pad);
    const y = (p: number) => TOP + (1 - (p - bottom) / (top - bottom || 1)) * PRICE_H; const price = (py: number) => bottom + (1 - (py - TOP) / PRICE_H) * (top - bottom);
    const maxVol = Math.max(...list.map(c => c.volume), 1e-12); const step = (W - PAD_R) / list.length; const ticks = Array.from({ length: 6 }, (_, i) => bottom + ((top - bottom) * i) / 5);
    const line = (vals: (number | null)[]) => vals.map((v, i) => v === null ? '' : `${vals[i - 1] == null ? 'M' : 'L'}${(i * step + step / 2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const spanHours = (list[list.length - 1].end - list[0].start) / 3_600_000;
    return { list, y, price, step, maxVol, ticks, ma7: line(ma(list, 7)), ma25: line(ma(list, 25)), spanHours, change: ((list[list.length - 1].close - list[0].open) / list[0].open) * 100, volume: list.reduce((s, c) => s + c.volume, 0) };
  }, [series, range]);
  if (!model) return <div className={cn('sunk flex flex-col items-center justify-center rounded-2xl text-center', className)}><p className="text-base font-extrabold">Not enough trades to chart yet.</p><p className="mt-1 max-w-xs text-sm font-semibold text-ink/65">Candles appear after two confirmed trades. Nothing is estimated.</p></div>;
  const active = model.list[hover?.i ?? model.list.length - 1]; const up = active.close >= active.open; const last = model.list[model.list.length - 1]; const lastUp = last.close >= last.open;
  const cols = Array.from({ length: 6 }, (_, i) => Math.round((i / 5) * (model.list.length - 1)));
  return <div className={cn('relative flex flex-col', className)}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12.5px] font-bold text-ink/65 tnum">
        <span>O <b className={up ? 'text-up' : 'text-down'}>{priceText(active.open, ethUsd)}</b></span><span>H <b className={up ? 'text-up' : 'text-down'}>{priceText(active.high, ethUsd)}</b></span><span>L <b className={up ? 'text-up' : 'text-down'}>{priceText(active.low, ethUsd)}</b></span><span>C <b className={up ? 'text-up' : 'text-down'}>{priceText(active.close, ethUsd)}</b></span>
        <span className={cn('rounded-md px-1.5 py-0.5', up ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>{up ? '+' : ''}{((active.close - active.open) / active.open * 100).toFixed(2)}%</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-[#E0A100]"/>MA7</span><span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-[#5B6CFF]"/>MA25</span>
      </div>
      <div className="sunk flex rounded-xl p-0.5 font-mono text-[12px] font-extrabold">{RANGES.map((r, i) => <button key={r.label} onClick={() => setRange(i)} className={cn('min-h-9 rounded-[10px] px-3 transition-all', range === i ? 'raised text-ink' : 'text-ink/60 hover:text-ink')}>{r.label}</button>)}</div>
    </div>
    <div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-[inset_0_0_0_1px_rgba(12,13,16,.08)]">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full cursor-crosshair" role="img" aria-label={`Candlestick chart, ${series.length} trades, ${model.change >= 0 ? 'up' : 'down'} ${Math.abs(model.change).toFixed(1)}%`} onMouseLeave={() => setHover(null)} onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); const x = ((event.clientX - rect.left) / rect.width) * W; const y = ((event.clientY - rect.top) / rect.height) * H; if (x > W - PAD_R) return setHover(null); setHover({ i: Math.max(0, Math.min(model.list.length - 1, Math.floor(x / model.step))), y }); }}>
        {model.ticks.map(t => <line key={t} x1="0" x2={W - PAD_R} y1={model.y(t)} y2={model.y(t)} stroke="#0C0D10" strokeOpacity=".06" vectorEffect="non-scaling-stroke"/>)}
        {cols.map(i => <line key={i} x1={i * model.step + model.step / 2} x2={i * model.step + model.step / 2} y1={TOP} y2={VOL_TOP + VOL_H} stroke="#0C0D10" strokeOpacity=".05" vectorEffect="non-scaling-stroke"/>)}
        <line x1="0" x2={W} y1={VOL_TOP - 8} y2={VOL_TOP - 8} stroke="#0C0D10" strokeOpacity=".1" vectorEffect="non-scaling-stroke"/>
        <line x1={W - PAD_R} x2={W - PAD_R} y1="0" y2={H} stroke="#0C0D10" strokeOpacity=".1" vectorEffect="non-scaling-stroke"/>
        <rect x={W - PAD_R} y="0" width={PAD_R} height={H} fill="#F7F8FA"/>
        {model.ticks.map(t => <text key={t} x={W - PAD_R + 8} y={model.y(t) + 4} fontSize="12.5" fontFamily="Geist Mono, monospace" fontWeight="700" fill="#0C0D10" fillOpacity=".62">{priceText(t, ethUsd)}</text>)}
        {model.list.map((c, i) => { const x = i * model.step + model.step / 2; const rise = c.close >= c.open; const color = rise ? UP : DOWN; const bodyTop = model.y(Math.max(c.open, c.close)); const bodyH = Math.max(1.5, Math.abs(model.y(c.open) - model.y(c.close))); const vh = (c.volume / model.maxVol) * VOL_H; const bw = Math.max(2, model.step * 0.68);
          return <g key={c.start} opacity={hover === null || hover.i === i ? 1 : 0.7}>
            <line x1={x} x2={x} y1={model.y(c.high)} y2={model.y(c.low)} stroke={color} strokeWidth="1.3" vectorEffect="non-scaling-stroke"/>
            <rect x={x - bw / 2} y={bodyTop} width={bw} height={bodyH} rx="0.8" fill={color}/>
            {c.volume > 0 && <rect x={x - bw / 2} y={VOL_TOP + VOL_H - vh} width={bw} height={vh} fill={color} fillOpacity=".38"/>}
          </g>; })}
        <path d={model.ma25} fill="none" stroke="#5B6CFF" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>
        <path d={model.ma7} fill="none" stroke="#E0A100" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>
        <line x1="0" x2={W - PAD_R} y1={model.y(last.close)} y2={model.y(last.close)} stroke={lastUp ? UP : DOWN} strokeOpacity=".75" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"/>
        <rect x={W - PAD_R + 1} y={model.y(last.close) - 11} width={PAD_R - 2} height="22" rx="4" fill={lastUp ? UP : DOWN}/>
        <text x={W - PAD_R + 8} y={model.y(last.close) + 4.5} fontSize="12.5" fontFamily="Geist Mono, monospace" fontWeight="800" fill="#fff">{priceText(last.close, ethUsd)}</text>
        <text x={W - PAD_R + 8} y={VOL_TOP + 12} fontSize="11.5" fontFamily="Geist Mono, monospace" fontWeight="700" fill="#0C0D10" fillOpacity=".55">VOL</text>
        {cols.map(i => <text key={`t${i}`} x={Math.min(W - PAD_R - 40, Math.max(4, i * model.step + model.step / 2 - 20))} y={AXIS_Y} fontSize="11.5" fontFamily="Geist Mono, monospace" fontWeight="700" fill="#0C0D10" fillOpacity=".55">{timeLabel(model.list[i].start, model.spanHours)}</text>)}
        {hover && <g pointerEvents="none">
          <line x1={hover.i * model.step + model.step / 2} x2={hover.i * model.step + model.step / 2} y1={TOP} y2={VOL_TOP + VOL_H} stroke="#0C0D10" strokeOpacity=".45" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"/>
          {hover.y < TOP + PRICE_H && <><line x1="0" x2={W - PAD_R} y1={hover.y} y2={hover.y} stroke="#0C0D10" strokeOpacity=".45" strokeDasharray="4 4" vectorEffect="non-scaling-stroke"/><rect x={W - PAD_R + 1} y={hover.y - 11} width={PAD_R - 2} height="22" rx="4" fill="#1B1D22"/><text x={W - PAD_R + 8} y={hover.y + 4.5} fontSize="12.5" fontFamily="Geist Mono, monospace" fontWeight="800" fill="#fff">{priceText(model.price(hover.y), ethUsd)}</text></>}
        </g>}
      </svg>
      {hover && <span className="pointer-events-none absolute bottom-1 rounded-md bg-graphite px-2 py-0.5 font-mono text-[11.5px] font-bold text-white" style={{ left: `calc(${((hover.i * model.step + model.step / 2) / W) * 100}% - 44px)` }}>{new Date(active.end).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
    </div>
    <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[12px] font-bold text-ink/60"><span>{series.length.toLocaleString()} trades · {model.list.length} candles</span><span>Range {model.change >= 0 ? '+' : ''}{model.change.toFixed(2)}% · vol {model.volume.toFixed(2)} ETH</span></div>
  </div>;
});
