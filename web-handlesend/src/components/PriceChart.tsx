import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, CrosshairMode, HistogramSeries, LineSeries, LineStyle, type IChartApi, type ISeriesApi, type MouseEventParams, type Time, type UTCTimestamp } from 'lightweight-charts';
import { Maximize2 } from 'lucide-react';
import { tinyUsd, usd } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One decoded curve trade. `price` is ETH per token. */
export interface ChartTrade { id: string; side: 'buy' | 'sell'; price: number; eth: number; at: number; }
interface Candle { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number; buys: number; }

const UP = '#0E9F6E'; const DOWN = '#E5484D'; const SUPPLY = 1_000_000_000;
const INTERVALS: { label: string; seconds: number }[] = [{ label: '1m', seconds: 60 }, { label: '5m', seconds: 300 }, { label: '15m', seconds: 900 }, { label: '1h', seconds: 3600 }, { label: '4h', seconds: 14_400 }, { label: '1D', seconds: 86_400 }];

/** Buckets trades into OHLC candles; each candle opens at the previous close, like every trading terminal. */
function bucket(trades: ChartTrade[], seconds: number, scale: number): Candle[] {
  const out: Candle[] = []; let prev: number | null = null;
  for (const t of trades) {
    const value = t.price * scale; const time = (Math.floor(t.at / 1000 / seconds) * seconds) as UTCTimestamp; const last = out[out.length - 1];
    if (last && last.time === time) { last.high = Math.max(last.high, value); last.low = Math.min(last.low, value); last.close = value; last.volume += t.eth; if (t.side === 'buy') last.buys += t.eth; }
    else { const open = prev ?? value; out.push({ time, open, high: Math.max(open, value), low: Math.min(open, value), close: value, volume: t.eth, buys: t.side === 'buy' ? t.eth : 0 }); }
    prev = value;
  }
  return out;
}
const sma = (list: Candle[], n: number) => list.flatMap((c, i) => i < n - 1 ? [] : [{ time: c.time, value: list.slice(i - n + 1, i + 1).reduce((s, x) => s + x.close, 0) / n }]);
/** Picks the timeframe that gives a readable number of candles for this coin's history. */
function autoInterval(trades: ChartTrade[]): number { if (trades.length < 2) return 0; const span = (trades[trades.length - 1].at - trades[0].at) / 1000; const i = INTERVALS.findIndex(x => span / x.seconds <= 150); return i < 0 ? INTERVALS.length - 1 : i; }

/**
 * TradingView-grade candlestick chart built only from real, decoded curve trades: drag to pan, scroll or pinch to zoom,
 * crosshair with OHLC readout, timeframes, price or market-cap view, MA7/MA25 and a volume pane. Updates live in place.
 */
