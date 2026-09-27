import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, AtSign, Check, Copy, FileSignature, Flag, Link2, ScanFace, Trash2, Undo2, UserPlus, Wallet } from 'lucide-react';
import { ErrorState, Loading } from '@/components/Feedback';
import { Blocker, CheckLine, Field, inputCls, Notice, SignInGate, SplitBar, StateChip } from '@/components/people/PeopleUi';
import { PEOPLE_KEY, peopleError, usePeopleCall, usePeopleStatus, type PeopleDraft } from '@/lib/people';
import { useSession } from '@/lib/session';
import { copyText, shortAddress } from '@/lib/format';
import { CAPTURE_MODES, CONSENT_TEXT, splitFor, type ConsentKind, type Relationship } from '@/shared/people';
import { cn } from '@/lib/utils';

const draftKey = (id: string) => [...PEOPLE_KEY, 'draft', id] as const;
const STATE_LABEL: Record<PeopleDraft['state'], string> = { draft: 'Private draft', awaiting_subject: 'Waiting for the subject', published: 'Published', withdrawn: 'Withdrawn', deleted: 'Deleted' };

/** /People/start: pick the relationship to the subject, or resume a saved draft. */
export default function PeopleStart() {
  useEffect(() => { document.title = 'ObjectPad People · Start your profile'; }, []);
  return <div className="page max-w-4xl py-8 sm:py-12">
    <Link to="/People" className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-bold text-ink/60"><ArrowLeft size={15}/>People</Link>
    <h1 className="display mt-2 text-[clamp(40px,7vw,72px)] leading-[0.9]">Start a profile.</h1>
    <p className="mt-4 max-w-xl text-[15.5px] font-semibold text-ink/65">Drafts are private. Nothing is public or tradable until the person it’s about completes every check and approves it. You can stop at any step and come back.</p>
    <div className="mt-8"><SignInGate body="Drafts, consents and proofs are private to your account. Viewing People never needs sign-in."><StartInner/></SignInGate></div>
  </div>;
}

