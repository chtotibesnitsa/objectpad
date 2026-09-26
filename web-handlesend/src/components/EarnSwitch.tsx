import { Link, useLocation } from 'react-router-dom';
import { Megaphone, ScanLine } from 'lucide-react';
import { useRewardBoard } from '@/lib/rewards';
import { cn } from '@/lib/utils';

/** The Earn hub: one control to flip between getting paid for X posts and getting paid to find & scan objects. */
export function EarnSwitch({ className }: { className?: string }) {
  const { pathname } = useLocation(); const rewards = pathname.startsWith('/rewards'); const board = useRewardBoard();
  const open = board.data?.stats.openUsd;
  return <nav aria-label="Earn hub" className={cn('sunk relative grid w-full max-w-[520px] grid-cols-2 rounded-[22px] p-1', className)}>
    <span aria-hidden="true" className={cn('raised absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-[18px] transition-[left] duration-500 ease-[cubic-bezier(.2,.9,.25,1.15)]', rewards ? 'left-1/2' : 'left-1')}/>
    <Link to="/earn" aria-current={!rewards ? 'page' : undefined} className={cn('relative z-10 flex min-h-12 items-center justify-center gap-2 rounded-[18px] px-3 text-[14px] font-extrabold transition-colors', rewards ? 'text-ink/55 hover:text-ink' : 'text-ink')}><Megaphone size={16} strokeWidth={2.5}/>Post & earn</Link>
    <Link to="/rewards" aria-current={rewards ? 'page' : undefined} className={cn('relative z-10 flex min-h-12 items-center justify-center gap-2 rounded-[18px] px-3 text-[14px] font-extrabold transition-colors', rewards ? 'text-ink' : 'text-ink/55 hover:text-ink')}>
      <ScanLine size={16} strokeWidth={2.5}/>Paid Rewards
      {open !== undefined && open > 0 && <span className="rounded-full bg-up px-1.5 py-0.5 font-mono text-[10.5px] font-extrabold text-white tnum">${open.toLocaleString('en-US')}</span>}
    </Link>
  </nav>;
}
