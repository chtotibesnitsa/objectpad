import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, RefreshCw, SwitchCamera, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { checkFrame } from '@/lib/frameCheck';
import { peopleError, type PeoplePhoto } from '@/lib/people';
import { CAPTURE_PLAN, VIEW_GUIDE, type CaptureMode, type CaptureView } from '@/shared/people';
import { cn } from '@/lib/utils';

const MIN_SIDE = 720; const MAX_PIXELS = 4_000_000;

/** Draws any image source into a JPEG the server accepts: at least 720 px on the short side, at most 4 MP. EXIF is dropped. */
async function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  let scale = Math.max(1, MIN_SIDE / Math.min(w, h)); if (w * h * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (w * h));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('This browser can’t process photos.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Couldn’t encode the photo.')), 'image/jpeg', 0.9));
}
/** Decodes a picked file (HEIC works where the browser can display it, e.g. iPhone Safari), respecting EXIF orientation. */
async function fileToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode().catch(() => { throw new Error('That photo format can’t be opened here. Try a JPEG or PNG, or use the camera.'); });
    return await toJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

type CamState = 'off' | 'starting' | 'on' | 'denied' | 'none';

/** Guided capture for one People draft. Camera is requested only when the person taps "Open camera". */
export function PeopleCapture({ draftId, mode, photos, onPhotos, disabled }: { draftId: string; mode: CaptureMode; photos: PeoplePhoto[]; onPhotos: (items: PeoplePhoto[]) => void; disabled?: boolean }) {
  const plan = CAPTURE_PLAN[mode]; const session = useSession();
  const has = useCallback((v: CaptureView) => photos.some(p => p.view === v), [photos]);
  const firstMissing = plan.views.find(v => !has(v)) ?? plan.views[0];
  const [active, setActive] = useState<CaptureView>(firstMissing);
  const [previews, setPreviews] = useState<Partial<Record<CaptureView, string>>>({});
  const [cam, setCam] = useState<CamState>('off'); const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [live, setLive] = useState<{ light: 'dark' | 'bright' | 'ok'; sharp: boolean } | null>(null);
  const [busy, setBusy] = useState<boolean>(false); const [error, setError] = useState<string | null>(null); const [flash, setFlash] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null); const streamRef = useRef<MediaStream | null>(null); const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (!plan.views.includes(active)) setActive(firstMissing); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const stop = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setCam(c => (c === 'on' || c === 'starting') ? 'off' : c); setLive(null); }, []);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);
  useEffect(() => () => { Object.values(previews).forEach(u => u && URL.revokeObjectURL(u)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async (face: 'user' | 'environment') => {
    setError(null); if (!navigator.mediaDevices?.getUserMedia) { setCam('none'); return; }
    streamRef.current?.getTracks().forEach(t => t.stop()); setCam('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      streamRef.current = stream; setCam('on');
      requestAnimationFrame(() => { const v = videoRef.current; if (v) { v.srcObject = stream; void v.play().catch(() => undefined); } });
    } catch (e) { const name = e instanceof DOMException ? e.name : ''; setCam(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'none'); }
  }, []);

  // Live light / focus readout from real pixels, a few times a second.
  useEffect(() => {
    if (cam !== 'on') return; const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 96; const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const t = window.setInterval(() => { const v = videoRef.current; if (!ctx || !v || v.readyState < 2) return; ctx.drawImage(v, 0, 0, 128, 96); const r = checkFrame(ctx.getImageData(0, 0, 128, 96).data, 128, 96); setLive({ light: r.light, sharp: r.sharp }); }, 350);
    return () => window.clearInterval(t);
  }, [cam]);

  const upload = useCallback(async (view: CaptureView, blob: Blob) => {
    setBusy(true); setError(null);
    try {
      const out = await api<{ items: PeoplePhoto[] }>(`/people/drafts/${draftId}/photos/${view}`, { token: await session.token(), method: 'PUT', binary: blob, timeout: 90_000 });
      setPreviews(p => { if (p[view]) URL.revokeObjectURL(p[view]!); return { ...p, [view]: URL.createObjectURL(blob) }; });
      onPhotos(out.items); if ('vibrate' in navigator) navigator.vibrate?.(18);
      const next = plan.views.find(v => v !== view && !out.items.some(p => p.view === v)); if (next) setActive(next); else stop();
    } catch (e) { setError(peopleError(e)); } finally { setBusy(false); }
  }, [draftId, onPhotos, plan.views, session, stop]);

  const shoot = async () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return; setFlash(true); window.setTimeout(() => setFlash(false), 160);
    try { await upload(active, await toJpeg(v, v.videoWidth, v.videoHeight)); } catch (e) { setError(e instanceof Error ? e.message : 'Capture failed.'); }
  };
  const pick = async (file: File | undefined) => { if (!file) return; try { await upload(active, await fileToJpeg(file)); } catch (e) { setError(e instanceof Error ? e.message : 'That photo couldn’t be used.'); } };
  const remove = async (view: CaptureView) => { setBusy(true); try { const out = await api<{ items: PeoplePhoto[] }>(`/people/drafts/${draftId}/photos/${view}`, { token: await session.token(), method: 'DELETE' }); onPhotos(out.items); setPreviews(p => ({ ...p, [view]: undefined })); setActive(view); } catch (e) { setError(peopleError(e)); } finally { setBusy(false); } };

  const guide = VIEW_GUIDE[active]; const body = active.startsWith('body');
  const hint = !live ? null : live.light === 'dark' ? 'Too dark: face a window or lamp' : live.light === 'bright' ? 'Too bright: step out of direct light' : !live.sharp ? 'Hold still: image is blurry' : 'Looks good: take it';
  const good = live?.light === 'ok' && live.sharp;

  return <div className="grid gap-4">
    <ul className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{plan.views.map((v, i) => { const done = has(v); const on = v === active; return <li key={v} className="shrink-0"><button type="button" disabled={disabled || busy} onClick={() => setActive(v)} className={cn('press relative flex h-[92px] w-[76px] flex-col items-center justify-end overflow-hidden rounded-[18px] pb-2 text-[11px] font-extrabold transition-shadow', on ? 'ring-[2.5px] ring-ink ring-offset-2' : '', done ? 'bg-ink text-white' : 'sunk text-ink/55')}>
      {previews[v] && <img src={previews[v]} alt="" className="absolute inset-0 size-full object-cover opacity-80"/>}
      <span className={cn('relative mb-auto mt-2 flex size-7 items-center justify-center rounded-full', done ? 'bg-[#12A150] text-white' : 'bg-white text-ink/50')}>{done ? <Check size={15} strokeWidth={3}/> : i + 1}</span>
      <span className="relative rounded-full bg-black/30 px-1.5 text-white [text-shadow:0_1px_2px_rgba(0,0,0,.4)]">{VIEW_GUIDE[v].title.replace('Full body, ', '').replace('Turn to your ', '').replace('Face the camera', 'Front').replace('Back of your head', 'Back')}</span>
      {!plan.required.includes(v) && <span className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-[9px] text-ink/60">opt</span>}
    </button></li>; })}</ul>

    <div className="relative overflow-hidden rounded-[28px] bg-ink text-white">
      <div className={cn('relative w-full', body ? 'aspect-[3/4]' : 'aspect-[4/5] sm:aspect-[4/3]')}>
        {cam === 'on' || cam === 'starting' ? <>
          <video ref={videoRef} playsInline muted autoPlay className={cn('absolute inset-0 size-full object-cover', facing === 'user' && '-scale-x-100')}/>
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={cn('border-[3px] border-dashed transition-colors', body ? 'h-[86%] w-[46%] rounded-[40%]' : 'h-[70%] w-[52%] rounded-[50%]', good ? 'border-[#2EE584]' : 'border-white/70')} style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,.35)' }}/>
          </div>
          {flash && <div className="absolute inset-0 bg-white/80"/>}
          {hint && <p className={cn('absolute inset-x-4 top-4 mx-auto w-fit rounded-full px-4 py-2 text-[13px] font-extrabold backdrop-blur', good ? 'bg-[#12A150]/90' : 'bg-black/60')}>{hint}</p>}
        </> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-white/10"><Camera size={28}/></span>
          <p className="display text-[26px] leading-tight">{guide.title}</p>
          <p className="max-w-xs text-[14px] font-semibold text-white/65">{guide.tip}</p>
          {cam === 'denied' && <p className="max-w-sm rounded-2xl bg-white/10 px-4 py-2.5 text-[13px] font-bold text-white/80">Camera access is blocked. Allow it in your browser settings, or upload a photo instead.</p>}
          {cam === 'none' && <p className="max-w-sm rounded-2xl bg-white/10 px-4 py-2.5 text-[13px] font-bold text-white/80">No camera found on this device. Upload a photo, or open this page on your phone.</p>}
        </div>}
      </div>
      <div className="flex items-center justify-between gap-3 bg-black/40 px-4 py-3">
        <div className="min-w-0"><p className="truncate text-[14.5px] font-extrabold">{guide.title}</p><p className="truncate text-[12px] font-semibold text-white/55">{guide.tip}</p></div>
        {cam === 'on' && <button type="button" onClick={stop} aria-label="Close camera" className="press flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10"><X size={18}/></button>}
      </div>
    </div>

    {error && <p role="alert" className="rounded-2xl bg-down/10 px-4 py-3 text-[14px] font-bold text-down">{error}</p>}

    <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-wrap">
      {cam === 'on' ? <>
        <button type="button" disabled={busy || disabled} onClick={() => void shoot()} className="btn press min-h-[56px] px-8 text-[16px] sm:flex-1">{busy ? <RefreshCw size={18} className="animate-spin"/> : <Camera size={19}/>}{busy ? 'Checking photo…' : has(active) ? 'Retake' : 'Take photo'}</button>
        <button type="button" disabled={busy} onClick={() => { const f = facing === 'user' ? 'environment' : 'user'; setFacing(f); void start(f); }} aria-label="Switch camera" className="btn-ghost press min-h-[56px] px-4"><SwitchCamera size={19}/></button>
      </> : <button type="button" disabled={busy || disabled || cam === 'starting'} onClick={() => { const f = body ? 'environment' : 'user'; setFacing(f); void start(f); }} className="btn press col-span-2 min-h-[56px] px-8 text-[16px] sm:flex-1"><Camera size={19}/>{cam === 'starting' ? 'Opening camera…' : 'Open camera'}</button>}
      <button type="button" disabled={busy || disabled} onClick={() => fileRef.current?.click()} className="btn-ghost press col-span-2 min-h-[52px] px-5 text-[14.5px] sm:col-span-1"><ImagePlus size={17}/>{busy && cam !== 'on' ? 'Checking photo…' : 'Upload a photo'}</button>
      {has(active) && <button type="button" disabled={busy || disabled} onClick={() => void remove(active)} className="btn-ghost press col-span-2 min-h-[52px] px-4 text-[14px] !text-down sm:col-span-1"><Trash2 size={15}/>Remove</button>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }}/>
    </div>
    <p className="text-[12.5px] font-semibold leading-5 text-ink/45">Photos are private to you, stripped of location data and checked for light, focus and one clothed adult. They’re deleted once you approve your 3D double. A photo is never treated as proof it’s you.</p>
  </div>;
}
