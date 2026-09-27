import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AtSign, BadgeCheck, ChevronDown, Flag, Info, Wallet } from 'lucide-react';
import { ErrorState, Loading } from '@/components/Feedback';
import { HalfHuman } from '@/components/people/HalfHuman';
import { CheckLine, Notice, SignInGate, SplitBar, inputCls } from '@/components/people/PeopleUi';
import { PEOPLE_KEY, peopleError, usePeopleCall, type PublicPerson } from '@/lib/people';
import { api } from '@/lib/api';
import { shortAddress } from '@/lib/format';
import { defaultSplit } from '@/shared/people';
import { cn } from '@/lib/utils';

const TABS = ['About', 'Updates', 'Missions', 'Live', 'Fees', 'Proof'] as const;
type Tab = typeof TABS[number];

/** /People/p/:id: a published profile. Only data the subject approved; verification evidence never reaches this page. */
export default function PersonProfile() {
  const { id = '' } = useParams(); const [tab, setTab] = useState<Tab>('About'); const [drawer, setDrawer] = useState<boolean>(false);
  const q = useQuery({ queryKey: [...PEOPLE_KEY, 'profile', id], queryFn: () => api<PublicPerson>(`/people/profiles/${id}`), retry: false });
  useEffect(() => { if (q.data) document.title = `${q.data.displayName} · ObjectPad People`; }, [q.data]);
  if (q.isPending) return <div className="page py-12"><Loading label="Opening profile…"/></div>;
  if (q.isError || !q.data) return <div className="page max-w-3xl py-12"><ErrorState message="This profile doesn’t exist, or its subject withdrew it."/></div>;
  const p = q.data; const allPassed = p.checks.every(c => c.passed) && !p.attestation?.revoked;
  return <div className="page max-w-4xl py-8 sm:py-12">
    <Link to="/People" className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-bold text-ink/60"><ArrowLeft size={15}/>People</Link>
    <section className="raised mt-2 overflow-hidden rounded-[32px] p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">{allPassed ? <span className="chip !bg-up/10 !text-up !shadow-none"><BadgeCheck size={13}/>Verified by ObjectPad: {p.relationship === 'self' ? 'self-launch' : 'assisted-launch'} checks completed</span> : <span className="chip">Checks incomplete</span>}<span className="chip !bg-ink/[0.05] !text-ink/60 !shadow-none">3D likeness is an AI reconstruction</span></div>
      <h1 className="display mt-4 text-[clamp(40px,7vw,72px)] leading-[0.9]">{p.displayName}</h1>
      <div className="mt-3 flex flex-wrap gap-3 text-[14px] font-bold text-ink/60">{p.handle && <span className="flex items-center gap-1.5"><AtSign size={15}/>{p.handle}</span>}{p.wallet && <span className="flex items-center gap-1.5 font-mono text-[13px]"><Wallet size={14}/>{shortAddress(p.wallet, 6, 4)}</span>}</div>
    </section>
    <nav className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto" role="tablist">{TABS.map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('press min-h-11 shrink-0 rounded-full px-4 text-[14px] font-extrabold', tab === t ? 'bg-ink text-white' : 'sunk')}>{t}</button>)}</nav>
    <section className="raised mt-3 rounded-[28px] p-5 sm:p-6" role="tabpanel">
      {tab === 'About' && (p.narrative ? <p className="text-[15.5px] font-semibold leading-relaxed text-ink/75">{p.narrative}</p> : <p className="text-sm font-bold text-ink/50">No narrative yet.</p>)}
      {(tab === 'Updates' || tab === 'Missions' || tab === 'Live') && <p className="flex items-start gap-2 text-[14px] font-semibold text-ink/55"><Info size={16} className="mt-0.5 shrink-0"/>{tab === 'Updates' ? 'The official timeline is planned. It will show permitted embeds with source links and timestamps.' : tab === 'Missions' ? 'Paid missions are planned. None can go live before its funding is locked in escrow.' : 'Live appearances are planned. v1 will link to the creator’s own stream.'}</p>}
      {tab === 'Fees' && <><SplitBar split={p.split}/><p className="mt-4 text-[13px] font-semibold text-ink/55">The subject signed this split. It isn’t enforced on-chain until a reviewed splitter contract is deployed.</p></>}
      {tab === 'Proof' && <>
        <ul className="divide-y divide-ink/[0.06]">{p.checks.map(c => <CheckLine key={c.id} {...c}/>)}</ul>
        <button onClick={() => setDrawer(v => !v)} aria-expanded={drawer} className="btn-ghost press mt-4 min-h-11 px-4 text-[13.5px]"><ChevronDown size={15} className={cn('transition-transform', drawer && 'rotate-180')}/>Technical details</button>
        {drawer && p.attestation && <div className="sunk mt-3 rounded-2xl p-4"><p className="stat-label">Attestation manifest · SHA-256 of canonical JSON</p><p className="mt-1 break-all font-mono text-[12px] font-bold">{p.attestation.digest}{p.attestation.revoked ? ' · REVOKED' : ''}</p><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11.5px] leading-5 text-ink/70">{JSON.stringify(p.attestation.manifest, null, 2)}</pre><p className="mt-3 text-[12px] font-semibold text-ink/50">Contains a random subject reference, not your account. No face images, liveness media, embeddings or biometric hashes.</p></div>}
      </>}
    </section>
    <Link to="/People/nominate#report" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-ink/55"><Flag size={14}/>Report this profile</Link>
  </div>;
}

