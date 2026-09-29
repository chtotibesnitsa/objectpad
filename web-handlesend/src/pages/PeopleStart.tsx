import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, ArrowRight, AtSign, Box, Camera, Check, Copy, FileSignature, Flag, Link2, Lock, Rocket, ScanFace, ShieldCheck, Smartphone, Split, Trash2, Undo2, User, UserPlus, Wallet } from 'lucide-react';
import { ErrorState, Loading } from '@/components/Feedback';
import { CheckLine, Field, inputCls, Notice, SignInGate, SplitBar, StateChip } from '@/components/people/PeopleUi';
import { PeopleCapture } from '@/components/people/PeopleCapture';
import { PeopleModel } from '@/components/people/PeopleModel';
import { PEOPLE_KEY, peopleError, usePeopleCall, usePeopleStatus, type PeopleDraft, type PeoplePhoto } from '@/lib/people';
import { useSession } from '@/lib/session';
import { copyText, shortAddress } from '@/lib/format';
import { CAPTURE_MODES, CAPTURE_PLAN, CONSENT_TEXT, splitFor, type Relationship } from '@/shared/people';
import { cn } from '@/lib/utils';

const draftKey = (id: string) => [...PEOPLE_KEY, 'draft', id] as const;
const STATE_LABEL: Record<PeopleDraft['state'], string> = { draft: 'Private draft', awaiting_subject: 'Waiting for them to accept', published: 'Published', withdrawn: 'Withdrawn', deleted: 'Deleted' };

/** /People/start: pick who the profile is about (or resume a draft). Two taps to a private draft. */
export default function PeopleStart() {
  useEffect(() => { document.title = 'ObjectPad People · Make your 3D double'; }, []);
  return <div className="page max-w-3xl py-6 sm:py-12">
    <Link to="/People" className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-ink/60"><ArrowLeft size={16}/>People</Link>
    <h1 className="display mt-2 text-[clamp(44px,8vw,80px)] leading-[0.9]">Let’s make<br/>your double.</h1>
    <p className="mt-4 max-w-xl text-[16px] font-semibold text-ink/60">Everything is private until you approve it. It saves as you go, so you can stop and come back.</p>
    <div className="mt-8"><SignInGate title="Sign in to start" body="Use X so we can confirm your account later. Just looking around never needs sign-in."><StartInner/></SignInGate></div>
  </div>;
}