function StartInner() {
  const call = usePeopleCall(); const qc = useQueryClient(); const navigate = useNavigate();
  const drafts = useQuery({ queryKey: [...PEOPLE_KEY, 'drafts'], queryFn: () => call<{ items: PeopleDraft[] }>('/people/drafts') });
  const [relationship, setRelationship] = useState<Relationship | null>(null); const [name, setName] = useState<string>(''); const [adult, setAdult] = useState<boolean>(false);
  const create = useMutation({ mutationFn: () => call<PeopleDraft>('/people/drafts', 'POST', { relationship, displayName: name.trim() }), onSuccess: d => { void qc.invalidateQueries({ queryKey: PEOPLE_KEY }); navigate(`/People/start/${d.id}`); } });
  const canCreate = relationship !== null && name.trim().length >= 2 && (relationship === 'assisted' || adult);

  return <div className="grid gap-4">
    {drafts.data && drafts.data.items.length > 0 && <section className="raised rounded-[28px] p-5 sm:p-6">
      <p className="stat-label">Resume</p>
      <ul className="mt-3 grid gap-2">{drafts.data.items.map(d => { const done = d.checks.filter(c => c.passed).length; return <li key={d.id}><Link to={`/People/start/${d.id}`} className="press sunk flex items-center gap-3 rounded-2xl p-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-white">{d.relationship === 'self' ? <ScanFace size={17}/> : <UserPlus size={17}/>}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-extrabold">{d.displayName || 'Untitled'}</span><span className="block text-[12.5px] font-bold text-ink/50">{d.relationship === 'self' ? 'Self-launch' : 'Assisted'} · {STATE_LABEL[d.state]} · {done}/{d.checks.length} checks</span></span>
        <ArrowRight size={16} className="text-ink/40"/></Link></li>; })}</ul>
    </section>}

    <section className="raised rounded-[28px] p-5 sm:p-6">
      <p className="stat-label">Who is this profile about?</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {([['self', ScanFace, 'Me', 'I’m an adult and this profile is about me.'], ['assisted', UserPlus, 'Someone I work with', 'I prepare a private draft. They accept an invitation, take control and approve everything themselves.']] as const).map(([id, Icon, t, d]) => <button key={id} onClick={() => setRelationship(id)} aria-pressed={relationship === id} className={cn('press rounded-[22px] p-4 text-left transition-shadow', relationship === id ? 'bg-ink text-white shadow-[0_18px_30px_-16px_rgba(12,13,16,.7)]' : 'sunk')}>
          <Icon size={20}/><p className="mt-3 text-[17px] font-extrabold">{t}</p><p className={cn('mt-1 text-[13px] font-semibold leading-5', relationship === id ? 'text-white/65' : 'text-ink/55')}>{d}</p></button>)}
      </div>
      <p className="mt-3 text-[12.5px] font-semibold leading-5 text-ink/50">Public figures you don’t work with? <Link to="/People/nominate" className="underline underline-offset-2">Nominate them</Link> instead. A checkbox from an uploader is never treated as another person’s consent.</p>
      {relationship && <div className="mt-5 grid gap-4">
        <Field label={relationship === 'self' ? 'Your display name' : 'Their display name'} hint="Shown only to you (and the subject) until publication."><input value={name} onChange={e => setName(e.target.value.slice(0, 60))} className={inputCls} placeholder="Display name" autoComplete="off"/></Field>
        {relationship === 'self' && <label className="flex items-start gap-3 text-[14px] font-bold"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="mt-0.5 size-5 accent-ink"/>I’m 18 or older. I’ll confirm this again as a recorded consent inside the draft.</label>}
        {create.isError && <Notice tone="error">{peopleError(create.error)}</Notice>}
        <button disabled={!canCreate || create.isPending} onClick={() => create.mutate()} className="btn press min-h-12 w-full text-[14.5px] sm:w-auto sm:px-8">{create.isPending ? 'Saving…' : 'Create private draft'}<ArrowRight size={16}/></button>
      </div>}
    </section>
  </div>;
}

function Step({ n, title, done, children, state }: { n: number; title: string; done: boolean; children: ReactNode; state?: ReactNode }) {
  return <section className="raised rounded-[28px] p-5 sm:p-6">
    <div className="flex items-center gap-3"><span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-extrabold', done ? 'bg-up text-white' : 'bg-ink/[0.07] text-ink/60')}>{done ? <Check size={16} strokeWidth={3}/> : n}</span><h2 className="min-w-0 flex-1 text-[19px] font-extrabold leading-tight">{title}</h2>{state}</div>
    <div className="mt-4">{children}</div>
  </section>;
}

/** /People/start/:id: the wizard for one private draft. Every action is re-checked server-side. */
export function PeopleDraftPage() {
  const { id = '' } = useParams();
  return <div className="page max-w-4xl py-8 sm:py-12">
    <Link to="/People/start" className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-bold text-ink/60"><ArrowLeft size={15}/>All drafts</Link>
    <div className="mt-2"><SignInGate><DraftInner id={id}/></SignInGate></div>
  </div>;
}

