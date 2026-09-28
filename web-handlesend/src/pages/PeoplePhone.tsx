import { useCallback, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, Monitor, ScanFace } from 'lucide-react';
import { api } from '@/lib/api';
import { peopleError, type PeoplePhoto } from '@/lib/people';
import { PeopleCapture } from '@/components/people/PeopleCapture';
import { Loading } from '@/components/Feedback';
import { CAPTURE_MODES, CAPTURE_PLAN, type CaptureMode } from '@/shared/people';

interface PhoneSession { draftId: string; name: string; mode: CaptureMode; expiresAt: number; items: PeoplePhoto[] }

/**
 * /People/phone/:token. Opened from the QR code on a computer. The link only lets this phone add or remove photos on
 * one draft for 30 minutes; everything else (consents, wallet, split, 3D approval) stays on the signed-in account.
 */
export default function PeoplePhone() {
  const { token = '' } = useParams(); const qc = useQueryClient(); const key = ['people', 'phone', token] as const;
  useEffect(() => { document.title = 'ObjectPad People · Phone capture'; }, []);
  const q = useQuery({ queryKey: key, queryFn: () => api<PhoneSession>(`/people/phone/${token}`), retry: false, refetchInterval: 30_000 });
  const setItems = useCallback((items: PeoplePhoto[]) => qc.setQueryData<PhoneSession>(key, s => s ? { ...s, items } : s), [qc, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isPending) return <div className="page max-w-xl py-10"><Loading label="Connecting to your computer…"/></div>;
  if (q.isError || !q.data) return <div className="page max-w-xl py-10">
    <div className="smoke relative overflow-hidden rounded-[32px] p-7 text-white"><Lock size={26}/><h1 className="display mt-4 text-[34px] leading-none">Link closed</h1><p className="mt-3 text-[15px] font-semibold leading-6 text-white/70">{peopleError(q.error)}</p><Link to="/People/start" className="press mt-6 inline-flex min-h-12 items-center rounded-full bg-white px-6 text-[15px] font-extrabold text-ink">Sign in on this phone instead</Link></div>
  </div>;

  const s = q.data; const plan = CAPTURE_PLAN[s.mode]; const done = plan.required.every(v => s.items.some(p => p.view === v));
  const mins = Math.max(0, Math.round((s.expiresAt - Date.now()) / 60_000));
  return <div className="page max-w-xl py-5 sm:py-10">
    <div className="flex items-center gap-2.5"><span className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white"><ScanFace size={19}/></span><div><p className="font-mono text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-ink/50">Phone capture · linked to your computer</p><p className="text-[17px] font-extrabold leading-tight">{s.name || 'Your double'}</p></div></div>
    <p className="mt-3 text-[13.5px] font-semibold text-ink/55">{CAPTURE_MODES.find(m => m.id === s.mode)?.label} · {plan.required.length} required photo{plan.required.length === 1 ? '' : 's'} · link closes in {mins} min</p>
    <div className="mt-5"><PeopleCapture draftId={s.draftId} mode={s.mode} photos={s.items} onPhotos={setItems} phoneToken={token}/></div>
    {done && <div className="slide-in mt-5 flex items-center gap-3 rounded-[24px] bg-ink p-5 text-white"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#12A150]"><Check size={20} strokeWidth={3}/></span><div><p className="text-[16px] font-extrabold">All set. Back to your computer.</p><p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-white/60"><Monitor size={13}/>Your photos already appear there. Build your 3D double from that screen.</p></div></div>}
  </div>;
}