/**
 * /People/demo: the original Milo illustration, isolated. Fictional person, fictional figures, not tradable.
 * Nothing on this page is read from or written to production data, totals, feeds, leaderboards or previews.
 */
export function PeopleDemo() {
  useEffect(() => { document.title = 'ObjectPad People · Illustrative demo (fictional)'; }, []);
  const poster = <div className="flex h-full items-center justify-center"><img src="/people/subject-avatar.jpg" alt="" className="size-48 rounded-full object-cover opacity-90"/></div>;
  return <div className="page max-w-5xl py-8 sm:py-12">
    <Link to="/People" className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-bold text-ink/60"><ArrowLeft size={15}/>People</Link>
    <div role="note" className="mt-2 rounded-[22px] border-2 border-dashed border-[#E0B000] bg-[#F5C400]/10 p-4 text-[14px] font-bold leading-6">Illustrative demo. “Milo Reyes” is a fictional person. Every number, post and check on this page is made up to show the layout. It is not tradable, not a real profile, and never counted anywhere on ObjectPad.</div>
    <section className="mt-4 grid items-center gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="relative aspect-square overflow-hidden rounded-[32px]"><div aria-hidden className="scan-stage absolute inset-0"/><div aria-hidden className="scan-grid absolute inset-0"/><HalfHuman src="/models/people/subject-real.glb" fallback={poster}/><span className="chip absolute left-4 top-4">Demo · AI reconstruction</span></div>
      <div>
        <span className="chip !bg-ink/[0.05] !text-ink/60 !shadow-none">Fictional · not tradable</span>
        <h1 className="display mt-4 text-[clamp(40px,6vw,64px)] leading-[0.9]">Milo Reyes</h1>
        <p className="mt-2 text-[14px] font-bold text-ink/55">Example role: onchain trader and streamer</p>
        <p className="mt-4 text-[15px] font-semibold leading-relaxed text-ink/70">This is how a published profile could look: a 3D likeness the person approved, a narrative in their words, and a proof drawer that lists exactly which checks passed and when.</p>
        <div className="mt-5 rounded-[24px] bg-white/60 p-4"><p className="stat-label">Example fee split (assisted launch)</p><div className="mt-3"><SplitBar split={defaultSplit('assisted')} example={false}/></div></div>
      </div>
    </section>
    <section className="raised mt-4 rounded-[28px] p-5 sm:p-6">
      <p className="stat-label">Example proof drawer (fictional)</p>
      <ul className="mt-2 divide-y divide-ink/[0.06]">{[['Adult eligibility confirmed', true], ['X account bound (immutable user ID)', true], ['Wallet control proven (signed, single-use)', true], ['Liveness check passed (provider)', false], ['3D likeness approved by subject', true], ['Fee split signed by subject', true]].map(([l, ok]) => <CheckLine key={l as string} label={l as string} passed={ok as boolean}/>)}</ul>
      <p className="mt-3 text-[12.5px] font-semibold text-ink/50">A liveness check shows a live person completed it once. It doesn’t prove ongoing health or rule out every deepfake. Duplicate checks run per ObjectPad account; they aren’t worldwide one-human proof.</p>
    </section>
  </div>;
}

