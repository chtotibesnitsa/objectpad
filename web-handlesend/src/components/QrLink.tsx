import { useState } from 'react';
import { Check, Copy, Download, EyeOff, Link2 } from 'lucide-react';
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
