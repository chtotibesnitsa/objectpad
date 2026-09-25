import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Cuboid, ImagePlus, Lock, RotateCcw, Trash2 } from 'lucide-react';
import type { CaptureSession } from '@/shared/domain';
import { API_BASE, type ApiOptions } from '@/lib/api';
import { useSessionCaller } from '@/lib/creator';
import { snapshotModel, squareIcon } from '@/lib/snapshot';
import { usePrivateArtifacts } from './PrivateModel';
import { cn } from '@/lib/utils';

type Caller = <T>(path: string, options?: ApiOptions) => Promise<T>;

/**
 * The coin's icon, written into its launch. By default it's a front-facing snapshot of the finished 3D model, made in the
 * browser the moment the model lands. Until then it reads LOADING. The creator can remove it and use their own image
 * at any point before the launch is broadcast, even before the 3D model is done.
 */
export function CoinIconPicker({ session, call, onSession, className }: { session: CaptureSession; call: Caller; onSession: (s: CaptureSession) => void; className?: string }) {
  const { download } = useSessionCaller(session.id); const file = useRef<HTMLInputElement>(null);
  const icon = session.icon; const model = session.model && ['model_review', 'approved'].includes(session.state) ? session.model : undefined;
  const locked = Boolean(session.launch?.hash);
  const needsSnapshot = Boolean(model && !locked && (!icon || (icon.source === 'snapshot' && icon.modelHash !== model.optimizedHash)));
  const artifacts = usePrivateArtifacts(session); const tried = useRef<string>(''); const [snapFailed, setSnapFailed] = useState<boolean>(false);
  const snap = useMutation({
    mutationFn: async (blob: Blob) => call<CaptureSession>(`/sessions/${session.id}/icon`, { method: 'PUT', binary: blob, timeout: 40_000, headers: { 'X-Icon-Source': 'snapshot', 'X-Icon-Model': model?.optimizedHash ?? '' } }),
    onSuccess: onSession, onError: () => setSnapFailed(true),
  });
  const { mutate: sendSnapshot } = snap;
  useEffect(() => {
    const data = artifacts.data; if (!needsSnapshot || !data) return; const key = `${data.hash}:${icon?.hash ?? 'none'}`; if (tried.current === key) return; tried.current = key; setSnapFailed(false);
    void snapshotModel(data.model).then(blob => sendSnapshot(blob)).catch(() => setSnapFailed(true));
  }, [needsSnapshot, artifacts.data, icon?.hash, sendSnapshot]);
  const custom = useMutation({ mutationFn: async (picked: File) => call<CaptureSession>(`/sessions/${session.id}/icon`, { method: 'PUT', binary: await squareIcon(picked), timeout: 40_000, headers: { 'X-Icon-Source': 'custom' } }), onSuccess: onSession });
  const reset = useMutation({ mutationFn: () => call<CaptureSession>(`/sessions/${session.id}/icon`, { method: 'DELETE' }), onSuccess: s => { tried.current = ''; onSession(s); } });
  // The icon may still be private (before the 3D model is done), so it's read back with this scan's own credentials.
  const image = useQuery({ queryKey: ['objectpad', 'icon', icon?.hash], enabled: Boolean(icon), staleTime: Infinity, retry: 1, queryFn: async () => URL.createObjectURL(await download(`${API_BASE}/artifacts/${icon!.hash}`)) });
  useEffect(() => () => { if (image.data) URL.revokeObjectURL(image.data); }, [image.data]);
  const busy = custom.isPending || reset.isPending || snap.isPending || (needsSnapshot && !snapFailed);
  const status = locked ? 'Locked into your launch transaction.' : custom.isPending ? 'Uploading your image…' : icon?.source === 'custom' ? 'Your own image. It’s written into your launch.' : icon ? 'Front snapshot of your 3D model, made automatically.' : needsSnapshot && !snapFailed ? 'Snapshotting the front of your 3D model…' : model ? 'Snapshot unavailable on this device. Add your own image.' : 'Made automatically from your 3D model when it’s done. Or use your own now.';
  const error = (custom.error ?? reset.error)?.message;
  return <div className={cn('sunk rounded-2xl p-3', className)}>
    <div className="flex items-center gap-3.5">
      <div className="relative size-[76px] shrink-0 overflow-hidden rounded-full bg-white shadow-[0_0_0_1px_rgba(12,13,16,.08),0_8px_20px_-8px_rgba(12,13,16,.35)]">
        {icon && image.data ? <img key={icon.hash} src={image.data} alt="Coin icon" className="card-pop size-full object-cover"/>
          : <div className="flex size-full flex-col items-center justify-center bg-[#0F1115] text-white"><span className="incoming-sweep pointer-events-none absolute inset-0 opacity-40" aria-hidden="true"/><Cuboid size={18} className="relative opacity-70"/><span className="relative mt-1 font-mono text-[9.5px] font-extrabold tracking-widest">LOADING<span className="build-dots"/></span></div>}
        {locked && <span className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-ink text-white"><Lock size={10}/></span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="spec !text-[11px]">Coin icon</p>
        <p className="mt-0.5 text-[13px] font-bold leading-5 text-ink/70">{status}</p>
        {!locked && <div className="mt-2 flex flex-wrap gap-1.5">
          {icon?.source === 'snapshot' ? <button type="button" onClick={() => file.current?.click()} disabled={busy} className="btn-ghost press min-h-9 px-3 text-[12px]"><Trash2 size={13}/>Remove · use my own</button>
            : <button type="button" onClick={() => file.current?.click()} disabled={custom.isPending || reset.isPending} className="btn-ghost press min-h-9 px-3 text-[12px]"><ImagePlus size={13}/>{icon?.source === 'custom' ? 'Change image' : 'Use my own image'}</button>}
          {icon?.source === 'custom' && <button type="button" onClick={() => reset.mutate()} disabled={reset.isPending} className="btn-ghost press min-h-9 px-3 text-[12px]"><RotateCcw size={13}/>{model ? 'Use 3D snapshot' : 'Remove'}</button>}
        </div>}
      </div>
    </div>
    <input ref={file} type="file" accept="image/*" className="hidden" onChange={event => { const picked = event.target.files?.[0]; event.target.value = ''; if (picked) custom.mutate(picked); }}/>
    {error && <p role="alert" className="mt-2 text-xs font-semibold text-down">{error}</p>}
  </div>;
}
