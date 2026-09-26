import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, ArrowRight, ArrowUpRight, Box, Camera, Check, Copy, Cuboid, ExternalLink, Fingerprint, Inbox, LoaderCircle, Lock, RefreshCw, Rocket, RotateCcw, ScanLine, Smartphone, Sparkles, Trash2, Wallet, X } from 'lucide-react';
import { api, API_BASE, describeError, RequestError } from '@/lib/api';
import { GlassIcon, type GlassName } from '@/components/GlassIcon';
import { forgetScan, openScan, rememberScan } from '@/lib/handoff';
import { Dialog } from '@/components/ui/dialog';
import { timeAgo } from '@/lib/format';
import { deviceSecret, guestToken, isPhone, useCreator, useSessionCaller } from '@/lib/creator';
import { useReadiness } from '@/lib/market';
import { copyText, shortAddress } from '@/lib/format';
import { usePreferences } from '@/hooks/use-preferences';
import { ErrorState, Loading } from '@/components/Feedback';
import { PrivateModel } from '@/components/PrivateModel';
import { AndroidFeatureCard, QrLinkReveal } from '@/components/QrLink';
import { CoinIconPicker } from '@/components/CoinIconPicker';
import { PairPicker } from '@/components/PairPicker';
import { BuildLattice } from '@/components/BuildLattice';
import { TxPanel, useLaunchTx } from '@/components/TxProof';
import { AsciiReveal, EngineLog, useEngineLog } from '@/components/EngineLog';
import { AsciiPhoto, BitCatcher, DataStream, useViewUrls } from '@/components/ScanSequence';
import { devWallet, ensureDevWallet } from '@/lib/devWallet';
import { VIEWS, type CaptureSession, type LaunchDraft } from '@/shared/domain';
import { cn } from '@/lib/utils';

const schema = z.object({
  publicName: z.string().trim().min(2, 'At least 2 characters.').max(32, 'Up to 32 characters.'),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, '2–10 letters or digits.'),
  story: z.string().trim().min(10, 'At least 10 characters.').max(280, 'Up to 280 characters.'),
  xUrl: z.string().trim().refine(v => !v || /^https:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/.test(v), 'Use https://x.com/handle or leave empty.'),
  telegram: z.string().trim().refine(v => !v || /^https:\/\/(t|telegram)\.me\/[A-Za-z0-9_]{4,32}\/?$/.test(v), 'Use https://t.me/group or leave empty.'),
  feeWallet: z.string().trim().refine(v => !v || /^0x[a-fA-F0-9]{40}$/.test(v), 'Paste a full 0x… wallet address or leave empty.'),
});
type Form = z.infer<typeof schema>;
type View = CaptureSession;
const MAX_REGENERATIONS = 2;
const TERMINAL = ['blocked', 'cancelled', 'expired'];

