import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { BadgeCheck, ChevronDown, Handshake, ShieldCheck, Users, X } from 'lucide-react';
import { AFFILIATION_LABEL, type Affiliation, type Vault } from '@/lib/vaults';
import { cn } from '@/lib/utils';

export const pct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

export function Change({ v, big = false }: { v: number; big?: boolean }) {
  return <span className={cn('inline-flex items-center rounded-full font-mono font-extrabold tnum', big ? 'px-3 py-1 text-[15px]' : 'px-2 py-0.5 text-[12px]', v >= 0 ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>{v >= 0 ? '▲' : '▼'} {pct(v)}</span>;
}

/** Five constituent icons, then +N. */
export function Logos({ vault, size = 34, max = 5 }: { vault: Pick<Vault, 'constituents'>; size?: number; max?: number }) {
  const extra = vault.constituents.length - max;
  return <div className="flex -space-x-2.5">{vault.constituents.slice(0, max).map((c, i) => <img key={c.token} src={c.logo} alt={c.symbol} loading="lazy" className="vault-logo rounded-full bg-white object-cover ring-2 ring-white" style={{ width: size, height: size, ['--i' as string]: i }}/>)}{extra > 0 && <span className="flex items-center justify-center rounded-full bg-ink font-mono text-[11px] font-bold text-white ring-2 ring-white" style={{ width: size, height: size }}>+{extra}</span>}</div>;
}

const AFF_ICON: Record<Affiliation, ReactNode> = { official: <BadgeCheck size={12}/>, partner: <Handshake size={12}/>, community: <Users size={12}/>, unaffiliated: <Users size={12}/> };
export function AffiliationBadge({ vault }: { vault: Pick<Vault, 'affiliation' | 'partner'> }) {
  const tone = vault.affiliation === 'official' ? 'bg-ink text-white' : vault.affiliation === 'partner' ? 'bg-blue/12 text-blue' : vault.affiliation === 'unaffiliated' ? 'bg-down/10 text-down' : 'bg-ink/[0.07] text-ink/70';
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-extrabold uppercase tracking-[0.06em]', tone)} title={vault.affiliation === 'unaffiliated' && vault.partner ? `Not affiliated with ${vault.partner.name}` : undefined}>{AFF_ICON[vault.affiliation]}{AFFILIATION_LABEL[vault.affiliation]}{vault.affiliation === 'partner' && vault.partner ? ` · ${vault.partner.name}` : ''}</span>;
}

/** Proof / custody / freshness health as a compact meter. */
export function HealthPill({ vault }: { vault: Pick<Vault, 'health' | 'execution'> }) {
  const { proof, total, fresh, eligible } = vault.health; const ok = proof === total && fresh && vault.execution !== 'halted';
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-extrabold', ok ? 'bg-up/12 text-up' : 'bg-amber-500/15 text-amber-700')} title={`${proof}/${total} proofs valid · ${eligible}/${total} eligible · sources ${fresh ? 'fresh' : 'stale'}`}><ShieldCheck size={12}/>{proof}/{total} proof{fresh ? '' : ' · stale'}</span>;
}

export function ProductTag({ vault }: { vault: Pick<Vault, 'execution'> }) {
  const label = vault.execution === 'basket' ? 'Index · Buy as basket' : vault.execution === 'halted' ? 'Index · Halted' : 'Index · Track only';
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-extrabold uppercase tracking-[0.06em]', vault.execution === 'basket' ? 'bg-up/12 text-up' : vault.execution === 'halted' ? 'bg-down/10 text-down' : 'bg-ink/[0.07] text-ink/60')}>{label}</span>;
}

/** Number that counts up to its value when it first appears. */
export const CountUp = memo(function CountUp({ value, decimals = 2, className }: { value: number; decimals?: number; className?: string }) {
  const [shown, setShown] = useState<number>(value * 0.94); const from = useRef<number>(value * 0.94);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    const start = performance.now(); const a = from.current; let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - start) / 900); const e = 1 - Math.pow(1 - k, 3); setShown(a + (value - a) * e); if (k < 1) raf = requestAnimationFrame(tick); else from.current = value; };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cn('tnum', className)}>{shown.toFixed(decimals)}</span>;
});

/** Expandable drawer with an animated chevron. */
export function Drawer({ title, meta, children, defaultOpen = false }: { title: string; meta?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  return <section className="raised overflow-hidden rounded-[24px]">
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="press flex min-h-14 w-full items-center justify-between gap-3 px-5 text-left"><span className="text-[16px] font-extrabold">{title}</span><span className="flex items-center gap-3">{meta && <span className="font-mono text-[11.5px] font-bold text-ink/50">{meta}</span>}<ChevronDown size={18} className={cn('transition-transform duration-300', open && 'rotate-180')}/></span></button>
    <div className={cn('grid transition-[grid-template-rows] duration-400 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}><div className="min-h-0 overflow-hidden"><div className="border-t border-ink/[0.07] px-5 pb-5 pt-4">{children}</div></div></div>
  </section>;
}

/** Bottom sheet on phones, centred card on desktop. */
export function Sheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; children: ReactNode }) {
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="sheet-fade fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"/>
    <DialogPrimitive.Content aria-describedby={undefined} className="vault-sheet fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-auto rounded-t-[30px] bg-paper px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-float sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(520px,calc(100%-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[30px] sm:p-7">
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15 sm:hidden"/>
      <div className="flex items-center justify-between gap-3"><DialogPrimitive.Title className="text-[20px] font-extrabold">{title}</DialogPrimitive.Title><DialogPrimitive.Close className="flex size-11 items-center justify-center rounded-full hover:bg-ink/5" aria-label="Close"><X size={18}/></DialogPrimitive.Close></div>
      <div className="mt-4">{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}
