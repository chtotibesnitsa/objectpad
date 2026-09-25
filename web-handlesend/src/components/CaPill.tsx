import { useState } from 'react';
import { Check, Copy, Rocket } from 'lucide-react';
import { OBJECTPAD_CA } from '@/lib/brand';
import { copyText } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Wide $ObjectPad contract-address pill. Before the CA is set it reads "launching soon"; once VITE_OBJECTPAD_TOKEN_ADDRESS
 * is set it shows the CA and copies it on tap with a press animation and a COPIED pop-up.
 */
export function CaPill({ className }: { className?: string }) {
  const [copied, setCopied] = useState<number>(0);
  const live = Boolean(OBJECTPAD_CA);
  const copy = async () => {
    if (!OBJECTPAD_CA) return;
    if (await copyText(OBJECTPAD_CA)) { const key = Date.now(); setCopied(key); navigator.vibrate?.(15); setTimeout(() => setCopied(c => (c === key ? 0 : c)), 1600); }
  };
  return <div className={cn('relative w-full', className)}>
    <button type="button" onClick={() => void copy()} disabled={!live} aria-label={live ? 'Copy $ObjectPad contract address' : '$ObjectPad launching soon'}
      className={cn('ca-pill group flex min-h-[58px] w-full items-center gap-3 rounded-full py-2 pl-2 pr-5 text-left transition-transform duration-150', live ? 'raised active:scale-[0.97] cursor-pointer' : 'sunk cursor-default')}>
      <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-ink text-white">{copied ? <Check size={18} strokeWidth={3}/> : live ? <Copy size={17}/> : <Rocket size={17}/>}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-extrabold leading-tight">{live ? <>$ObjectPad is live! <span className="text-up">●</span></> : '$ObjectPad · launching soon'}</span>
        <span className="block truncate font-mono text-[12.5px] font-bold text-ink/60">{live ? `CA: ${OBJECTPAD_CA}` : 'CA: drops here at launch'}</span>
      </span>
      {live && <span className="hidden shrink-0 font-mono text-[11px] font-extrabold uppercase text-ink/55 sm:block">tap to copy</span>}
    </button>
    {copied > 0 && <span key={copied} role="status" className="ca-copied pointer-events-none absolute left-1/2 top-0 z-20 flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-mono text-[13px] font-extrabold uppercase tracking-wider text-white shadow-xl"><Check size={14} strokeWidth={3}/>Copied</span>}
  </div>;
}
