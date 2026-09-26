import { useState } from 'react';
import { Apple, ArrowRight, Check, Copy, Download, EyeOff, Link2 } from 'lucide-react';
import { copyText } from '@/lib/format';
import { Link } from 'react-router-dom';
import { OBJECTPAD_APK_URL } from '@/lib/brand';
import { cn } from '@/lib/utils';

/** For people who'd rather not scan a QR code: reveals the exact link the code opens, to copy or type on a phone. */
export function QrLinkReveal({ url, className }: { url: string; className?: string }) {
  const [open, setOpen] = useState<boolean>(false); const [copied, setCopied] = useState<boolean>(false);
  const copy = async () => { const ok = await copyText(url); setCopied(ok); if (ok) setTimeout(() => setCopied(false), 2000); };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex min-h-10 items-center gap-1.5 text-[13.5px] font-bold text-ink/60 underline underline-offset-4 hover:text-ink', className)}><Link2 size={14} strokeWidth={2.6}/>Rather not scan? Show the link</button>;
  return <div className={cn('slide-in sunk w-full rounded-[18px] p-3 text-left', className)}>
    <p className="font-mono text-[11px] font-extrabold uppercase text-ink/65">The code opens this link</p>
    <p className="mt-1.5 select-all break-all font-mono text-[12px] font-semibold leading-5 text-ink">{url}</p>
    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
      <button type="button" onClick={() => void copy()} className="btn press min-h-10 text-[13px]">{copied ? <Check size={14}/> : <Copy size={14}/>}{copied ? 'Copied' : 'Copy link'}</button>
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost press min-h-10 text-[13px]"><EyeOff size={14}/>Hide</button>
    </div>
    <p className="mt-2 text-[12px] font-semibold leading-4 text-ink/60">Paste or type it into your phone’s browser. It works once and only for this scan, so don’t share it.</p>
  </div>;
}

/** Direct download of the ObjectPad Android app. Renders nothing until the signed APK is published. */
export function AndroidAppButton({ className }: { className?: string }) {
  if (!OBJECTPAD_APK_URL) return null;
  return <a href={OBJECTPAD_APK_URL} download className={cn('btn-ghost press min-h-11 px-4 text-sm', className)}><Download size={15}/>Get the Android app</a>;
}

/** Small "Update #1 · live" pill, always on one line. `light` sits on glass, the default on smoke. */
export function LivePill({ badge, tone = 'dark' }: { badge: string; tone?: 'dark' | 'light' }) {
  return <span className={cn('inline-flex min-h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[9.5px] font-extrabold uppercase leading-none tracking-[0.1em]', tone === 'dark' ? 'border border-white/25 bg-white/15 text-white backdrop-blur-md' : 'app-well text-ink/75')}><span className="pulse-dot size-1.5 shrink-0 rounded-full bg-up"/>{badge} · live</span>;
}

/** One italic line promising iOS, shown under every Android download. */
export function IosSoonLine({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  return <p className={cn('inline-flex items-center gap-1.5 text-[11.5px] font-semibold italic', tone === 'dark' ? 'text-white/60' : 'text-ink/60', className)}><Apple size={13} strokeWidth={2.4} className={cn('-mt-px shrink-0', tone === 'dark' ? 'text-white' : 'text-ink')}/><span><span className={cn('not-italic font-extrabold', tone === 'dark' ? 'text-white' : 'text-ink')}>iOS</span> in App Store review · out soon</span></p>;
}

/** The real ObjectPad app icon in an app-store style tile. */
export function AppTile({ size = 56, className }: { size?: number; className?: string }) {
  return <span className={cn('app-tile', className)} style={{ width: size, height: size }}><img src="/apple-touch-icon.png" alt="" width={size} height={size} draggable={false}/></span>;
}

function GetButton({ className, label = 'Get the app' }: { className?: string; label?: string }) {
  return <a href={OBJECTPAD_APK_URL ?? undefined} download className={cn('cta-hero press justify-center whitespace-nowrap py-1.5 pl-1.5 pr-5 text-[14px]', className)}><span className="orb size-9"><Download size={16} strokeWidth={2.6} className="text-ink"/></span>{label}</a>;
}

/**
 * Android download card. `wide` is one horizontal strip (headline on one line, button on the right) matching the CA
 * pill's width; `stack` is the compact version for narrow QR columns. Hidden until the APK is published.
 */
export function AndroidFeatureCard({ className, badge = 'Update #1', layout = 'stack' }: { className?: string; badge?: string; layout?: 'wide' | 'stack' }) {
  if (!OBJECTPAD_APK_URL) return null;
  if (layout === 'wide') return <div className={cn('app-card w-full rounded-[28px] p-2.5', className)}>
    <div className="flex flex-col gap-3 p-1.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <AppTile size={58}/>
        <div className="min-w-0">
          <LivePill badge={badge} tone="light"/>
          <h3 className="mt-1.5 whitespace-nowrap text-[15px] font-extrabold leading-tight tracking-[-0.02em] text-ink min-[400px]:text-[16.5px]">ObjectPad for Android is live.</h3>
          <p className="mt-0.5 whitespace-nowrap font-mono text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink/50">Free · No Play Store · No sign-up</p>
        </div>
      </div>
      <GetButton className="min-h-12 w-full sm:w-auto"/>
    </div>
    <div className="app-well mt-1.5 flex items-center justify-between gap-3 rounded-[20px] px-3.5 py-2.5"><IosSoonLine tone="light"/><Link to="/download" className="press inline-flex shrink-0 items-center gap-1 text-[12px] font-extrabold text-ink hover:gap-1.5">How it works<ArrowRight size={13} strokeWidth={2.6}/></Link></div>
  </div>;
  return <div className={cn('app-card flex w-full flex-col items-center rounded-[28px] p-4 text-center', className)}>
    <div className="flex w-full items-center gap-3 text-left">
      <AppTile size={52}/>
      <div className="min-w-0">
        <LivePill badge={badge} tone="light"/>
        <h3 className="mt-1 text-[15px] font-extrabold leading-tight tracking-[-0.02em] text-ink">ObjectPad for Android</h3>
      </div>
    </div>
    <p className="mt-2.5 w-full text-left font-mono text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink/50">Free · No Play Store · No sign-up</p>
    <GetButton className="mt-3 min-h-12 w-full"/>
    <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1"><IosSoonLine tone="light"/><Link to="/download" className="press inline-flex items-center gap-1 text-[12px] font-extrabold text-ink">How it works<ArrowRight size={13} strokeWidth={2.6}/></Link></div>
  </div>;
}
