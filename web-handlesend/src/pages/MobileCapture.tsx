import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Camera, Check, Hand, LoaderCircle, RotateCcw, ScanLine, Sun, AlertTriangle, Smartphone, Cuboid, X } from 'lucide-react';
import { api, RequestError } from '@/lib/api';
import { deviceSecret, forgetDeviceScan, lastDeviceScan, saveDeviceSecret, useSessionCaller } from '@/lib/creator';
import { usePreferences } from '@/hooks/use-preferences';
import { PointCloud } from '@/components/PointCloud';
import { MEMES } from '@/lib/memes';
import { CAPTURE_LONG_SIDE, MIN_IMAGE_SIDE, perceptualDistance } from '@/shared/capture';
import { checkFrame, thumbDiff, thumbnail } from '@/lib/frameCheck';
import { useViewUrls } from '@/components/ScanSequence';
import { VIEWS, type CaptureSession, type ViewId } from '@/shared/domain';
import { cn } from '@/lib/utils';

type Status = 'queued' | 'uploading' | 'accepted' | 'rejected';
interface Shot { view: ViewId; url: string; blob: Blob; signature: string; status: Status; error?: string; tries?: number; }
interface Pose { heading: number; pitch: number; at: number; }
interface Hud { light: 'dark' | 'bright' | 'ok'; sharp: boolean; object: boolean; steady: boolean; angle: boolean; moved: boolean; hold: number; delta: number | null; pitch: number | null; }
interface Flying { key: number; url: string; style: Record<string, string>; }
interface OrientationPermission { requestPermission?: () => Promise<'granted' | 'denied'>; }

const PENDING = 'objectpad.pending-handoff';
const FRAME_REJECTIONS = new Set(['IMAGE_QUALITY', 'IMAGE_RESOLUTION', 'IMAGE_NOT_VALIDATED', 'DUPLICATE_VIEW', 'DUPLICATE_ARCHIVE_FRAME', 'NO_OBJECT', 'OBJECT_OR_BACKGROUND_QUALITY', 'UNSUPPORTED_IMAGE', 'RETAKE_REQUIRED']);
const TOL = 26; const HOLD_MS = 700; const STEADY_MS = 350; const VISUAL_NEW_ANGLE = 13;
/** Steadiness: the phone's pointing direction may wander this many degrees within the window and still count as still. */
const STEADY_DEG = 4.5; const STEADY_WINDOW = 450; const STILL_DIFF = 9; const NEW_SIDE_DEG = 35; const NEW_SIDE_DIFF = 18; const MAX_TRIES = 4;
const ORDER: ViewId[] = ['front', 'right', 'back', 'left', 'high-front', 'high-back'];
const SHORT: Record<ViewId, string> = { front: 'Front', right: 'Right', back: 'Back', left: 'Left', 'high-front': 'Top 1', 'high-back': 'Top 2' };
const wrap = (d: number): number => ((d + 540) % 360) - 180;
const deg = Math.PI / 180;

