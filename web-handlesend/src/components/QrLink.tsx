import { useState } from 'react';
import { Check, Copy, Download, EyeOff, Link2, Smartphone } from 'lucide-react';
import { copyText } from '@/lib/format';
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

/**
 * Featured Android download bar: a wide, short smoked liquid-glass strip that fills the full width available (e.g.
 * under the CA pill), so it reads as an equally important way in without towering over the page. Carries a small
 * live badge and a bold black-and-white download button. Renders nothing until the signed APK is published.
 */
export function AndroidFeatureCard({ className, badge = 'Update #1' }: { className?: string; badge?: string }) {
  if (!OBJECTPAD_APK_URL) return null;
  return <div className={cn('smoke relative flex w-full flex-col gap-4 overflow-hidden rounded-[26px] p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5', className)}>
    <div className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-white/10 blur-3xl" aria-hidden="true"/>
    <div className="relative flex items-center gap-3.5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full" style={{ background: 'radial-gradient(circle at 35% 25%, #fff, #DCE0E6 70%)', boxShadow: 'inset 0 1px 0 #fff, inset 0 -2px 4px rgba(12,13,16,.12), 0 0 0 1px rgba(255,255,255,.4), 0 8px 16px -8px rgba(0,0,0,.6)' }}><Smartphone size={22} strokeWidth={2.4} className="text-ink"/></span>
      <div className="min-w-0">
        <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-[0.1em] text-white backdrop-blur-md"><span className="pulse-dot size-1.5 shrink-0 rounded-full bg-up"/>{badge} · live</span>
        <h3 className="display mt-1.5 text-[19px] leading-[1.02] text-white sm:text-[21px]">ObjectPad for Android is live.</h3>
        <p className="mt-0.5 text-[12.5px] font-bold text-white/60">Anybody can download and test it immediately · no Play Store, no waiting.</p>
      </div>
    </div>
    <a href={OBJECTPAD_APK_URL} download className="btn press relative min-h-[52px] shrink-0 justify-center px-6 text-[14.5px] sm:ml-auto"><Download size={17} strokeWidth={2.4}/>Download the APK</a>
  </div>;
}
