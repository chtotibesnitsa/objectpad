import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Box, Camera, Check, Coins, Download as DownloadIcon, Rocket, ScanLine, ShieldCheck, UserRound, Wallet, Zap } from 'lucide-react';
import { GlassIcon } from '@/components/GlassIcon';
import { AppTile, IosSoonLine, LivePill } from '@/components/QrLink';
import { canPromptInstall, isMobilePhone, promptInstall } from '@/lib/install';
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

const APP_URL = 'https://objectpad.fun/app/?install=1';
const APP_SHOTS = ['home', 'market', 'coin', 'scan', 'rewards', 'wallet'] as const;

/** iPhone web app: the full iOS app as a home-screen app, while the App Store listing is in review. */
function IphoneWebAppCard() {
  const phone = typeof window !== 'undefined' && isMobilePhone();
  const open = async () => { if (canPromptInstall() && await promptInstall()) return; window.location.href = '/app/?install=1'; };
  return <section className="card-pop mt-8 overflow-hidden rounded-[32px] bg-[#0C0D10] p-5 text-white shadow-[0_40px_80px_-40px_rgba(12,13,16,.8)] sm:p-7">
    <div className="grid items-center gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="flex items-center gap-4"><img src="/app/icon-192.png" alt="" className="size-[76px] rounded-[20px] shadow-[0_14px_30px_rgba(0,0,0,.5)]"/><div className="min-w-0"><LivePill badge="iPhone · web app"/><h2 className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[30px]">ObjectPad for iPhone</h2><p className="mt-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.04em] text-white/55">Free · No App Store · Works today</p></div></div>
        <p className="mt-5 max-w-xl text-[15px] font-semibold leading-6 text-white/75">Our native iOS app is in App Store review. Until it lands, add the exact same app to your iPhone home screen straight from objectpad.fun, with every screen, animation, sound and wallet feature. Scan, pair, launch and claim from your phone, no QR code needed.</p>
        <ol className="mt-5 grid gap-2 sm:grid-cols-3">{['Open objectpad.fun/app in Safari', 'Tap Share › Add to Home Screen', 'Open ObjectPad from your home screen'].map((t, i) => <li key={t} className="flex items-start gap-2.5 rounded-2xl bg-white/[0.07] p-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white font-mono text-[11px] font-extrabold text-ink">{i + 1}</span><span className="text-[13px] font-bold leading-5">{t}</span></li>)}</ol>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {phone ? <button type="button" onClick={() => void open()} className="press flex min-h-[58px] flex-1 items-center justify-center gap-2 rounded-full bg-white px-6 text-[16px] font-extrabold text-ink"><DownloadIcon size={18} strokeWidth={2.6}/>Add to Home Screen</button>
            : <a href="/app/" className="press flex min-h-[58px] flex-1 items-center justify-center gap-2 rounded-full bg-white px-6 text-[16px] font-extrabold text-ink">Try it in your browser</a>}
          <div className="hidden items-center gap-3 rounded-[20px] bg-white/[0.07] p-2 pr-3 sm:flex"><div className="rounded-[14px] bg-white p-1.5"><QRCodeSVG value={APP_URL} size={68} level="M" marginSize={0} fgColor="#0C0D10" title="Open the ObjectPad app on your iPhone"/></div><p className="max-w-[120px] font-mono text-[10px] font-bold uppercase leading-snug text-white/60">On desktop? Scan with your iPhone</p></div>
        </div>
      </div>
      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:-mx-7 sm:px-7 lg:mx-0 lg:px-0">{APP_SHOTS.map(s => <a key={s} href={`/v2/app-${s}.webp`} target="_blank" rel="noreferrer" className="shrink-0 overflow-hidden rounded-[26px] ring-1 ring-white/15"><img src={`/v2/app-${s}.webp`} alt={`ObjectPad iPhone app: ${s}`} loading="lazy" className="h-[360px] w-auto"/></a>)}</div>
    </div>
  </section>;
}

/** Mobile apps: iPhone web app, Android download, iOS status, animated how-to and the feature list. */
export default function Download() {
  const [step, setStep] = useState<number>(0); const [paused, setPaused] = useState<boolean>(false);
  useEffect(() => { if (paused) return; const t = setInterval(() => setStep(s => (s + 1) % STEPS.length), 3200); return () => clearInterval(t); }, [paused]);
  const apk = OBJECTPAD_APK_URL; const apkAbsolute = apk ? new URL(apk, typeof window === 'undefined' ? 'https://objectpad.fun' : window.location.origin).toString() : null;

  return <div className="page py-8 sm:py-12">
    <div className="enter flex items-end gap-4"><GlassIcon name="qr" size={84} float className="hidden sm:block"/><div><p className="lab">Mobile apps</p><h1 className="display mt-3 text-[44px] leading-[0.95] sm:text-[64px]">ObjectPad<br/>in your pocket.</h1></div></div>
    <p className="enter mt-4 max-w-xl text-[16px] font-bold text-ink/65">Scan any real object, launch its coin for $0 and earn on every trade — straight from your phone. No account needed to start.</p>

    <IphoneWebAppCard/>

    <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <section className="app-card card-pop rounded-[32px] p-5 sm:p-7">
        <div className="flex items-center gap-4"><AppTile size={76}/><div className="min-w-0"><LivePill badge="Android · Update #1" tone="light"/><h2 className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[30px]">ObjectPad for Android</h2><p className="mt-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink/50">Free · Signed release · No sign-up</p></div></div>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          {apk ? <a href={apk} download className="cta-hero press min-h-[58px] flex-1 justify-center py-1.5 pl-1.5 pr-6 text-[16px]"><span className="orb size-11"><DownloadIcon size={18} strokeWidth={2.6} className="text-ink"/></span>Get the app · APK</a> : <span className="app-well rounded-2xl px-4 py-3 text-[13px] font-bold text-ink/60">Download link coming online…</span>}
          {apkAbsolute && <div className="app-well hidden items-center gap-3 rounded-[20px] p-2 pr-3 sm:flex"><div className="rounded-[14px] bg-white p-1.5 shadow-sm"><QRCodeSVG value={apkAbsolute} size={68} level="M" marginSize={0} fgColor="#0C0D10" title="Scan to download on Android"/></div><p className="max-w-[104px] font-mono text-[10px] font-bold uppercase leading-snug text-ink/55">On desktop? Scan with your phone</p></div>}
        </div>
        <div className="app-well mt-4 rounded-[20px] px-4 py-3"><IosSoonLine tone="light" className="text-[13px]"/></div>
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
