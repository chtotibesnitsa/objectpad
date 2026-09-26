import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** The gold "V2" pill that sits next to the ObjectPad logo on every page. Opens the V2 release notes & developer log. */
export function V2Pill({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  return <Link to="/v2" aria-label="ObjectPad V2: release notes and developer log" title="ObjectPad V2 is live: see what's new" className={cn('v2-pill press relative inline-flex shrink-0 items-center gap-1 overflow-hidden rounded-full font-mono font-black uppercase tracking-[0.06em] text-[#3A2A05]', size === 'sm' ? 'h-[22px] px-2 text-[10.5px]' : 'h-[26px] px-2.5 text-[11.5px]', className)}>
    <span className="relative z-10">V2</span><span className="relative z-10 size-1.5 rounded-full bg-[#3A2A05]/70 pulse-dot"/>
  </Link>;
}