function StartInner() {
  const call = usePeopleCall(); const qc = useQueryClient(); const navigate = useNavigate();
  const drafts = useQuery({ queryKey: [...PEOPLE_KEY, 'drafts'], queryFn: () => call<{ items: PeopleDraft[] }>('/people/drafts') });
  const [relationship, setRelationship] = useState<Relationship | null>(null); const [name, setName] = useState<string>(''); const [adult, setAdult] = useState<boolean>(false);
  const create = useMutation({
    mutationFn: async () => { const d = await call<PeopleDraft>('/people/drafts', 'POST', { relationship, displayName: name.trim() }); if (relationship === 'self' && adult) await call(`/people/drafts/${d.id}/consents`, 'POST', { kind: 'adult', granted: true }); return d; },
    onSuccess: d => { void qc.invalidateQueries({ queryKey: PEOPLE_KEY }); navigate(`/People/start/${d.id}`); },
  });
  const canCreate = relationship !== null && name.trim().length >= 2 && (relationship === 'assisted' || adult);
  const open = drafts.data?.items.filter(d => d.state !== 'deleted') ?? [];

  return <div className="grid gap-5">
    {open.length > 0 && <section>
      <p className="text-[15px] font-extrabold">Pick up where you left off</p>
      <ul className="mt-3 grid gap-2">{open.map(d => { const done = d.checks.filter(c => c.passed).length; return <li key={d.id}><Link to={`/People/start/${d.id}`} className="raised press flex items-center gap-3.5 rounded-[22px] p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-white">{d.relationship === 'self' ? <ScanFace size={20}/> : <UserPlus size={20}/>}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-extrabold">{d.displayName || 'Untitled'}</span><span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink/[0.07]"><span className="block h-full rounded-full bg-ink" style={{ width: `${(done / d.checks.length) * 100}%` }}/></span><span className="mt-1 block text-[12.5px] font-bold text-ink/45">{STATE_LABEL[d.state]} · {done} of {d.checks.length} done</span></span>
        <ArrowRight size={18} className="text-ink/35"/></Link></li>; })}</ul>
    </section>}

    <section className="raised rounded-[30px] p-5 sm:p-7">
      <p className="text-[18px] font-extrabold">Who is this for?</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {([['self', ScanFace, 'It’s me', 'I’m 18+ and this is about me.'], ['assisted', UserPlus, 'Someone I work with', 'I set it up. They accept and take full control.']] as const).map(([id, Icon, t, d]) => <button key={id} type="button" onClick={() => setRelationship(id)} aria-pressed={relationship === id} className={cn('press rounded-[24px] p-5 text-left transition-all', relationship === id ? 'bg-ink text-white shadow-[0_20px_34px_-18px_rgba(12,13,16,.75)]' : 'sunk')}>
          <span className={cn('flex size-11 items-center justify-center rounded-2xl', relationship === id ? 'bg-white/15' : 'bg-white')}><Icon size={21}/></span><p className="mt-4 text-[19px] font-extrabold">{t}</p><p className={cn('mt-1 text-[14px] font-semibold leading-5', relationship === id ? 'text-white/65' : 'text-ink/55')}>{d}</p></button>)}
      </div>
      {relationship && <div className="slide-in mt-6 grid gap-4">
        <Field label={relationship === 'self' ? 'Your name or creator name' : 'Their name or creator name'}><input value={name} onChange={e => setName(e.target.value.slice(0, 60))} className={cn(inputCls, 'min-h-[54px] text-[16px]')} placeholder={relationship === 'self' ? 'e.g. Maya Creates' : 'e.g. Jordan'} autoComplete="off" autoFocus/></Field>
        {relationship === 'self' && <label className="sunk flex cursor-pointer items-start gap-3 rounded-2xl p-4 text-[14.5px] font-bold"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="mt-0.5 size-6 shrink-0 accent-ink"/>{CONSENT_TEXT.adult}</label>}
        {relationship === 'assisted' && <p className="text-[13.5px] font-semibold leading-5 text-ink/55">You’ll get a private invite link to send them. Public figures you don’t work with? <Link to="/People/nominate" className="font-extrabold text-ink underline underline-offset-2">Nominate them</Link> instead.</p>}
        {create.isError && <Notice tone="error">{peopleError(create.error)}</Notice>}
        <button type="button" disabled={!canCreate || create.isPending} onClick={() => create.mutate()} className="btn press min-h-[56px] w-full text-[16px]">{create.isPending ? 'Creating…' : 'Continue'}<ArrowRight size={18}/></button>
      </div>}
    </section>
  </div>;
}

type StepId = 'you' | 'photos' | 'double' | 'connect' | 'split' | 'verify' | 'review';
const STEP_META: Record<StepId, { title: string; short: string; icon: typeof User }> = {
  you: { title: 'About you', short: 'You', icon: User },
  photos: { title: 'Take your photos', short: 'Photos', icon: Camera },
  double: { title: 'Your 3D double', short: '3D', icon: Box },
  connect: { title: 'Connect X and wallet', short: 'Connect', icon: Wallet },
  split: { title: 'Your fee split', short: 'Split', icon: Split },
  verify: { title: 'Verify it’s you', short: 'Verify', icon: ShieldCheck },
  review: { title: 'Review and go live', short: 'Go live', icon: Rocket },
};
const ORDER: StepId[] = ['you', 'photos', 'double', 'connect', 'split', 'verify', 'review'];

/** /People/start/:id: one step at a time. Every action is re-checked server-side. */
export function PeopleDraftPage() {
  const { id = '' } = useParams();
  return <div className="page max-w-3xl py-6 sm:py-10">
    <Link to="/People/start" className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-ink/60"><ArrowLeft size={16}/>My drafts</Link>
    <div className="mt-2"><SignInGate><DraftInner id={id}/></SignInGate></div>
  </div>;
}

