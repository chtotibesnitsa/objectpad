import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChartLine, ChevronLeft, House, ScanLine, Sparkle, Trophy, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Feedback } from './feedback';
import { useApp, TABS, type Tab } from './store';
import { img, VoxelField } from './ui';

/** Keeps a sheet mounted while its exit animation plays. */
function usePresence(open: boolean, ms = 300): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState<boolean>(open); const [closing, setClosing] = useState<boolean>(false);
  useEffect(() => { if (open) { setMounted(true); setClosing(false); return; } if (!mounted) return; setClosing(true); const t = setTimeout(() => { setMounted(false); setClosing(false); }, ms); return () => clearTimeout(t); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return { mounted, closing };
}

/** Bottom sheet with a grabber, swipe-down to dismiss and a spring entrance (the iOS `.sheet` with large detents). */
export function Sheet({ open, onClose, children, height = 'large', className }: { open: boolean; onClose: () => void; children: ReactNode; height?: 'large' | 'medium' | 'auto'; className?: string }) {
  const { mounted, closing } = usePresence(open); const [drag, setDrag] = useState<number>(0); const start = useRef<number | null>(null);
  useEffect(() => { if (!open) return; const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [open, onClose]);
  if (!mounted) return null;
  const h = height === 'large' ? 'calc(100% - max(44px, env(safe-area-inset-top)) - 10px)' : height === 'medium' ? '56%' : undefined;
  return <>
    <div className={cn('ap-backdrop ap-fixed', closing && 'out')} onClick={onClose}/>
    <div role="dialog" aria-modal="true" className={cn('ap-sheet ap-fixed', closing && 'out', className)} style={{ height: h, maxHeight: 'calc(100% - 20px)', transform: drag ? `translateY(${drag}px)` : undefined, transition: start.current === null ? 'transform .3s cubic-bezier(.22,1.1,.36,1)' : 'none' }}>
      <div className="flex shrink-0 touch-none justify-center pb-1 pt-2" onPointerDown={e => { start.current = e.clientY; (e.target as HTMLElement).setPointerCapture(e.pointerId); }} onPointerMove={e => { if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current)); }} onPointerUp={() => { const d = drag; start.current = null; setDrag(0); if (d > 110) onClose(); }} onPointerCancel={() => { start.current = null; setDrag(0); }}>
        <span className="h-[5px] w-10 rounded-full bg-ink/15"/>
      </div>
      <div className="ap-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(16px,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  </>;
}
/** Full-screen cover that slides up (the iOS `.fullScreenCover`). */
export function Cover({ open, children, dark = false }: { open: boolean; children: ReactNode; dark?: boolean }) {
  const { mounted, closing } = usePresence(open);
  if (!mounted) return null;
  return <div className={cn('ap-cover ap-fixed overflow-hidden', closing && 'out', dark ? 'bg-black text-white' : 'bg-[#ECEEF1]')}>{children}</div>;
}
/** Sheet header row: title and a Done button (iOS navigation-bar-in-sheet). */
export function SheetHeader({ title, onDone, done = 'Done' }: { title: string; onDone: () => void; done?: string }) {
  return <div className="relative flex h-11 items-center justify-center px-4"><p className="text-[16px] font-extrabold">{title}</p><button type="button" onClick={onDone} className="ap-press absolute right-4 text-[16px] font-bold text-ink">{done}</button></div>;
}

/** Pushed screen with an inline, blurred navigation bar (back chevron, centered title, trailing actions). */
export function PushScreen({ title, trailing, children, background }: { title?: ReactNode; trailing?: ReactNode; children: ReactNode; background?: string }) {
  const app = useApp();
  return <div className="ap-push min-h-[100dvh]" style={{ background }}>
    <div className="ap-navbar"><div className="relative flex h-11 items-center justify-between px-2">
      <button type="button" aria-label="Back" onPointerDown={() => Feedback.tap(false)} onClick={app.back} className="ap-press flex h-11 items-center gap-0.5 pr-3 text-[17px] font-semibold text-ink"><ChevronLeft size={26} strokeWidth={2.4}/>Back</button>
      {title && <div className="pointer-events-none absolute inset-x-24 truncate text-center text-[16px] font-extrabold">{title}</div>}
      <div className="flex items-center gap-1 pr-2">{trailing}</div>
    </div></div>
    {children}
  </div>;
}
/** Root tab screen: content starts under the status bar, leaves room for the floating tab bar. */
export function RootScreen({ children }: { children: ReactNode }) {
  return <div className="ap-fade min-h-[100dvh] px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))]">{children}</div>;
}