function useNow(active: boolean): number { const [now, setNow] = useState<number>(Date.now()); useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]); return now; }
const clock = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function stepOf(s: View): number {
  if (s.launch) return 4;
  if (['model_review', 'approved'].includes(s.state)) return 4;
  if (['reconstructing', 'validating'].includes(s.state)) return 3;
  if (s.state === 'screening' || (s.state === 'review' && s.views.length >= VIEWS.length)) return 2;
  if (s.state === 'capturing' || s.views.length > 0) return 1;
  return 0;
}
function Stepper({ session }: { session: View }) {
  const current = stepOf(session); const steps: { label: string; icon: GlassName }[] = [{ label: 'Phone', icon: 'qr' }, { label: 'Photos', icon: 'mesh' }, { label: 'AI check', icon: 'ai' }, { label: '3D model', icon: 'fingerprint' }, { label: 'Coin', icon: 'rocket' }];
  const phoneBar = <div className="raised rounded-[22px] p-3.5 sm:hidden"><div className="flex items-center justify-between gap-3"><p className="text-[16px] font-extrabold">Step {current + 1} of 5 · {steps[current].label}</p><GlassIcon name={steps[current].icon} size={34}/></div><div className="mt-2.5 grid grid-cols-5 gap-1">{steps.map((st, i) => <span key={st.label} className={cn('h-1.5 rounded-full transition-colors duration-500', i < current ? 'bg-ink' : i === current ? 'bg-ink/60' : 'bg-ink/10')}/>)}</div></div>;
  return <>{phoneBar}<ol className="sunk hidden grid-cols-5 gap-1 rounded-[22px] p-1 sm:grid">{steps.map((step, i) => { const done = i < current; const active = i === current; return <li key={step.label} className={cn('flex min-h-14 items-center justify-center gap-2 rounded-[18px] px-2 text-[12px] font-extrabold transition-all sm:text-[13.5px]', active ? 'raised' : done ? 'text-ink' : 'text-ink/35')}><span className="relative hidden sm:block"><GlassIcon name={step.icon} size={32} className={cn(!active && !done && 'opacity-40 grayscale')}/>{done && <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-up text-white"><Check size={10} strokeWidth={3.5}/></span>}</span><span className="font-mono text-[11.5px] opacity-50 sm:hidden">{i + 1}</span><span className="truncate">{step.label}</span>{active && <span className="pulse-dot size-1.5 rounded-full bg-up"/>}</li>; })}</ol></>;
}

/** Desktop QR that moves this exact session to a phone, with the six angles filling in live. */
/** Each accepted angle, read back from the private store the moment it lands, so the desktop mirrors the phone. */
function LivePhotos({ session, download, onRemove }: { session: View; download: (url: string) => Promise<Blob>; onRemove?: (view: string) => Promise<void> }) {
  const urls = useViewUrls(session, download); const byView = new Map(session.views.map(v => [v.view, v])); const incoming = new Set((session.incoming ?? []).filter(s => Date.now() - s.at < 90_000).map(s => s.view));
  const [confirm, setConfirm] = useState<string | null>(null); const [removing, setRemoving] = useState<string | null>(null);
  const remove = async (view: string) => { setRemoving(view); try { await onRemove?.(view); if (navigator.vibrate) navigator.vibrate(10); } finally { setRemoving(null); setConfirm(null); } };
  return <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{VIEWS.map((view, i) => { const shot = byView.get(view.id); const url = shot ? urls[view.id] : undefined; const arriving = !shot && incoming.has(view.id); return <div key={shot ? `${view.id}-${shot.hash}` : `${view.id}-empty`} className={cn('group relative aspect-[3/4] overflow-hidden rounded-2xl transition-all', shot ? 'raised card-pop' : arriving ? 'raised' : 'sunk', removing === view.id && 'tile-out')}>
    {shot && onRemove && confirm !== view.id && <button onClick={() => setConfirm(view.id)} className="press absolute right-1.5 top-1.5 z-10 flex size-8 items-center justify-center rounded-full bg-black/60 text-white opacity-100 backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" aria-label={`Retake ${view.label}`}><RotateCcw size={13} strokeWidth={2.6}/></button>}
    {shot && confirm === view.id && <div className="slide-in absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-[#0F1115]/85 p-2 text-center text-white backdrop-blur-sm"><p className="text-[12px] font-extrabold leading-4">Retake {view.label.replace(' side', '').toLowerCase()}?</p><button onClick={() => void remove(view.id)} disabled={removing === view.id} className="press flex min-h-9 w-full items-center justify-center gap-1 rounded-full bg-white text-[12px] font-extrabold text-ink">{removing === view.id ? <LoaderCircle size={12} className="animate-spin"/> : <Trash2 size={12}/>}Remove</button><button onClick={() => setConfirm(null)} className="min-h-8 text-[11.5px] font-bold text-white/70">Keep</button></div>}
    {url ? <AsciiPhoto src={url}/> : arriving ? <div className="relative flex h-full flex-col items-center justify-center gap-1.5 bg-[#0F1115] text-white"><span className="incoming-sweep absolute inset-0"/><LoaderCircle size={18} className="relative animate-spin"/><span className="relative font-mono text-[11px] font-bold uppercase">receiving</span></div> : shot ? <div className="flex h-full items-center justify-center bg-[#0F1115] font-mono text-[13px] font-bold text-white/70">0101…</div> : <div className="flex h-full flex-col items-center justify-center gap-1 text-ink/40"><Camera size={18}/><span className="font-mono text-[12px] font-bold">{i + 1}/6</span></div>}
    <span className={cn('absolute inset-x-1.5 bottom-1.5 rounded-lg px-1.5 py-1 text-center text-[12px] font-extrabold', shot ? 'bg-white/90 text-ink backdrop-blur' : 'text-ink/65')}>{shot && <Check size={10} strokeWidth={3.5} className="mr-0.5 inline text-up"/>}{view.label.replace(' side', '')}</span>
  </div>; })}</div>;
}

function Handoff({ session, call, download }: { session: View; call: <T>(path: string, options?: Parameters<typeof api>[1]) => Promise<T>; download: (url: string) => Promise<Blob> }) {
  const navigate = useNavigate(); const phone = useMemo(() => isPhone(), []); const now = useNow(true);
  const [link, setLink] = useState<{ url: string; expires: number } | null>(() => { try { const saved = JSON.parse(sessionStorage.getItem(`objectpad.handoff.${session.id}`) ?? 'null') as { url: string; expires: number } | null; return saved && saved.expires > Date.now() ? saved : null; } catch { return null; } });
  const rotate = useMutation({ mutationFn: () => call<{ handoffUrl: string; expiresAt: number }>(`/sessions/${session.id}/handoff`, { method: 'POST', body: {} }), onSuccess: data => { const next = { url: data.handoffUrl, expires: Math.min(data.expiresAt, Date.now() + 9.5 * 60_000) }; setLink(next); sessionStorage.setItem(`objectpad.handoff.${session.id}`, JSON.stringify(next)); } });
  // "Connect a new phone": shows a fresh QR even while a phone is paired. The new phone replaces the old one the moment it scans.
  const [pairNew, setPairNew] = useState<boolean>(false); const pairedAt = useRef<number | undefined>(session.pairedAt);
  useEffect(() => { if (session.pairedAt && session.pairedAt !== pairedAt.current) { pairedAt.current = session.pairedAt; setPairNew(false); } }, [session.pairedAt]);
  const showQr = !session.deviceConnected || pairNew;
  const live = Boolean(link && link.expires > now && showQr);
  const { mutate, isIdle, isError, isPending } = rotate;
  useEffect(() => { if (showQr && (!link || link.expires <= now) && !isPending && (isIdle || !isError)) mutate(); }, [showQr, link, now, isIdle, isError, isPending, mutate]);
  const newPhone = () => { setPairNew(true); if (!link || link.expires <= Date.now() + 60_000) mutate(); };
  const removePhoto = async (view: string) => { await call<View>(`/sessions/${session.id}/views/${view}`, { method: 'DELETE' }); };
  const openHere = async () => { const data = await call<{ handoffUrl: string }>(`/sessions/${session.id}/handoff`, { method: 'POST', body: {} }); navigate(`/capture/claim${new URL(data.handoffUrl).hash}`); };
  const connected = Boolean(session.deviceConnected) && !pairNew; const count = session.views.length;
  return <div className="raised relative overflow-hidden rounded-[32px]">
    <div className="grid-paper pointer-events-none absolute inset-0 opacity-50" aria-hidden="true"/>
    <div className="relative grid gap-6 p-5 sm:p-7 md:grid-cols-[auto_1fr]">
      <div className="mx-auto flex w-full max-w-[272px] flex-col items-center">
        <div className="raised crop relative flex aspect-square w-full items-center justify-center rounded-[30px] p-6"><i/><i/><i/><i/>
          {connected ? <div className="text-center"><GlassIcon name="qr" size={96} float className="mx-auto"/><p className="mt-3 flex items-center justify-center gap-2 font-extrabold"><span className="pulse-dot size-2 rounded-full bg-up"/>Phone connected</p><p className="mt-1 font-mono text-[11px] font-bold text-ink/65">keep going on your phone</p></div>
            : live && link ? <QRCodeSVG value={link.url} size={224} level="M" marginSize={0} fgColor="#0C0D10" title="Open this scan on your phone"/>
            : <div className="text-center">{rotate.isPending ? <LoaderCircle className="mx-auto animate-spin text-ink/60"/> : <><p className="text-sm font-bold text-ink/60">Code expired</p><button onClick={() => rotate.mutate()} className="btn press mt-3 min-h-11 px-4 text-sm"><RefreshCw size={14}/>New code</button></>}</div>}
        </div>
        <div className="smoke mt-3 w-full rounded-[20px] px-4 py-3 text-center"><p className="flex items-center justify-center gap-2 text-[15px] font-extrabold text-white"><Smartphone size={16}/>{connected ? 'Scanning on your phone' : pairNew ? 'Scan with the new phone' : 'Scan with your phone'}</p><p className="mt-0.5 font-mono text-[12px] font-bold uppercase text-white/60">{connected ? 'paired · this scan only' : live && link ? `single use · ${clock(link.expires - now)}` : 'waiting for a code'}</p></div>
        {live && link && !connected && <QrLinkReveal url={link.url} className="mt-2"/>}
        {pairNew && <button onClick={() => setPairNew(false)} className="mt-2 min-h-10 text-[13px] font-bold text-ink/60 hover:text-ink">Keep the current phone</button>}
        {!phone && !connected && <AndroidFeatureCard className="mt-3"/>}
      </div>
      <div className="flex min-w-0 flex-col">
        <p className="lab">Step {connected || count ? 2 : 1} · {connected ? 'Photos coming in' : pairNew ? 'Connect a new phone' : count ? 'Continue on a phone' : 'Connect your phone'}</p>
        <h2 className="display mt-3 text-[34px] sm:text-[44px]">{connected ? (count ? `${count} of 6 angles in.` : 'Walk around it.') : count ? `${count} of 6 saved. Carry on.` : 'Point your phone here.'}</h2>
        <p className="mt-2 max-w-md text-[15px] font-bold text-ink/60">{connected ? 'Each photo shows up here the moment it lands. Tap ↺ on any photo to have it retaken. The 3D build starts by itself.' : count ? 'Scan the code with any phone to finish the missing angles. Your saved photos come with it, and you can retake any of them.' : 'Your camera opens this exact scan. No app. No sign-in.'}</p>
        <div className="sunk mt-4 h-2 overflow-hidden rounded-full"><div className="h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${Math.max(connected ? 6 : 0, (count / VIEWS.length) * 100)}%` }}/></div>
        <div className="mt-4"><LivePhotos session={session} download={download} onRemove={removePhoto}/></div>
        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          {(phone || !connected) && <button onClick={() => void openHere()} className="btn-ghost press min-h-11 px-4 text-sm"><ScanLine size={15}/>{phone ? 'Scan on this phone' : 'Already on a phone? Open here'}</button>}
          {connected && <button onClick={newPhone} className="btn-ghost press min-h-11 px-4 text-sm"><Smartphone size={14}/>Connect a new phone</button>}
        </div>
        {rotate.isError && <p className="mt-3 text-sm font-semibold text-down">{rotate.error.message}</p>}
      </div>
    </div>
  </div>;
}

function Building({ session, download }: { session: View; download: (url: string) => Promise<Blob> }) {
  const validating = session.state === 'validating'; const screening = session.state === 'screening' || session.state === 'review';
  const progress = validating ? 100 : session.job?.progress ?? 0; const now = useNow(true); const started = session.job?.startedAt ?? session.createdAt;
  const urls = useViewUrls(session, download); const list = useMemo(() => Object.values(urls), [urls]);
  const elapsed = session.job?.startedAt ? now - session.job.startedAt : 0; const busy = !screening && !validating && elapsed > 120_000;
  const stages = ['AI check', 'Shape', 'Colour', 'Finishing', 'Checking'];
  const activeStage = screening ? 0 : validating ? 4 : progress >= 85 ? 3 : progress >= 45 ? 2 : 1;
  const headline = screening ? 'AI is naming your object' : validating ? 'Checking your model' : progress < 45 ? 'Building the shape' : progress < 85 ? 'Painting the colours' : 'Final touches';
  return <div className="raised relative overflow-hidden rounded-[32px]">
    <div className="relative h-[320px] overflow-hidden bg-[#0F1115] sm:h-[440px]">
      <BuildLattice progress={screening ? 0 : progress} mode={screening ? 'search' : 'build'} className="absolute inset-x-0 bottom-0 top-[18%] opacity-90 invert sm:top-[35%]"/>
      {list.length > 0 && <div className="absolute inset-x-4 top-4 grid grid-cols-6 gap-1.5 sm:hidden">{list.slice(0, 6).map((u, i) => <img key={u} src={u} alt="" className="aspect-square w-full rounded-lg object-cover opacity-80 ring-1 ring-white/20" style={{ filter: `grayscale(${Math.min(1, progress / 100 + i * 0.05)})` }}/>)}</div>}
      <DataStream urls={list} progress={screening ? 5 : progress} className="absolute inset-0 hidden sm:block"/>
      <div className="absolute bottom-5 left-5"><p className="text-[15px] font-extrabold text-white/80">{headline}</p><p className="display mt-1 text-5xl text-white tnum sm:text-7xl">{screening ? '…' : `${Math.round(progress)}%`}</p></div>
      <div className="absolute bottom-5 right-5 text-right"><p className="font-mono text-[13px] font-bold text-white/60">elapsed</p><p className="font-mono text-[20px] font-extrabold text-white tnum">{clock(now - started)}</p></div>
    </div>
    <div className="border-t border-ink/[0.06] p-5">
      <div className="sunk h-3 overflow-hidden rounded-full"><div className="h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${screening ? 4 : Math.max(3, progress)}%` }}/></div>
      <ol className="mt-4 grid grid-cols-5 gap-1.5">{stages.map((stage, i) => <li key={stage} className={cn('truncate rounded-xl px-1 py-2 text-center text-[11px] font-extrabold transition-colors sm:px-2 sm:text-[13px]', i < activeStage ? 'text-ink' : i === activeStage ? 'raised' : 'text-ink/35')}>{i < activeStage && <Check size={12} className="mr-1 hidden sm:inline" strokeWidth={3}/>}{stage}</li>)}</ol>
      <EngineTelemetry session={session} now={now}/>
      {session.suggestion && <AiCard session={session}/>}
      {busy ? <p className="mt-4 rounded-2xl bg-ink px-4 py-3 text-[15px] font-bold text-white">Taking a bit longer. No need to wait: name your coin and tap launch. It goes live the second the model is done, and the 3D model appears on your coin page by itself.</p>
        : <p className="mt-4 text-[15px] font-bold text-ink/65">{screening ? 'AI is naming your object and making sure it isn’t on ObjectPad already.' : 'Usually 1–3 minutes. You can launch now; it fires the second the model is done.'}</p>}
      <BitCatcher className="mt-4 hidden h-[220px] sm:block"/>
    </div>
  </div>;
}

/** Real engine telemetry: every value comes from the 3D engine's task status, polled by the backend. */
function EngineTelemetry({ session, now }: { session: View; now: number }) {
  const job = session.job; const screening = session.state === 'screening' || session.state === 'review';
  const status = screening ? 'AI_VISION' : session.state === 'validating' ? 'VALIDATING_GLB' : job?.providerStatus ?? (job?.state === 'submitting' ? 'SUBMITTING' : 'QUEUED');
  const rows: [string, string][] = [
    ['stage', status.replace('_', ' ')],
    ['task', job?.taskRef ? `${job.taskRef}…` : screening ? 'naming + one-of-one check' : 'uploading 4 views'],
    ['engine', job?.model ?? 'multi-view'],
    ['input', `${job?.images ?? 4} views · ${session.views.length} photos`],
    ['queue', job?.queue === undefined ? '—' : job.queue === 0 ? 'running now' : `${job.queue} ahead`],
    ['last poll', job?.polledAt ? `${Math.max(0, Math.round((now - job.polledAt) / 1000))}s ago · #${job.polls ?? 0}` : 'waiting'],
  ];
  return <div className="mt-4 overflow-hidden rounded-2xl bg-[#0F1115] p-3.5 font-mono text-[12px] text-white/80">
    <div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-2 font-extrabold uppercase tracking-wider text-white"><span className="pulse-dot size-1.5 rounded-full bg-up"/>Live engine feed</span><span className="text-white/45">{Math.round(job?.progress ?? 0)}%</span></div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">{rows.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[10.5px] uppercase text-white/40">{k}</dt><dd key={v} className="slide-in truncate font-bold text-white">{v}</dd></div>)}</dl>
  </div>;
}

/** What the vision model saw: object, colours, materials and the coin it suggests. */
function AiCard({ session }: { session: View }) {
  const s = session.suggestion!; const tags = [...(s.colors ?? []), ...(s.materials ?? [])].slice(0, 6);
  return <div className="card-pop sunk mt-3 rounded-2xl p-3.5">
    <p className="spec flex items-center gap-1.5 !text-[11px]"><Sparkles size={11}/>AI vision · identified</p>
    <p className="mt-1.5 text-[17px] font-extrabold">{s.catalog ?? s.object}</p>
    {tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{tags.map((t, i) => <span key={t} className="chip card-pop" style={{ animationDelay: `${i * 90}ms` }}>{t}</span>)}</div>}
    <p className="mt-2.5 text-[13.5px] font-bold text-ink/70">Coin idea: <span className="text-ink">{s.name}</span> <span className="font-mono">${s.ticker}</span></p>
    <p className="mt-1 text-[12.5px] italic text-ink/60">“{s.story}”</p>
    <p className="mt-2 font-mono text-[11px] text-ink/50">checked against {s.compared.toLocaleString()} objects · one of one</p>
  </div>;
}

/** Coin details: AI-prefilled, a locked coin link fixed before launch, the on-chain object name, then launch or save. */
function CoinPanel({ session, call, onSession }: { session: View; call: <T>(path: string, options?: Parameters<typeof api>[1]) => Promise<T>; onSession: (s: View) => void }) {
  const creator = useCreator(); const readiness = useReadiness(); const qc = useQueryClient(); const { play } = usePreferences();
  const suggestion = session.suggestion; const saved = session.launchDraft; const ready = ['model_review', 'approved'].includes(session.state) && Boolean(session.model);
  // The 3D model doesn't have to finish before the coin details are sealed: launching while it's still building
  // queues the sponsored launch, which fires itself the instant the model comes back — no second tap needed.
  const building = ['screening', 'reconstructing', 'validating'].includes(session.state);
  const queued = building && session.autoLaunch === true;
  const defaults = (): Form => ({ publicName: saved?.publicName ?? suggestion?.name ?? '', symbol: saved?.symbol ?? suggestion?.ticker ?? '', story: saved?.story ?? suggestion?.story ?? '', xUrl: saved?.xUrl ?? '', telegram: saved?.telegram ?? '', feeWallet: saved?.feeWallet ?? creator.wallet ?? '' });
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: defaults() }); const { reset } = form; const errors = form.formState.errors;
  const [pairToken, setPairToken] = useState<string>(saved?.pairToken ?? ''); const dirty = form.formState.isDirty || pairToken !== (saved?.pairToken ?? '');
  useEffect(() => { if (!dirty && suggestion) reset(defaults()); }, [suggestion?.name, creator.wallet]); // eslint-disable-line react-hooks/exhaustive-deps
  const sponsor = readiness.data?.sponsor; const funded = Boolean(sponsor && sponsor.launchesAffordable >= 1 && sponsor.usedToday < sponsor.dailyLimit);
  // Guests with no wallet get an on-site dev wallet, generated in this browser at launch, so creator rewards always have a home.
  const body = (v: Form, launching = false): LaunchDraft => { const fee = v.feeWallet || creator.wallet || (launching && !creator.signedIn ? ensureDevWallet().address : ''); return { publicName: v.publicName, symbol: v.symbol.toUpperCase(), story: v.story, xUrl: v.xUrl, ...(v.telegram ? { telegram: v.telegram } : {}), ...(fee ? { feeWallet: fee } : {}), ...(pairToken ? { pairToken } : {}) }; };
  const saveDraft = useMutation({ mutationFn: (v: Form) => call<View>(`/sessions/${session.id}/draft`, { method: 'POST', body: body(v) }), onSuccess: data => { onSession(data); reset(defaults()); } });
  const launch = useMutation({ mutationFn: (v: Form) => call<{ state: string; hash?: string; session: View }>(`/sessions/${session.id}/launch`, { method: 'POST', body: body(v, true), timeout: 90_000 }), onSuccess: data => { onSession(data.session); if (data.state !== 'queued' || data.hash) play('seal'); void qc.invalidateQueries({ queryKey: ['objectpad', 'status'] }); } });
  const guest = session.guest !== false && !creator.signedIn; const coinPath = session.coinUrl ? new URL(session.coinUrl).host + new URL(session.coinUrl).pathname : 'objectpad.fun/o/…';
  const canSubmit = ready || building;
  return <form onSubmit={form.handleSubmit(v => launch.mutate(v))} className="raised rounded-[30px] p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-[20px] font-extrabold"><GlassIcon name="coins" size={40}/>Name your coin</h2>{suggestion && <span className="chip"><Sparkles size={11}/>AI filled</span>}</div>
    <p className="mt-1 text-xs text-ink/65">{suggestion ? `Detected: ${suggestion.object}.` : 'AI suggests a name after the one-of-one check.'} The coin name can’t change after launch.</p>
    <div className="mt-4 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-2.5"><label className="field">Coin name<input {...form.register('publicName')} placeholder="Chubby Vinyl Frog" autoComplete="off" maxLength={32}/>{errors.publicName && <span className="text-xs text-down">{errors.publicName.message}</span>}</label><label className="field">Ticker<input {...form.register('symbol')} placeholder="FROG" autoComplete="off" maxLength={10} className="uppercase"/>{errors.symbol && <span className="text-xs text-down">{errors.symbol.message}</span>}</label></div>
    <label className="field mt-2.5">Description<textarea {...form.register('story')} rows={2} maxLength={280} placeholder="Where it came from, why it matters."/>{errors.story && <span className="text-xs text-down">{errors.story.message}</span>}</label>
    <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2"><label className="field">X (optional)<input {...form.register('xUrl')} placeholder="https://x.com/handle" autoComplete="off"/>{errors.xUrl && <span className="text-xs text-down">{errors.xUrl.message}</span>}</label><label className="field">Telegram (optional)<input {...form.register('telegram')} placeholder="https://t.me/group" autoComplete="off"/>{errors.telegram && <span className="text-xs text-down">{errors.telegram.message}</span>}</label></div>
    <label className="field mt-2.5">Website<span className="relative"><input value={coinPath} readOnly disabled aria-readonly="true" className="w-full cursor-not-allowed !bg-ink/[0.04] pr-10 font-mono text-sm !text-ink/70"/><Lock size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/65"/></span><span className="text-[11px] font-normal text-ink/65">Your coin’s permanent ObjectPad page, fixed before launch. It shows your 3D model now and becomes the chart and trade page at launch.</span></label>
    <PairPicker value={pairToken} onChange={setPairToken} suggestion={suggestion?.pair} disabled={Boolean(session.launch) || queued} className="mt-2.5"/>
    <CoinIconPicker session={session} call={call} onSession={onSession} className="mt-2.5"/>
    <label className="field mt-2.5">Fee wallet (optional)<span className="relative"><input {...form.register('feeWallet')} placeholder="0x… receives the 1.5% creator fee" autoComplete="off" className="w-full pr-10 font-mono text-sm"/><Wallet size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/65"/></span>{errors.feeWallet ? <span className="text-xs text-down">{errors.feeWallet.message}</span> : <span className="text-[11px] font-normal text-ink/65">{creator.wallet ? 'Prefilled with your signed-in wallet.' : 'Leave empty: we create a dev wallet for you on this device at launch.'}</span>}</label>
    {session.onchain && <div className="sunk mt-4 rounded-2xl p-3.5"><p className="spec flex items-center gap-1.5 !text-[11px]"><Cuboid size={11}/>Written into your launch transaction</p><p className="mt-1.5 text-[16px] font-extrabold">{session.onchain.objectName}</p><span className="chip-dark mt-1.5">{session.onchain.objectTag}</span>{session.model && <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] font-bold text-ink/60"><Fingerprint size={12}/>3D sha256 {session.model.originalHash.slice(0, 10)}…{session.model.originalHash.slice(-6)}</p>}<p className="mt-1 text-[11.5px] font-semibold text-ink/55">Your object’s SHA-256 fingerprint goes on-chain, so this exact object can’t be copied or vamped.</p></div>}
    <button type="submit" disabled={!canSubmit || launch.isPending || queued} className="btn press group mt-5 min-h-[62px] w-full !justify-between pl-1.5 pr-5 text-[15.5px]">
      <span className="flex items-center gap-3"><span className="orb size-[50px]">{launch.isPending ? <LoaderCircle size={20} className="animate-spin"/> : <GlassIcon name={ready || building ? 'rocket' : 'mesh'} size={38} className="!filter-none"/>}</span>{queued ? 'Launch queued — building your 3D model' : launch.isPending ? 'Sealing & launching…' : !canSubmit ? 'Unlocks when your 3D model is ready' : ready ? (funded ? 'Launch my coin free' : 'Seal & queue free launch') : 'Launch now — sends the instant it’s built'}</span>{canSubmit ? <ArrowRight size={18}/> : <Lock size={16}/>}
    </button>
    {queued && <div className="slide-in mt-2.5 rounded-2xl bg-up/[0.09] px-3.5 py-2.5 text-[13px] font-bold text-up"><p>Sealed. Your coin launches the second the 3D model finishes building. You can close this page.</p>{session.coinUrl && <Link to={new URL(session.coinUrl).pathname} className="mt-1.5 inline-flex min-h-9 items-center gap-1 font-extrabold underline underline-offset-2">Watch it build on your coin page<ArrowUpRight size={13}/></Link>}</div>}
    <div className="mt-2.5 grid grid-cols-2 gap-2">
      <button type="button" onClick={form.handleSubmit(v => saveDraft.mutate(v))} disabled={saveDraft.isPending || (!dirty && Boolean(saved))} className="btn-ghost press min-h-11 text-[13px] disabled:opacity-50">{saveDraft.isPending ? 'Saving…' : saved && !dirty ? <><Check size={14}/>Details saved</> : 'Save details'}</button>
      {guest ? <span className="sunk flex min-h-11 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-bold text-ink/60"><Inbox size={14}/>Saved in this browser</span>
        : <Link to="/inventory" className="press flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-up/[0.09] text-[13px] font-medium text-up"><Check size={14}/>In your inventory</Link>}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-ink/65">{funded ? `$0 to you. The ObjectPad treasury pays the launch fee, first buy (burned) and gas${sponsor ? ` · ${Math.max(0, sponsor.dailyLimit - sponsor.usedToday)} free launches left today` : ''}.` : 'The treasury is topping up. Your coin is sealed now and launches automatically.'}</p>
    {(launch.isError || saveDraft.isError) && <p role="alert" className="mt-3 rounded-2xl bg-down/[0.07] p-3 text-sm text-down">{(launch.error ?? saveDraft.error)?.message}</p>}
  </form>;
}

/** A copyable link back to this exact scan, so a creator can leave while the 3D model builds and return to launch. */
function SaveLink({ session }: { session: View }) {
  const [copied, setCopied] = useState<boolean>(false);
  const base = /(^|\.)objectpad\.(fun|com)$/i.test(window.location.hostname) ? window.location.origin : 'https://www.objectpad.fun';
  const url = `${base}/launch/${session.id}`;
  const copy = async () => { const ok = await copyText(url); if (ok) { setCopied(true); if (navigator.vibrate) navigator.vibrate(12); setTimeout(() => setCopied(false), 2000); } };
  const share = async () => { try { if (navigator.share) { await navigator.share({ title: 'My ObjectPad scan', url }); return; } } catch { return; } void copy(); };
  return <div className="raised rounded-[26px] p-4 sm:p-5">
    <div className="flex items-center gap-3"><GlassIcon name="qr" size={40}/><div className="min-w-0"><p className="text-[16px] font-extrabold">Save your scan link</p><p className="text-[13px] font-bold text-ink/60">Come back any time to check progress and launch.</p></div></div>
    <button onClick={() => void copy()} className="sunk press mt-3 flex min-h-12 w-full items-center gap-2 rounded-2xl px-3.5 text-left" aria-label="Copy scan link"><span className="min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-ink/75">{url.replace(/^https:\/\//, '')}</span>{copied ? <Check size={16} className="text-up" strokeWidth={3}/> : <Copy size={16}/>}</button>
    <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => void copy()} className="btn press min-h-11 text-[13px]">{copied ? <><Check size={14}/>Copied</> : <><Copy size={14}/>Copy link</>}</button><button onClick={() => void share()} className="btn-ghost press min-h-11 text-[13px]"><ExternalLink size={14}/>Share / save</button></div>
    <p className="mt-2 text-[11.5px] font-semibold text-ink/55">Open it on this device (or signed in) — your scan stays private to you until launch.</p>
  </div>;
}

/** Shown only after a guest's coin is live: their on-site dev wallet (key kept in this browser) and a sign-in to keep it. */
function DevWalletCard({ feeWallet }: { feeWallet: string | null }) {
  const creator = useCreator(); const wallet = devWallet(); const [reveal, setReveal] = useState<boolean>(false); const [copied, setCopied] = useState<string>('');
  if (!wallet || !feeWallet || wallet.address.toLowerCase() !== feeWallet.toLowerCase()) return null;
  const copy = (value: string, key: string) => void copyText(value).then(ok => ok && setCopied(key));
  return <div className="raised rounded-[28px] p-5">
    <div className="flex items-center gap-3"><GlassIcon name="wallet" size={48}/><div className="min-w-0"><p className="font-bold">Your dev wallet</p><p className="truncate font-mono text-xs text-ink/65">{wallet.address}</p></div><button onClick={() => copy(wallet.address, 'a')} className="ml-auto flex size-10 items-center justify-center rounded-full hover:bg-ink/5" aria-label="Copy address">{copied === 'a' ? <Check size={15}/> : <Copy size={15}/>}</button></div>
    <p className="mt-3 text-sm font-medium text-ink/70">Creator rewards from this coin go here. It was made on this device and only you hold the key.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button onClick={() => setReveal(v => !v)} className="btn-ghost press min-h-11 px-4 text-[13px]">{reveal ? 'Hide key' : 'Back up private key'}</button>
      {!creator.signedIn && creator.configured && <button onClick={() => creator.login(['twitter', 'wallet', 'email'])} className="btn press min-h-11 px-5 text-[13px]">Sign in to keep your coins</button>}
    </div>
    {reveal && <div className="mt-3 rounded-2xl bg-down/[0.06] p-3"><p className="text-xs font-bold text-down">Never share this. Anyone with it controls the wallet.</p><p className="mt-1.5 break-all font-mono text-[11px]">{wallet.privateKey}</p><button onClick={() => copy(wallet.privateKey, 'k')} className="mt-2 text-xs font-bold">{copied === 'k' ? 'Copied' : 'Copy key'}</button></div>}
  </div>;
}

/** Shown once the coin is sealed but the 3D model hasn't finished yet: the build lattice, never the capture photos. */
function ModelPending({ session }: { session: View }) {
  return <div className="raised relative flex h-[280px] items-center justify-center overflow-hidden rounded-[32px] bg-[#0F1115] sm:h-[360px]">
    <BuildLattice progress={session.job?.progress ?? 30} mode="build" className="absolute inset-0 opacity-70 invert"/>
    <div className="relative flex flex-col items-center gap-3 px-6 text-center">
      <span className="orb size-16 bg-white/90"><LoaderCircle size={26} className="animate-spin text-ink"/></span>
      <p className="text-[17px] font-extrabold text-white">Coin sealed. 3D model still building{session.job?.progress ? ` · ${Math.round(session.job.progress)}%` : ''}.</p>
      <p className="max-w-xs text-[13px] font-bold text-white/60">It goes live on Robinhood Chain the moment the model is done. The 3D model swaps in here by itself.</p>
    </div>
  </div>;
}
function LaunchProgress({ session, call, onSession }: { session: View; call: <T>(path: string, options?: Parameters<typeof api>[1]) => Promise<T>; onSession: (s: View) => void }) {
  const launch = session.launch!; const tx = useLaunchTx(launch.hash); const [copied, setCopied] = useState<boolean>(false); const { play } = usePreferences(); const qc = useQueryClient();
  const retry = useMutation({ mutationFn: () => call<{ state: string; hash?: string; session: View }>(`/sessions/${session.id}/launch`, { method: 'POST', body: {}, timeout: 90_000 }), onSuccess: data => { onSession(data.session); if (data.hash) play('seal'); void qc.invalidateQueries({ queryKey: ['objectpad', 'status'] }); } });
  const confirmed = launch.recordState === 'confirmed'; const review = launch.recordState === 'reorg_review' || launch.state === 'reorg_review'; const queued = !launch.hash && Boolean(session.failureCode);
  const stage = confirmed ? 3 : launch.hash ? 2 : 1; const coinPath = session.coinUrl ? new URL(session.coinUrl).pathname : null;
  useEffect(() => { if (confirmed) play('launch'); }, [confirmed, play]);
  // Right after a coin goes live, offer sign-in once so the creator's dev wallet and fees are tied to an account.
  const creator = useCreator(); const { signedIn, configured, ready: authReady, login } = creator;
  useEffect(() => { if (!confirmed || signedIn || !configured || !authReady) return; const key = `objectpad.signin-prompt.${session.id}`; try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* ignore */ } const t = setTimeout(() => login(['twitter', 'wallet', 'email']), 1800); return () => clearTimeout(t); }, [confirmed, signedIn, configured, authReady, login, session.id]);
  const share = `I just tokenized a real ${session.suggestion?.object ?? 'object'}: $${session.launchDraft?.symbol ?? ''} on @ObjectPad. Scanned in 3D, named on-chain, one of one.`;
  return <div className="space-y-4">
    <div className="raised rounded-[30px] p-6 sm:p-7">
      <div className="flex items-center gap-3">{confirmed ? <GlassIcon name="rocket" size={64} className="stamp"/> : review ? <AlertTriangle className="text-down"/> : queued ? <Inbox size={26}/> : <LoaderCircle size={26} className="animate-spin"/>}
        <div><p className="display text-2xl sm:text-3xl">{confirmed ? `$${session.launchDraft?.symbol ?? ''} is live.` : review ? 'Held for review' : queued ? 'Sealed & queued' : launch.hash ? 'Confirming on-chain…' : 'Sending launch…'}</p><p className="text-sm font-semibold text-ink/60">{confirmed ? 'Your object is now a coin on Robinhood Chain.' : review ? 'The receipt didn’t match the sealed record exactly, so it isn’t published yet.' : queued ? describeError(session.failureCode ?? 'SPONSOR_EMPTY') : 'Usually under a minute.'}</p></div></div>
      <ol className="mt-5 grid grid-cols-3 gap-2">{['Sealed', 'Sent', 'Confirmed'].map((label, i) => <li key={label} className={cn('flex min-h-11 items-center justify-center gap-1.5 rounded-full text-xs font-extrabold', i < stage ? 'raised text-ink' : 'sunk text-ink/65')}>{i < stage && <Check size={12} strokeWidth={3}/>}{label}</li>)}</ol>
      {!launch.hash && !review && <><CoinIconPicker session={session} call={call} onSession={onSession} className="mt-5"/>
        {queued && session.model && <button onClick={() => retry.mutate()} disabled={retry.isPending} className="btn press group mt-3 min-h-[58px] w-full !justify-between pl-1.5 pr-5 text-[15px]"><span className="flex items-center gap-3"><span className="orb size-[46px]">{retry.isPending ? <LoaderCircle size={18} className="animate-spin"/> : <GlassIcon name="rocket" size={34} className="!filter-none"/>}</span>{retry.isPending ? 'Sending your launch…' : 'Launch now'}</span><ArrowRight size={18}/></button>}
        {retry.isError && <p role="alert" className="mt-2 rounded-2xl bg-down/[0.07] p-3 text-sm text-down">{retry.error.message}</p>}</>}
      {coinPath && !confirmed && <Link to={coinPath} className="mt-3 inline-flex min-h-10 items-center gap-1 text-[13px] font-extrabold underline underline-offset-2">Open your coin link<ArrowUpRight size={13}/></Link>}
      {confirmed && coinPath && <div className="mt-5 flex flex-wrap gap-2"><Link to={coinPath} className="btn press min-h-12 px-5 text-sm">Open coin page<ArrowUpRight size={15}/></Link><button onClick={() => void copyText(session.coinUrl ?? '').then(setCopied)} className="btn-ghost press min-h-12 px-5 text-sm">{copied ? <Check size={15}/> : <Copy size={15}/>}{copied ? 'Copied' : 'Copy link'}</button><a href={`https://x.com/intent/post?text=${encodeURIComponent(share)}&url=${encodeURIComponent(session.coinUrl ?? '')}`} target="_blank" rel="noreferrer" className="btn-ghost press min-h-12 px-5 text-sm">Share on X<ExternalLink size={14}/></a></div>}
    </div>
    {confirmed && <DevWalletCard feeWallet={launch.feeWallet}/>}
    <div className="raised rounded-[24px] p-4"><p className="spec">On-chain object record</p><p className="mt-1.5 font-extrabold">{launch.objectName ?? session.onchain?.objectName}</p><p className="font-mono text-xs font-bold">{launch.objectTag ?? session.onchain?.objectTag}</p><p className="mt-2 font-mono text-[11px] text-ink/65">Fees → {launch.feeRecipientKind === 'launch_pool' ? 'free-launch pool' : shortAddress(launch.feeWallet ?? '', 6, 4)}</p></div>
    {launch.hash && <TxPanel view={tx.data} loading={tx.isPending} expected={{ objectTag: launch.objectTag ?? undefined }}/>}
  </div>;
}

/** The live studio for one scan, on desktop or phone: handoff, AI check, real 3D progress, model review and launch. */
export default function Studio() {
  const { id = '' } = useParams(); const navigate = useNavigate(); const creator = useCreator(); const { call, download } = useSessionCaller(id); const qc = useQueryClient(); const { play } = usePreferences();
  const key = ['objectpad', 'session', id, creator.signedIn];
  const query = useQuery({ queryKey: key, queryFn: () => call<View>(`/sessions/${id}`), retry: (count, error) => !(error instanceof RequestError && error.status === 404) && count < 2, refetchInterval: q => { const s = q.state.data; if (!s) return false; if (s.launch?.recordState === 'confirmed' || TERMINAL.includes(s.state)) return false; if (['screening', 'reconstructing', 'validating'].includes(s.state)) return 2000; if (s.launch) return 3500; if (s.state === 'model_review') return 10000; if (['awaiting_mobile', 'capturing', 'review'].includes(s.state)) return 1200; return 2500; } });
  const setSession = (s: View) => qc.setQueryData(key, s);
  const reconstruct = useMutation({ mutationFn: () => call<View>(`/sessions/${id}/reconstruct`, { method: 'POST', body: {}, timeout: 150_000 }), onSuccess: setSession, onSettled: () => void query.refetch() });
  const regenerate = useMutation({ mutationFn: () => call<View>(`/sessions/${id}/regenerate`, { method: 'POST', body: {}, timeout: 90_000 }), onSuccess: setSession });
  // Rescan keeps both devices linked: a fresh scan for the same owner; the paired phone follows automatically.
  const rescan = useMutation({ mutationFn: () => call<{ session: View }>(`/sessions/${id}/rescan`, { method: 'POST', body: {} }), onSuccess: data => { forgetScan(id); rememberScan(data.session.id); navigate(`/launch/${data.session.id}`); } });
  // Start over: cancels this scan everywhere (the phone is told too) and opens a brand-new one with a fresh QR code.
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const startOver = useMutation({ mutationFn: async () => { await call(`/sessions/${id}/cancel`, { method: 'POST', body: {} }).catch((e: unknown) => { if (!(e instanceof RequestError && [404, 409].includes(e.status))) throw e; }); forgetScan(id); qc.removeQueries({ queryKey: ['objectpad', 'scan-link'] }); return openScan(creator.token); }, onSuccess: scan => { setConfirmReset(false); play('retry'); if (isPhone() && scan.url) { navigate(`/capture/claim${new URL(scan.url).hash}`, { replace: true }); return; } navigate(`/launch/${scan.session.id}`, { replace: true }); } });
  const session = query.data; const state = session?.state; const announced = useRef<string>('');
  useEffect(() => { if (session?.successor) navigate(`/launch/${session.successor}`, { replace: true }); }, [session?.successor, navigate]);
  const engine = useEngineLog(session); const [revealed, setRevealed] = useState<boolean>(false);
  useEffect(() => { if (!state || announced.current === state) return; if (state === 'model_review') play('model'); if (state === 'blocked' || state === 'failed') play('rejected'); announced.current = state; }, [state, play]);
  // Start the AI check and 3D rebuild as soon as all six angles are in.
  const { mutate, isIdle } = reconstruct;
  // An AI hiccup from an earlier attempt retries itself once automatically instead of leaving a dead end.
  const autoScreen = useRef<boolean>(false);
  useEffect(() => { if (!session || session.state !== 'review' || session.views.length < VIEWS.length || !isIdle) return; if (!session.failureCode) mutate(); else if (session.failureCode === 'MEDIA_VALIDATION_UNAVAILABLE' && !autoScreen.current) { autoScreen.current = true; mutate(); } }, [session, isIdle, mutate]);
  // A failed 3D build retries itself once straight away; after that the creator gets a one-tap "Try again now".
  const autoRetried = useRef<boolean>(false); const { mutate: regen, isIdle: regenIdle } = regenerate;
  const autoCount = useRef<number>(0);
  useEffect(() => { const soft = ['PROVIDER_PAYLOAD_TOO_LARGE', 'PROVIDER_UNAVAILABLE', 'PROVIDER_REQUEST_TIMEOUT', 'PROVIDER_RATE_LIMIT', 'PROVIDER_FAILED', 'PROVIDER_TIMEOUT'].includes(session?.failureCode ?? ''); if (session?.state === 'failed' && regenIdle && autoCount.current < 3 && (soft || (session.failureRetries ?? 0) === 0)) { autoCount.current += 1; autoRetried.current = true; const t = setTimeout(() => regen(), 1500); return () => clearTimeout(t); } }, [session?.state, session?.failureCode, session?.failureRetries, regenIdle, regen]);
  // A guest who signs in keeps this scan: it moves into their account's inventory.
  const adopt = useMutation({ mutationFn: async () => api<{ adopted: number }>('/account/adopt', { token: await creator.token(), method: 'POST', body: { sessionId: id, ...(guestToken() ? { guestToken: guestToken() } : {}), ...(deviceSecret(id) ? { deviceSecret: deviceSecret(id) } : {}) } }), onSettled: () => void qc.invalidateQueries({ queryKey: ['objectpad', 'session', id] }) });
  const { mutate: adoptNow, isIdle: adoptIdle } = adopt;
  // This scan is what every QR on the site resumes until its coin is live.
  useEffect(() => { if (!session) return; if (session.launch?.recordState === 'confirmed' || TERMINAL.includes(session.state) || session.state === 'failed') forgetScan(session.id); else rememberScan(session.id); }, [session]);
  useEffect(() => { if (creator.signedIn && session?.guest && !session.launch && adoptIdle) adoptNow(); }, [creator.signedIn, session?.guest, session?.launch, adoptIdle, adoptNow]);

  if (query.isPending) return <Loading label="Opening your scan…"/>;
  if (query.isError || !session) return <div className="page max-w-2xl py-16"><ErrorState message={query.error instanceof RequestError && query.error.status === 404 ? 'This scan belongs to another browser or account. Open it where you started, or sign in with the account that owns it.' : query.error?.message ?? 'The scan could not be opened.'} retry={() => void query.refetch()}/><Link to="/launch" className="btn press mt-4 min-h-11 px-5 text-sm"><ScanLine size={15}/>Start a new scan</Link></div>;
  const code = session.failureCode; const capturing = ['awaiting_mobile', 'capturing'].includes(session.state) || (session.state === 'review' && session.views.length < VIEWS.length);
  // A 3D build running past 3 minutes counts as failed: it stays off the market until the creator regenerates it.
  const stalled = session.state === 'reconstructing' && Boolean(session.job?.startedAt) && Date.now() - (session.job?.startedAt ?? 0) > 180_000;
  const building = !stalled && (['screening', 'reconstructing', 'validating'].includes(session.state) || (session.state === 'review' && session.views.length >= VIEWS.length && !code));
  const modelReady = ['model_review', 'approved'].includes(session.state) && Boolean(session.model);
  const left = MAX_REGENERATIONS - (session.regenerations ?? 0);
  const providerFailed = stalled || session.state === 'failed' || (session.state === 'blocked' && code === 'PROVIDER_SUBMISSION_UNCERTAIN');
  const retriesLeft = 8 - (session.failureRetries ?? 0);
  const rescanButton = (big = false) => <button onClick={() => rescan.mutate()} disabled={rescan.isPending} className={cn('btn-ghost press px-5', big ? 'min-h-[56px] text-[15px]' : 'min-h-11 text-sm')}>{rescan.isPending ? <LoaderCircle size={15} className="animate-spin"/> : <ScanLine size={15}/>}{rescan.isPending ? 'Starting new scan…' : 'Rescan'}</button>;
  const title = session.launchDraft?.publicName ?? session.suggestion?.name ?? (capturing ? (session.views.length ? 'Your scan' : 'New scan') : 'Your object');
  const canReset = !session.launch && !TERMINAL.includes(session.state) && !session.autoLaunch && !session.launchQueuedAt;
  const resumed = capturing && session.views.length > 0 && Date.now() - session.createdAt > 5 * 60_000;
  return <div className="page py-5 sm:py-8">
    <div className="flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><p className="lab hidden sm:inline-flex">{session.guest ? 'Your scan · saved in this browser' : 'Saved to your inventory'} · started {timeAgo(session.createdAt)}</p><h1 className="display text-[32px] sm:mt-3 sm:text-[52px]">{title}</h1></div><div className="flex flex-wrap items-center gap-2"><span className="chip hidden sm:inline-flex"><Lock size={11}/>Private until launch</span><span className="chip hidden sm:inline-flex">$0 · treasury pays</span>{canReset && <button onClick={() => setConfirmReset(true)} className="btn-ghost press min-h-10 px-4 text-[13px]"><RotateCcw size={14}/>Start over</button>}</div></div>
    {resumed && <div className="slide-in raised mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] px-4 py-3"><p className="flex items-center gap-2.5 text-[14px] font-extrabold"><GlassIcon name="mesh" size={30}/>Picked up your scan from {timeAgo(session.createdAt)} · {session.views.length} of 6 photos saved</p><div className="flex gap-2"><button onClick={() => setConfirmReset(true)} className="btn press min-h-10 px-4 text-[13px]"><ScanLine size={14}/>Scan something new</button></div></div>}
    <Dialog open={confirmReset} onOpenChange={open => { if (!startOver.isPending) setConfirmReset(open); }} title="Start a new scan?" description={session.views.length ? `This cancels the current scan and deletes its ${session.views.length} photo${session.views.length === 1 ? '' : 's'}${building ? ' and the 3D build in progress' : ''}. Your phone is disconnected and you get a fresh QR code.` : 'This cancels the current scan and gives you a fresh QR code.'}>
      <div className="grid gap-2"><button onClick={() => startOver.mutate()} disabled={startOver.isPending} className="btn press min-h-[52px] text-[15px]">{startOver.isPending ? <LoaderCircle size={16} className="animate-spin"/> : <RotateCcw size={16}/>}{startOver.isPending ? 'Starting fresh…' : 'Cancel this scan & start new'}</button><button onClick={() => setConfirmReset(false)} disabled={startOver.isPending} className="btn-ghost press min-h-12 text-sm">Keep this scan</button>{startOver.isError && <p role="alert" className="text-sm font-semibold text-down">{startOver.error.message}</p>}</div>
    </Dialog>
    <div className="mt-5"><Stepper session={session}/></div>
    <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-4">
        {session.launch ? (session.model ? <PrivateModel session={session} height="h-[360px] sm:h-[480px]"/> : <ModelPending session={session}/>)
          : capturing ? <Handoff session={session} call={call} download={download}/>
          : building ? <Building session={session} download={download}/>
          : modelReady ? <>
            <div className="relative overflow-hidden rounded-[32px]"><PrivateModel session={session} height="h-[380px] sm:h-[520px]"/>{!revealed && <AsciiReveal onDone={() => setRevealed(true)}/>}</div>
            <div className="raised grid grid-cols-2 items-center gap-2 rounded-[22px] p-2.5 sm:flex sm:flex-wrap">
              <span className="col-span-2 px-2 text-sm font-extrabold sm:col-auto">Like it?</span>
              <button onClick={() => regenerate.mutate()} disabled={left <= 0 || regenerate.isPending} className="btn-ghost press min-h-10 px-4 text-[13px] disabled:opacity-40">{regenerate.isPending ? <LoaderCircle size={14} className="animate-spin"/> : <RefreshCw size={14}/>}Regenerate 3D <span className="font-mono text-[11.5px] text-ink/65">{left} left</span></button>
              <button onClick={() => rescan.mutate()} disabled={rescan.isPending} className="btn-ghost press min-h-10 px-4 text-[13px]">{rescan.isPending ? <LoaderCircle size={14} className="animate-spin"/> : <ScanLine size={14}/>}Rescan</button>
              {session.model && <span className="ml-auto hidden px-2 font-mono text-[11px] text-ink/65 sm:block">{session.model.triangles.toLocaleString()} tris · {session.model.textures} textures · {session.views.length} photos</span>}
              {regenerate.isError && <p className="w-full px-2 text-xs text-down">{regenerate.error.message}</p>}
            </div>
          </>
          : session.state === 'review' && code ? <div className="glass rounded-[28px] p-8 text-center"><AlertTriangle size={30} className="mx-auto text-down"/><h2 className="display mt-4 text-3xl">Let’s try that again.</h2><p className="mx-auto mt-2 max-w-md text-sm text-ink/65">{describeError(code)}</p><div className="mt-5 grid gap-2 sm:flex sm:justify-center"><button onClick={() => reconstruct.mutate()} disabled={reconstruct.isPending} className="btn press min-h-[56px] px-6 text-[15px]">{reconstruct.isPending ? <LoaderCircle size={16} className="animate-spin"/> : <RefreshCw size={16}/>}Try again now</button>{rescanButton()}</div></div>
          : providerFailed ? <div className="raised rounded-[30px] p-6 sm:p-8"><GlassIcon name="mesh" size={56}/><h2 className="display mt-4 text-[30px] leading-none sm:text-3xl">{stalled ? '3D build failed.' : retriesLeft > 0 ? 'The 3D engine hiccupped.' : 'We couldn’t build this one.'}</h2><p className="mt-3 max-w-md text-[15px] font-semibold text-ink/65">{stalled ? 'It ran past 3 minutes, so we stopped waiting. Your coin won’t show on the market or front page until it has its 3D model. Regenerate it from the same photos. Free.' : retriesLeft > 0 ? 'Your photos are safe. Rebuild from the same photos. Free, and it doesn’t use up your rebuilds.' : 'Rescan the object on a plain surface in even light.'}</p><div className="mt-5 grid gap-2 sm:flex">{retriesLeft > 0 && <button onClick={() => regenerate.mutate()} disabled={regenerate.isPending} className="btn press min-h-[56px] px-6 text-[15px]">{regenerate.isPending ? <LoaderCircle size={16} className="animate-spin"/> : <RefreshCw size={16}/>}{regenerate.isPending ? 'Sending to the 3D engine…' : stalled ? 'Regenerate 3D' : 'Try again now'}</button>}{rescanButton(true)}</div>{code && <p className="mt-3 font-mono text-[11.5px] font-bold text-ink/50">last error · {code.toLowerCase()}</p>}{(regenerate.isError || rescan.isError) && <p className="mt-3 text-sm font-semibold text-down">{(regenerate.error ?? rescan.error)?.message}</p>}</div>
          : <div className="glass rounded-[28px] p-8"><GlassIcon name="shield" size={56}/><h2 className="display mt-4 text-3xl">{code === 'DUPLICATE_OBJECT' ? 'Already on ObjectPad.' : session.state === 'failed' ? 'The 3D rebuild didn’t work.' : session.state === 'cancelled' ? 'Scan cancelled.' : session.state === 'expired' ? 'This scan expired.' : 'This scan is on hold.'}</h2><p className="mt-2 max-w-md text-sm text-ink/65">{code === 'PROVIDER_SUBMISSION_UNCERTAIN' ? 'We couldn’t confirm the 3D job started, so we paused instead of paying twice. An operator will review it.' : code ? describeError(code) : 'Start a fresh scan any time.'}</p><div className="mt-5 flex flex-wrap gap-2">{session.state === 'failed' && left > 0 && <button onClick={() => regenerate.mutate()} disabled={regenerate.isPending} className="btn press min-h-11 px-5 text-sm"><RefreshCw size={15}/>Rebuild from the same photos</button>}{session.state === 'cancelled' || session.state === 'expired' ? <Link to="/launch" className="btn-ghost press min-h-11 px-5 text-sm"><ScanLine size={15}/>Scan something else</Link> : rescanButton()}</div>{regenerate.isError && <p className="mt-3 text-sm text-down">{regenerate.error.message}</p>}</div>}
        {reconstruct.isError && !building && <p className="text-sm text-down">{reconstruct.error.message}</p>}
      </div>
      <div className="space-y-4">
        {session.launch ? <LaunchProgress session={session} call={call} onSession={setSession}/>
          : !TERMINAL.includes(session.state) && session.state !== 'failed' && (building || modelReady) ? <><CoinPanel session={session} call={call} onSession={setSession}/><SaveLink session={session}/></>
          : <div className="raised rounded-[30px] p-5 sm:p-6"><p className="lab">Next: 3D model → coin</p><p className="mt-3 text-[18px] font-extrabold">Launch unlocks once your 3D model is built.</p><ul className="mt-4 space-y-2">{([['mesh', 'One object, plain table, even daylight.'], ['qr', 'Keep it still. Move yourself around it.'], ['ai', 'AI names it and checks it’s one of one.'], ['shield', 'Six angles. The camera guides you.']] as [GlassName, string][]).map(([icon, text]) => <li key={text} className="sunk flex items-center gap-3 rounded-2xl p-2 pr-3"><GlassIcon name={icon} size={36}/><span className="text-[13.5px] font-bold text-ink/75">{text}</span></li>)}</ul></div>}
      </div>
    </div>
    <EngineLog lines={engine.lines} className="mt-4 hidden sm:block"/>
  </div>;
}
