import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Coins, LogIn, LogOut, Rocket, UserRound, Wallet } from 'lucide-react';
import { useSession } from '@/lib/session';
import { useAccount, useAccountSync } from '@/lib/account';
import { useMarket } from '@/lib/market';
import { shortAddress, usd } from '@/lib/format';
import { cn } from '@/lib/utils';

const ethLabel = (value: number): string => value === 0 ? '0 ETH' : value < 0.0001 ? '<0.0001 ETH' : `${value.toFixed(4)} ETH`;

/** Top-right account control: "Sign in" (X, email, MetaMask or any wallet) or the signed-in creator with live claimable fees. */
export function AccountButton({ compact = false }: { compact?: boolean }) {
  useAccountSync();
  const session = useSession(); const account = useAccount(); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null;
  const [open, setOpen] = useState<boolean>(false); const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('mousedown', close); window.addEventListener('keydown', key); return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); }; }, [open]);
  if (!session.configured) return null;
  if (!session.authenticated) return <button onClick={() => session.login()} disabled={!session.ready} className={cn('press raised flex items-center gap-2 rounded-[16px] font-extrabold transition-opacity disabled:opacity-60', compact ? 'min-h-10 px-3 text-[12.5px]' : 'min-h-[52px] px-4 text-[14px]')} aria-label="Sign in or sign up">
    <LogIn size={compact ? 15 : 16} strokeWidth={2.5}/>{compact ? 'Sign in' : 'Sign in / Sign up'}
  </button>;
  const me = account.data; const claimable = me?.totalClaimableEth ?? 0;
  const name = me?.alias ?? (session.wallet ? shortAddress(session.wallet, 4, 4) : 'Account');
  return <div ref={root} className="relative">
    <button onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu" className={cn('press raised flex items-center gap-2 rounded-[16px] font-extrabold', compact ? 'min-h-10 pl-1.5 pr-2.5 text-[12px]' : 'min-h-[52px] pl-1.5 pr-3 text-[13px]')}>
      <span className={cn('flex items-center justify-center rounded-[12px] bg-ink text-white', compact ? 'size-7' : 'size-10')}><UserRound size={compact ? 14 : 17}/></span>
      {!compact && <span className="text-left leading-none"><span className="block max-w-[120px] truncate">{name}</span><span className="mt-1 flex items-center gap-1 font-mono text-[11px] font-bold text-ink/60"><span className={cn('size-1.5 rounded-full', claimable > 0 ? 'pulse-dot bg-up' : 'bg-ink/30')}/>{account.isPending ? '…' : `${ethLabel(claimable)} to claim`}</span></span>}
      {compact && claimable > 0 && <span className="pulse-dot size-2 rounded-full bg-up"/>}
      <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')}/>
    </button>
    {open && <div role="menu" className="glass-nav absolute right-0 top-[calc(100%+8px)] z-[80] w-[300px] overflow-hidden rounded-[22px] p-2">
      <div className="px-3 pb-2 pt-2"><p className="truncate text-[15px] font-extrabold">{name}</p>{session.wallet && <p className="mt-0.5 font-mono text-[11.5px] text-ink/60">{shortAddress(session.wallet, 6, 4)}</p>}</div>
      <div className="sunk mx-1 rounded-2xl px-3 py-3"><p className="stat-label !text-[11px]">Creator fees to claim</p><p className="mt-1 text-[22px] font-extrabold tnum">{ethLabel(claimable)}</p>{ethUsd && claimable > 0 && <p className="font-mono text-[11.5px] text-ink/60">≈ {usd(claimable * ethUsd)}</p>}<p className="mt-1 font-mono text-[11px] font-bold text-ink/55">{me ? `${me.launches.length} coin${me.launches.length === 1 ? '' : 's'} launched · ${me.wallets.length} wallet${me.wallets.length === 1 ? '' : 's'}` : 'Loading your coins…'}</p></div>
      <div className="mt-1.5 space-y-0.5">
        <Link to="/wallet" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl bg-ink px-3 text-[14px] font-extrabold text-white transition-transform hover:scale-[1.01]"><Wallet size={16}/>My wallet<span className="ml-auto font-mono text-[10px] font-bold uppercase text-white/60">Deposit · withdraw</span></Link>
        <Link to="/earnings" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-bold hover:bg-white/70"><Coins size={16}/>Claim creator fees</Link>
        <Link to="/earnings#launches" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-bold hover:bg-white/70"><Rocket size={16}/>My launches</Link>
        <Link to="/earnings#wallets" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-bold hover:bg-white/70"><UserRound size={16}/>Dev wallets</Link>
        <button onClick={() => { setOpen(false); session.logout(); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[14px] font-bold text-ink/70 hover:bg-white/70"><LogOut size={16}/>Sign out</button>
      </div>
    </div>}
  </div>;
}