interface Overview { drafts: { state: string; relationship: string; n: number }[]; applications: { id: string; state: string; createdAt: number; name: string; email: string; location: string; roles: string[]; handles: Record<string, string>; portfolio: string[]; note: string }[]; nominations: { platform: string; handle: string; displayName: string; kind: string; n: number }[]; cases: { id: string; draftId: string | null; kind: string; reason: string; createdAt: number }[]; }

/** /People/admin: operator-only queue. Authorization is enforced server-side against the operator allowlist. */
export function PeopleAdmin() {
  return <div className="page max-w-5xl py-10"><p className="lab">Restricted</p><h1 className="display mt-3 text-[40px]">People review queue</h1><div className="mt-6"><SignInGate><AdminInner/></SignInGate></div></div>;
}
function AdminInner() {
  const call = usePeopleCall(); const qc = useQueryClient(); const [notes, setNotes] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: [...PEOPLE_KEY, 'admin'], queryFn: () => call<Overview>('/people/admin'), retry: false });
  const decide = useMutation({ mutationFn: (v: { id: string; action: string }) => call('/people/admin/cases', 'POST', { id: v.id, action: v.action, resolution: notes[v.id] ?? '' }), onSuccess: () => void qc.invalidateQueries({ queryKey: [...PEOPLE_KEY, 'admin'] }) });
  if (q.isPending) return <Loading/>; if (q.isError || !q.data) return <ErrorState message="This account is not on the operator allowlist." retry={() => void q.refetch()}/>;
  const d = q.data;
  return <div className="grid gap-4">
    <section className="raised rounded-[26px] p-5"><p className="stat-label">Drafts</p><div className="mt-2 flex flex-wrap gap-2">{d.drafts.length ? d.drafts.map(r => <span key={`${r.state}${r.relationship}`} className="chip">{r.relationship} · {r.state}: {r.n}</span>) : <span className="text-sm font-bold text-ink/50">None yet.</span>}</div></section>
    <section className="raised rounded-[26px] p-5"><p className="stat-label">Open cases ({d.cases.length})</p>
      {decide.isError && <div className="mt-2"><Notice tone="error">{peopleError(decide.error)}</Notice></div>}
      <ul className="mt-3 grid gap-3">{d.cases.map(c => <li key={c.id} className="sunk rounded-2xl p-3.5"><p className="text-[13px] font-extrabold uppercase">{c.kind}</p><p className="mt-1 text-[13.5px] font-semibold text-ink/70">{c.reason}</p><input value={notes[c.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value.slice(0, 800) }))} placeholder="Resolution note (10+ characters)" className={cn(inputCls, 'mt-2 !py-2 text-[13.5px]')}/><div className="mt-2 flex gap-2">{['dismiss', 'uphold', 'unpublish'].map(a => <button key={a} disabled={decide.isPending || (notes[c.id] ?? '').length < 10} onClick={() => decide.mutate({ id: c.id, action: a })} className="btn-ghost press min-h-10 px-4 text-[13px] capitalize">{a}</button>)}</div></li>)}</ul></section>
    <section className="raised rounded-[26px] p-5"><p className="stat-label">Applications ({d.applications.length})</p><ul className="mt-3 grid gap-2">{d.applications.map(a => <li key={a.id} className="sunk rounded-2xl p-3.5 text-[13.5px]"><p className="font-extrabold">{a.name} · {a.email}</p><p className="font-semibold text-ink/60">{a.location} · {a.roles.join(', ')} · handles unverified: {Object.entries(a.handles).map(([k, v]) => `${k}:@${v}`).join(' ') || 'none'}</p>{a.portfolio.length > 0 && <p className="break-all font-mono text-[12px] text-ink/55">{a.portfolio.join(' ')}</p>}{a.note && <p className="mt-1 text-ink/65">{a.note}</p>}</li>)}</ul></section>
    <section className="raised rounded-[26px] p-5"><p className="stat-label">Nominations</p><ul className="mt-3 grid gap-1.5">{d.nominations.map(n => <li key={`${n.platform}${n.handle}`} className="text-[13.5px] font-bold">{n.platform} @{n.handle} · {n.displayName} · {n.kind} · {n.n}×</li>)}</ul></section>
  </div>;
}
