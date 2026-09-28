import { lazy, Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Check, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { Loading } from '@/components/Feedback';
import { PEOPLE_KEY, peopleError, usePeopleBlob, usePeopleCall, type ModelStatus } from '@/lib/people';
import type { ModelJobState } from '@/shared/people';
import { cn } from '@/lib/utils';

const ModelViewer = lazy(() => import('@/components/ModelViewer'));
const ACTIVE: ModelJobState[] = ['submitting', 'queued', 'generating', 'validating'];
const LABEL: Record<ModelJobState, string> = { submitting: 'Sending your photos', queued: 'In the queue', generating: 'Building your 3D double', validating: 'Checking the model', ready: 'Ready for your review', approved: 'Approved', rejected: 'Rejected', failed: 'Build failed', uncertain: 'Connection lost' };

export const modelKey = (id: string) => [...PEOPLE_KEY, 'model', id] as const;

/** Private 3D preview: real provider progress, subject review, approve or rebuild within the retry budget. */
export function PeopleModel({ draftId, canStart, onApproved }: { draftId: string; canStart: boolean; onApproved: () => void }) {
  const call = usePeopleCall(); const blob = usePeopleBlob(); const qc = useQueryClient();
  const status = useQuery({ queryKey: modelKey(draftId), queryFn: () => call<ModelStatus>(`/people/drafts/${draftId}/model`), refetchInterval: q => { const s = q.state.data?.job?.state; return s && ACTIVE.includes(s) ? 3_500 : false; } });
  const job = status.data?.job ?? null; const active = Boolean(job && ACTIVE.includes(job.state));
  const [err, setErr] = useState<string | null>(null);
  const act = useMutation({ mutationFn: (path: string) => call<ModelStatus>(`/people/drafts/${draftId}/model${path}`, 'POST', {}), onMutate: () => setErr(null), onSuccess: (d, path) => { qc.setQueryData(modelKey(draftId), d); if (path === '/approve') onApproved(); }, onError: e => setErr(peopleError(e)) });
  const showModel = job && (job.state === 'ready' || job.state === 'approved') && job.model;
  const files = useQuery({ queryKey: [...modelKey(draftId), 'files', job?.id], enabled: Boolean(showModel), staleTime: Infinity, gcTime: 60_000, queryFn: async () => ({ model: await blob(`/people/drafts/${draftId}/model/model`), thumb: await blob(`/people/drafts/${draftId}/model/thumb`) }) });
  const [urls, setUrls] = useState<{ model: string; thumb: string } | null>(null);
  useEffect(() => { if (!files.data) { setUrls(null); return; } const u = { model: URL.createObjectURL(files.data.model), thumb: URL.createObjectURL(files.data.thumb) }; setUrls(u); return () => { URL.revokeObjectURL(u.model); URL.revokeObjectURL(u.thumb); }; }, [files.data]);
  const [elapsed, setElapsed] = useState<number>(0);
  useEffect(() => { if (!active || !job) return; const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - job.createdAt) / 1000)), 1000); return () => window.clearInterval(t); }, [active, job]);

  if (status.isPending) return <Loading label="Checking your 3D double…"/>;
  if (status.data && !status.data.configured) return <p className="rounded-2xl bg-ink/[0.04] p-4 text-[14px] font-bold text-ink/60">The 3D engine is offline right now. Your photos are saved: come back soon.</p>;
  const left = status.data?.attemptsLeft ?? 0; const failed = job && (job.state === 'failed' || job.state === 'uncertain' || job.state === 'rejected');

  return <div className="grid gap-4">
    {!job && <div className="relative overflow-hidden rounded-[28px] bg-ink p-6 text-white sm:p-8">
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[#2F7BF2]/30 blur-3xl"/>
      <Sparkles size={26} className="relative"/><p className="display relative mt-4 text-[30px] leading-none">Build my 3D double</p>
      <p className="relative mt-2 max-w-md text-[14.5px] font-semibold text-white/65">Takes about 1–3 minutes. It’s an AI reconstruction: hidden sides are inferred. You’ll review it before anything else happens. {left} builds available.</p>
      <button type="button" disabled={!canStart || act.isPending} onClick={() => act.mutate('')} className="press relative mt-5 inline-flex min-h-[54px] items-center gap-2 rounded-full bg-white px-7 text-[15.5px] font-extrabold text-ink disabled:opacity-40">{act.isPending ? <RefreshCw size={18} className="animate-spin"/> : <Box size={18}/>}{act.isPending ? 'Starting…' : 'Build it'}</button>
      {!canStart && <p className="relative mt-3 text-[13px] font-bold text-white/55">Take the required photos first.</p>}
    </div>}

    {job && active && <div className="raised rounded-[28px] p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3"><p className="text-[18px] font-extrabold">{LABEL[job.state]}</p><span className="font-mono text-[12px] font-bold text-ink/45 tnum">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span></div>
      <div className="mt-4 h-4 overflow-hidden rounded-full bg-ink/[0.07] p-[3px]"><div className="h-full rounded-full bg-[linear-gradient(90deg,#2F7BF2,#6FA8FF)] transition-[width] duration-700" style={{ width: `${Math.max(4, job.progress)}%` }}/></div>
      <p className="mt-2.5 text-[13px] font-bold text-ink/50">{job.progress}% from the 3D engine{job.queue ? ` · ${job.queue} ahead of you` : ''}. You can leave this page; it keeps building.</p>
    </div>}

    {showModel && <div className="grid gap-3">
      {urls ? <Suspense fallback={<Loading/>}><ModelViewer src={urls.model} poster={urls.thumb} height="h-[420px] sm:h-[480px]" autoLoad label="Your private 3D preview · AI reconstruction"/></Suspense> : files.isError ? <p className="rounded-2xl bg-down/10 p-4 text-[14px] font-bold text-down">The preview couldn’t load. <button className="underline" onClick={() => void files.refetch()}>Retry</button></p> : <div className="sunk flex h-[420px] items-center justify-center rounded-[28px]"><Loading label="Loading your preview…"/></div>}
      {job.state === 'approved' ? <p className="flex items-center gap-2 rounded-2xl bg-up/10 px-4 py-3 text-[14.5px] font-extrabold text-up"><Check size={17} strokeWidth={3}/>Approved. Your photos were deleted.</p>
        : <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={act.isPending} onClick={() => act.mutate('/approve')} className="btn press min-h-[56px] text-[16px]"><Check size={19} strokeWidth={3}/>Looks like me: approve</button>
          <button type="button" disabled={act.isPending || left <= 0} onClick={() => act.mutate('/reject')} className="btn-ghost press min-h-[56px] text-[15px]"><RotateCcw size={17}/>Not right{left > 0 ? ` · ${left} left` : ''}</button>
        </div>}
      {job.model && <p className="text-[12px] font-semibold text-ink/40">{job.model.triangles.toLocaleString()} triangles · {(job.model.bytes / 1_048_576).toFixed(1)} MB · private to you until you publish</p>}
    </div>}

    {failed && <div className={cn('rounded-[24px] p-5', job.state === 'rejected' ? 'raised' : 'bg-down/[0.07]')}>
      <p className="text-[16px] font-extrabold">{job.state === 'rejected' ? 'Let’s try again' : LABEL[job.state]}</p>
      <p className="mt-1 text-[14px] font-semibold text-ink/60">{job.state === 'rejected' ? 'Retake any photo above for a better match, then rebuild.' : peopleError(Object.assign(new Error(job.failure ?? ''), { code: job.failure ?? '' }))}</p>
      <button type="button" disabled={act.isPending || left <= 0 || !canStart} onClick={() => act.mutate('')} className="btn press mt-3 min-h-12 px-6 text-[14.5px]"><RefreshCw size={16}/>Rebuild · {left} left</button>
    </div>}
    {err && <p role="alert" className="rounded-2xl bg-down/10 px-4 py-3 text-[14px] font-bold text-down">{err}</p>}
  </div>;
}