function readHandoff(): { id: string; token: string } {
  const params = new URLSearchParams(location.hash.slice(1)); const fresh = { id: params.get('session') ?? '', token: params.get('token') ?? '' };
  // #session=<id> without a token: resume a scan this phone is already paired to.
  if (fresh.id && !fresh.token && /^[a-f0-9-]{36}$/.test(fresh.id)) { history.replaceState(null, '', location.pathname); return fresh; }
  if (fresh.id && fresh.token) { try { sessionStorage.setItem(PENDING, JSON.stringify({ ...fresh, expires: Date.now() + 600_000 })); } catch { /* ignore */ } history.replaceState(null, '', location.pathname); return fresh; }
  try { const saved = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as { id: string; token: string; expires: number } | null; if (saved && saved.expires > Date.now()) return saved; } catch { /* ignore */ }
  // The page reloaded (or the tab was reopened) after pairing: link straight back to the last paired scan.
  const last = lastDeviceScan(); if (last) return { id: last, token: '' };
  return fresh;
}
/** Moves this phone to the linked follow-up scan (after a rescan on either device), keeping its pairing. */
function followScan(from: string, to: string): void {
  const secret = deviceSecret(from); forgetDeviceScan(from); if (secret) saveDeviceSecret(to, secret);
  window.location.replace(`/capture/claim?s=${to.slice(0, 8)}#session=${to}`);
}
/** Direction the rear camera looks, from W3C device orientation (Z-X'-Y'' Euler): compass-like heading and pitch. */
function poseFrom(event: DeviceOrientationEvent): Pose | null {
  if (event.alpha === null || event.beta === null || event.gamma === null) return null;
  const a = event.alpha * deg; const b = event.beta * deg; const g = event.gamma * deg;
  const fx = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g); const fy = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g); const fz = -Math.cos(b) * Math.cos(g);
  return { heading: (Math.atan2(fx, fy) / deg + 360) % 360, pitch: Math.asin(Math.max(-1, Math.min(1, fz))) / deg, at: performance.now() };
}
const GUIDE: Record<ViewId, { title: string; hint: string; move: string }> = {
  front: { title: 'Front', hint: 'Face the object, phone at its height.', move: 'Face the front of the object.' },
  right: { title: 'Right side', hint: 'Walk a quarter turn around it.', move: 'Walk a quarter turn around it.' },
  back: { title: 'Back', hint: 'Keep walking to the far side.', move: 'Keep walking to the back.' },
  left: { title: 'Left side', hint: 'One more quarter turn.', move: 'One more quarter turn.' },
  'high-front': { title: 'Top · front', hint: 'Raise your phone and look down at it.', move: 'Raise the phone and tilt it down.' },
  'high-back': { title: 'Top · back', hint: 'From above, on the far side.', move: 'From above, go to the far side.' },
};
/** Does the phone's pose match the angle we want? `d` is heading relative to the front shot. */
function angleMatch(view: ViewId, d: number, pitch: number, sign: number): boolean {
  const level = pitch > -22 && pitch < 34; const high = pitch <= -22 && pitch > -78; const near = (a: number, b: number, tol: number) => Math.abs(wrap(a - b)) < tol;
  switch (view) {
    case 'front': return level && near(d, 0, TOL);
    case 'back': return level && near(Math.abs(d), 180, TOL);
    case 'right': return level && near(Math.abs(d), 90, TOL);
    case 'left': return level && (sign ? near(d, -sign * 90, TOL) : near(Math.abs(d), 90, TOL));
    case 'high-front': return high && near(d, 0, TOL + 12);
    case 'high-back': return high && near(Math.abs(d), 180, TOL + 12);
  }
}
function degreesToGo(view: ViewId, d: number, sign: number): number {
  const targets = view === 'front' || view === 'high-front' ? [0] : view === 'back' || view === 'high-back' ? [180, -180] : view === 'left' && sign ? [-sign * 90] : [90, -90];
  return Math.round(Math.min(...targets.map(t => Math.abs(wrap(t - d)))));
}

const INTRO_STEPS: { icon: typeof Sun; title: string; text: string }[] = [
  { icon: Sun, title: 'Set it up', text: 'One object on a plain table, in even light.' },
  { icon: Hand, title: 'Keep it still', text: 'The object stays put. You move around it.' },
  { icon: RotateCcw, title: 'Walk one lap', text: 'Four sides at object height, then two from above. The camera shoots by itself.' },
];

/** Full-screen, dark pre-camera screen: live point-cloud preview, three swipeable tips and one big start button. */
function IntroScreen({ onStart, onBack, error }: { onStart: () => void; onBack: () => void; error: string }) {
  const [step, setStep] = useState<number>(0); const [starting, setStarting] = useState<boolean>(false);
  useEffect(() => { const t = setInterval(() => setStep(s => (s + 1) % INTRO_STEPS.length), 3200); return () => clearInterval(t); }, []);
  useEffect(() => { if (error) setStarting(false); }, [error]);
  const current = INTRO_STEPS[step]; const Icon = current.icon;
  return <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0B0C0F] text-white">
    <div className="grid-smoke pointer-events-none absolute inset-0 opacity-60" aria-hidden="true"/>
    <div className="relative flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
      <button onClick={onBack} className="press flex size-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-md" aria-label="Back"><ArrowLeft size={19}/></button>
      <span className="flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-2 text-[13px] font-extrabold backdrop-blur-md"><span className="pulse-dot size-2 rounded-full bg-up"/>Connected to your scan</span>
    </div>
    <div className="relative mx-4 mt-4 min-h-0 flex-1 overflow-hidden rounded-[32px] bg-gradient-to-b from-white/[0.07] to-white/[0.02] ring-1 ring-white/10">
      <PointCloud src={MEMES[0].points} mode="scan" size={2.2} className="absolute inset-0"/>
      <div className="viewfinder pointer-events-none absolute inset-[14%] text-white/70"><span/><span/><span/><span/></div>
      <div className="intro-scanline pointer-events-none absolute inset-x-[14%] h-[2px] bg-white/80 shadow-[0_0_18px_4px_rgba(255,255,255,.45)]"/>
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">{VIEWS.map((v, i) => <span key={v.id} className="intro-dot size-2 rounded-full bg-white" style={{ animationDelay: `${i * 0.35}s` }}/>)}</div>
    </div>
    <div className="relative px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-5">
      <p className="font-mono text-[12px] font-extrabold uppercase tracking-[0.16em] text-white/55">Step {step + 1} of 3</p>
      <div key={step} className="slide-in mt-2 flex items-start gap-3.5"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-ink"><Icon size={22} strokeWidth={2.4}/></span><div><h1 className="display text-[30px] leading-none">{current.title}</h1><p className="mt-2 text-[16px] font-semibold leading-6 text-white/75">{current.text}</p></div></div>
      <div className="mt-4 flex gap-1.5">{INTRO_STEPS.map((s, i) => <button key={s.title} onClick={() => setStep(i)} aria-label={s.title} className="h-11 flex-1"><span className="block h-1 overflow-hidden rounded-full bg-white/20"><span className={cn('block h-full rounded-full bg-white transition-all duration-500', i <= step ? 'w-full' : 'w-0')}/></span></button>)}</div>
      {error && <p role="alert" className="mt-2 rounded-2xl bg-down/90 p-3 text-[14px] font-bold">{error}</p>}
      <button onClick={() => { setStarting(true); onStart(); }} disabled={starting && !error} className="press mt-3 flex min-h-[62px] w-full items-center justify-between rounded-full bg-white pl-6 pr-2 text-[17px] font-extrabold text-ink shadow-[0_20px_40px_-18px_rgba(255,255,255,.5)] disabled:opacity-70"><span className="flex items-center gap-2.5">{starting && !error ? <LoaderCircle size={19} className="animate-spin"/> : <Camera size={19}/>}{starting && !error ? 'Opening camera…' : 'Open camera'}</span><span className="flex size-12 items-center justify-center rounded-full bg-ink text-white"><ArrowRight size={19}/></span></button>
      <p className="mt-3 text-center text-[12px] font-semibold text-white/50">Photos stay private. Location data is removed.</p>
    </div>
  </div>;
}


