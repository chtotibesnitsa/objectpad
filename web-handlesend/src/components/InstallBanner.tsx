import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { canPromptInstall, isAndroid, isMobilePhone, isStandalone, onInstallChange, promptInstall } from '@/lib/install';
import { OBJECTPAD_APK_URL } from '@/lib/brand';

const KEY = 'objectpad.installBanner.dismissedAt';
const SNOOZE = 3 * 86_400_000;

/**
 * Shown to phone visitors of objectpad.fun (never inside the installed app): "We see you're on a mobile device. Add our app?"
 * Android installs in one tap where the browser allows it; iPhone opens the app with the Add to Home Screen guide.
 */
export function InstallBanner() {
  const location = useLocation(); const navigate = useNavigate(); const [open, setOpen] = useState<boolean>(false); const [, force] = useState<number>(0);
  useEffect(() => onInstallChange(() => force(n => n + 1)), []);
  useEffect(() => {
    if (!isMobilePhone() || isStandalone() || location.pathname.startsWith('/capture/')) return;
    try { const at = Number(localStorage.getItem(KEY) ?? 0); if (Date.now() - at < SNOOZE || localStorage.getItem('objectpad.app.installed') === '1') return; } catch { /* show it */ }
    const t = setTimeout(() => setOpen(true), 1400); return () => clearTimeout(t);
  }, [location.pathname]);
  if (!open) return null;
  const dismiss = () => { setOpen(false); try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } };
  const add = async () => { if (canPromptInstall() && await promptInstall()) { setOpen(false); return; } setOpen(false); navigate('/app/?install=1'); };
  return <div role="dialog" aria-label="Add the ObjectPad app" className="fixed inset-x-0 top-0 z-[120] px-3 pt-[max(10px,env(safe-area-inset-top))] [animation:install-drop_.5s_cubic-bezier(.22,1.3,.36,1)_both]">
    <div className="mx-auto max-w-[520px] rounded-[26px] bg-[#0C0D10] p-3 text-white shadow-[0_24px_50px_-18px_rgba(12,13,16,.7)] ring-1 ring-white/10">
      <div className="flex items-start gap-3">
        <img src="/app/icon-192.png" alt="" className="size-[52px] shrink-0 rounded-[13px]"/>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/55">ObjectPad app · free</p>
          <p className="mt-0.5 text-[15px] font-extrabold leading-snug">We see you’re on a mobile device. Would you like to add our app?</p>
          <p className="mt-1 text-[12.5px] font-semibold leading-snug text-white/65">The full iPhone app on your home screen. No App Store, no QR codes.</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Not now" className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-white/60"><X size={17}/></button>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => void add()} className="press flex min-h-12 flex-1 items-center justify-center rounded-full bg-white text-[15px] font-extrabold text-[#0C0D10]">Add App</button>
        <button type="button" onClick={dismiss} className="press min-h-12 rounded-full bg-white/10 px-5 text-[14px] font-bold">Not now</button>
      </div>
      {isAndroid() && OBJECTPAD_APK_URL && <a href={OBJECTPAD_APK_URL} download className="mt-2 block text-center text-[12px] font-bold text-white/60 underline underline-offset-2">Or download the Android APK</a>}
    </div>
  </div>;
}
