import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, KeyRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { timeAgo } from '@/lib/format';
import { CAPTURE_LONG_SIDE, MIN_IMAGE_SIDE } from '@/shared/capture';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

/** Re-encodes a picked photo to a metadata-free JPEG no larger than the capture limit. */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, CAPTURE_LONG_SIDE / Math.max(bitmap.width, bitmap.height)); const width = Math.round(bitmap.width * scale); const height = Math.round(bitmap.height * scale);
  if (Math.min(width, height) < MIN_IMAGE_SIDE) throw new Error(`This photo is too small. Use at least ${MIN_IMAGE_SIDE}px on the short side.`);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d'); if (!context) throw new Error('Image processing is unavailable.');
  context.drawImage(bitmap, 0, 0, width, height); bitmap.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the photo.')), 'image/jpeg', 0.9));
}

/**
 * Object Key: the creator re-photographs the physical object and AI compares it with the original scan. A match shows
 * a public "still has it" badge on the coin. It proves a matching photo was taken, not legal ownership.
 */
export function ObjectKey({ objectId, checkin, isCreator }: { objectId: string; checkin?: { at: number; confidence: number }; isCreator: boolean }) {
  const auth = useSession(); const qc = useQueryClient(); const input = useRef<HTMLInputElement>(null); const [error, setError] = useState<string>('');
  const run = useMutation({
    mutationFn: async (file: File) => api<{ matched: boolean; confidence: number; reason: string }>(`/records/${objectId}/checkin`, { token: await auth.token(), method: 'PUT', binary: await toJpeg(file), timeout: 70_000 }),
    onSuccess: data => { if (data.matched) void qc.invalidateQueries({ queryKey: ['objectpad', 'object', objectId] }); },
    onError: failure => setError(failure instanceof Error ? failure.message : 'The check-in failed.'),
  });
  const result = run.data;
  return <section className="rounded-[28px] p-5 glass">
    <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold"><KeyRound size={16} className="text-volt"/>Object Key</h2>{checkin && <span className="rounded-full bg-up/15 px-2.5 py-1 font-mono text-[11px] uppercase text-up">Checked in {timeAgo(checkin.at)}</span>}</div>
    <p className="mt-2 text-xs leading-5 text-muted">{checkin ? `The creator re-photographed this object and AI matched it to the original scan (${Math.round(checkin.confidence * 100)}% confidence).` : 'The creator can re-photograph the real object at any time. When AI matches it to the original scan, a public check-in badge appears here.'}</p>
    {isCreator && <>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; setError(''); if (file) run.mutate(file); }}/>
      <Button variant="outline" className="mt-4 w-full bg-white/50" disabled={run.isPending} onClick={() => input.current?.click()}><Camera/>{run.isPending ? 'Comparing with the original scan…' : 'Check in with a new photo'}</Button>
    </>}
    {result && <p className={cn('mt-3 flex items-start gap-2 rounded-2xl px-3 py-2.5 text-xs leading-5', result.matched ? 'bg-up/10' : 'bg-down/10')}>{result.matched ? <Check size={14} className="mt-0.5 shrink-0 text-up"/> : <X size={14} className="mt-0.5 shrink-0 text-down"/>}{result.matched ? `Matched (${Math.round(result.confidence * 100)}%). Badge updated.` : `Not matched${result.reason ? `: ${result.reason}` : ''}. Try again in even light, showing the same side as your first photo.`}</p>}
    {error && <p role="alert" className="mt-3 text-xs text-down">{error}</p>}
  </section>;
}