function DraftInner({ id }: { id: string }) {
  const call = usePeopleCall(); const qc = useQueryClient(); const session = useSession(); const status = usePeopleStatus(); const navigate = useNavigate();
  const query = useQuery({ queryKey: draftKey(id), queryFn: () => call<PeopleDraft>(`/people/drafts/${id}`), retry: false });
  const [error, setError] = useState<string | null>(null); const [flash, setFlash] = useState<string | null>(null);
  const [name, setName] = useState<string>(''); const [narrative, setNarrative] = useState<string>(''); const [bps, setBps] = useState<number>(2000); const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const d = query.data;
  useEffect(() => { if (d) { setName(d.displayName); setNarrative(d.narrative); setBps(d.split.launcherBps); } }, [d?.id, d?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onMutate: () => { setError(null); setFlash(null); },
    onSuccess: result => { if (result && typeof result === 'object' && 'id' in result && 'checks' in result) qc.setQueryData(draftKey(id), result); void qc.invalidateQueries({ queryKey: [...PEOPLE_KEY, 'drafts'] }); },
    onError: e => setError(peopleError(e)),
  });
  if (query.isPending) return <Loading label="Opening draft…"/>;
  if (query.isError || !d) return <ErrorState message={peopleError(query.error)} retry={() => void query.refetch()}/>;

  const isSubject = d.role !== 'creator'; const locked = d.state === 'published' || d.state === 'withdrawn';
  const check = (cid: string) => d.checks.find(c => c.id === cid)?.passed ?? false;
  const capture = status.data?.features.find(f => f.id === 'capture'); const model = status.data?.features.find(f => f.id === 'model_jobs');
  const post = <T,>(path: string, body?: unknown) => call<T>(`/people/drafts/${id}${path}`, 'POST', body ?? {});
  const consent = (kind: ConsentKind, granted: boolean) => act.mutate(() => post('/consents', { kind, granted }));
  const proveWallet = () => act.mutate(async () => {
    if (!session.wallet) throw new Error('Connect a wallet to your ObjectPad sign-in first.');
    const ch = await post<{ message: string; nonce: string }>('/wallet-challenge', { address: session.wallet });
    const signature = await session.sign(ch.message);
    const out = await post<PeopleDraft>('/wallet', { nonce: ch.nonce, signature }); setFlash('Wallet proven. The signature was checked on the server and can’t be reused.'); return out;
  });
  const signFees = () => act.mutate(async () => {
    const ch = await post<{ message: string; nonce: string }>('/fee-challenge');
    const signature = await session.sign(ch.message);
    const out = await post<PeopleDraft>('/fee-policy', { nonce: ch.nonce, signature }); setFlash('Fee split signed. Changing it later needs a new signature.'); return out;
  });
  const n = { basics: 1, consent: 2, account: 3, wallet: 4, capture: 5, verify: 6, fees: 7, review: 8 };

  return <div className="grid gap-4">
    <header>
      <div className="flex flex-wrap items-center gap-2"><span className="chip">{d.relationship === 'self' ? 'Self-launch' : 'Assisted launch'}</span><span className="chip !bg-ink/[0.05] !text-ink/60 !shadow-none">{STATE_LABEL[d.state]}</span><span className="chip !bg-ink/[0.05] !text-ink/60 !shadow-none">You are the {d.role === 'both' ? 'subject' : d.role}</span></div>
      <h1 className="display mt-4 text-[clamp(36px,6vw,60px)] leading-[0.92]">{d.displayName || 'Untitled draft'}</h1>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/[0.07]"><div className="bar-grow h-full rounded-full bg-ink" style={{ width: `${(d.checks.filter(c => c.passed).length / d.checks.length) * 100}%` }}/></div>
      <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink/50">{d.checks.filter(c => c.passed).length} of {d.checks.length} checks · saved automatically</p>
    </header>
    {error && <Notice tone="error">{error}</Notice>}
    {flash && <Notice tone="ok">{flash}</Notice>}

    {d.relationship === 'assisted' && d.role === 'creator' && !d.subjectAccepted && <section className="raised rounded-[28px] p-5 sm:p-6">
      <p className="stat-label">Invite the subject</p>
      <p className="mt-2 text-[14px] font-semibold leading-6 text-ink/65">Send this private link to the person directly. It expires in 7 days and works once. When they accept, they take control of the draft and you can no longer edit it. They can decline.</p>
      {d.invitation && <p className="mt-3 font-mono text-[11.5px] font-bold uppercase tracking-wider text-ink/50">Latest invitation: {d.invitation.state}{d.invitation.state === 'pending' ? ` · expires ${new Date(d.invitation.expiresAt).toLocaleString()}` : ''}</p>}
      {inviteUrl && <button onClick={() => void copyText(inviteUrl).then(ok => ok && setFlash('Invitation link copied.'))} className="pill press mt-3 w-full !justify-between !pr-3 font-mono !text-[12.5px]"><span className="truncate">{inviteUrl}</span><Copy size={15}/></button>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={act.isPending} onClick={() => act.mutate(async () => { const r = await post<{ url: string }>('/invitation'); setInviteUrl(r.url); await query.refetch(); })} className="btn press min-h-11 px-5 text-[14px]"><Link2 size={15}/>{d.invitation?.state === 'pending' ? 'Replace link' : 'Create invitation link'}</button>
        {d.invitation?.state === 'pending' && <button disabled={act.isPending} onClick={() => act.mutate(async () => { setInviteUrl(null); return post('/invitation-revoke'); })} className="btn-ghost press min-h-11 px-5 text-[14px]"><Undo2 size={15}/>Revoke</button>}
      </div>
    </section>}

    <Step n={n.basics} title="Name and narrative" done={Boolean(d.displayName && d.narrative)}>
      <div className="grid gap-4">
        <Field label="Display name"><input value={name} disabled={!d.canEdit || locked} onChange={e => setName(e.target.value.slice(0, 60))} className={inputCls}/></Field>
        <Field label="Narrative" hint="Who you are and what you make. No private details like home location, health or family."><textarea value={narrative} disabled={!d.canEdit || locked} onChange={e => setNarrative(e.target.value.slice(0, 600))} rows={3} className={cn(inputCls, 'resize-none')}/></Field>
        {d.canEdit && !locked && <button disabled={act.isPending || (name === d.displayName && narrative === d.narrative)} onClick={() => act.mutate(() => call(`/people/drafts/${id}`, 'PATCH', { displayName: name, narrative }))} className="btn-ghost press min-h-11 w-fit px-5 text-[14px]">Save</button>}
        {!d.canEdit && <p className="text-[12.5px] font-semibold text-ink/50">{d.subjectAccepted ? 'The subject controls this draft now.' : 'Waiting for the subject to accept.'}</p>}
      </div>
    </Step>

    {!isSubject ? <Notice>The remaining steps (consent, account, wallet, liveness, fee split and approval) can only be completed by the subject after they accept your invitation.</Notice> : <>
      <Step n={n.consent} title="Consents, given separately" done={check('adult') && check('verificationConsent') && check('likenessConsent')}>
        <ul className="grid gap-2.5">{(['adult', 'verification_processing', 'public_likeness'] as ConsentKind[]).map(kind => { const cid = kind === 'adult' ? 'adult' : kind === 'verification_processing' ? 'verificationConsent' : 'likenessConsent'; const on = check(cid); return <li key={kind} className="sunk flex items-start gap-3 rounded-2xl p-3.5">
          <input type="checkbox" aria-label={CONSENT_TEXT[kind]} checked={on} disabled={act.isPending || locked && !on} onChange={e => consent(kind, e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-ink"/>
          <span className="text-[13.5px] font-semibold leading-5 text-ink/75">{CONSENT_TEXT[kind]}</span></li>; })}</ul>
        <p className="mt-3 text-[12px] font-semibold text-ink/45">Unticking withdraws that consent. Withdrawing likeness consent takes a published profile down right away.</p>
      </Step>

      <Step n={n.account} title="Bind your X account" done={check('account')}>
        {d.account ? <p className="flex items-center gap-2 text-[14.5px] font-bold"><AtSign size={16}/>@{d.account.handle}<span className="font-semibold text-ink/50">· bound by X user ID, so renaming your handle keeps it</span></p>
          : <><p className="text-[14px] font-semibold leading-6 text-ink/65">We read your X account from your sign-in and store X’s permanent user ID, not your @handle. Pasted links are never accepted.</p>
            <div className="mt-3 flex flex-wrap gap-2"><button disabled={act.isPending || locked} onClick={() => act.mutate(() => post('/account'))} className="btn press min-h-11 px-5 text-[14px]">Bind my X account</button>{session.linkX && <button onClick={() => session.linkX?.()} className="btn-ghost press min-h-11 px-5 text-[14px]">Link X to my sign-in first</button>}</div></>}
      </Step>

      <Step n={n.wallet} title="Prove your wallet" done={check('wallet')}>
        {d.wallet && <p className="mb-3 flex items-center gap-2 font-mono text-[13px] font-bold"><Wallet size={15}/>{shortAddress(d.wallet.address, 8, 6)}</p>}
        <p className="text-[14px] font-semibold leading-6 text-ink/65">You sign a standard Sign-In with Ethereum message tied to this site, this draft, Robinhood Chain and a single-use code that expires in 10 minutes. It doesn’t move funds or approve spending. Fees can only ever go to a wallet proven this way.</p>
        {!locked && <button disabled={act.isPending || !session.wallet} onClick={proveWallet} className="btn press mt-3 min-h-11 px-5 text-[14px]"><FileSignature size={15}/>{d.wallet ? 'Re-prove with the connected wallet' : `Sign with ${session.wallet ? shortAddress(session.wallet, 6, 4) : 'your wallet'}`}</button>}
        {!session.wallet && <p className="mt-2 text-[12.5px] font-semibold text-ink/50">Connect a wallet to your ObjectPad sign-in to continue.</p>}
      </Step>

      <Step n={n.capture} title="Capture mode" done={check('model')} state={capture && <StateChip state={capture.state}/>}>
        <div className="grid gap-2 sm:grid-cols-2">{CAPTURE_MODES.map(m => <button key={m.id} disabled={locked || act.isPending} onClick={() => act.mutate(() => call(`/people/drafts/${id}`, 'PATCH', { captureMode: m.id }))} aria-pressed={d.captureMode === m.id} className={cn('press rounded-2xl p-3.5 text-left', d.captureMode === m.id ? 'bg-ink text-white' : 'sunk')}><p className="text-[14.5px] font-extrabold">{m.label}</p><p className={cn('mt-1 text-[12.5px] font-semibold leading-5', d.captureMode === m.id ? 'text-white/65' : 'text-ink/55')}>{m.fidelity}</p></button>)}</div>
        <p className="mt-3 text-[12.5px] font-semibold leading-5 text-ink/55">Every 3D likeness is an AI reconstruction and is labeled that way. A photo upload is never treated as a liveness check. The camera is requested only when capture starts.</p>
        {capture?.blocker && <Blocker>{capture.blocker}</Blocker>}
        {model?.blocker && <Blocker>{model.blocker}</Blocker>}
      </Step>

      <Step n={n.verify} title="Liveness check" done={check('liveness')} state={<StateChip state={d.liveness.providerConfigured ? 'pilot' : 'planned'}/>}>
        <p className="text-[14px] font-semibold leading-6 text-ink/65">An independent, commercially supported provider with presentation-attack detection confirms a live person completed the check. The result is one input, not a final verdict: you can always appeal to a human review.</p>
        {d.liveness.providerConfigured ? <button disabled={act.isPending || !check('verificationConsent')} onClick={() => act.mutate(async () => { const r = await post<{ url: string }>('/liveness'); window.location.assign(r.url); })} className="btn press mt-3 min-h-11 px-5 text-[14px]">Start liveness check</button>
          : <Blocker>No provider is contracted yet, so this check can’t run and nothing can be published. Everything else you complete is saved.</Blocker>}
      </Step>

      <Step n={n.fees} title="Sign your fee split" done={check('feePolicy')}>
        {d.relationship === 'assisted' && !locked && <div className="mb-4"><Field label={`Collaborator share · ${(bps / 100).toFixed(0)}%`} hint="You decide, from 0% up to 20%. ObjectPad’s 10% is fixed."><input type="range" min={0} max={d.maxLauncherBps} step={100} value={bps} onChange={e => setBps(Number(e.target.value))} className="w-full accent-ink"/></Field>
          {bps !== d.split.launcherBps && <button disabled={act.isPending} onClick={() => act.mutate(() => call(`/people/drafts/${id}`, 'PATCH', { launcherBps: bps }))} className="btn-ghost press mt-2 min-h-11 px-5 text-[14px]">Save split</button>}</div>}
        <SplitBar split={bps !== d.split.launcherBps ? splitFor(d.relationship, bps) : d.split}/>
        {d.feePolicy && <p className="mt-3 text-[12.5px] font-bold text-ink/55">Signed v{d.feePolicy.version} on {new Date(d.feePolicy.signedAt).toLocaleString()} · to {shortAddress(d.feePolicy.subjectWallet, 6, 4)}{check('feePolicy') ? '' : ' · out of date, sign again'}</p>}
        {!locked && <button disabled={act.isPending || !check('wallet') || bps !== d.split.launcherBps} onClick={signFees} className="btn press mt-3 min-h-11 px-5 text-[14px]"><FileSignature size={15}/>Sign this exact split</button>}
        <Blocker>The signed split is recorded now. Robinhood Chain launches currently pay creator fees to one wallet and no reviewed splitter contract is deployed, so the split isn’t enforced on-chain yet and token launch stays off.</Blocker>
      </Step>

      <Step n={n.review} title="Review and approve" done={d.state === 'published'}>
        <ul className="divide-y divide-ink/[0.06]">{d.checks.map(c => <CheckLine key={c.id} {...c}/>)}</ul>
        {d.state === 'published' && d.profileId ? <Link to={`/People/p/${d.profileId}`} className="btn press mt-4 min-h-12 px-6 text-[14.5px]">Open public profile<ArrowRight size={16}/></Link>
          : <button disabled={act.isPending || locked || !d.checks.every(c => c.passed)} onClick={() => act.mutate(() => post('/publish'))} className="btn press mt-4 min-h-12 px-6 text-[14.5px]">Approve and publish</button>}
        {!d.checks.every(c => c.passed) && <p className="mt-2 text-[12.5px] font-semibold text-ink/50">Publishing unlocks only when every check above has passed.</p>}
      </Step>
    </>}

    <section className="sunk rounded-[28px] p-5 sm:p-6">
      <p className="stat-label">Your controls</p>
      <p className="mt-2 text-[13px] font-semibold leading-5 text-ink/60">Withdraw hides the draft and revokes pending invitations. Delete erases hosted draft data; the audit log keeps only event names and times. Blockchain history and copies others downloaded can’t be erased.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {d.state !== 'withdrawn' && <button disabled={act.isPending} onClick={() => { if (confirm('Withdraw this draft?')) act.mutate(() => post('/withdraw')); }} className="btn-ghost press min-h-11 px-4 text-[13.5px]"><Undo2 size={14}/>Withdraw</button>}
        <button disabled={act.isPending} onClick={() => { if (confirm('Delete this draft and its hosted data? This cannot be undone.')) act.mutate(async () => { await call(`/people/drafts/${id}`, 'DELETE'); void qc.invalidateQueries({ queryKey: PEOPLE_KEY }); navigate('/People/start'); }); }} className="btn-ghost press min-h-11 px-4 text-[13.5px] !text-down"><Trash2 size={14}/>Delete</button>
        <Link to="/People/nominate#report" className="btn-ghost press min-h-11 px-4 text-[13.5px]"><Flag size={14}/>Report or appeal</Link>
      </div>
    </section>
  </div>;
}
