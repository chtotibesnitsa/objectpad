import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, Download, Eye, FileText, Pencil, Plus, Trash2, TriangleAlert, X as XIcon } from 'lucide-react';
import { ErrorState, Loading, OperatorNotice } from '@/components/Feedback';
import { Field, inputCls, Notice } from '@/components/people/PeopleUi';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import {
  downloadPrivate, ENGAGEMENT_LABEL, HIRING_KEY, hiringError, isPlaceholder, REMOTE_LABEL, roleUnfinished, STATE_LABEL, TEAM_LABEL,
  type ApplicationState, type Engagement, type HiringAdminData, type HiringApplication, type HiringFaq, type HiringRole, type HiringTeam, type RemotePolicy, type RoleStatus,
} from '@/lib/hiring';
import { cn } from '@/lib/utils';

type Tab = 'launch' | 'roles' | 'applications' | 'faq';
const ADMIN_KEY = [...HIRING_KEY, 'admin'] as const;

/** Operator-only hiring workspace. Every action is authorized server-side against the operator allowlist and audited. */
export default function HiringAdmin() {
  const session = useSession();
  useEffect(() => { document.title = 'ObjectPad · Hiring admin'; const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex,nofollow'; document.head.appendChild(m); return () => m.remove(); }, []);
  const query = useQuery({ queryKey: ADMIN_KEY, enabled: session.authenticated, retry: false, queryFn: async () => api<HiringAdminData>('/hiring/admin', { token: await session.token() }) });
  const [tab, setTab] = useState<Tab>('launch');
  return <div className="page py-10 sm:py-12">
    <p className="lab">Restricted workspace</p>
    <h1 className="display mt-3 text-[clamp(38px,6vw,60px)] leading-[0.92]">Hiring admin</h1>
    <p className="mt-4 max-w-2xl text-[14.5px] font-semibold leading-relaxed text-ink/60">Operator-only. Applicant data never leaves this view except through the audited CSV export. The public page stays hidden until every readiness check passes.</p>
    {!session.configured ? <div className="mt-8"><OperatorNotice/></div>
      : !session.authenticated ? <button onClick={() => session.login()} className="btn press mt-8 min-h-12 px-7">Sign in as operator</button>
      : query.isPending ? <Loading label="Loading hiring data…"/>
      : query.isError ? <div className="mt-8"><ErrorState message={hiringError(query.error)} retry={() => void query.refetch()}/></div>
      : <>
        <div className="mt-8 flex flex-wrap gap-1.5" role="tablist">{([['launch', 'Go-live'], ['roles', `Roles · ${query.data.roles.length}`], ['applications', `Applications · ${query.data.applications.length}`], ['faq', 'FAQ & privacy']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('press min-h-11 rounded-full px-5 text-[14px] font-extrabold', tab === id ? 'bg-ink text-white' : 'sunk')}>{label}</button>)}
          <Link to="/hiring" className="btn-ghost press ml-auto inline-flex min-h-11 items-center gap-2 px-5 text-[14px]"><Eye size={15}/>Preview page</Link></div>
        <div className="mt-6">
          {tab === 'launch' && <GoLive data={query.data}/>}
          {tab === 'roles' && <Roles data={query.data}/>}
          {tab === 'applications' && <Applications items={query.data.applications}/>}
          {tab === 'faq' && <FaqEditor data={query.data}/>}
        </div>
      </>}
  </div>;
}

/** Shared authenticated mutation that replaces the cached admin payload with the server's answer. */
function useAdminMutation<V>(fn: (v: V, token: string | null) => Promise<HiringAdminData>) {
  const session = useSession(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (v: V) => fn(v, await session.token()), onSuccess: data => { qc.setQueryData(ADMIN_KEY, data); void qc.invalidateQueries({ queryKey: [...HIRING_KEY, 'public'] }); void qc.invalidateQueries({ queryKey: [...HIRING_KEY, 'flag'] }); } });
}

function GoLive({ data }: { data: HiringAdminData }) {
  const flag = useAdminMutation<boolean>((enabled, token) => api('/hiring/admin/flag', { token, method: 'POST', body: { enabled } }));
  const ready = data.readiness.every(c => c.passed); const passed = data.readiness.filter(c => c.passed).length;
  return <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
    <section className="raised rounded-[28px] p-6">
      <div className="flex items-center justify-between gap-3"><h2 className="text-[20px] font-extrabold">Readiness</h2><span className="font-mono text-[12px] font-extrabold text-ink/55">{passed}/{data.readiness.length}</span></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.07]"><div className="bar-grow h-full rounded-full bg-up" style={{ width: `${(passed / data.readiness.length) * 100}%` }}/></div>
      <ul className="mt-5 grid gap-3">{data.readiness.map(c => <li key={c.id} className="flex items-start gap-3"><span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', c.passed ? 'bg-up text-white' : 'bg-[#FFE27A] text-[#6B5200]')}>{c.passed ? <Check size={14}/> : <TriangleAlert size={13}/>}</span><span><span className="block text-[14.5px] font-extrabold">{c.label}</span><span className="block text-[12.5px] font-semibold text-ink/55">{c.detail}</span></span></li>)}</ul>
    </section>
    <section className="raised rounded-[28px] p-6">
      <p className="stat-label">HIRING_PAGE_ENABLED</p>
      <p className="mt-2 flex items-center gap-2 text-[28px] font-extrabold tracking-[-0.03em]"><span className={cn('size-3 rounded-full', data.enabled ? 'bg-up pulse-dot' : 'bg-ink/25')}/>{data.enabled ? 'Public' : 'Hidden'}</p>
      <p className="mt-2 text-[13.5px] font-semibold leading-relaxed text-ink/60">{data.enabled ? 'The page, its navigation entry and search indexing are live. Applications are being accepted.' : 'Visitors get a 404, the page is left out of navigation and search, and applications are refused.'}</p>
      {data.forcedOff && <Notice tone="error">The server environment sets HIRING_PAGE_ENABLED=false, which overrides this switch.</Notice>}
      {flag.isError && <div className="mt-3"><Notice tone="error">{hiringError(flag.error)}</Notice></div>}
      <button disabled={flag.isPending || (!data.flag && !ready)} onClick={() => flag.mutate(!data.flag)} className={cn('press mt-5 min-h-12 w-full rounded-full text-[14.5px] font-extrabold disabled:opacity-40', data.flag ? 'btn-ghost' : 'btn')}>{flag.isPending ? 'Saving…' : data.flag ? 'Hide page' : ready ? 'Make page public' : 'Finish the checklist first'}</button>
    </section>
  </div>;
}

const EMPTY_ROLE = { slug: '', title: '', team: 'engineering' as HiringTeam, location: '', remotePolicy: 'remote' as RemotePolicy, engagementType: 'full_time' as Engagement, summary: '', responsibilities: '', requiredSkills: '', preferredSkills: '' };
type RoleDraft = typeof EMPTY_ROLE;
const toDraft = (r: HiringRole): RoleDraft => ({ slug: r.slug, title: r.title, team: r.team, location: r.location, remotePolicy: r.remotePolicy, engagementType: r.engagementType, summary: r.summary, responsibilities: r.responsibilities.join('\n'), requiredSkills: r.requiredSkills.join('\n'), preferredSkills: r.preferredSkills.join('\n') });
const lines = (s: string): string[] => s.split('\n').map(v => v.trim()).filter(Boolean);
const STATUS_CLS: Record<RoleStatus, string> = { draft: 'bg-ink/[0.06] text-ink/60', open: 'bg-up/10 text-up', paused: 'bg-[#F5C400]/20 text-[#7A5E00]', closed: 'bg-down/10 text-down' };

function Roles({ data }: { data: HiringAdminData }) {
  const session = useSession();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const status = useAdminMutation<{ id: string; status: RoleStatus }>((v, token) => api(`/hiring/admin/roles/${v.id}/status`, { token, method: 'POST', body: { status: v.status } }));
  const remove = useAdminMutation<string>((id, token) => api(`/hiring/admin/roles/${id}`, { token, method: 'DELETE' }));
  const reorder = useAdminMutation<string[]>((ids, token) => api('/hiring/admin/reorder', { token, method: 'POST', body: { ids } }));
  const move = (i: number, d: number) => { const ids = data.roles.map(r => r.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder.mutate(ids); };
  const error = status.error ?? remove.error ?? reorder.error;
  void session;
  return <div className="grid gap-3">
    {error && <Notice tone="error">{hiringError(error)}</Notice>}
    {data.roles.map((r, i) => editing === r.id ? <RoleEditor key={r.id} role={r} onDone={() => setEditing(null)}/> : <article key={r.id} className="raised rounded-[24px] p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1"><button aria-label="Move up" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} className="sunk press flex size-8 items-center justify-center rounded-lg disabled:opacity-30"><ArrowUp size={14}/></button><button aria-label="Move down" disabled={i === data.roles.length - 1 || reorder.isPending} onClick={() => move(i, 1)} className="sunk press flex size-8 items-center justify-center rounded-lg disabled:opacity-30"><ArrowDown size={14}/></button></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-[18px] font-extrabold">{r.title}</h3><span className={cn('rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-extrabold uppercase', STATUS_CLS[r.status])}>{r.status}</span>{roleUnfinished(r) && <span className="inline-flex items-center gap-1 rounded-full bg-[#FFE27A] px-2.5 py-0.5 font-mono text-[10.5px] font-extrabold uppercase text-[#6B5200]"><TriangleAlert size={11}/>Unfinished</span>}</div>
          <p className="mt-1 font-mono text-[12px] font-semibold text-ink/50">/{r.slug} · {TEAM_LABEL[r.team]} · {r.location} · {REMOTE_LABEL[r.remotePolicy]} · {ENGAGEMENT_LABEL[r.engagementType]}</p>
          <p className="mt-2 line-clamp-2 text-[13.5px] font-semibold text-ink/60">{r.summary}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setEditing(r.id)} className="btn-ghost press inline-flex min-h-10 items-center gap-1.5 px-4 text-[13px]"><Pencil size={13}/>Edit</button>
          {r.status !== 'open' && <button disabled={status.isPending || roleUnfinished(r)} title={roleUnfinished(r) ? 'Replace every [TBD] and “to be confirmed” field first' : undefined} onClick={() => status.mutate({ id: r.id, status: 'open' })} className="btn press min-h-10 px-4 text-[13px] disabled:opacity-40">Publish</button>}
          {r.status === 'open' && <button disabled={status.isPending} onClick={() => status.mutate({ id: r.id, status: 'paused' })} className="btn-ghost press min-h-10 px-4 text-[13px]">Pause</button>}
          {(r.status === 'open' || r.status === 'paused') && <button disabled={status.isPending} onClick={() => status.mutate({ id: r.id, status: 'closed' })} className="btn-ghost press min-h-10 px-4 text-[13px]">Close</button>}
          {r.status === 'closed' && <button disabled={status.isPending} onClick={() => status.mutate({ id: r.id, status: 'draft' })} className="btn-ghost press min-h-10 px-4 text-[13px]">Back to draft</button>}
          {r.status === 'draft' && <button aria-label="Delete draft" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete the draft “${r.title}”?`)) remove.mutate(r.id); }} className="btn-ghost press flex min-h-10 items-center px-3 text-down"><Trash2 size={14}/></button>}
        </div>
      </div>
    </article>)}
    {editing === 'new' ? <RoleEditor onDone={() => setEditing(null)}/> : <button onClick={() => setEditing('new')} className="sunk press flex min-h-16 items-center justify-center gap-2 rounded-[24px] text-[14.5px] font-extrabold"><Plus size={17}/>New role</button>}
  </div>;
}

function RoleEditor({ role, onDone }: { role?: HiringRole; onDone: () => void }) {
  const [d, setD] = useState<RoleDraft>(role ? toDraft(role) : EMPTY_ROLE);
  const set = <K extends keyof RoleDraft>(k: K, v: RoleDraft[K]) => setD(prev => ({ ...prev, [k]: v }));
  const save = useAdminMutation<RoleDraft>((v, token) => api(role ? `/hiring/admin/roles/${role.id}` : '/hiring/admin/roles', { token, method: 'POST', body: { ...v, responsibilities: lines(v.responsibilities), requiredSkills: lines(v.requiredSkills), preferredSkills: lines(v.preferredSkills) } }));
  const tbd = isPlaceholder(Object.values(d).join(' ')) || d.remotePolicy === 'tbd' || d.engagementType === 'tbd';
  const select = (label: string, value: string, options: Record<string, string>, onChange: (v: string) => void) => <Field label={label}><select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>{Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>;
  return <section className="raised grid gap-4 rounded-[24px] p-5 sm:p-6">
    <div className="flex items-center justify-between"><h3 className="text-[18px] font-extrabold">{role ? `Edit · ${role.title}` : 'New role'}</h3><button aria-label="Cancel" onClick={onDone} className="sunk press flex size-10 items-center justify-center rounded-full"><XIcon size={16}/></button></div>
    {tbd && <Notice>This role still has placeholders or “to be confirmed” fields. It can be saved as a draft, but it can’t be published until they’re replaced with real facts.</Notice>}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title"><input value={d.title} onChange={e => set('title', e.target.value)} className={inputCls}/></Field>
      <Field label="URL slug" hint="lowercase-with-dashes"><input value={d.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className={inputCls}/></Field>
      <Field label="Location"><input value={d.location} onChange={e => set('location', e.target.value)} className={inputCls}/></Field>
      {select('Team', d.team, TEAM_LABEL, v => set('team', v as HiringTeam))}
      {select('Remote policy', d.remotePolicy, REMOTE_LABEL, v => set('remotePolicy', v as RemotePolicy))}
      {select('Engagement', d.engagementType, ENGAGEMENT_LABEL, v => set('engagementType', v as Engagement))}
    </div>
    <Field label="Short mission"><textarea value={d.summary} onChange={e => set('summary', e.target.value)} rows={3} className={cn(inputCls, 'resize-y')}/></Field>
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Responsibilities" hint="One per line"><textarea value={d.responsibilities} onChange={e => set('responsibilities', e.target.value)} rows={5} className={cn(inputCls, 'resize-y text-[14px]')}/></Field>
      <Field label="Required skills" hint="One per line"><textarea value={d.requiredSkills} onChange={e => set('requiredSkills', e.target.value)} rows={5} className={cn(inputCls, 'resize-y text-[14px]')}/></Field>
      <Field label="Preferred skills" hint="One per line"><textarea value={d.preferredSkills} onChange={e => set('preferredSkills', e.target.value)} rows={5} className={cn(inputCls, 'resize-y text-[14px]')}/></Field>
    </div>
    {save.isError && <Notice tone="error">{hiringError(save.error)}</Notice>}
    <div className="flex gap-2"><button disabled={save.isPending} onClick={() => save.mutate(d, { onSuccess: onDone })} className="btn press min-h-12 px-8 text-[14.5px]">{save.isPending ? 'Saving…' : 'Save'}</button><button onClick={onDone} className="btn-ghost press min-h-12 px-6 text-[14.5px]">Cancel</button></div>
  </section>;
}

function Applications({ items }: { items: HiringApplication[] }) {
  const session = useSession(); const qc = useQueryClient();
  const [filter, setFilter] = useState<ApplicationState | 'all'>('all'); const [open, setOpen] = useState<string | null>(null); const [note, setNote] = useState<string>(''); const [dlError, setDlError] = useState<string>('');
  const shown = useMemo(() => filter === 'all' ? items : items.filter(a => a.state === filter), [items, filter]);
  const update = useMutation({
    mutationFn: async (v: { id: string; state?: ApplicationState; note?: string }) => api<HiringApplication>(`/hiring/admin/applications/${v.id}`, { token: await session.token(), method: 'POST', body: { state: v.state, note: v.note } }),
    onSuccess: app => { setNote(''); qc.setQueryData<HiringAdminData>(ADMIN_KEY, prev => prev ? { ...prev, applications: prev.applications.map(a => a.id === app.id ? app : a) } : prev); },
  });
  const remove = useMutation({ mutationFn: async (id: string) => api(`/hiring/admin/applications/${id}`, { token: await session.token(), method: 'DELETE' }), onSuccess: () => { setOpen(null); void qc.invalidateQueries({ queryKey: ADMIN_KEY }); } });
  const dl = async (path: string, name: string) => { setDlError(''); try { await downloadPrivate(path, await session.token(), name); } catch (e) { setDlError(e instanceof Error ? e.message : 'Download failed.'); } };
  return <div>
    <div className="flex flex-wrap items-center gap-1.5">{(['all', 'new', 'reviewing', 'shortlisted', 'declined', 'archived'] as const).map(s => <button key={s} onClick={() => setFilter(s)} aria-pressed={filter === s} className={cn('press min-h-10 rounded-full px-4 text-[13px] font-extrabold', filter === s ? 'bg-ink text-white' : 'sunk')}>{s === 'all' ? 'All' : STATE_LABEL[s]} · {s === 'all' ? items.length : items.filter(a => a.state === s).length}</button>)}
      <button disabled={!items.length} onClick={() => void dl('/hiring/admin/export', `objectpad-applications-${new Date().toISOString().slice(0, 10)}.csv`)} className="btn-ghost press ml-auto inline-flex min-h-10 items-center gap-2 px-4 text-[13px] disabled:opacity-40"><Download size={14}/>Export CSV</button></div>
    {dlError && <div className="mt-3"><Notice tone="error">{dlError}</Notice></div>}
    {!shown.length ? <div className="sunk mt-5 rounded-[24px] p-8 text-center text-[14.5px] font-bold text-ink/55">{items.length ? 'No applications in this state.' : 'No applications yet. They appear here once the page is public.'}</div> :
    <div className="mt-5 grid gap-2">{shown.map(a => <article key={a.id} className="raised rounded-[22px]">
      <button onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id} className="flex w-full flex-wrap items-center gap-3 p-4 text-left">
        <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-extrabold">{a.name}</span><span className="block font-mono text-[12px] font-semibold text-ink/50">{a.roleTitle} · {a.location} · {new Date(a.createdAt).toLocaleDateString()}</span></span>
        {a.hasResume && <FileText size={15} className="text-ink/45"/>}
        <span className="rounded-full bg-ink/[0.06] px-2.5 py-0.5 font-mono text-[10.5px] font-extrabold uppercase text-ink/60">{STATE_LABEL[a.state]}</span>
      </button>
      {open === a.id && <div className="grid gap-4 border-t border-ink/[0.07] p-4">
        <dl className="grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
          {([['Email', a.email], ['X', a.xHandle ? `@${a.xHandle}` : '—'], ['Time zone', a.timezone], ['Availability', a.availability]] as const).map(([k, v]) => <div key={k}><dt className="stat-label">{k}</dt><dd className="font-bold break-all">{v}</dd></div>)}
          {([['Portfolio', a.portfolio], ['GitHub', a.github], ['LinkedIn', a.linkedin]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="stat-label">{k}</dt><dd><a href={v} target="_blank" rel="noreferrer noopener" className="font-bold break-all underline">{v}</a></dd></div>)}
        </dl>
        <div><p className="stat-label">Strongest shipped project</p><p className="mt-1 whitespace-pre-wrap text-[14px] font-semibold leading-relaxed text-ink/75">{a.strongestProject}</p></div>
        <div><p className="stat-label">Why ObjectPad</p><p className="mt-1 whitespace-pre-wrap text-[14px] font-semibold leading-relaxed text-ink/75">{a.whyObjectPad}</p></div>
        {a.hasResume && <button onClick={() => void dl(`/hiring/admin/applications/${a.id}/resume`, `resume-${a.name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`)} className="btn-ghost press inline-flex min-h-10 w-fit items-center gap-2 px-4 text-[13px]"><Download size={14}/>Download résumé</button>}
        <div><p className="stat-label">Status</p><div className="mt-2 flex flex-wrap gap-1.5">{(['new', 'reviewing', 'shortlisted', 'declined', 'archived'] as const).map(s => <button key={s} disabled={update.isPending} onClick={() => update.mutate({ id: a.id, state: s })} aria-pressed={a.state === s} className={cn('press min-h-9 rounded-full px-3.5 text-[12.5px] font-extrabold', a.state === s ? 'bg-ink text-white' : 'sunk')}>{STATE_LABEL[s]}</button>)}</div></div>
        <div><p className="stat-label">Internal notes</p>
          {a.notes.length > 0 && <ul className="mt-2 grid gap-1.5">{a.notes.map(n => <li key={n.at} className="sunk rounded-xl px-3 py-2 text-[13.5px] font-semibold"><span className="mr-2 font-mono text-[11px] text-ink/45">{new Date(n.at).toLocaleString()}</span>{n.text}</li>)}</ul>}
          <div className="mt-2 flex gap-2"><input value={note} onChange={e => setNote(e.target.value.slice(0, 1500))} placeholder="Add a private note" className={inputCls}/><button disabled={!note.trim() || update.isPending} onClick={() => update.mutate({ id: a.id, note: note.trim() })} className="btn press min-h-12 shrink-0 px-5 text-[14px]">Add</button></div>
        </div>
        {(update.isError || remove.isError) && <Notice tone="error">{hiringError(update.error ?? remove.error)}</Notice>}
        <button disabled={remove.isPending} onClick={() => { if (window.confirm(`Permanently delete ${a.name}'s application and résumé?`)) remove.mutate(a.id); }} className="inline-flex min-h-10 w-fit items-center gap-2 text-[13px] font-extrabold text-down"><Trash2 size={14}/>Delete application (deletion request)</button>
      </div>}
    </article>)}</div>}
  </div>;
}

function FaqEditor({ data }: { data: HiringAdminData }) {
  const [faq, setFaq] = useState<HiringFaq[]>(data.settings.faq); const [contact, setContact] = useState<string>(data.settings.privacyContact);
  const save = useAdminMutation<void>((_, token) => api('/hiring/admin/settings', { token, method: 'POST', body: { faq: faq.filter(f => f.q.trim() && f.a.trim()), privacyContact: contact.trim() } }));
  const edit = (i: number, k: keyof HiringFaq, v: string) => setFaq(prev => prev.map((f, j) => j === i ? { ...f, [k]: v } : f));
  return <section className="raised grid gap-4 rounded-[28px] p-5 sm:p-6">
    <Notice>Answers starting with “[TBD” are shown highlighted in the preview and block the page from going public. Only write facts you can stand behind — no salaries, benefits, headcount or response times you haven’t decided.</Notice>
    <Field label="Privacy / deletion contact email" hint="Shown under the FAQ. Required before going public."><input value={contact} onChange={e => setContact(e.target.value)} type="email" placeholder="privacy@…" className={inputCls}/></Field>
    {faq.map((f, i) => <div key={i} className={cn('sunk grid gap-2 rounded-2xl p-4', (isPlaceholder(f.q) || isPlaceholder(f.a)) && 'ring-2 ring-[#F5C400]')}>
      <div className="flex gap-2"><input value={f.q} onChange={e => edit(i, 'q', e.target.value)} placeholder="Question" className={cn(inputCls, 'font-extrabold')}/><button aria-label="Remove question" onClick={() => setFaq(prev => prev.filter((_, j) => j !== i))} className="press flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-down"><Trash2 size={15}/></button></div>
      <textarea value={f.a} onChange={e => edit(i, 'a', e.target.value)} rows={3} placeholder="Answer" className={cn(inputCls, 'resize-y text-[14px]')}/>
    </div>)}
    <button onClick={() => setFaq(prev => [...prev, { q: '', a: '' }])} className="btn-ghost press inline-flex min-h-11 w-fit items-center gap-2 px-5 text-[14px]"><Plus size={15}/>Add question</button>
    {save.isError && <Notice tone="error">{hiringError(save.error)}</Notice>}
    {save.isSuccess && <Notice tone="ok">Saved.</Notice>}
    <button disabled={save.isPending} onClick={() => save.mutate()} className="btn press min-h-12 w-full px-8 text-[14.5px] sm:w-fit">{save.isPending ? 'Saving…' : 'Save FAQ & contact'}</button>
  </section>;
}
