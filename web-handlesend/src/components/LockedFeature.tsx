import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ScanLine } from 'lucide-react';
import { usePreferences } from '@/hooks/use-preferences';
import { MEMES } from '@/lib/memes';
import { cn } from '@/lib/utils';

/** Liquid-glass padlock that swings on its shackle whenever it is touched. */
function GlassLock() {
  const [swing, setSwing] = useState<number>(0); const { play } = usePreferences();
  return <button type="button" onClick={() => { setSwing(s => s + 1); play('rejected'); }} onPointerEnter={() => setSwing(s => s + 1)} aria-label="Locked while in production" className="group relative mx-auto block w-[150px] sm:w-[190px]">
    <span key={swing} className={cn('block', swing ? 'lock-swing' : 'lock-idle')}>
      <svg viewBox="0 0 200 240" className="w-full drop-shadow-[0_30px_30px_rgba(20,24,40,.22)]" aria-hidden="true">
        <defs>
          <linearGradient id="lock-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffffff" stopOpacity=".96"/><stop offset="55%" stopColor="#EEF1F6" stopOpacity=".78"/><stop offset="100%" stopColor="#DCE1EA" stopOpacity=".85"/></linearGradient>
          <linearGradient id="lock-metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#8A909C"/><stop offset="50%" stopColor="#E9ECF1"/><stop offset="100%" stopColor="#7C828E"/></linearGradient>
          <linearGradient id="lock-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fff" stopOpacity="0"/><stop offset="50%" stopColor="#fff" stopOpacity=".95"/><stop offset="100%" stopColor="#fff" stopOpacity="0"/></linearGradient>
        </defs>
        <path d="M54 108V76a46 46 0 0 1 92 0v32" fill="none" stroke="url(#lock-metal)" strokeWidth="16" strokeLinecap="round"/>
        <rect x="20" y="100" width="160" height="128" rx="32" fill="url(#lock-glass)" stroke="#fff" strokeWidth="3"/>
        <rect x="20.5" y="100.5" width="159" height="127" rx="31.5" fill="none" stroke="#0C0D10" strokeOpacity=".08"/>
        <rect x="32" y="110" width="34" height="108" rx="16" fill="url(#lock-shine)" opacity=".75"/>
        <circle cx="100" cy="154" r="15" fill="#0C0D10"/><rect x="93" y="160" width="14" height="32" rx="6" fill="#0C0D10"/>
        <circle cx="100" cy="154" r="5" fill="#0C0D10"/>
      </svg>
    </span>
    <span className="mt-2 block font-mono text-[11.5px] uppercase tracking-widest text-muted group-hover:text-ink">Tap the lock</span>
  </button>;
}

/** Full-page lock for features still in production: three real scans orbiting a glass padlock, with a short explanation. */
export function LockedFeature({ eyebrow, title, lines, children }: { eyebrow: string; title: string; lines: string[]; image?: string; children?: ReactNode }) {
  const trio = [MEMES[1], MEMES[3], MEMES[5]];
  return <div className="page py-6 sm:py-10">
    <div className="glass relative overflow-hidden rounded-[32px]">
      <div className="scan-grid absolute inset-0" aria-hidden="true"/>
      <div className="relative grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1fr_auto] xl:px-14">
        <div>
          <span className="chip"><span className="pulse-signal size-1.5 rounded-full bg-ink"/>In production</span>
          <p className="spec mt-6">{eyebrow}</p>
          <h1 className="display mt-3 max-w-2xl text-[40px] sm:text-6xl">{title}</h1>
          <ul className="mt-7 max-w-lg space-y-2">{lines.map((line, i) => <li key={line} className="flex items-center gap-3 rounded-2xl bg-white/55 p-3 shadow-[0_0_0_1px_rgba(12,13,16,.04)]"><span className="display flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-sm text-white">{i + 1}</span><span className="text-[15px] font-medium">{line}</span></li>)}</ul>
          <div className="mt-7 flex flex-wrap gap-2.5"><Link to="/launch" className="press flex min-h-12 items-center gap-2 btn px-5 text-sm font-semibold "><ScanLine size={16}/>Scan an object now</Link><Link to="/docs" className="press flex min-h-12 items-center gap-2 rounded-full bg-white/80 px-5 text-sm font-medium shadow-[0_0_0_1px_rgba(12,13,16,.08)]">How it works<ArrowUpRight size={15}/></Link></div>
          {children}
        </div>
        <div className="relative mx-auto flex size-[320px] items-center justify-center sm:size-[400px]">
          <div className="orbit-ring inset-4 spin-slow" aria-hidden="true"/><div className="orbit-ring inset-16 spin-slow [animation-direction:reverse]" aria-hidden="true"/>
          {trio.map((item, i) => { const angle = (i / 3) * Math.PI * 2 - Math.PI / 2; return <img key={item.id} src={item.image} alt="" aria-hidden="true" className="bob absolute w-24 opacity-55 blur-[1.5px] sm:w-28" style={{ left: `calc(50% + ${Math.cos(angle) * 40}% - 48px)`, top: `calc(50% + ${Math.sin(angle) * 40}% - 48px)`, '--bob': `${i * -1.4}s` } as React.CSSProperties}/>; })}
          <GlassLock/>
        </div>
      </div>
    </div>
  </div>;
}