function Status({ ok, label }: { ok: boolean; label: string }) {
  return <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-extrabold transition-colors', ok ? 'bg-[#34D57A]/20 text-[#7CF0AE]' : 'bg-black/45 text-white/80')}><span className={cn('status-dot size-2 rounded-full', ok ? 'bg-[#34D57A]' : 'bg-[#FF5A4E]')}/>{label}</span>;
}

/** Full-screen check of all six photos, one card at a time, before the 3D build starts. */
function Review({ session, local, download, onRetake, onBuild }: { session: CaptureSession; local: Partial<Record<ViewId, string>>; download: (url: string) => Promise<Blob>; onRetake: (view: ViewId) => void; onBuild: () => void }) {
  const remote = useViewUrls(session, download); const [index, setIndex] = useState<number>(0); const [dir, setDir] = useState<'next' | 'back'>('next'); const [building, setBuilding] = useState<boolean>(false);
  const view = ORDER[index]; const url = local[view] ?? remote[view]; const last = index === ORDER.length - 1;
  const go = (i: number) => { setDir(i > index ? 'next' : 'back'); setIndex(Math.max(0, Math.min(ORDER.length - 1, i))); if (navigator.vibrate) navigator.vibrate(8); };
  return <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-[#0B0C0F] text-white">
    <div className="flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
      <div><p className="font-mono text-[12px] font-extrabold uppercase tracking-[0.16em] text-white/55">Check your photos</p><p className="display mt-1 text-[28px] leading-none">{index + 1} of 6 · {GUIDE[view].title}</p></div>
      <span className="flex items-center gap-1.5 rounded-full bg-[#34D57A]/20 px-3 py-1.5 text-[13px] font-extrabold text-[#7CF0AE]"><Check size={14} strokeWidth={3}/>6/6</span>
    </div>
    <div className="relative mx-4 mt-4 min-h-0 flex-1">
      <div key={`${view}-${dir}`} className={cn('review-card absolute inset-0 overflow-hidden rounded-[30px] bg-white/5 ring-1 ring-white/10', dir === 'back' && 'back')}>
        {url ? <img src={url} alt={`${GUIDE[view].title} photo`} className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center"><LoaderCircle className="animate-spin text-white/60"/></div>}
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-2xl bg-black/55 px-3 py-2.5"><span className="flex items-center gap-2 text-[14px] font-extrabold"><span className="flex size-6 items-center justify-center rounded-full bg-[#34D57A] text-ink"><Check size={13} strokeWidth={3.5}/></span>Sharp · lit · accepted</span><button onClick={() => onRetake(view)} className="press flex min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-[13px] font-extrabold"><RotateCcw size={14}/>Retake</button></div>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-6 gap-1.5 px-4">{ORDER.map((v, i) => { const u = local[v] ?? remote[v]; return <button key={v} onClick={() => go(i)} aria-label={GUIDE[v].title} className={cn('relative aspect-square overflow-hidden rounded-xl ring-2 transition-all', i === index ? 'scale-105 ring-white' : 'ring-transparent opacity-60')}>{u ? <img src={u} alt="" className="size-full object-cover"/> : <span className="block size-full bg-white/10"/>}</button>; })}</div>
    <div className="grid grid-cols-[auto_1fr] gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
      <button onClick={() => go(index - 1)} disabled={index === 0} className="press flex size-[60px] items-center justify-center rounded-full bg-white/10 disabled:opacity-30" aria-label="Previous photo"><ArrowLeft size={20}/></button>
      {last ? <button onClick={() => { setBuilding(true); onBuild(); }} disabled={building} className="press flex min-h-[60px] items-center justify-between rounded-full bg-white pl-6 pr-2 text-[17px] font-extrabold text-ink"><span className="flex items-center gap-2.5">{building ? <LoaderCircle size={19} className="animate-spin"/> : <Cuboid size={19}/>}{building ? 'Starting 3D build…' : 'Build my 3D model'}</span><span className="flex size-12 items-center justify-center rounded-full bg-ink text-white"><ArrowRight size={19}/></span></button>
        : <button onClick={() => go(index + 1)} className="press flex min-h-[60px] items-center justify-between rounded-full bg-white pl-6 pr-2 text-[17px] font-extrabold text-ink"><span>Next photo</span><span className="flex size-12 items-center justify-center rounded-full bg-ink text-white"><ArrowRight size={19}/></span></button>}
    </div>
  </div>;
}

/** The phone scanner: live light / focus / object / steady checks, a green frame when the shot is good, six guided angles. */
export default function MobileCapture() {
  const navigate = useNavigate(); const { play } = usePreferences();
  const [handoff] = useState(readHandoff); const id = handoff.id; const { call, download } = useSessionCaller(id);
  const [session, setSession] = useState<CaptureSession | null>(null); const [pairError, setPairError] = useState<string>(''); const [phase, setPhase] = useState<'pair' | 'intro' | 'camera' | 'review'>('pair');
  const [shots, setShots] = useState<Shot[]>([]); const [cameraError, setCameraError] = useState<string>(''); const [flash, setFlash] = useState<number>(0); const [sensor, setSensor] = useState<'pending' | 'on' | 'off'>('pending');
  const [hud, setHud] = useState<Hud>({ light: 'ok', sharp: false, object: false, steady: false, angle: false, moved: true, hold: 0, delta: null, pitch: null });
  const [flying, setFlying] = useState<Flying | null>(null); const [popped, setPopped] = useState<ViewId | null>(null);
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null); const pose = useRef<Pose | null>(null); const shotsRef = useRef<Shot[]>([]); const sessionRef = useRef<CaptureSession | null>(null);
  const slots = useRef<Partial<Record<ViewId, HTMLElement | null>>>({});
  const orbit = useRef<{ origin: number | null; sign: number }>(((): { origin: number | null; sign: number } => { try { return JSON.parse(sessionStorage.getItem(`objectpad.orbit.${id}`) ?? 'null') ?? { origin: null, sign: 0 }; } catch { return { origin: null, sign: 0 }; } })());
  const busy = useRef<boolean>(false); const uploading = useRef<boolean>(false); const poseLog = useRef<Pose[]>([]);
  const [mark, setMark] = useState<{ key: number; ok: boolean } | null>(null);
  const showMark = useCallback((ok: boolean) => { const key = Date.now(); setMark({ key, ok }); setTimeout(() => setMark(m => m?.key === key ? null : m), 900); }, []);
  const lastShot = useRef<{ heading: number | null; pitch: number | null; thumb: Float32Array | null }>({ heading: null, pitch: null, thumb: null }); const shotThumb = useRef<Float32Array | null>(null);
  useEffect(() => { shotsRef.current = shots; }, [shots]); useEffect(() => { sessionRef.current = session; }, [session]);
  const saveOrbit = () => { try { sessionStorage.setItem(`objectpad.orbit.${id}`, JSON.stringify(orbit.current)); } catch { /* ignore */ } };

  const adopt = useCallback((next: CaptureSession) => {
    if (next.successor) { followScan(next.id, next.successor); return; }
    setSession(next);
    if (!['awaiting_mobile', 'capturing', 'review'].includes(next.state)) { navigate(`/launch/${next.id}`, { replace: true }); return; }
    setPhase(current => current === 'pair' ? (next.views.length >= VIEWS.length ? 'review' : 'intro') : current);
  }, [navigate]);
  useEffect(() => {
    if (!id) { setPairError('Open this page by scanning the QR code on your computer, or start a scan on this phone.'); return; }
    let cancelled = false;
    (async () => {
      if (deviceSecret(id)) { try { const s = await call<CaptureSession>(`/sessions/${id}`); if (!cancelled) adopt(s); return; } catch { /* fall through to a fresh claim */ } }
      if (!handoff.token) { setPairError('This phone isn’t linked to a scan right now. Scan the QR code on your computer again to link back to what you’re working on.'); return; }
      try { const data = await api<{ session: CaptureSession; claimSecret: string }>(`/sessions/${id}/claim`, { method: 'POST', body: { token: handoff.token } }); saveDeviceSecret(id, data.claimSecret); try { sessionStorage.removeItem(PENDING); } catch { /* ignore */ } play('handoff'); if (!cancelled) adopt(data.session); }
      catch (error) { if (!cancelled) setPairError(error instanceof RequestError && error.code === 'HANDOFF_EXPIRED_OR_USED' ? 'This QR code was already used or expired. Tap “New code” on your computer and scan again.' : error instanceof Error ? error.message : 'The scan could not be opened.'); }
    })();
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stay in sync with the computer while scanning: a rescan there moves this phone to the new scan too.
  useEffect(() => { if (!session || phase === 'pair') return; const t = setInterval(() => { void call<CaptureSession>(`/sessions/${id}`).then(s => { if (s.successor) followScan(s.id, s.successor); else if (!['awaiting_mobile', 'capturing', 'review'].includes(s.state)) navigate(`/launch/${s.id}`, { replace: true }); }).catch(() => undefined); }, 4000); return () => clearInterval(t); }, [session !== null, phase, id, call, navigate]); // eslint-disable-line react-hooks/exhaustive-deps
  const accepted = useMemo(() => new Set<ViewId>(session?.views.map(v => v.view) ?? []), [session]);
  const covered = useMemo(() => new Set<ViewId>([...accepted, ...shots.filter(s => s.status !== 'rejected').map(s => s.view)]), [accepted, shots]);
  const target = ORDER.find(view => !covered.has(view)) ?? null; const targetRef = useRef<ViewId | null>(target); targetRef.current = target;

  const stop = useCallback(() => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; }, []);
  useEffect(() => () => { stop(); shotsRef.current.forEach(s => URL.revokeObjectURL(s.url)); }, [stop]);

  async function start() {
    setCameraError('');
    const orientation = (globalThis as unknown as { DeviceOrientationEvent?: OrientationPermission }).DeviceOrientationEvent;
    const permission = orientation?.requestPermission ? orientation.requestPermission().catch(() => 'denied' as const) : Promise.resolve('granted' as const);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      stop(); stream.current = media; setPhase('camera');
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = media; void video.current.play().catch(() => setCameraError('Tap the screen to start the camera.')); } });
    } catch (error) { const name = (error as DOMException)?.name; setCameraError(name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.' : name === 'NotFoundError' ? 'No camera was found. Open this page on a phone.' : 'The camera could not be opened. Use Safari or Chrome.'); return; }
    if (await permission !== 'granted') setSensor('off');
  }
  useEffect(() => {
    if (phase !== 'camera') return;
    const listener = (event: DeviceOrientationEvent) => { const next = poseFrom(event); if (next) { pose.current = next; const log = poseLog.current; log.push(next); while (log.length && next.at - log[0].at > STEADY_WINDOW) log.shift(); setSensor(s => s === 'pending' ? 'on' : s); } };
    addEventListener('deviceorientation', listener); const timer = setTimeout(() => setSensor(s => s === 'pending' ? 'off' : s), 1500);
    return () => { removeEventListener('deviceorientation', listener); clearTimeout(timer); };
  }, [phase]);

  const pump = useCallback(async () => {
    if (uploading.current) return; uploading.current = true;
    try {
      for (;;) {
        const next = shotsRef.current.find(s => s.status === 'queued'); if (!next) break;
        setShots(cur => cur.map(s => s === next ? { ...s, status: 'uploading' } : s));
        try {
          const ticket = await call<{ url: string; token: string }>(`/sessions/${id}/tickets`, { method: 'POST', body: { view: next.view } });
          const updated = await call<CaptureSession>(ticket.url, { method: 'PUT', binary: next.blob, timeout: 60_000, headers: { 'X-Upload-Token': ticket.token } });
          setSession(updated); setShots(cur => cur.map(s => s.view === next.view && s.blob === next.blob ? { ...s, status: 'accepted' } : s)); play('orbit');
        } catch (error) {
          const rejected = error instanceof RequestError && FRAME_REJECTIONS.has(error.code);
          const tries = (next.tries ?? 0) + 1; const giveUp = rejected || tries >= MAX_TRIES;
          setShots(cur => cur.map(s => s.view === next.view && s.blob === next.blob ? { ...s, tries, status: giveUp ? 'rejected' : 'queued', error: rejected && error instanceof Error ? error.message : 'Couldn’t upload that photo.' } : s));
          if (giveUp) { play('rejected'); showMark(false); if (navigator.vibrate) navigator.vibrate([30, 40, 30]); continue; }
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }
    } finally { uploading.current = false; }
  }, [call, id, play, showMark]);

  const capture = useCallback(async (view: ViewId, signature: string) => {
    const el = video.current; if (!el || busy.current) return; busy.current = true;
    try {
      const w0 = el.videoWidth; const h0 = el.videoHeight; if (!w0 || !h0) return;
      const scale = Math.min(1, CAPTURE_LONG_SIDE / Math.max(w0, h0)); const width = Math.round(w0 * scale); const height = Math.round(h0 * scale);
      if (Math.min(width, height) < MIN_IMAGE_SIDE) { setCameraError(`This camera gives ${w0}×${h0}. Use the rear camera (at least ${MIN_IMAGE_SIDE}px).`); return; }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const g = canvas.getContext('2d'); if (!g) return; g.drawImage(el, 0, 0, width, height);
      // Canvas re-encoding writes no EXIF, GPS or device metadata; the server re-encodes again before storage.
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('encode')), 'image/jpeg', 0.9));
      if (view === 'front' && pose.current && orbit.current.origin === null) { orbit.current.origin = pose.current.heading; saveOrbit(); }
      if (view === 'right' && pose.current && orbit.current.origin !== null && !orbit.current.sign) { orbit.current.sign = Math.sign(wrap(pose.current.heading - orbit.current.origin)) || 1; saveOrbit(); }
      lastShot.current = { heading: pose.current?.heading ?? null, pitch: pose.current?.pitch ?? null, thumb: shotThumb.current }; showMark(true);
      const url = URL.createObjectURL(blob);
      setShots(cur => [...cur.filter(s => s.view !== view || s.status === 'accepted'), { view, blob, url, signature, status: 'queued' }]);
      const slot = slots.current[view]?.getBoundingClientRect();
      if (slot) { const k = Date.now(); setFlying({ key: k, url, style: { '--fx': `${slot.left}px`, '--fy': `${slot.top}px`, '--fs': String(slot.width / innerWidth), '--fsy': String(slot.height / innerHeight) } }); setTimeout(() => { setFlying(f => f?.key === k ? null : f); setPopped(view); }, 700); }
      setFlash(f => f + 1); play('capture'); if (navigator.vibrate) navigator.vibrate(18);
      setTimeout(() => void pump(), 0);
    } finally { setTimeout(() => { busy.current = false; }, 900); }
  }, [play, pump, showMark]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sampling loop (~7×/s): real light, focus, object-in-frame and steadiness, plus the phone's angle. Auto-snaps after a steady hold.
  const lastSig = useRef<string>('');
  useEffect(() => {
    if (phase !== 'camera') return;
    const small = document.createElement('canvas'); const g = small.getContext('2d', { willReadFrequently: true }); if (!g) return;
    let prevThumb: Float32Array | null = null; let steadySince = performance.now(); let okSince = 0;
    const timer = window.setInterval(() => {
      const el = video.current; if (!el || !el.videoWidth || busy.current) return;
      small.width = 160; small.height = Math.round(160 * el.videoHeight / el.videoWidth); g.drawImage(el, 0, 0, small.width, small.height);
      const pixels = g.getImageData(0, 0, small.width, small.height).data; const q = checkFrame(pixels, small.width, small.height); lastSig.current = q.signature;
      const thumb = thumbnail(pixels, small.width, small.height); shotThumb.current = thumb;
      const now = performance.now(); const p = pose.current && now - pose.current.at < 1000 ? pose.current : null;
      // Still = the phone's pointing direction barely wandered over the last ~0.45s (motion sensors), or, without sensors,
      // the picture barely changed. Camera noise and hand tremor stay well under both limits.
      const log = poseLog.current.filter(e => now - e.at < STEADY_WINDOW);
      const jitter = p && log.length > 3 ? Math.max(...log.map(e => Math.max(Math.abs(wrap(e.heading - p.heading)), Math.abs(e.pitch - p.pitch)))) : null;
      const shaking = jitter !== null ? jitter > STEADY_DEG : prevThumb ? thumbDiff(prevThumb, thumb) > STILL_DIFF : true;
      if (shaking) steadySince = now; prevThumb = thumb; const steady = now - steadySince > STEADY_MS;
      // After each photo you must actually move to a new side before the next one can fire, so no angle is shot twice.
      const shot = lastShot.current; const firstShot = !shotsRef.current.some(s => s.status !== 'rejected');
      const moved = firstShot || (p && shot.heading !== null && shot.pitch !== null ? Math.abs(wrap(p.heading - shot.heading)) > NEW_SIDE_DEG || Math.abs(p.pitch - shot.pitch) > 18 : shot.thumb ? thumbDiff(shot.thumb, thumb) > NEW_SIDE_DIFF : true);
      const want = targetRef.current; let angle = false; let delta: number | null = null;
      if (want && p && (orbit.current.origin !== null || want === 'front')) {
        delta = orbit.current.origin === null ? 0 : wrap(p.heading - orbit.current.origin);
        angle = orbit.current.origin === null ? p.pitch > -22 && p.pitch < 34 : angleMatch(want, delta, p.pitch, orbit.current.sign);
      } else if (want) angle = shotsRef.current.filter(s => s.status !== 'rejected').every(s => perceptualDistance(s.signature, q.signature) >= VISUAL_NEW_ANGLE);
      angle = angle && moved;
      const ok = Boolean(want) && q.light === 'ok' && q.sharp && q.object && steady && angle;
      if (ok) { if (!okSince) okSince = now; } else okSince = 0;
      const hold = ok ? Math.min(1, (now - okSince) / HOLD_MS) : 0;
      setHud({ light: q.light, sharp: q.sharp, object: q.object, steady, angle, moved, hold, delta, pitch: p?.pitch ?? null });
      if (hold >= 1 && want) { okSince = 0; void capture(want, q.signature); }
    }, 140);
    return () => window.clearInterval(timer);
  }, [phase, capture]);

  const acceptedCount = accepted.size;
  useEffect(() => { if (acceptedCount >= VIEWS.length && phase === 'camera') { stop(); play('model'); const t = setTimeout(() => setPhase('review'), 900); return () => clearTimeout(t); } }, [acceptedCount, phase, stop, play]);
  const snap = () => { if (!target) return; if (!hud.moved) { showMark(false); if (navigator.vibrate) navigator.vibrate([20, 30, 20]); return; } void capture(target, lastSig.current || '0'.repeat(64)); };
  const retake = async (view: ViewId) => { setShots(cur => cur.filter(s => s.view !== view)); if (accepted.has(view)) { try { setSession(await call<CaptureSession>(`/sessions/${id}/views/${view}`, { method: 'DELETE' })); } catch { /* the list refreshes on the next upload */ } } };

  if (pairError) return <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-[#0B0C0F] px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] text-white"><div className="flex flex-1 flex-col justify-center"><span className="flex size-16 items-center justify-center rounded-[22px] bg-white/10"><Smartphone size={28}/></span><h1 className="display mt-6 text-[40px] leading-none">Scan the QR again.</h1><p className="mt-4 text-[17px] font-semibold leading-7 text-white/70">{pairError}</p></div><Link to="/launch" className="press flex min-h-[60px] items-center justify-center gap-2 rounded-full bg-white text-[16px] font-extrabold text-ink"><ScanLine size={18}/>Start a scan on this phone</Link></div>;
  if (phase === 'pair' || !session) return <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col items-center justify-center gap-4 bg-[#0B0C0F] text-white"><span className="relative flex size-20 items-center justify-center"><span className="absolute inset-0 animate-ping rounded-full bg-white/10"/><span className="flex size-16 items-center justify-center rounded-full bg-white/10"><Smartphone size={26}/></span></span><p className="text-[17px] font-extrabold">Connecting to your scan…</p><p className="font-mono text-[12px] font-bold uppercase tracking-wider text-white/50">private link · single use</p></div>;
  if (phase === 'intro') return <IntroScreen onStart={() => void start()} onBack={() => navigate(`/launch/${id}`)} error={cameraError}/>;
  if (phase === 'review') { const local: Partial<Record<ViewId, string>> = {}; for (const s of shots) if (s.status === 'accepted') local[s.view] = s.url; return <Review session={session} local={local} download={download} onRetake={view => { void retake(view); void start(); }} onBuild={() => navigate(`/launch/${id}`, { replace: true })}/>; }

  const ready = hud.light === 'ok' && hud.sharp && hud.object; const green = ready && hud.angle;
  const toGo = target && sensor === 'on' && hud.delta !== null && orbit.current.origin !== null ? degreesToGo(target, hud.delta, orbit.current.sign) : null;
  const message = !target ? 'Uploading your photos…' : hud.light === 'dark' ? 'Too dark. Turn on a light.' : hud.light === 'bright' ? 'Too bright. Move out of the glare.' : !hud.object ? 'Put the object inside the frame.' : !hud.sharp ? 'Hold still so it can focus.' : !hud.moved ? `Got it. Now move to the ${GUIDE[target].title.toLowerCase()}.` : !hud.angle ? (toGo !== null && toGo > 8 ? `${GUIDE[target].move} ${toGo}° to go.` : sensor === 'on' ? GUIDE[target].move : `Move to a new side: ${GUIDE[target].title.toLowerCase()}.`) : !hud.steady ? 'Good angle. Hold steady…' : 'Perfect. Hold it…';
  const rejected = shots.filter(s => s.status === 'rejected');
  return <div className="fixed inset-0 z-[70] h-[100dvh] overflow-hidden bg-black text-white" onClick={() => { if (video.current?.paused) void video.current.play().catch(() => undefined); }}>
    <video ref={video} muted playsInline autoPlay className="absolute inset-0 h-full w-full object-cover" aria-label="Live camera"/>
    <div key={flash} className={cn('pointer-events-none absolute inset-0 bg-white', flash ? 'flash-pop' : 'opacity-0')}/>
    <div className={cn('cam-frame pointer-events-none absolute left-[9%] right-[9%] top-[22%] bottom-[33%] rounded-[34px] border-[3px]', green ? 'on' : 'off')}>
      {hud.hold > 0 && <svg className="absolute left-1/2 top-1/2 size-20 -translate-x-1/2 -translate-y-1/2 -rotate-90" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="white" strokeOpacity=".25" strokeWidth="6"/><circle cx="50" cy="50" r="44" fill="none" stroke="#34D57A" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${hud.hold * 276} 276`}/></svg>}
      {target && hud.object && <span className={cn('absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-extrabold', hud.angle ? 'bg-[#34D57A] text-ink' : 'bg-[#FF5A4E] text-white')}>{hud.angle ? <Check size={14} strokeWidth={3.5}/> : <X size={14} strokeWidth={3.5}/>}{hud.angle ? 'Right angle' : 'Not this angle'}</span>}
      {target && <span className={cn('absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-extrabold', green ? 'bg-[#34D57A] text-ink' : 'bg-black/70 text-white')}>{covered.size + 1} of 6 · {GUIDE[target].title}</span>}
    </div>

    <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        <button onClick={() => { stop(); navigate(`/launch/${id}`); }} className="press flex size-11 shrink-0 items-center justify-center rounded-full bg-black/50" aria-label="Close scanner"><ArrowLeft size={19}/></button>
        <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5">
          <Status ok={hud.light === 'ok'} label={hud.light === 'dark' ? 'Too dark' : hud.light === 'bright' ? 'Too bright' : 'Light'}/>
          <Status ok={hud.sharp} label={hud.sharp ? 'Sharp' : 'Blurry'}/>
          <Status ok={hud.object} label={hud.object ? 'Object' : 'No object'}/>
          <Status ok={hud.steady} label={hud.steady ? 'Steady' : 'Moving'}/>
        </div>
      </div>
    </div>

    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-10">
      <p key={message} className="slide-in text-center text-[18px] font-extrabold leading-6">{message}</p>
      {(rejected[0] || cameraError) && <p className="mt-2 flex items-start gap-2 rounded-2xl bg-[#FF5A4E]/90 px-3 py-2 text-[13px] font-bold"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>{cameraError || `${GUIDE[rejected[0].view].title}: ${rejected[0].error ?? 'Not accepted.'} Take it again.`}</p>}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center">
        <p className="font-mono text-[12px] font-extrabold uppercase text-white/60">{sensor === 'on' ? 'Auto-snap on' : 'Tap to snap'}</p>
        <button onClick={snap} disabled={!target || !ready} className={cn('press flex size-[78px] items-center justify-center rounded-full border-[4px] transition-colors disabled:opacity-40', green ? 'border-[#34D57A]' : 'border-white/90')} aria-label="Take photo"><span className={cn('size-[60px] rounded-full transition-colors', green ? 'bg-[#34D57A]' : 'bg-white')}/></button>
        <p className="text-right"><span className="display text-[30px]">{acceptedCount}</span><span className="text-[15px] font-bold text-white/50">/6</span></p>
      </div>
      <div className="mt-4 grid grid-cols-6 gap-1.5">{ORDER.map(view => { const shot = [...shots].reverse().find(s => s.view === view); const ok = accepted.has(view); const on = target === view; return <button key={view} ref={el => { slots.current[view] = el; }} onClick={() => (shot || ok) && void retake(view)} className={cn('relative aspect-square overflow-hidden rounded-xl ring-2 transition-all', popped === view && 'slot-pop', shot?.status === 'rejected' ? 'ring-[#FF5A4E]' : ok ? 'ring-[#34D57A]' : on ? 'ring-white' : 'ring-white/15')} aria-label={`${GUIDE[view].title}${ok ? ', accepted, tap to retake' : ''}`}>
        {shot ? <img src={shot.url} alt="" className="size-full object-cover"/> : <span className={cn('flex size-full items-center justify-center text-[11px] font-extrabold', on ? 'bg-white/20 text-white' : 'bg-white/5 text-white/45')}>{SHORT[view]}</span>}
        {shot?.status === 'uploading' || shot?.status === 'queued' ? <span className="absolute inset-0 flex items-center justify-center bg-black/45"><LoaderCircle size={15} className="animate-spin"/></span> : ok ? <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-[#34D57A] text-ink"><Check size={10} strokeWidth={3.5}/></span> : shot?.status === 'rejected' ? <span className="absolute inset-0 flex items-center justify-center bg-[#FF5A4E]/60"><RotateCcw size={15}/></span> : null}
      </button>; })}</div>
    </div>
    {mark && <div key={mark.key} className="mark-pop pointer-events-none absolute left-1/2 top-[42%] z-10 flex size-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-2xl" style={{ background: mark.ok ? '#34D57A' : '#FF5A4E' }}>{mark.ok ? <Check size={60} strokeWidth={3.5} className="text-ink"/> : <X size={60} strokeWidth={3.5} className="text-white"/>}</div>}
    {flying && <img key={flying.key} src={flying.url} alt="" className="fly-shot" style={flying.style as CSSProperties}/>}
  </div>;
}
