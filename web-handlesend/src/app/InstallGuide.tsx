import { useEffect, useState } from 'react';
import { MoreHorizontal, PlusSquare, Share as ShareIcon, Check, Smartphone } from 'lucide-react';
import { canPromptInstall, iosBrowser, isIOS, onInstallChange, promptInstall } from '@/lib/install';
import { cn } from '@/lib/utils';
import { Feedback } from './feedback';
import { Sheet } from './chrome';
import { Display, Lab, PadButton } from './ui';

/**
 * Add ObjectPad to the home screen. Android/Chrome gets the real one-tap install prompt; iPhone (where Apple allows no
 * programmatic install) gets an animated three-step guide to Share › Add to Home Screen, pointing at the share button.
 */
export function InstallGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<number>(0); const [canPrompt, setCanPrompt] = useState<boolean>(canPromptInstall()); const ios = isIOS(); const browser = iosBrowser();
  useEffect(() => onInstallChange(() => setCanPrompt(canPromptInstall())), []);
  useEffect(() => { if (!open) return; setStep(0); const t = setInterval(() => setStep(s => (s + 1) % 3), 2400); return () => clearInterval(t); }, [open]);
  const steps = [
    { icon: browser === 'chrome' ? ShareIcon : ShareIcon, title: browser === 'chrome' ? 'Tap Share in the address bar' : 'Tap Share', body: browser === 'chrome' ? 'The share icon at the top right of Chrome.' : 'The square with an arrow, in Safari’s bottom bar. On iOS 26, tap ••• first.' },
    { icon: PlusSquare, title: 'Tap “Add to Home Screen”', body: 'Scroll the share sheet down a little if you don’t see it.' },
    { icon: Check, title: 'Tap Add', body: 'ObjectPad lands on your home screen with its icon. Open it like any app.' },
  ];
  return <Sheet open={open} onClose={onClose} height="auto"><div className="flex flex-col gap-4 px-5 pb-3 pt-1">
    <div className="flex items-center gap-3.5"><img src="/app/icon-192.png" alt="" className="size-[64px] rounded-[16px] shadow-[0_8px_16px_rgba(12,13,16,.3)]"/><div><Lab>Free · no App Store needed</Lab><Display size={26}>Add ObjectPad to your Home Screen</Display></div></div>
    <p className="text-[14px] font-semibold text-[#6A6E78]">The full ObjectPad app on your phone: scan, pair, launch, trade and claim, with sounds and haptics. It opens full screen from your home screen, no QR code needed.</p>
    {canPrompt ? <PadButton title="Add App" icon={Smartphone} onClick={() => { Feedback.tap(); void promptInstall().then(ok => ok && onClose()); }}/> : <>
      <ol className="flex flex-col gap-2">{steps.map((s, i) => <li key={s.title} className={cn('flex items-center gap-3 rounded-[20px] p-3 transition-all duration-500', i === step ? 'ap-raised scale-[1.01]' : 'opacity-60')}>
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors', i === step ? 'bg-ink text-white' : 'ap-sunk text-ink')}><s.icon size={20} strokeWidth={2.4}/></span>
        <span className="min-w-0"><span className="ap-mono block text-[10.5px] font-extrabold text-[#6A6E78]">STEP {i + 1}</span><span className="block text-[15px] font-extrabold">{s.title}</span><span className="block text-[12.5px] font-semibold text-[#6A6E78]">{s.body}</span></span>
      </li>)}</ol>
      {ios && browser !== 'chrome' && <div className="flex items-center justify-center gap-2 text-[13px] font-bold text-ink/70"><span className="flex items-center gap-1 rounded-full bg-ink/[0.06] px-3 py-1.5"><ShareIcon size={14}/>Share</span>or<span className="flex items-center gap-1 rounded-full bg-ink/[0.06] px-3 py-1.5"><MoreHorizontal size={14}/>then Share</span></div>}
      {!ios && <p className="text-center text-[12.5px] font-semibold text-[#6A6E78]">On Android: open your browser menu (⋮) and tap “Install app” or “Add to Home screen”.</p>}
    </>}
    <button type="button" onClick={onClose} className="py-2 text-[14px] font-bold text-[#6A6E78]">Not now</button>
  </div></Sheet>;
}

/** Bouncing arrow pointing at Safari's share button while the guide is open (bottom-center on iPhone). */
export function ShareArrow({ show }: { show: boolean }) {
  if (!show || !isIOS() || iosBrowser() === 'chrome') return null;
  return <div className="ap-fixed pointer-events-none fixed inset-x-0 bottom-1 z-[95] flex justify-center"><span className="ap-bob text-[34px] drop-shadow-[0_4px_8px_rgba(0,0,0,.3)]" aria-hidden="true">⬇︎</span></div>;
}
