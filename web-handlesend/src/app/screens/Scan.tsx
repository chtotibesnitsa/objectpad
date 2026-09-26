import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, CircleDashed, Loader2, RotateCcw, ScanLine, Sun, UserX, X } from 'lucide-react';
import { api, RequestError } from '@/lib/api';
import { saveDeviceSecret, useSessionCaller } from '@/lib/creator';
import type { CaptureSession } from '@/shared/domain';
import { cn } from '@/lib/utils';
import { useApp } from '../store';
import { Feedback } from '../feedback';
import { CircleIconButton, ConfettiBurst, Display, img, PadButton, PAD, VoxelField } from '../ui';

type Angle = 'front' | 'right' | 'back' | 'left' | 'high-front' | 'high-back';
const ANGLES: { id: Angle; title: string; hint: string; short: string; deg: number }[] = [
  { id: 'front', title: 'Front', hint: 'Face the object, phone at its height.', short: 'Front', deg: 0 },
  { id: 'right', title: 'Right side', hint: 'Walk a quarter turn around it.', short: 'Right', deg: 90 },
  { id: 'back', title: 'Back', hint: 'Keep walking to the far side.', short: 'Back', deg: 180 },
  { id: 'left', title: 'Left side', hint: 'One more quarter turn.', short: 'Left', deg: 270 },
  { id: 'high-front', title: 'Top · front', hint: 'Raise your phone and look down at it.', short: 'Top 1', deg: 30 },
  { id: 'high-back', title: 'Top · back', hint: 'From above, go to the far side.', short: 'Top 2', deg: 210 },
];
type Shot = { state: 'uploading' } | { state: 'accepted' } | { state: 'rejected'; message: string };
type Phase = { kind: 'intro' | 'opening' | 'camera' | 'denied' | 'noCamera' } | { kind: 'failed'; message: string };
const FRAME_CODES = new Set(['IMAGE_QUALITY', 'IMAGE_RESOLUTION', 'IMAGE_NOT_VALIDATED', 'DUPLICATE_VIEW', 'DUPLICATE_ARCHIVE_FRAME', 'NO_OBJECT', 'OBJECT_OR_BACKGROUND_QUALITY', 'UNSUPPORTED_IMAGE', 'RETAKE_REQUIRED', 'PEOPLE_IN_FRAME', 'DOCUMENT_IN_FRAME', 'SCREEN_IN_FRAME']);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Ring of six stations around the object; the current one pulses, finished ones glow green. */
function OrbitGuide({ target, done, uploading }: { target: Angle | null; done: Set<Angle>; uploading: Set<Angle> }) {
  const R = 131; const C = 2 * Math.PI * R;
  return <div className="pointer-events-none relative size-[290px]">
    <svg viewBox="0 0 290 290" className="absolute inset-0"><circle cx="145" cy="145" r={R} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.5" strokeDasharray="4 7" className="ap-spin-slow origin-center [transform-box:fill-box]"/><circle cx="145" cy="145" r={R} fill="none" stroke={PAD.up} strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - done.size / 6)} transform="rotate(-90 145 145)" style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.34,1.3,.64,1)' }}/></svg>
    {ANGLES.map((a, i) => { const rad = ((a.deg - 90) * Math.PI) / 180; const k = i >= 4 ? 0.6 : 1; const isT = a.id === target; const d = done.has(a.id); const s = isT ? 22 : 14;
      return <div key={a.id} className="absolute left-1/2 top-1/2" style={{ transform: `translate(${Math.cos(rad) * R * k}px, ${Math.sin(rad) * R * k}px)` }}>
        {isT && <span className="ap-pulse absolute -left-5 -top-5 size-10 rounded-full bg-[#6FB2FF]/35"/>}
        <span className="absolute flex items-center justify-center rounded-full transition-all duration-300" style={{ width: s, height: s, left: -s / 2, top: -s / 2, background: d ? PAD.up : isT ? PAD.sky : 'rgba(255,255,255,.3)' }}>{d && <CheckCircle2 size={10} stroke="#fff" strokeWidth={4}/>}{uploading.has(a.id) && <Loader2 size={9} className="ap-spin text-white"/>}</span>
      </div>; })}
    <ScanLine size={64} strokeWidth={0.8} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/55"/>
  </div>;
}

