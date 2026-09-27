import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, Check, Flag, Megaphone, UserPlus, X as XIcon } from 'lucide-react';
import { ErrorState, Loading } from '@/components/Feedback';
import { Field, inputCls, Notice, SignInGate, SplitBar } from '@/components/people/PeopleUi';
import { PEOPLE_KEY, peopleError, usePeopleCall, type InvitePreview, type PeopleDraft } from '@/lib/people';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { splitFor } from '@/shared/people';
import { cn } from '@/lib/utils';

function Shell({ back = '/People', eyebrow, title, intro, children }: { back?: string; eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return <div className="page max-w-3xl py-8 sm:py-12">
    <Link to={back} className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-bold text-ink/60"><ArrowLeft size={15}/>People</Link>
    <p className="lab mt-2">{eyebrow}</p>
    <h1 className="display mt-3 text-[clamp(38px,6.5vw,64px)] leading-[0.92]">{title}</h1>
    <p className="mt-4 max-w-xl text-[15.5px] font-semibold leading-relaxed text-ink/65">{intro}</p>
    <div className="mt-8 grid gap-4">{children}</div>
  </div>;
}

const PLATFORMS = [['x', 'X'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['twitch', 'Twitch'], ['other', 'Other']] as const;

/** /People/nominate: private, unclaimed nominations of public accounts, plus impersonation reports and appeals. */
export function Nominate() {
  useEffect(() => { document.title = 'ObjectPad People · Nominate a creator'; }, []);
  return <Shell eyebrow="Nominate" title="Nominate a creator." intro="Suggest a public creator or public figure you’d like to see on ObjectPad People. Nominations stay private, are marked unclaimed and are never tradable. We don’t generate a likeness or publish anything; the person can only appear if they come to us and complete every check themselves.">
    <SignInGate body="Nominations are tied to your account so they can’t be spammed."><NominateForm/></SignInGate>
    <div id="report" className="scroll-mt-28"><SignInGate title="Report or appeal" body="Sign in to report impersonation or appeal a decision."><ReportForm/></SignInGate></div>
  </Shell>;
}

function NominateForm() {
  const call = usePeopleCall();
  const [platform, setPlatform] = useState<string>('x'); const [handle, setHandle] = useState<string>(''); const [displayName, setDisplayName] = useState<string>(''); const [url, setUrl] = useState<string>(''); const [kind, setKind] = useState<'creator' | 'public_figure'>('creator'); const [note, setNote] = useState<string>(''); const [isPublic, setIsPublic] = useState<boolean>(false);
  const mine = useQuery({ queryKey: [...PEOPLE_KEY, 'nominations'], queryFn: () => call<{ items: { id: string; platform: string; handle: string; displayName: string; state: string; createdAt: number }[] }>('/people/nominations') });
  const submit = useMutation({ mutationFn: () => call<{ id: string }>('/people/nominations', 'POST', { platform, handle: handle.trim(), displayName: displayName.trim(), url: url.trim(), kind, note: note.trim(), publicAccount: isPublic }), onSuccess: () => { setHandle(''); setDisplayName(''); setUrl(''); setNote(''); setIsPublic(false); void mine.refetch(); } });
  return <section className="raised rounded-[28px] p-5 sm:p-6">
    <div className="grid gap-4">
      <Field label="Platform"><div className="flex flex-wrap gap-1.5">{PLATFORMS.map(([id, label]) => <button key={id} type="button" onClick={() => setPlatform(id)} aria-pressed={platform === id} className={cn('press min-h-10 rounded-full px-4 text-[13.5px] font-extrabold', platform === id ? 'bg-ink text-white' : 'sunk')}>{label}</button>)}</div></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Handle"><input value={handle} onChange={e => setHandle(e.target.value.slice(0, 31))} placeholder="@handle" className={inputCls} autoComplete="off"/></Field>
        <Field label="Name"><input value={displayName} onChange={e => setDisplayName(e.target.value.slice(0, 60))} placeholder="Display name" className={inputCls}/></Field>
      </div>
      <Field label="Profile link (optional)" hint="Public https link to their account."><input value={url} onChange={e => setUrl(e.target.value.slice(0, 300))} placeholder="https://" className={inputCls} inputMode="url"/></Field>
      <Field label="Type"><div className="flex gap-1.5">{([['creator', 'Creator'], ['public_figure', 'Public figure']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setKind(id)} aria-pressed={kind === id} className={cn('press min-h-10 rounded-full px-4 text-[13.5px] font-extrabold', kind === id ? 'bg-ink text-white' : 'sunk')}>{label}</button>)}</div></Field>
      <Field label="Why them? (optional)"><textarea value={note} onChange={e => setNote(e.target.value.slice(0, 400))} rows={2} className={cn(inputCls, 'resize-none')}/></Field>
      <label className="flex items-start gap-3 text-[13.5px] font-bold leading-5"><input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-ink"/>This is a public account. I’m not uploading photos of them or claiming to act for them. Private individuals need a direct invitation from someone they work with.</label>
      {submit.isError && <Notice tone="error">{peopleError(submit.error)}</Notice>}
      {submit.isSuccess && <Notice tone="ok">Saved as an unclaimed, private nomination.</Notice>}
      <button disabled={submit.isPending || handle.trim().length < 1 || displayName.trim().length < 2 || !isPublic} onClick={() => submit.mutate()} className="btn press min-h-12 w-full text-[14.5px] sm:w-auto sm:px-8"><Megaphone size={16}/>{submit.isPending ? 'Saving…' : 'Nominate'}</button>
    </div>
    {mine.data && mine.data.items.length > 0 && <div className="mt-6 border-t border-ink/[0.07] pt-4"><p className="stat-label">Your nominations</p><ul className="mt-2 grid gap-1.5">{mine.data.items.map(n => <li key={n.id} className="flex items-center gap-2 text-[13.5px] font-bold"><span className="rounded-full bg-ink/[0.06] px-2 py-0.5 font-mono text-[10.5px] uppercase text-ink/60">{n.platform}</span>@{n.handle}<span className="ml-auto font-mono text-[10.5px] uppercase text-ink/45">{n.state}</span></li>)}</ul></div>}
  </section>;
}

function ReportForm() {
  const call = usePeopleCall(); const [kind, setKind] = useState<string>('impersonation'); const [reason, setReason] = useState<string>(''); const [profileId, setProfileId] = useState<string>('');
  const submit = useMutation({ mutationFn: () => call('/people/reports', 'POST', { kind, reason: reason.trim(), profileId: profileId.trim() || undefined }), onSuccess: () => setReason('') });
  return <section className="raised rounded-[28px] p-5 sm:p-6">
    <p className="flex items-center gap-2 text-[19px] font-extrabold"><Flag size={18}/>Report or appeal</p>
    <p className="mt-1.5 text-[13.5px] font-semibold text-ink/60">A person reviews every report. Disputed profiles can be unpublished; disputed fees are paused, never handed to the reporter.</p>
    <div className="mt-4 grid gap-4">
      <Field label="Type"><select value={kind} onChange={e => setKind(e.target.value)} className={inputCls}><option value="impersonation">Someone is impersonating me</option><option value="unauthorized_likeness">My likeness was used without permission</option><option value="harassment">Harassment or unsafe content</option><option value="appeal">Appeal a decision</option><option value="other">Other</option></select></Field>
      <Field label="Profile ID (optional)"><input value={profileId} onChange={e => setProfileId(e.target.value.toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 20))} className={inputCls} placeholder="From the profile URL"/></Field>
      <Field label="What happened"><textarea value={reason} onChange={e => setReason(e.target.value.slice(0, 1500))} rows={3} className={cn(inputCls, 'resize-none')}/></Field>
      {submit.isError && <Notice tone="error">{peopleError(submit.error)}</Notice>}
      {submit.isSuccess && <Notice tone="ok">Received. A reviewer will look at it.</Notice>}
      <button disabled={submit.isPending || reason.trim().length < 10} onClick={() => submit.mutate()} className="btn-ghost press min-h-12 w-fit px-6 text-[14px]">Send report</button>
    </div>
  </section>;
}

const ROLES = [['creator', 'Creator'], ['streamer', 'Streamer'], ['ugc', 'UGC'], ['kol', 'KOL'], ['3d_artist', '3D artist'], ['community', 'Community'], ['engineering', 'Engineering']] as const;

/** /People/apply: private creator application intake. Sign-in optional. No token purchase or private documents required. */
export function Apply() {
  useEffect(() => { document.title = 'ObjectPad People · Apply as a creator'; }, []);
  const session = useSession();
  const [name, setName] = useState<string>(''); const [email, setEmail] = useState<string>(''); const [location, setLocation] = useState<string>('remote'); const [roles, setRoles] = useState<string[]>([]);
  const [handles, setHandles] = useState<Record<string, string>>({ x: '', tiktok: '', instagram: '', youtube: '' }); const [portfolio, setPortfolio] = useState<string>(''); const [note, setNote] = useState<string>(''); const [consent, setConsent] = useState<boolean>(false);
  const submit = useMutation({ mutationFn: async () => api<{ id: string }>('/people/applications', { method: 'POST', token: session.authenticated ? await session.token() : null, body: { name: name.trim(), email: email.trim(), location, roles, handles, portfolio: portfolio.split(/\s+/).filter(Boolean).slice(0, 3), note: note.trim(), contactConsent: consent } }) });
  if (submit.isSuccess) return <Shell eyebrow="Apply" title="Application received." intro="Thanks. Applications stay private to ObjectPad reviewers. We contact selected creators when an actual role with pay terms and a deadline is published."><Link to="/People" className="btn press min-h-12 w-fit px-6 text-[14.5px]">Back to People</Link></Shell>;
  return <Shell eyebrow="Apply" title="Apply as a creator." intro="Remote or San Francisco. Selected creators can apply for paid roles and paid pilots as they’re published, each with its own pay terms and deadline. No role or payment is promised by applying, and you never need to buy a token.">
    <section className="raised rounded-[28px] p-5 sm:p-6"><div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name or display name"><input value={name} onChange={e => setName(e.target.value.slice(0, 80))} className={inputCls} autoComplete="name"/></Field>
        <Field label="Email"><input value={email} onChange={e => setEmail(e.target.value.slice(0, 254))} className={inputCls} type="email" autoComplete="email" inputMode="email"/></Field>
      </div>
      <Field label="Location"><div className="flex flex-wrap gap-1.5">{([['remote', 'Remote'], ['san_francisco', 'San Francisco'], ['other', 'Elsewhere']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setLocation(id)} aria-pressed={location === id} className={cn('press min-h-10 rounded-full px-4 text-[13.5px] font-extrabold', location === id ? 'bg-ink text-white' : 'sunk')}>{label}</button>)}</div></Field>
      <Field label="Interested in"><div className="flex flex-wrap gap-1.5">{ROLES.map(([id, label]) => { const on = roles.includes(id); return <button key={id} type="button" onClick={() => setRoles(r => on ? r.filter(x => x !== id) : [...r, id])} aria-pressed={on} className={cn('press flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-extrabold', on ? 'bg-ink text-white' : 'sunk')}>{on && <Check size={13} strokeWidth={3}/>}{label}</button>; })}</div></Field>
      <Field label="Social handles (optional)" hint="Only shown publicly after you verify ownership. We never publish follower counts we haven’t verified."><div className="grid gap-2 sm:grid-cols-2">{(['x', 'tiktok', 'instagram', 'youtube'] as const).map(k => <input key={k} value={handles[k]} onChange={e => setHandles(h => ({ ...h, [k]: e.target.value.slice(0, 31) }))} placeholder={`${k === 'x' ? 'X' : k[0].toUpperCase() + k.slice(1)} @handle`} className={inputCls} autoComplete="off"/>)}</div></Field>
      <Field label="Portfolio links (up to 3, optional)" hint="Separate with spaces. Public https links only."><input value={portfolio} onChange={e => setPortfolio(e.target.value.slice(0, 700))} className={inputCls} inputMode="url" placeholder="https://"/></Field>
      <Field label="Anything else (optional)"><textarea value={note} onChange={e => setNote(e.target.value.slice(0, 600))} rows={3} className={cn(inputCls, 'resize-none')}/></Field>
      <label className="flex items-start gap-3 text-[13.5px] font-bold leading-5"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-ink"/>ObjectPad may store this application privately and contact me about it.</label>
      {submit.isError && <Notice tone="error">{peopleError(submit.error)}</Notice>}
      <button disabled={submit.isPending || name.trim().length < 2 || !email.includes('@') || !roles.length || !consent} onClick={() => submit.mutate()} className="btn press min-h-12 w-full text-[14.5px] sm:w-auto sm:px-8"><Briefcase size={16}/>{submit.isPending ? 'Sending…' : 'Send application'}</button>
    </div></section>
  </Shell>;
}

/** /People/invite/:token: a subject reviews an assisted-launch invitation's scope, then accepts or declines. */
export function Invite() {
  const { token = '' } = useParams(); const call = usePeopleCall(); const session = useSession(); const navigate = useNavigate(); const qc = useQueryClient();
  useEffect(() => { document.title = 'ObjectPad People · Invitation'; }, []);
  const preview = useQuery({ queryKey: [...PEOPLE_KEY, 'invite', token], queryFn: () => api<InvitePreview>(`/people/invitations/${token}`), retry: false });
  const accept = useMutation({ mutationFn: () => call<PeopleDraft>(`/people/invitations/${token}/accept`, 'POST', {}), onSuccess: d => { void qc.invalidateQueries({ queryKey: PEOPLE_KEY }); navigate(`/People/start/${d.id}`); } });
  const decline = useMutation({ mutationFn: () => call(`/people/invitations/${token}/decline`, 'POST', {}), onSuccess: () => void preview.refetch() });
  const p = preview.data;
  return <Shell eyebrow="Invitation" title={p?.state === 'pending' ? `A profile draft for ${p.displayName}.` : 'Invitation'} intro="Someone you work with prepared a private ObjectPad People draft about you. Nothing about it is public or tradable. Only you can accept it, and only you can finish it.">
    {preview.isPending ? <Loading label="Opening invitation…"/> : preview.isError || !p ? <ErrorState message={peopleError(preview.error)}/> : p.state !== 'pending'
      ? <Notice>{p.state === 'accepted' ? 'This invitation was already accepted.' : p.state === 'declined' ? 'This invitation was declined.' : p.state === 'revoked' ? 'The creator revoked this invitation.' : 'This invitation expired. Ask for a new one.'}</Notice>
      : <>
        <section className="raised rounded-[28px] p-5 sm:p-6">
          <p className="stat-label">Invited by</p><p className="mt-1 text-[19px] font-extrabold">{p.invitedBy}</p>
          <p className="stat-label mt-5">What accepting does</p>
          <ul className="mt-2 grid gap-2">{p.scope.map(s => <li key={s} className="flex items-start gap-2 text-[14px] font-bold"><Check size={16} className="mt-0.5 shrink-0 text-up" strokeWidth={3}/>{s}</li>)}</ul>
          <p className="stat-label mt-5">Proposed fee split (you can change it before signing)</p>
          <div className="mt-3"><SplitBar split={splitFor('assisted', p.launcherBps)}/></div>
          <p className="mt-4 font-mono text-[11px] font-bold uppercase tracking-wider text-ink/45">Expires {new Date(p.expiresAt).toLocaleString()}</p>
        </section>
        <SignInGate title="Sign in as yourself to respond" body="Use your own account. The person who sent this link can’t accept it for you.">
          {(accept.isError || decline.isError) && <Notice tone="error">{peopleError(accept.error ?? decline.error)}</Notice>}
          <div className="flex flex-wrap gap-2.5">
            <button disabled={accept.isPending || !session.authenticated} onClick={() => accept.mutate()} className="btn press min-h-12 px-6 text-[14.5px]"><UserPlus size={16}/>{accept.isPending ? 'Accepting…' : 'Accept and take control'}</button>
            <button disabled={decline.isPending} onClick={() => decline.mutate()} className="btn-ghost press min-h-12 px-6 text-[14px]"><XIcon size={15}/>Decline</button>
          </div>
        </SignInGate>
      </>}
  </Shell>;
}
