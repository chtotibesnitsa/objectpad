import { useState } from 'react';
import { Check, Copy, Download, EyeOff, Link2, Smartphone } from 'lucide-react';
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

const ORB_STYLE = { background: 'radial-gradient(circle at 35% 25%, #fff, #DCE0E6 70%)', boxShadow: 'inset 0 1px 0 #fff, inset 0 -2px 4px rgba(12,13,16,.12), 0 0 0 1px rgba(255,255,255,.4), 0 8px 16px -8px rgba(0,0,0,.6)' };

/** Small "Update #1 · live" pill, always on one line. */
export function LivePill({ badge }: { badge: string }) {
  return <span className="inline-flex min-h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 font-mono text-[10px] font-extrabold uppercase leading-none tracking-[0.1em] text-white backdrop-blur-md"><span className="pulse-dot size-1.5 shrink-0 rounded-full bg-up"/>{badge} · live</span>;
}

/** One italic line promising iOS, shown under every Android download. */
export function IosSoonLine({ className }: { className?: string }) {
  return <p className={cn('text-[11.5px] font-bold italic text-white/60', className)}><span className="not-italic font-extrabold text-white">iOS</span> is in App Store review · out soon.</p>;
}

/**
 * Android download card. `wide` is one horizontal strip (headline on one line, button on the right) matching the CA
 * pill's width; `stack` is the compact version for narrow QR columns. Hidden until the APK is published.
 */
export function AndroidFeatureCard({ className, badge = 'Update #1', layout = 'stack' }: { className?: string; badge?: string; layout?: 'wide' | 'stack' }) {
  if (!OBJECTPAD_APK_URL) return null;
  if (layout === 'wide') return <div className={cn('smoke relative w-full overflow-hidden rounded-[26px] p-3.5 sm:p-4', className)}>
    <div className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-white/10 blur-3xl" aria-hidden="true"/>
    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full" style={ORB_STYLE}><Smartphone size={20} strokeWidth={2.4} className="text-ink"/></span>
        <div className="min-w-0">
          <LivePill badge={badge}/>
          <h3 className="display mt-1.5 whitespace-nowrap text-[15px] leading-none text-white min-[400px]:text-[17px] sm:text-[18px]">ObjectPad for Android is live.</h3>
          <p className="mt-1 whitespace-nowrap text-[12px] font-bold text-white/60">Scan & launch free. No Play Store.</p>
        </div>
      </div>
      <a href={OBJECTPAD_APK_URL} download className="btn press min-h-[48px] shrink-0 justify-center whitespace-nowrap px-5 text-[14px]"><Download size={16} strokeWidth={2.4}/>Download APK</a>
    </div>
    <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-2.5"><IosSoonLine/><Link to="/download" className="shrink-0 font-mono text-[11px] font-extrabold uppercase text-white/70 underline underline-offset-4 hover:text-white">How it works</Link></div>
  </div>;
  return <div className={cn('smoke relative flex w-full flex-col items-center overflow-hidden rounded-[26px] p-4 text-center', className)}>
    <div className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-white/10 blur-3xl" aria-hidden="true"/>
    <div className="relative flex items-center gap-2.5"><span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={ORB_STYLE}><Smartphone size={17} strokeWidth={2.4} className="text-ink"/></span><LivePill badge={badge}/></div>
    <h3 className="display relative mt-2.5 whitespace-nowrap text-[15px] leading-none text-white">ObjectPad for Android is live.</h3>
    <p className="relative mt-1 text-[12px] font-bold text-white/60">Scan & launch free. No Play Store.</p>
    <a href={OBJECTPAD_APK_URL} download className="btn press relative mt-3 min-h-[48px] w-full justify-center whitespace-nowrap text-[14px]"><Download size={16} strokeWidth={2.4}/>Download APK</a>
    <IosSoonLine className="relative mt-2"/>
  </div>;
}