const TAB_META: Record<Tab, { title: string; icon: LucideIcon }> = { home: { title: 'Home', icon: House }, market: { title: 'Market', icon: ChartLine }, scan: { title: 'Scan', icon: ScanLine }, rewards: { title: 'Rewards', icon: Trophy }, wallet: { title: 'Wallet', icon: Wallet } };
/** Floating liquid-glass tab bar with a raised scan button and a sliding selection blob. */
export function TabBar() {
  const app = useApp(); const shown = TABS; const index = shown.indexOf(app.tab);
  return <nav className="ap-tabbar ap-fixed" aria-label="Tabs"><div className="ap-glass relative flex rounded-full p-1.5 shadow-[0_10px_24px_rgba(12,13,16,.14)]">
    {index >= 0 && app.tab !== 'scan' && <span className="absolute bottom-1.5 top-1.5 rounded-full bg-ink/[0.07] transition-transform duration-[350ms] [transition-timing-function:cubic-bezier(.34,1.3,.64,1)]" style={{ left: 6, width: 'calc((100% - 12px) / 5 - 8px)', marginLeft: 4, transform: `translateX(calc(${index} * (100% + 8px)))` }}/>}
    {shown.map(t => {
      if (t === 'scan') return <button key={t} type="button" aria-label="Scan an object" onPointerDown={() => Feedback.tap()} onClick={() => app.selectTab(t)} className="ap-press relative flex flex-1 items-center justify-center">
        <span className="ap-scan-pulse absolute size-[66px] rounded-full bg-[#2F7BF2]/35"/>
        <span className="relative flex size-[60px] items-center justify-center rounded-full bg-gradient-to-b from-[#1B1D22] to-[#0C0D10] text-white shadow-[0_6px_12px_rgba(12,13,16,.35)] ring-1 ring-white/20"><ScanLine size={24} strokeWidth={2.6}/><Sparkle size={10} fill="#6FB2FF" stroke="#6FB2FF" className="absolute right-[15px] top-[15px]"/></span>
      </button>;
      const on = app.tab === t; const M = TAB_META[t];
      return <button key={t} type="button" onClick={() => app.selectTab(t)} className={cn('ap-press ap-quiet relative z-10 flex min-h-[54px] flex-1 flex-col items-center justify-center gap-[3px]', on ? 'text-ink' : 'text-[#6A6E78]')}>
        <M.icon key={on ? 'on' : 'off'} size={20} strokeWidth={on ? 2.6 : 2.2} className={on ? 'ap-bounce' : ''}/><span className="ap-mono text-[9.5px] font-extrabold">{M.title}</span>
      </button>;
    })}
  </div></nav>;
}
export function Toast() {
  const { toast } = useApp(); if (!toast) return null;
  return <div className="ap-fixed pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center pt-[max(8px,env(safe-area-inset-top))]"><div key={toast} className="ap-toast rounded-full bg-ink px-[18px] py-3 text-[14px] font-extrabold text-white shadow-[0_8px_16px_rgba(12,13,16,.3)]">{toast}</div></div>;
}

/** Launch sequence: the duck rises onto its glass pedestal while the wordmark decodes from glyphs. */
export function Splash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<number>(0); const [word, setWord] = useState<string>(''); const [leaving, setLeaving] = useState<boolean>(false);
  useEffect(() => {
    const target = 'ObjectPad'; const glyphs = '01#Ξ░▒▓<>/*'; let frame = 0; let cancelled = false;
    const t0 = setTimeout(() => { setPhase(1); Feedback.play('model', 0.35); }, 30);
    const tick = setInterval(() => { if (cancelled) return; frame++; setWord([...target].map((c, i) => (i < frame - 6 ? c : i < frame ? glyphs[Math.floor(Math.random() * glyphs.length)] : ' ')).join('')); if (frame > target.length + 6) { clearInterval(tick); setWord(target); setPhase(2); setTimeout(() => setLeaving(true), 650); setTimeout(onDone, 1150); } }, 40);
    return () => { cancelled = true; clearTimeout(t0); clearInterval(tick); };
  }, [onDone]);
  return <div className={cn('ap-fixed fixed inset-0 z-[200] flex flex-col items-center justify-center gap-[18px] transition-opacity duration-500', leaving && 'opacity-0')} style={{ background: 'linear-gradient(135deg,#2C2F36,#17191E 55%,#111216)' }}>
    <div className={cn('absolute inset-0 transition-opacity duration-700', phase >= 1 ? 'opacity-90' : 'opacity-0')}><VoxelField count={30} seed={5}/></div>
    <img src={img('rubber_duck_voxel_dissolve')} alt="" className="relative w-[220px] transition-all duration-[800ms] [transition-timing-function:cubic-bezier(.34,1.4,.64,1)]" style={{ transform: phase >= 1 ? 'none' : 'translateY(60px) scale(.6)', opacity: phase >= 1 ? 1 : 0, filter: 'drop-shadow(0 0 40px rgba(47,123,242,.6))' }}/>
    <p className="ap-display relative h-11 whitespace-pre text-[40px] text-white">{word}</p>
    <p className="ap-mono relative text-[11px] font-extrabold tracking-[0.18em] text-white transition-opacity duration-500" style={{ opacity: phase >= 2 ? 0.6 : 0 }}>SCAN ANYTHING · LAUNCH A COIN</p>
  </div>;
}
