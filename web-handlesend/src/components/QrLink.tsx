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
 * Featured Android download card: a big smoked liquid-glass panel, sized like the QR scan box next to it, so the
 * download reads as an equally important way in. Carries a small live badge and a bold black-and-white download
 * button. Renders nothing until the signed APK is published.
 */
export function AndroidFeatureCard({ className, badge = 'Update #1' }: { className?: string; badge?: string }) {
  if (!OBJECTPAD_APK_URL) return null;
  return <div className={cn('smoke relative flex w-full flex-col items-center overflow-hidden rounded-[34px] p-6 text-center', className)}>
    <div className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-white/10 blur-3xl" aria-hidden="true"/>
    <span className="relative inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3.5 py-1 font-mono text-[11px] font-extrabold uppercase tracking-[0.1em] text-white backdrop-blur-md"><span className="pulse-dot size-1.5 shrink-0 rounded-full bg-up"/>{badge} · live</span>
    <span className="relative mt-5 flex size-16 shrink-0 items-center justify-center rounded-full" style={{ background: 'radial-gradient(circle at 35% 25%, #fff, #DCE0E6 70%)', boxShadow: 'inset 0 1px 0 #fff, inset 0 -2px 4px rgba(12,13,16,.12), 0 0 0 1px rgba(255,255,255,.4), 0 10px 20px -8px rgba(0,0,0,.6)' }}><Smartphone size={30} strokeWidth={2.3} className="text-ink"/></span>
    <h3 className="display relative mt-4 text-[25px] leading-[0.98] text-white sm:text-[28px]">ObjectPad for<br/>Android is live.</h3>
    <p className="relative mt-2 max-w-[250px] text-[13.5px] font-bold text-white/65">Anybody can download it and test it immediately. No Play Store, no waiting.</p>
    <a href={OBJECTPAD_APK_URL} download className="btn press relative mt-5 min-h-[56px] w-full justify-center text-[15.5px]"><Download size={18} strokeWidth={2.4}/>Download the APK</a>
    <p className="relative mt-2.5 font-mono text-[10.5px] font-extrabold uppercase tracking-wide text-white/45">Signed release · direct install · free</p>
  </div>;
}
