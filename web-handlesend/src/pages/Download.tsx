import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Apple, Box, Camera, Check, Coins, Download as DownloadIcon, Rocket, ScanLine, ShieldCheck, Smartphone, UserRound, Wallet, Zap } from 'lucide-react';
import { GlassIcon } from '@/components/GlassIcon';
import { LivePill } from '@/components/QrLink';
import { OBJECTPAD_APK_URL } from '@/lib/brand';
import { cn } from '@/lib/utils';

const STEPS = [
  { icon: DownloadIcon, title: 'Download & install', body: 'Tap Download APK, open the file, allow the install once. About 30 seconds.', screen: 'Installing ObjectPad…' },
  { icon: UserRound, title: 'Skip sign-up (or don’t)', body: 'Start as a guest instantly. Sign in with X, email or a wallet later — your coins follow you.', screen: 'Continue as guest →' },
  { icon: Camera, title: 'Scan a real object', body: 'Walk around it with your camera. We build a full 3D model and check it’s one of a kind.', screen: 'Scanning · 18 / 24 angles' },
  { icon: Rocket, title: 'Launch for $0', body: 'Name it, pick a ticker, tap launch. The treasury pays gas and the first buy.', screen: '$DESKBULL is live' },
  { icon: Coins, title: 'Earn on every trade', body: 'Your coin pays you 0.5% of every trade. Claim to your wallet anytime.', screen: '+0.0042 ETH to claim' },
] as const;

const FEATURES = [
  { icon: ScanLine, title: 'Real 3D scan', body: 'Full photogrammetry model from your phone camera.' },
  { icon: ShieldCheck, title: 'Uniqueness check', body: 'AI blocks duplicates, so every coin is one real object.' },
  { icon: Zap, title: '$0 launch', body: 'Gas and first buy paid by the launch treasury.' },
  { icon: Wallet, title: 'Built-in wallet', body: 'Balance, deposits, withdrawals and fee claims.' },
  { icon: Box, title: 'Resume anywhere', body: 'Start on the phone, finish on desktop, or the other way round.' },
  { icon: Coins, title: 'Creator fees', body: '0.5% of every trade on your coin, claimable anytime.' },
] as const;

