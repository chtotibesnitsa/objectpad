import { useState, type ReactNode } from 'react';
import { EyeOff, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const KEY = 'objectpad:adult-ok';
function confirmed(): boolean { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } }

/** The "18+" tab button that sits beside the sort tabs. */
export function AdultTabButton({ on, onClick, className }: { on: boolean; onClick: () => void; className?: string }) {
  return <button type="button" onClick={onClick} aria-pressed={on} className={cn('press flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold', on ? 'bg-down text-white' : 'raised text-ink/70 hover:text-ink', className)}>
    <span className={cn('rounded-md px-1 py-px font-mono text-[10px] font-black', on ? 'bg-white/20' : 'bg-down/12 text-down')}>18+</span>NSFW
  </button>;
}

/** Shows an 18+ warning before revealing adult coins; the choice lasts for this browser session. */
export function AdultGate({ active, onLeave, children }: { active: boolean; onLeave: () => void; children: ReactNode }) {
  const [ok, setOk] = useState<boolean>(confirmed);
  if (!active || ok) return <>{children}</>;
  const accept = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ } setOk(true); };
  return <div className="raised mx-auto mt-6 max-w-lg rounded-[28px] p-7 text-center">
    <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-down/10 text-down"><ShieldAlert size={28}/></span>
    <p className="lab mt-5 justify-center">18+ · Adult content</p>
    <h2 className="display mt-3 text-[34px] leading-none">NSFW coins.</h2>
    <p className="mt-3 text-[15px] font-semibold text-ink/65">These coins have adult names or objects, flagged by keyword filters or our AI. They're kept out of the main market. Only continue if you're 18 or older.</p>
    <div className="mt-6 grid gap-2 sm:grid-cols-2">
      <button type="button" onClick={accept} className="btn press min-h-[52px] text-[15px]">I'm 18+, show them</button>
      <button type="button" onClick={onLeave} className="btn-ghost press min-h-[52px] text-[15px]"><EyeOff size={16}/>Take me back</button>
    </div>
  </div>;
}