function DraftInner({ id }: { id: string }) {
  const call = usePeopleCall(); const qc = useQueryClient(); const navigate = useNavigate();
  const query = useQuery({ queryKey: draftKey(id), queryFn: () => call<PeopleDraft>(`/people/drafts/${id}`), retry: false });
  const d = query.data; const isSubject = Boolean(d && d.role !== 'creator');
  const photos = useQuery({ queryKey: [...draftKey(id), 'photos'], enabled: isSubject, queryFn: () => call<{ items: PeoplePhoto[] }>(`/people/drafts/${id}/photos`) });
  const [error, setError] = useState<string | null>(null); const [flash, setFlash] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onMutate: () => { setError(null); setFlash(null); },
    onSuccess: result => { if (result && typeof result === 'object' && 'id' in result && 'checks' in result) qc.setQueryData(draftKey(id), result); void qc.invalidateQueries({ queryKey: [...PEOPLE_KEY, 'drafts'] }); },
    onError: e => setError(peopleError(e)),
  });
  const [params, setParams] = useSearchParams();

  const check = useCallback((cid: string) => d?.checks.find(c => c.id === cid)?.passed ?? false, [d]);
  const photoItems = photos.data?.items ?? [];
  const requiredPhotos = d ? CAPTURE_PLAN[d.captureMode].required.every(v => photoItems.some(p => p.view === v)) : false;
  const done: Record<StepId, boolean> = useMemo(() => ({
    you: Boolean(d?.displayName) && check('adult'), photos: requiredPhotos || check('model'), double: check('model'), connect: check('account') && check('wallet'),
    split: check('feePolicy'), verify: check('verificationConsent') && check('likenessConsent') && check('liveness'), review: d?.state === 'published',
  }), [d, check, requiredPhotos]);
  const firstOpen = ORDER.find(s => !done[s]) ?? 'review';
  const step = (ORDER.find(s => s === params.get('step')) ?? firstOpen) as StepId;
  const go = (s: StepId) => { setError(null); setFlash(null); setParams({ step: s }, { replace: false }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  if (query.isPending) return <Loading label="Opening your draft…"/>;
  if (query.isError || !d) return <ErrorState message={peopleError(query.error)} retry={() => void query.refetch()}/>;

  const doneCount = ORDER.filter(s => done[s]).length; const locked = d.state === 'published' || d.state === 'withdrawn';
  const idx = ORDER.indexOf(step); const next = ORDER[idx + 1];

  return <div className="grid gap-5">
    <header>
      <div className="flex flex-wrap items-center gap-2"><span className="chip">{d.relationship === 'self' ? 'My profile' : 'Assisted'}</span><span className="chip !bg-ink/[0.05] !text-ink/60 !shadow-none">{STATE_LABEL[d.state]}</span></div>
      <h1 className="display mt-3 text-[clamp(36px,6vw,58px)] leading-[0.92]">{d.displayName || 'Untitled'}</h1>
    </header>

    {!isSubject ? <CreatorPanel d={d} act={act} setFlash={setFlash}/> : <>
      <nav aria-label="Steps" className="raised rounded-[24px] p-3 sm:p-4">
        <ol className="grid grid-cols-7 gap-1">{ORDER.map((s, i) => { const M = STEP_META[s]; const on = s === step; return <li key={s}><button type="button" onClick={() => go(s)} aria-current={on ? 'step' : undefined} className="press flex w-full flex-col items-center gap-1.5 rounded-xl py-1">
          <span className={cn('flex size-9 items-center justify-center rounded-full transition-all sm:size-10', done[s] ? 'bg-[#12A150] text-white' : on ? 'bg-ink text-white ring-4 ring-ink/10' : 'bg-ink/[0.06] text-ink/40')}>{done[s] ? <Check size={16} strokeWidth={3}/> : <M.icon size={16}/>}</span>
          <span className={cn('hidden text-[11px] font-extrabold sm:block', on ? 'text-ink' : 'text-ink/40')}>{M.short}</span><span className="sr-only">Step {i + 1}</span></button></li>; })}</ol>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]"><div className="h-full rounded-full bg-[#12A150] transition-[width] duration-700" style={{ width: `${(doneCount / ORDER.length) * 100}%` }}/></div>
        <p className="mt-2 text-center text-[12.5px] font-bold text-ink/45">Step {idx + 1} of {ORDER.length} · {doneCount} done · saved automatically</p>
      </nav>

      <section key={step} className="slide-in raised rounded-[30px] p-5 sm:p-7">
        <h2 className="display text-[clamp(28px,4.4vw,40px)] leading-none">{STEP_META[step].title}</h2>
        <div className="mt-5">
          {step === 'you' && <StepYou d={d} act={act} call={call} locked={locked}/>}
          {step === 'photos' && <StepPhotos d={d} act={act} call={call} locked={locked} photos={photoItems} setPhotos={items => qc.setQueryData([...draftKey(id), 'photos'], { items })}/>}
          {step === 'double' && (check('model') && !locked ? <><PeopleModel draftId={id} canStart={requiredPhotos} onApproved={() => void query.refetch()}/></> : locked ? <Notice>Your approved 3D double is locked in.</Notice> : <PeopleModel draftId={id} canStart={requiredPhotos} onApproved={() => { void query.refetch(); setFlash('Approved. Your photos were deleted.'); }}/>)}
          {step === 'connect' && <StepConnect d={d} act={act} call={call} locked={locked} setFlash={setFlash}/>}
          {step === 'split' && <StepSplit d={d} act={act} call={call} locked={locked} setFlash={setFlash} walletOk={check('wallet')}/>}
          {step === 'verify' && <StepVerify d={d} act={act} call={call} locked={locked}/>}
          {step === 'review' && <StepReview d={d} act={act} call={call} locked={locked} go={go}/>}
        </div>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        {flash && <div className="mt-4"><Notice tone="ok">{flash}</Notice></div>}
        <div className="mt-6 flex items-center justify-between gap-2 border-t border-ink/[0.07] pt-5">
          {idx > 0 ? <button type="button" onClick={() => go(ORDER[idx - 1])} className="btn-ghost press min-h-12 px-5 text-[14.5px]"><ArrowLeft size={16}/>Back</button> : <span/>}
          {next && <button type="button" onClick={() => go(next)} className={cn('press min-h-12 px-6 text-[15px]', done[step] ? 'btn' : 'btn-ghost')}>{done[step] ? 'Next' : 'Skip for now'}<ArrowRight size={16}/></button>}
        </div>
      </section>
    </>}

    <details className="sunk group rounded-[24px] p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-extrabold [&::-webkit-details-marker]:hidden">Your controls<span className="text-[12.5px] font-bold text-ink/45 group-open:hidden">Withdraw, delete, report</span></summary>
      <p className="mt-3 text-[13.5px] font-semibold leading-5 text-ink/60">Withdraw hides it and cancels invites. Delete erases your draft, photos and 3D files; our audit log keeps only event names and times. Blockchain history and copies others downloaded can’t be erased.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {d.state !== 'withdrawn' && <button type="button" disabled={act.isPending} onClick={() => { if (confirm('Withdraw this draft?')) act.mutate(() => call(`/people/drafts/${id}/withdraw`, 'POST', {})); }} className="btn-ghost press min-h-11 px-4 text-[14px]"><Undo2 size={15}/>Withdraw</button>}
        <button type="button" disabled={act.isPending} onClick={() => { if (confirm('Delete this draft, its photos and 3D files? This can’t be undone.')) act.mutate(async () => { await call(`/people/drafts/${id}`, 'DELETE'); void qc.invalidateQueries({ queryKey: PEOPLE_KEY }); navigate('/People/start'); }); }} className="btn-ghost press min-h-11 px-4 text-[14px] !text-down"><Trash2 size={15}/>Delete everything</button>
        <Link to="/People/nominate#report" className="btn-ghost press min-h-11 px-4 text-[14px]"><Flag size={15}/>Report or appeal</Link>
      </div>
    </details>
  </div>;
}

type Act = { mutate: (run: () => Promise<unknown>) => void; isPending: boolean };
type Call = ReturnType<typeof usePeopleCall>;
interface StepProps { d: PeopleDraft; act: Act; call: Call; locked: boolean; }

function StepYou({ d, act, call, locked }: StepProps) {
  const [name, setName] = useState<string>(d.displayName); const [bio, setBio] = useState<string>(d.narrative);
  useEffect(() => { setName(d.displayName); setBio(d.narrative); }, [d.id, d.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const adult = d.checks.find(c => c.id === 'adult')?.passed ?? false; const dirty = name !== d.displayName || bio !== d.narrative;
  return <div className="grid gap-4">
    <Field label="Name"><input value={name} disabled={locked} onChange={e => setName(e.target.value.slice(0, 60))} className={cn(inputCls, 'min-h-[54px] text-[16px]')}/></Field>
    <Field label="Short bio (optional)" hint="What you make. Skip private details like location, health or family."><textarea value={bio} disabled={locked} onChange={e => setBio(e.target.value.slice(0, 600))} rows={3} className={cn(inputCls, 'resize-none text-[16px]')} placeholder="I make comedy skits and sneaker reviews."/></Field>
    {dirty && !locked && <button type="button" disabled={act.isPending} onClick={() => act.mutate(() => call(`/people/drafts/${d.id}`, 'PATCH', { displayName: name, narrative: bio }))} className="btn-ghost press min-h-12 w-fit px-6 text-[14.5px]">Save</button>}
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-2xl p-4 text-[14.5px] font-bold', adult ? 'bg-up/10' : 'sunk')}><input type="checkbox" checked={adult} disabled={act.isPending || locked} onChange={e => act.mutate(() => call(`/people/drafts/${d.id}/consents`, 'POST', { kind: 'adult', granted: e.target.checked }))} className="mt-0.5 size-6 shrink-0 accent-ink"/>{CONSENT_TEXT.adult}</label>
  </div>;
}

/**
 * Desktop QR handoff. Mints a 30-minute, photos-only link for this draft, so the phone (Safari or the installed web app)
 * can shoot without signing in. Photos taken on the phone appear here within a few seconds.
 */
function PhoneHandoff({ draftId, call, count, onRefresh }: { draftId: string; call: Call; count: number; onRefresh: () => void }) {
  const link = useMutation({ mutationFn: () => call<{ token: string; expiresAt: number }>(`/people/drafts/${draftId}/phone-link`, 'POST', {}) });
  const url = link.data ? `${window.location.origin}/People/phone/${link.data.token}` : null;
  const live = Boolean(link.data && link.data.expiresAt > Date.now());
  useEffect(() => { if (!live) return; const t = window.setInterval(onRefresh, 3_000); return () => window.clearInterval(t); }, [live, onRefresh]);
  return <div className="raised relative overflow-hidden rounded-[26px] p-5">
    <div aria-hidden className="dot-grid absolute inset-0 opacity-60"/>
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
      {url ? <div className="shrink-0 self-start rounded-2xl bg-white p-2.5"><QRCodeSVG value={url} size={124}/></div> : <span className="flex size-[124px] shrink-0 items-center justify-center rounded-2xl bg-ink/[0.06]"><Smartphone size={34}/></span>}
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-extrabold">Shoot on your phone</p>
        <p className="mt-1 text-[13.5px] font-semibold leading-5 text-ink/60">{url ? 'Scan with your iPhone or Android camera. No sign-in on the phone: the link only adds photos to this draft and closes in 30 minutes.' : 'Phones take sharper selfies. We’ll make a private QR code that opens the camera on your phone.'}</p>
        {link.isError && <p className="mt-2 text-[13px] font-bold text-down">{peopleError(link.error)}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!url ? <button type="button" disabled={link.isPending} onClick={() => link.mutate()} className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-extrabold text-white"><Smartphone size={15}/>{link.isPending ? 'Making link…' : 'Show QR code'}</button>
            : <><span className="inline-flex items-center gap-2 rounded-full bg-ink/[0.06] px-3.5 py-2 text-[12.5px] font-extrabold"><span className="size-2 animate-pulse rounded-full bg-[#12A150]"/>Waiting for your phone · {count} photo{count === 1 ? '' : 's'} in</span>
              <button type="button" onClick={() => void copyText(url)} className="press inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold text-ink/60"><Copy size={13}/>Copy link</button>
              <button type="button" onClick={() => link.mutate()} className="press inline-flex min-h-10 items-center rounded-full px-3 text-[12.5px] font-bold text-ink/60">New code</button></>}
        </div>
      </div>
    </div>
  </div>;
}

function StepPhotos({ d, act, call, locked, photos, setPhotos }: StepProps & { photos: PeoplePhoto[]; setPhotos: (items: PeoplePhoto[]) => void }) {
  const refreshPhotos = useCallback(() => { void call<{ items: PeoplePhoto[] }>(`/people/drafts/${d.id}/photos`).then(r => setPhotos(r.items)).catch(() => undefined); }, [call, d.id, setPhotos]);
  const adult = d.checks.find(c => c.id === 'adult')?.passed ?? false; const approved = d.checks.find(c => c.id === 'model')?.passed ?? false;
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (approved) return <Notice tone="ok">Your 3D double is approved, so your photos were deleted. Nothing more to do here.</Notice>;
  if (!adult) return <Notice>Confirm you’re 18+ in the first step, then come back.</Notice>;
  return <div className="grid gap-5">
    <div>
      <p className="text-[15px] font-extrabold">Pick a style</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{CAPTURE_MODES.map(m => { const on = d.captureMode === m.id; return <button key={m.id} type="button" disabled={locked || act.isPending} onClick={() => act.mutate(() => call(`/people/drafts/${d.id}`, 'PATCH', { captureMode: m.id }))} aria-pressed={on} className={cn('press rounded-[20px] p-3.5 text-left transition-all', on ? 'bg-ink text-white shadow-[0_14px_24px_-14px_rgba(12,13,16,.7)]' : 'sunk')}>
        <p className="text-[15px] font-extrabold">{m.label}</p><p className={cn('mt-0.5 text-[12.5px] font-bold', on ? 'text-white/60' : 'text-ink/45')}>{m.short} · {m.minutes}</p></button>; })}</div>
      <p className="mt-2 text-[12.5px] font-semibold leading-5 text-ink/50">{CAPTURE_MODES.find(m => m.id === d.captureMode)?.fidelity}</p>
    </div>
    {!touch && <PhoneHandoff draftId={d.id} call={call} count={photos.length} onRefresh={refreshPhotos}/>}
    <PeopleCapture draftId={d.id} mode={d.captureMode} photos={photos} onPhotos={setPhotos} disabled={locked}/>
  </div>;
}

function StepConnect({ d, act, call, locked, setFlash }: StepProps & { setFlash: (s: string) => void }) {
  const session = useSession(); const post = <T,>(p: string, b?: unknown) => call<T>(`/people/drafts/${d.id}${p}`, 'POST', b ?? {});
  const proveWallet = () => act.mutate(async () => {
    if (!session.wallet) throw new Error('Your account has no wallet yet. Sign out and back in to create one.');
    const ch = await post<{ message: string; nonce: string }>('/wallet-challenge', { address: session.wallet });
    const signature = await session.sign(ch.message); const out = await post<PeopleDraft>('/wallet', { nonce: ch.nonce, signature }); setFlash('Wallet connected. That signature can’t be reused.'); return out;
  });
  return <div className="grid gap-3">
    <div className={cn('flex flex-col gap-3 rounded-[22px] p-4 sm:flex-row sm:items-center', d.account ? 'bg-up/[0.08]' : 'sunk')}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-white"><AtSign size={20}/></span>
      <div className="min-w-0 flex-1"><p className="text-[16px] font-extrabold">{d.account ? `@${d.account.handle}` : 'Your X account'}</p><p className="text-[13px] font-semibold text-ink/55">{d.account ? 'Connected by X’s permanent ID, so renaming keeps it.' : 'Proves the account is yours. We never accept a pasted link.'}</p></div>
      {!d.account && !locked && <div className="flex gap-2"><button type="button" disabled={act.isPending} onClick={() => act.mutate(() => post('/account'))} className="btn press min-h-12 px-5 text-[14.5px]">Connect X</button>{session.linkX && <button type="button" onClick={() => session.linkX?.()} className="btn-ghost press min-h-12 px-4 text-[13.5px]">Link X first</button>}</div>}
      {d.account && <Check size={22} strokeWidth={3} className="text-up"/>}
    </div>
    <div className={cn('flex flex-col gap-3 rounded-[22px] p-4 sm:flex-row sm:items-center', d.wallet ? 'bg-up/[0.08]' : 'sunk')}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-white"><Wallet size={20}/></span>
      <div className="min-w-0 flex-1"><p className="text-[16px] font-extrabold">{d.wallet ? shortAddress(d.wallet.address, 6, 4) : 'Your wallet'}</p><p className="text-[13px] font-semibold text-ink/55">{d.wallet ? 'Your fees can only ever go here.' : 'One free signature. It doesn’t move money or approve spending.'}</p></div>
      {!locked && <button type="button" disabled={act.isPending || !session.wallet} onClick={proveWallet} className={cn('press min-h-12 px-5 text-[14.5px]', d.wallet ? 'btn-ghost' : 'btn')}><FileSignature size={16}/>{d.wallet ? 'Re-sign' : 'Sign to connect'}</button>}
    </div>
    <details className="text-[12.5px] font-semibold text-ink/45"><summary className="cursor-pointer">What am I signing?</summary><p className="mt-1.5 leading-5">A standard Sign-In with Ethereum message tied to objectpad.fun, this draft, Robinhood Chain and a one-time code that expires in 10 minutes. It’s checked on our server, including smart-contract wallets.</p></details>
  </div>;
}

function StepSplit({ d, act, call, locked, setFlash, walletOk }: StepProps & { setFlash: (s: string) => void; walletOk: boolean }) {
  const session = useSession(); const [bps, setBps] = useState<number>(d.split.launcherBps); useEffect(() => setBps(d.split.launcherBps), [d.id, d.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const post = <T,>(p: string, b?: unknown) => call<T>(`/people/drafts/${d.id}${p}`, 'POST', b ?? {});
  const sign = () => act.mutate(async () => { const ch = await post<{ message: string; nonce: string }>('/fee-challenge'); const signature = await session.sign(ch.message); const out = await post<PeopleDraft>('/fee-policy', { nonce: ch.nonce, signature }); setFlash('Signed. Changing it later needs a new signature.'); return out; });
  const signedOk = d.checks.find(c => c.id === 'feePolicy')?.passed ?? false;
  return <div className="grid gap-4">
    <p className="text-[15px] font-semibold leading-6 text-ink/65">This is how the creator fees your coin collects get shared. You sign it once, before launch.</p>
    {d.relationship === 'assisted' && !locked && <div className="sunk rounded-[22px] p-4"><Field label={`Collaborator’s cut · ${(bps / 100).toFixed(0)}%`} hint="You choose 0% to 20%. ObjectPad’s 10% is fixed."><input type="range" min={0} max={d.maxLauncherBps} step={100} value={bps} onChange={e => setBps(Number(e.target.value))} className="mt-2 w-full accent-ink"/></Field>
      {bps !== d.split.launcherBps && <button type="button" disabled={act.isPending} onClick={() => act.mutate(() => call(`/people/drafts/${d.id}`, 'PATCH', { launcherBps: bps }))} className="btn-ghost press mt-3 min-h-11 px-5 text-[14px]">Save split</button>}</div>}
    <div className="raised rounded-[22px] p-5"><SplitBar split={bps !== d.split.launcherBps ? splitFor(d.relationship, bps) : d.split}/></div>
    {signedOk ? <Notice tone="ok">Signed on {new Date(d.feePolicy!.signedAt).toLocaleDateString()} · paid to {shortAddress(d.feePolicy!.subjectWallet, 6, 4)}</Notice>
      : !walletOk ? <Notice>Connect your wallet first (previous step).</Notice>
      : !locked && <button type="button" disabled={act.isPending || bps !== d.split.launcherBps} onClick={sign} className="btn press min-h-[56px] text-[16px]"><FileSignature size={18}/>Sign this split</button>}
    <p className="text-[12.5px] font-semibold leading-5 text-ink/45">Recorded now. Automatic on-chain splitting turns on before any People coin can launch.</p>
  </div>;
}

function StepVerify({ d, act, call, locked }: StepProps) {
  const status = usePeopleStatus(); const liveness = status.data?.features.find(f => f.id === 'proofs');
  const c = (id: string) => d.checks.find(x => x.id === id)?.passed ?? false;
  const consent = (kind: 'verification_processing' | 'public_likeness', granted: boolean) => act.mutate(() => call(`/people/drafts/${d.id}/consents`, 'POST', { kind, granted }));
  return <div className="grid gap-3">
    {([['verification_processing', 'verificationConsent'], ['public_likeness', 'likenessConsent']] as const).map(([kind, cid]) => { const on = c(cid); return <label key={kind} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl p-4 text-[14px] font-bold leading-5', on ? 'bg-up/10' : 'sunk')}><input type="checkbox" checked={on} disabled={act.isPending || (locked && !on)} onChange={e => consent(kind, e.target.checked)} className="mt-0.5 size-6 shrink-0 accent-ink"/>{CONSENT_TEXT[kind]}</label>; })}
    <div className="relative mt-2 overflow-hidden rounded-[24px] bg-ink p-5 text-white">
      <div className="flex items-start justify-between gap-3"><span className="flex size-12 items-center justify-center rounded-2xl bg-white/10"><ScanFace size={22}/></span>{liveness && <StateChip state={d.liveness.providerConfigured ? 'pilot' : 'planned'}/>}</div>
      <p className="mt-4 text-[18px] font-extrabold">Quick live check</p>
      <p className="mt-1 text-[14px] font-semibold leading-5 text-white/65">A 10-second video check by an independent verification company confirms a real, live person, not a photo or deepfake replay. You can always appeal to a human.</p>
      {d.liveness.providerConfigured ? <button type="button" disabled={act.isPending || !c('verificationConsent')} onClick={() => act.mutate(async () => { const r = await call<{ url: string }>(`/people/drafts/${d.id}/liveness`, 'POST', {}); window.location.assign(r.url); })} className="press mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-extrabold text-ink">Start live check</button>
        : <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] font-extrabold"><Lock size={14}/>Opening soon. Everything else you do is saved.</p>}
    </div>
  </div>;
}

function StepReview({ d, act, call, locked, go }: StepProps & { go: (s: StepId) => void }) {
  const all = d.checks.every(c => c.passed);
  const stepFor: Record<string, StepId> = { adult: 'you', verificationConsent: 'verify', likenessConsent: 'verify', subjectAccepted: 'you', account: 'connect', wallet: 'connect', liveness: 'verify', model: 'double', feePolicy: 'split' };
  return <div className="grid gap-4">
    <ul className="divide-y divide-ink/[0.06] rounded-[22px] bg-ink/[0.02] px-4">{d.checks.map(c => <li key={c.id} className="flex items-center gap-2"><div className="flex-1"><CheckLine {...c}/></div>{!c.passed && !locked && <button type="button" onClick={() => go(stepFor[c.id] ?? 'you')} className="text-[12.5px] font-extrabold text-ink underline underline-offset-2">Fix</button>}</li>)}</ul>
    {d.state === 'published' && d.profileId ? <Link to={`/People/p/${d.profileId}`} className="btn press min-h-[56px] text-[16px]">Open my public profile<ArrowRight size={18}/></Link>
      : <button type="button" disabled={act.isPending || locked || !all} onClick={() => act.mutate(() => call(`/people/drafts/${d.id}/publish`, 'POST', {}))} className="btn press min-h-[56px] text-[16px]"><Rocket size={18}/>Approve and go live</button>}
    {!all && <p className="text-center text-[13px] font-bold text-ink/50">Going live unlocks when every item is ticked. The live check opens soon.</p>}
  </div>;
}

/** What the collaborator who prepared an assisted draft sees: basics, split cap and the invite link. */
function CreatorPanel({ d, act, setFlash }: { d: PeopleDraft; act: Act; setFlash: (s: string) => void }) {
  const call = usePeopleCall(); const [inviteUrl, setInviteUrl] = useState<string | null>(null); const [bps, setBps] = useState<number>(d.split.launcherBps);
  const [name, setName] = useState<string>(d.displayName); const [bio, setBio] = useState<string>(d.narrative);
  const post = <T,>(p: string) => call<T>(`/people/drafts/${d.id}${p}`, 'POST', {});
  const editable = d.canEdit && d.state === 'awaiting_subject';
  const card = (title: string, body: ReactNode) => <section className="raised rounded-[28px] p-5 sm:p-6"><p className="text-[18px] font-extrabold">{title}</p><div className="mt-4">{body}</div></section>;
  return <div className="grid gap-4">
    {d.subjectAccepted ? <Notice tone="ok">They accepted and now control this profile. You’ll see it when they publish.</Notice> : card('1. Send them the invite', <>
      <p className="text-[14.5px] font-semibold leading-6 text-ink/60">Send this private link directly to them. It works once and expires in 7 days. When they accept, they take full control and do the photos and checks themselves.</p>
      {d.invitation && <p className="mt-3 text-[13px] font-extrabold text-ink/50">Current link: {d.invitation.state}{d.invitation.state === 'pending' ? ` · expires ${new Date(d.invitation.expiresAt).toLocaleDateString()}` : ''}</p>}
      {inviteUrl && <button type="button" onClick={() => void copyText(inviteUrl).then(ok => ok && setFlash('Invite link copied.'))} className="sunk press mt-3 flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 font-mono text-[12.5px] font-bold"><span className="truncate">{inviteUrl}</span><Copy size={15}/></button>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={act.isPending} onClick={() => act.mutate(async () => { const r = await post<{ url: string }>('/invitation'); setInviteUrl(r.url); void copyText(r.url); setFlash('Invite link created and copied.'); })} className="btn press min-h-12 px-6 text-[15px]"><Link2 size={16}/>{d.invitation?.state === 'pending' ? 'New link' : 'Create invite link'}</button>
        {d.invitation?.state === 'pending' && <button type="button" disabled={act.isPending} onClick={() => act.mutate(async () => { setInviteUrl(null); return post('/invitation-revoke'); })} className="btn-ghost press min-h-12 px-5 text-[14.5px]"><Undo2 size={16}/>Cancel link</button>}
      </div></>)}
    {editable && card('2. Basics they’ll see', <div className="grid gap-4">
      <Field label="Their name"><input value={name} onChange={e => setName(e.target.value.slice(0, 60))} className={cn(inputCls, 'min-h-[52px]')}/></Field>
      <Field label="Short bio (optional)"><textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 600))} rows={3} className={cn(inputCls, 'resize-none')}/></Field>
      <Field label={`Your proposed cut · ${(bps / 100).toFixed(0)}%`} hint="They can change it. Max 20%; ObjectPad’s 10% is fixed."><input type="range" min={0} max={d.maxLauncherBps} step={100} value={bps} onChange={e => setBps(Number(e.target.value))} className="w-full accent-ink"/></Field>
      <SplitBar split={splitFor('assisted', bps)}/>
      <button type="button" disabled={act.isPending || (name === d.displayName && bio === d.narrative && bps === d.split.launcherBps)} onClick={() => act.mutate(() => call(`/people/drafts/${d.id}`, 'PATCH', { displayName: name, narrative: bio, launcherBps: bps }))} className="btn-ghost press min-h-12 w-fit px-6 text-[14.5px]">Save</button>
    </div>)}
  </div>;
}