/** Animated phone mock that plays through the five steps. */
function PhoneDemo({ step }: { step: number }) {
  const S = STEPS[step];
  return <div className="relative mx-auto w-[240px] sm:w-[260px]">
    <div className="smoke relative aspect-[9/19] overflow-hidden rounded-[42px] p-3 shadow-[0_40px_80px_-30px_rgba(12,13,16,.6)]">
      <div className="mx-auto h-5 w-24 rounded-full bg-black/60"/>
      <div key={step} className="mt-6 flex flex-col items-center px-3 text-center text-white [animation:card-pop_.55s_cubic-bezier(.2,1.2,.35,1)_both]">
        <span className="flex size-20 items-center justify-center rounded-[28px] bg-white text-ink shadow-[0_12px_30px_-10px_rgba(255,255,255,.5)]"><S.icon size={34} strokeWidth={2.2}/></span>
        <p className="mt-5 font-mono text-[10.5px] font-extrabold uppercase tracking-widest text-white/50">Step {step + 1} of {STEPS.length}</p>
        <p className="display mt-2 text-[20px] leading-tight">{S.title}</p>
        <div className="mt-6 w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-3 font-mono text-[12px] font-bold backdrop-blur-md">{S.screen}</div>
        {step === 2 && <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10"><span className="block h-full w-3/4 origin-left bg-white [animation:bar-grow_1.2s_ease_both]"/></div>}
        {step === 3 && <span className="mt-4 rounded-full bg-up px-3 py-1 font-mono text-[11px] font-extrabold text-white [animation:slot-pop_.5s_ease_.2s_both]">LIVE ON CHAIN</span>}
      </div>
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">{STEPS.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all duration-500', i === step ? 'w-6 bg-white' : 'w-1.5 bg-white/30')}/>)}</div>
    </div>
  </div>;
}

/** Mobile apps: Android download, iOS status, animated how-to and the feature list. */
export default function Download() {
  const [step, setStep] = useState<number>(0); const [paused, setPaused] = useState<boolean>(false);
  useEffect(() => { if (paused) return; const t = setInterval(() => setStep(s => (s + 1) % STEPS.length), 3200); return () => clearInterval(t); }, [paused]);
  const apk = OBJECTPAD_APK_URL; const apkAbsolute = apk ? new URL(apk, typeof window === 'undefined' ? 'https://objectpad.fun' : window.location.origin).toString() : null;

  return <div className="page py-8 sm:py-12">
    <div className="enter flex items-end gap-4"><GlassIcon name="qr" size={84} float className="hidden sm:block"/><div><p className="lab">Mobile apps</p><h1 className="display mt-3 text-[44px] leading-[0.95] sm:text-[64px]">ObjectPad<br/>in your pocket.</h1></div></div>
    <p className="enter mt-4 max-w-xl text-[16px] font-bold text-ink/65">Scan any real object, launch its coin for $0 and earn on every trade — straight from your phone. No account needed to start.</p>

    <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <section className="smoke card-pop relative overflow-hidden rounded-[32px] p-6 text-white sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/10 blur-3xl" aria-hidden="true"/>
        <div className="relative flex items-center gap-3"><span className="flex size-12 items-center justify-center rounded-full bg-white text-ink"><Smartphone size={22}/></span><LivePill badge="Android · Update #1"/></div>
        <h2 className="display relative mt-4 text-[28px] leading-none sm:text-[34px]">ObjectPad for Android is live.</h2>
        <p className="relative mt-2 text-[14px] font-bold text-white/60">Signed release · direct install · free. No Play Store, no waiting.</p>
        <div className="relative mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          {apk ? <a href={apk} download className="btn press min-h-[56px] flex-1 justify-center text-[15.5px]"><DownloadIcon size={18}/>Download APK</a> : <span className="rounded-2xl border border-white/20 px-4 py-3 text-[13px] font-bold text-white/60">Download link coming online…</span>}
          {apkAbsolute && <div className="hidden items-center gap-3 sm:flex"><div className="rounded-2xl bg-white p-2"><QRCodeSVG value={apkAbsolute} size={76} level="M" marginSize={0} fgColor="#0C0D10" title="Scan to download on Android"/></div><p className="max-w-[110px] font-mono text-[10.5px] font-bold uppercase text-white/55">On desktop? Scan to get it on your phone</p></div>}
        </div>
        <div className="relative mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><Apple size={20}/><p className="text-[13px] font-bold italic text-white/70"><span className="not-italic font-extrabold text-white">iOS</span> is in App Store review — out soon.</p></div>
      </section>

      <section className="raised card-pop rounded-[32px] p-6" style={{ ['--delay' as string]: '120ms' }}>
        <p className="lab">Installing on Android</p>
        <ol className="mt-4 space-y-3">{['Tap Download APK above.', 'Open the downloaded file from your notifications.', 'If asked, allow installs from your browser (one time).', 'Open ObjectPad and tap Scan.'].map((t, i) => <li key={t} className="flex items-start gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[12px] font-extrabold text-white">{i + 1}</span><span className="pt-0.5 text-[14px] font-bold">{t}</span></li>)}</ol>
        <p className="mt-4 flex items-start gap-2 text-[12px] font-semibold text-ink/55"><ShieldCheck size={14} className="mt-px shrink-0"/>Signed by ObjectPad. The app never holds your keys on our servers.</p>
      </section>
    </div>

    <section className="mt-12"><p className="lab">How it works</p><h2 className="display mt-2 text-[32px] sm:text-[44px]">Download to coin in 5 steps.</h2>
      <div className="mt-6 grid items-center gap-8 lg:grid-cols-[auto_1fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <PhoneDemo step={step}/>
        <ol className="space-y-2">{STEPS.map((s, i) => <li key={s.title}><button onClick={() => { setStep(i); setPaused(true); }} className={cn('press relative flex w-full items-start gap-4 overflow-hidden rounded-[22px] p-4 text-left transition-all duration-300', i === step ? 'raised' : 'hover:bg-white/60')}>
          <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors', i === step ? 'bg-ink text-white' : i < step ? 'bg-ink/80 text-white' : 'sunk')}>{i < step ? <Check size={18}/> : <s.icon size={18}/>}</span>
          <span className="min-w-0 flex-1"><span className="block text-[16px] font-extrabold">{s.title}</span><span className={cn('block overflow-hidden text-[13.5px] font-semibold text-ink/60 transition-all duration-500', i === step ? 'mt-1 max-h-20 opacity-100' : 'max-h-0 opacity-0')}>{s.body}</span></span>
          {i === step && !paused && <span key={`bar-${step}`} className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-ink [animation:bar-grow_3.2s_linear_both]"/>}
        </button></li>)}</ol>
      </div>
    </section>

    <section className="mt-12"><p className="lab">In the app</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map((f, i) => <div key={f.title} style={{ ['--delay' as string]: `${i * 60}ms` }} className="raised card-pop rounded-[24px] p-5 transition-transform hover:-translate-y-1"><span className="flex size-11 items-center justify-center rounded-2xl bg-ink text-white"><f.icon size={19}/></span><p className="mt-3 text-[16px] font-extrabold">{f.title}</p><p className="mt-1 text-[13.5px] font-semibold text-ink/60">{f.body}</p></div>)}</div>
    </section>

    <div className="raised mt-12 flex flex-col items-start gap-4 rounded-[28px] p-6 sm:flex-row sm:items-center"><div className="flex-1"><p className="text-[18px] font-extrabold">No phone handy?</p><p className="mt-1 text-[13.5px] font-semibold text-ink/60">Start a scan in the browser — it works on any phone camera via QR.</p></div><Link to="/launch" className="btn press min-h-12 px-6 text-[14px]"><ScanLine size={16}/>Scan & launch in browser</Link></div>
  </div>;
}