/** Guided six-angle scanner: pairs this phone to a scan, shoots each angle and uploads it through a single-use ticket. */
export default function ScanFlow({ resume, onDone, onClose }: { resume: string | null; onDone: (id: string) => void; onClose: () => void }) {
  const app = useApp(); const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [session, setSession] = useState<CaptureSession | null>(null); const [shots, setShots] = useState<Partial<Record<Angle, Shot>>>({}); const [previews, setPreviews] = useState<Partial<Record<Angle, string>>>({});
  const [flash, setFlash] = useState<number>(0); const [busy, setBusy] = useState<boolean>(false); const [celebrate, setCelebrate] = useState<boolean>(false);
  const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null); const sessionId = session?.id ?? resume ?? '';
  const { call } = useSessionCaller(sessionId);
  const accepted = useMemo(() => new Set((session?.views ?? []).map(v => v.view as Angle)), [session]);
  const target = ANGLES.find(a => !accepted.has(a.id) && shots[a.id]?.state !== 'uploading' && shots[a.id]?.state !== 'accepted')?.id ?? null;
  const rejected = ANGLES.map(a => ({ a, s: shots[a.id] })).find(x => x.s?.state === 'rejected') as { a: typeof ANGLES[number]; s: { state: 'rejected'; message: string } } | undefined;
  const doneSet = useMemo(() => new Set(ANGLES.filter(a => accepted.has(a.id) || shots[a.id]?.state === 'accepted').map(a => a.id)), [accepted, shots]);
  const uploadingSet = useMemo(() => new Set(ANGLES.filter(a => shots[a.id]?.state === 'uploading').map(a => a.id)), [shots]);

  const stop = useCallback(() => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; }, []);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => { if (phase.kind === 'camera' && video.current && stream.current) { video.current.srcObject = stream.current; void video.current.play().catch(() => undefined); } }, [phase.kind]);

  const open = useCallback(async () => {
    setPhase({ kind: 'opening' });
    try {
      let s: CaptureSession;
      if (resume) s = await call<CaptureSession>(`/sessions/${resume}`);
      else {
        const created = await api<{ session: CaptureSession; handoffUrl?: string }>('/sessions', { token: await app.creator.token(), method: 'POST', body: { draftId: crypto.randomUUID(), rights: true } }); s = created.session;
        const token = created.handoffUrl?.match(/token=([^&]+)/)?.[1];
        if (token) { const claimed = await api<{ claimSecret: string }>(`/sessions/${s.id}/claim`, { method: 'POST', body: { token } }); saveDeviceSecret(s.id, claimed.claimSecret); }
      }
      setSession(s); app.setLastScan(s.id);
      const capturing = ['awaiting_mobile', 'capturing'].includes(s.state) || (s.state === 'review' && s.views.length < 6);
      if (s.views.length >= 6 || !capturing) { onDone(s.id); return; }
      if (!navigator.mediaDevices?.getUserMedia) { setPhase({ kind: 'noCamera' }); return; }
      try { stream.current = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } }); }
      catch (e) { setPhase({ kind: e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'noCamera' }); return; }
      setPhase({ kind: 'camera' });
    } catch (e) { setPhase({ kind: 'failed', message: e instanceof Error ? e.message : 'The scan could not be opened.' }); }
  }, [resume, call, app, onDone]);
  useEffect(() => { if (resume) void open(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = async (): Promise<Blob> => {
    const v = video.current; if (!v || !v.videoWidth) throw new Error('The camera isn’t ready yet.');
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight)); const w = Math.round(v.videoWidth * scale); const h = Math.round(v.videoHeight * scale);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; canvas.getContext('2d')!.drawImage(v, 0, 0, w, h);
    return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not take the photo.'))), 'image/jpeg', 0.9));
  };
  const upload = async (angle: Angle, jpeg: Blob, tries = 0): Promise<void> => {
    try {
      const ticket = await call<{ url: string; token: string }>(`/sessions/${sessionId}/tickets`, { method: 'POST', body: { view: angle } });
      const updated = await call<CaptureSession>(ticket.url, { method: 'PUT', binary: jpeg, timeout: 60_000, headers: { 'X-Upload-Token': ticket.token } });
      setSession(updated); setShots(p => ({ ...p, [angle]: { state: 'accepted' } })); Feedback.play('orbit', 0.45); Feedback.softImpact();
      if (updated.views.length >= 6) { Feedback.success('seal'); setCelebrate(true); await sleep(900); stop(); onDone(updated.id); }
    } catch (e) {
      if (e instanceof RequestError) { if (!FRAME_CODES.has(e.code) && tries < 3) { await sleep(1500 * (tries + 1)); return upload(angle, jpeg, tries + 1); } setShots(p => ({ ...p, [angle]: { state: 'rejected', message: e.message } })); Feedback.play('rejected'); Feedback.warning(); return; }
      if (tries < 3) { await sleep(2000); return upload(angle, jpeg, tries + 1); }
      setShots(p => ({ ...p, [angle]: { state: 'rejected', message: 'The upload failed. Retake this angle.' } }));
    }
  };
  const shoot = async () => {
    const angle = target; if (!angle || busy || !session) return; setBusy(true);
    try { const jpeg = await capture(); Feedback.play('capture', 0.5); Feedback.thud(); setFlash(f => f + 1); setPreviews(p => ({ ...p, [angle]: URL.createObjectURL(jpeg) })); setShots(p => ({ ...p, [angle]: { state: 'uploading' } })); setBusy(false); await upload(angle, jpeg); }
    catch (e) { setShots(p => ({ ...p, [angle]: { state: 'rejected', message: e instanceof Error ? e.message : 'Retake this angle.' } })); setBusy(false); }
  };
  const retake = (angle: Angle) => { setShots(p => { const n = { ...p }; delete n[angle]; return n; }); setPreviews(p => { const n = { ...p }; delete n[angle]; return n; }); if (accepted.has(angle)) void call<CaptureSession>(`/sessions/${sessionId}/views/${angle}`, { method: 'DELETE' }).then(setSession).catch(() => undefined); };
  const close = () => { stop(); onClose(); };
  const message = (title: string, body: string, cta: string, action: () => void) => <div className="flex h-full flex-col items-center justify-center gap-3.5 p-[30px] text-center"><AlertCircle size={48} className="text-white/70"/><Display size={28} className="!text-white">{title}</Display><p className="text-[14.5px] font-semibold text-white/70">{body}</p><div className="mt-2 w-full"><PadButton title={cta} kind="pearl" onClick={action}/></div></div>;

  return <div className="relative h-full bg-black text-white">
    {phase.kind === 'intro' && <div className="ap-night relative flex h-full flex-col items-center gap-[18px] px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
      <VoxelField count={24} seed={3}/><div className="flex-1"/>
      <img src={img('smartphone_camera_mug')} alt="" className="ap-bob relative h-[250px] object-contain"/>
      <Display size={40} className="relative text-center !text-white">{'Six photos.\nOne coin.'}</Display>
      <div className="relative flex w-full flex-col gap-2.5 rounded-[24px] bg-white/[0.07] p-[18px]">{[[Sun, 'Even light, plain background'], [CircleDashed, 'Walk around it. The ring shows where'], [UserX, 'No people, screens or documents']].map(([I, t]) => { const Icon = I as typeof Sun; return <div key={t as string} className="flex items-center gap-3"><Icon size={17} strokeWidth={2.6} className="w-6 text-[#6FB2FF]"/><span className="text-[14.5px] font-bold">{t as string}</span></div>; })}</div>
      <div className="flex-1"/>
      <div className="relative w-full"><PadButton title="Start scanning" icon={ScanLine} kind="pearl" onClick={() => void open()}/></div>
      <p className="relative text-center text-[11.5px] font-semibold text-white/50">No account needed. By scanning you confirm you own or may photograph this object.</p>
    </div>}
    {phase.kind === 'opening' && <div className="flex h-full flex-col items-center justify-center gap-3.5"><Loader2 size={34} className="ap-spin text-white"/><p className="text-[15px] font-bold text-white/70">Opening your scan…</p></div>}
    {phase.kind === 'denied' && message('Camera access is off', 'Allow the camera for objectpad.fun in Settings › Safari › Camera, then try again.', 'Try again', () => void open())}
    {phase.kind === 'noCamera' && message('No camera found', 'This device has no camera available. Scan from your phone.', 'Close', close)}
    {phase.kind === 'failed' && message('Couldn’t open the scan', phase.message, 'Try again', () => void open())}
    {phase.kind === 'camera' && <div className="relative h-full">
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 size-full object-cover"/>
      {flash > 0 && <div key={flash} className="ap-flash pointer-events-none absolute inset-0 bg-white"/>}
      <div className="absolute inset-0 flex items-center justify-center"><OrbitGuide target={target} done={doneSet} uploading={uploadingSet}/></div>
      {celebrate && <ConfettiBurst/>}
      <div className="absolute inset-0 flex flex-col items-center gap-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex w-full justify-end px-4 pt-1"><span className="ap-glass-dark ap-mono rounded-full px-3 py-2 text-[13px] font-extrabold">{doneSet.size}/6</span></div>
        {target && (() => { const t = ANGLES.find(a => a.id === target)!; return <div key={target} className="ap-glass-dark ap-push mx-6 rounded-[20px] px-[18px] py-3 text-center"><p className="ap-mono text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#6FB2FF]">{t.title}</p><p className="text-[16px] font-extrabold">{t.hint}</p></div>; })()}
        {rejected && <div className="ap-fade mx-4 flex items-center gap-2.5 self-stretch rounded-[18px] bg-ink/85 p-3"><RotateCcw size={22} className="shrink-0 text-[#F59E0B]"/><div className="min-w-0 flex-1"><p className="text-[14px] font-extrabold">Retake {rejected.a.short}</p><p className="text-[12px] font-semibold opacity-85">{rejected.s.message}</p></div><button type="button" onClick={() => retake(rejected.a.id)} className="ap-press rounded-full bg-white px-3 py-2 text-[13px] font-extrabold text-ink">Retake</button></div>}
        <div className="flex-1"/>
        <div className="flex gap-2">{ANGLES.map(a => { const st = accepted.has(a.id) ? 'accepted' : shots[a.id]?.state; return <button key={a.id} type="button" onClick={() => st === 'rejected' && retake(a.id)} className={cn('relative flex size-12 items-center justify-center overflow-hidden rounded-xl bg-white/[0.12] transition-transform', a.id === target && 'scale-[1.08] ring-2 ring-[#6FB2FF]')}>
          {previews[a.id] && <img src={previews[a.id]} alt="" className="absolute inset-0 size-full object-cover"/>}
          {st === 'accepted' ? <CheckCircle2 size={18} fill={PAD.up} stroke="#fff" className="relative"/> : st === 'uploading' ? <Loader2 size={16} className="ap-spin relative"/> : st === 'rejected' ? <AlertCircle size={18} fill={PAD.down} stroke="#fff" className="relative"/> : <span className="ap-mono relative text-[9px] font-extrabold text-white/70">{a.short}</span>}
        </button>; })}</div>
        <button type="button" aria-label="Take photo" disabled={!target || busy} onClick={() => void shoot()} className={cn('ap-press relative mb-[max(20px,env(safe-area-inset-bottom))] flex size-[82px] items-center justify-center rounded-full border-[5px] border-white', !target && 'opacity-40')}><span className={cn('size-[66px] rounded-full bg-white transition-transform', busy && 'scale-[.85]')}/>{busy && <Loader2 size={20} className="ap-spin absolute text-ink"/>}</button>
      </div>
    </div>}
    <div className="absolute left-4 top-[max(16px,env(safe-area-inset-top))] z-10"><CircleIconButton icon={X} dark label="Close" onClick={close}/></div>
    {phase.kind === 'camera' && <span className="sr-only"><Camera/></span>}
  </div>;
}
