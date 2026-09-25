import { memo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Cuboid, Rocket } from 'lucide-react';
import type { BuildingCoin } from '@/shared/domain';
import { BuildLattice } from './BuildLattice';
import { cn } from '@/lib/utils';

const clock = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function useTick(): number { const [now, setNow] = useState<number>(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []); return now; }

/** Animated percentage: eases toward the real engine progress so jumps between polls feel continuous. */
function useEased(target: number): number {
  const [value, setValue] = useState<number>(target);
  useEffect(() => { let raf = 0; const step = () => { setValue(v => { const next = v + (target - v) * 0.12; if (Math.abs(target - next) < 0.2) return target; raf = requestAnimationFrame(step); return next; }); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [target]);
  return value;
}

/** The dark "3D model generating" stage: lattice dots locking in with the real engine percentage. */
export function BuildStage({ coin, className, big = false }: { coin: BuildingCoin; className?: string; big?: boolean }) {
  const now = useTick(); const shown = useEased(coin.progress); const launching = coin.state === 'launching'; const searching = coin.stage === 'AI check';
  return <div className={cn('relative overflow-hidden bg-[#0F1115] text-white', className)}>
    <div className="scan-grid pointer-events-none absolute inset-0 opacity-30 invert" aria-hidden="true"/>
    <BuildLattice progress={launching ? 100 : searching ? 0 : shown} mode={searching ? 'search' : 'build'} className="absolute inset-x-0 bottom-0 top-[10%] opacity-90 invert"/>
    <span className="incoming-sweep pointer-events-none absolute inset-0 opacity-40" aria-hidden="true"/>
    <div className={cn('absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 font-mono font-extrabold uppercase tracking-wider backdrop-blur', big ? 'text-[12px]' : 'text-[10.5px]')}>
      <span className="pulse-dot size-1.5 rounded-full bg-up"/>{launching ? 'Launching' : 'Generating 3D'}
    </div>
    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
      <div className="min-w-0"><p className={cn('truncate font-extrabold text-white/75', big ? 'text-[15px]' : 'text-[12.5px]')}>{coin.stage}<span className="build-dots"/></p><p className={cn('display tnum leading-none', big ? 'mt-1 text-6xl sm:text-7xl' : 'mt-0.5 text-[38px]')}>{launching ? <Rocket className="inline" size={big ? 52 : 30}/> : searching ? '…' : `${Math.round(shown)}%`}</p></div>
      <p className={cn('shrink-0 text-right font-mono font-bold text-white/55 tnum', big ? 'text-[13px]' : 'text-[11px]')}>elapsed<br/><span className="text-white">{clock(now - (coin.startedAt ?? coin.queuedAt))}</span></p>
    </div>
    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10"><div className="h-full bg-white transition-[width] duration-700" style={{ width: `${launching ? 100 : Math.max(3, shown)}%` }}/></div>
  </div>;
}

/** Coins-tab card for a coin that's sealed and still building: live dots + %, swaps to the real 3D model when done. */
export const BuildingCard = memo(function BuildingCard({ coin }: { coin: BuildingCoin }) {
  return <Link to={`/o/${coin.code}`} className="raised lift group card-pop block overflow-hidden rounded-[26px]">
    <div className="relative m-1.5 overflow-hidden rounded-[21px]"><BuildStage coin={coin} className="aspect-square w-full"/><span className="chip-dark absolute right-3 top-3 !bg-white !text-ink">${coin.symbol}</span></div>
    <div className="px-4 pb-4 pt-2">
      <div className="flex items-start justify-between gap-2"><h3 className="truncate text-[15px] font-extrabold leading-tight">{coin.name}</h3><ArrowUpRight size={16} className="shrink-0 text-ink/65 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"/></div>
      <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase text-ink/60"><Cuboid size={12}/>{coin.state === 'launching' ? 'Model ready · going live' : 'Launch sealed · goes live when built'}</p>
    </div>
  </Link>;
});