export const PriceChart = memo(function PriceChart({ trades, ethUsd, className, live = true }: { trades: ChartTrade[]; ethUsd: number | null; className?: string; live?: boolean }) {
  const host = useRef<HTMLDivElement>(null); const chart = useRef<IChartApi | null>(null);
  const series = useRef<{ candles: ISeriesApi<'Candlestick'>; volume: ISeriesApi<'Histogram'>; ma7: ISeriesApi<'Line'>; ma25: ISeriesApi<'Line'> } | null>(null);
  const sorted = useMemo(() => trades.filter(t => t.price > 0).sort((a, b) => a.at - b.at), [trades]);
  const [interval, setInterval] = useState<number | null>(null); const [mode, setMode] = useState<'mcap' | 'price'>('mcap');
  const [hover, setHover] = useState<Candle | null>(null); const fitted = useRef<string>('');
  const active = interval ?? autoInterval(sorted);
  // Plotted values are market cap (price × supply) in USD or ETH: large, readable numbers. Price view divides back down.
  const unit = ethUsd ?? 1; const scale = SUPPLY * unit;
  const candles = useMemo(() => bucket(sorted, INTERVALS[active].seconds, scale), [sorted, active, scale]);
  const fmtRef = useRef<(v: number) => string>(() => '');
  fmtRef.current = (v: number) => { if (mode === 'price') { const p = v / SUPPLY; return ethUsd ? tinyUsd(p) : `${p.toExponential(3)} Ξ`; } return ethUsd ? usd(v, v >= 1000 ? 1 : 2) : `${v.toPrecision(4)} Ξ`; };

  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      autoSize: true, layout: { background: { type: ColorType.Solid, color: '#FFFFFF' }, textColor: 'rgba(12,13,16,.62)', fontFamily: 'Geist Mono, ui-monospace, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: 'rgba(12,13,16,.05)' }, horzLines: { color: 'rgba(12,13,16,.05)' } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(12,13,16,.45)', style: LineStyle.Dashed, labelBackgroundColor: '#1B1D22' }, horzLine: { color: 'rgba(12,13,16,.45)', style: LineStyle.Dashed, labelBackgroundColor: '#1B1D22' } },
      rightPriceScale: { borderColor: 'rgba(12,13,16,.1)', scaleMargins: { top: 0.12, bottom: 0.26 } },
      timeScale: { borderColor: 'rgba(12,13,16,.1)', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 10, minBarSpacing: 2 },
      localization: { priceFormatter: (v: number) => fmtRef.current(v) },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }, handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
    });
    const format = { type: 'custom' as const, formatter: (v: number) => fmtRef.current(v), minMove: 1e-9 };
    const candlesSeries = c.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN, priceFormat: format, priceLineStyle: LineStyle.Dashed });
    const volume = c.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'custom', formatter: (v: number) => ethUsd ? usd(v) : `${v.toFixed(4)} Ξ`, minMove: 1e-9 }, lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const ma7 = c.addSeries(LineSeries, { color: '#E0A100', lineWidth: 2, priceFormat: format, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const ma25 = c.addSeries(LineSeries, { color: '#5B6CFF', lineWidth: 2, priceFormat: format, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    chart.current = c; series.current = { candles: candlesSeries, volume, ma7, ma25 };
    const onMove = (param: MouseEventParams<Time>) => { const d = param.seriesData.get(candlesSeries) as { time: UTCTimestamp; open: number; high: number; low: number; close: number } | undefined; const v = param.seriesData.get(volume) as { value: number } | undefined; setHover(d && 'open' in d ? { ...d, volume: v?.value ?? 0, buys: 0 } : null); };
    c.subscribeCrosshairMove(onMove);
    return () => { c.unsubscribeCrosshairMove(onMove); c.remove(); chart.current = null; series.current = null; };
  }, [ethUsd]);

  useEffect(() => {
    const s = series.current; const c = chart.current; if (!s || !c) return;
    s.candles.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    s.volume.setData(candles.map(k => ({ time: k.time, value: k.volume * unit, color: k.close >= k.open ? 'rgba(14,159,110,.35)' : 'rgba(229,72,77,.35)' })));
    s.ma7.setData(sma(candles, 7)); s.ma25.setData(sma(candles, 25));
    const key = `${active}|${mode}|${Boolean(candles.length)}`; if (fitted.current !== key && candles.length) { fitted.current = key; c.timeScale().fitContent(); if (candles.length > 120) c.timeScale().setVisibleLogicalRange({ from: candles.length - 120, to: candles.length + 6 }); }
    c.priceScale('right').applyOptions({ autoScale: true });
  }, [candles, unit, active, mode]);

  const last = candles[candles.length - 1]; const shown = hover ?? last; const up = shown ? shown.close >= shown.open : true;
  const change = candles.length && candles[0].open ? ((last.close - candles[0].open) / candles[0].open) * 100 : 0;
  return <div className={cn('relative flex flex-col', className)}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-h-8 flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[12px] font-bold text-ink/60 tnum">
        {shown ? <>{(['open', 'high', 'low', 'close'] as const).map(k => <span key={k}>{k[0].toUpperCase()} <b className={up ? 'text-up' : 'text-down'}>{fmtRef.current(shown[k])}</b></span>)}<span className={cn('rounded-md px-1.5 py-0.5', up ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>{up ? '+' : ''}{shown.open ? (((shown.close - shown.open) / shown.open) * 100).toFixed(2) : '0.00'}%</span></> : <span>Waiting for the first trade</span>}
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-[#E0A100]"/>MA7</span><span className="flex items-center gap-1.5"><i className="h-0.5 w-4 rounded bg-[#5B6CFF]"/>MA25</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="sunk flex rounded-xl p-0.5 font-mono text-[11.5px] font-extrabold">{(['mcap', 'price'] as const).map(m => <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={cn('min-h-8 rounded-[10px] px-2.5 transition-all', mode === m ? 'raised text-ink' : 'text-ink/55 hover:text-ink')}>{m === 'mcap' ? 'MCap' : 'Price'}</button>)}</div>
        <div className="sunk flex rounded-xl p-0.5 font-mono text-[11.5px] font-extrabold">{INTERVALS.map((r, i) => <button key={r.label} type="button" onClick={() => setInterval(i)} aria-pressed={active === i} className={cn('min-h-8 rounded-[10px] px-2 transition-all sm:px-2.5', active === i ? 'raised text-ink' : 'text-ink/55 hover:text-ink')}>{r.label}</button>)}</div>
        <button type="button" onClick={() => { chart.current?.timeScale().fitContent(); chart.current?.priceScale('right').applyOptions({ autoScale: true }); }} className="sunk flex size-9 items-center justify-center rounded-xl text-ink/65 hover:text-ink" aria-label="Fit chart" title="Fit chart"><Maximize2 size={14}/></button>
      </div>
    </div>
    <div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-[inset_0_0_0_1px_rgba(12,13,16,.08)]">
      <div ref={host} className="absolute inset-0 cursor-crosshair touch-pan-y" aria-label={`Interactive candlestick chart, ${sorted.length} trades`}/>
      {!candles.length && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"><p className="text-base font-extrabold">No trades yet.</p><p className="mt-1 max-w-xs text-sm font-semibold text-ink/65">The first buy draws the first candle, live.</p></div>}
    </div>
    <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[11.5px] font-bold text-ink/55"><span className="flex items-center gap-1.5">{live && <span className="pulse-dot size-1.5 rounded-full bg-up"/>}{sorted.length.toLocaleString()} on-chain trades · {candles.length} candles · drag, scroll, pinch</span><span className={change >= 0 ? 'text-up' : 'text-down'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}% since launch</span></div>
  </div>;
});
