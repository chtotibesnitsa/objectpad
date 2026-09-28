import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, LoaderCircle, Mail, RefreshCw, Save, TriangleAlert, Users } from 'lucide-react';
import { ErrorState, Loading, OperatorNotice } from '@/components/Feedback';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { APPLY_KEY, applyError } from '@/lib/apply';
import { downloadPrivate } from '@/lib/hiring';
import { APPLICATION_STATUSES, compensationLabel, COMP_INTERVALS, JOB_STATUSES, JOB_TEAMS, LOCATION_MODES, ROLE_KINDS, STATUS_LABEL, TEAM_NAME, type ApplicationDraft, type ApplicationStatus, type PublicJob } from '@/shared/apply';
import { cn } from '@/lib/utils';

type Job = PublicJob & { id: string; status: string };
interface Overview { role: 'admin' | 'reviewer'; staff: { id: string; label: string }[]; byStatus: { status: ApplicationStatus; n: number }[]; byRole: { slug: string; title: string; n: number }[]; jobs: Job[]; emailConfigured: boolean; notificationInbox: boolean; retentionDays: number; }
interface ListItem { id: string; reference: string; name: string; role: string; roleSlug: string; status: ApplicationStatus; workMode: string; timezone: string; country: string; source: string; campaign: string; assigned: string | null; tags: string[]; submittedAt: number; duplicates: number; isTest: boolean; }
interface ListData { total: number; page: number; pageSize: number; items: ListItem[]; }
interface Metrics { windowDays: number; funnel: { views: number; roleViews: number; starts: number; submits: number }; submitsByRole: { dim: string; n: number }[]; viewSources: { dim: string; n: number }[]; sources: { dim: string; n: number }[]; timezones: { dim: string; n: number }[]; languages: { dim: string; n: number }[]; validationErrors: { dim: string; n: number }[]; uploads: { ok: number; error: number }; avgDaysWaiting: number | null; }
interface Detail {
  id: string; reference: string; status: ApplicationStatus; statusLabel: string; next: ApplicationStatus[]; job: PublicJob; applicant: { name: string; email: string; country: string; timezone: string; workMode: string; availability: string; startDate: string; summary: string };
  answers: ApplicationDraft; links: { kind: string; url: string }[]; files: { id: string; purpose: string; filename: string; size: number; scanStatus: string; scanDetail: string }[]; attribution: { source: string; campaign: string; utm: Record<string, string> };
  assigned: string | null; tags: string[]; isTest: boolean; submittedAt: number; withdrawnAt: number | null; retentionAt: number | null; notes: { id: string; author: string; body: string; created_at: number }[];
  scores: { id: string; reviewer: string; scores: Record<string, number>; recommendation: string; created_at: number }[]; events: { actor: string; event: string; from_status: string | null; to_status: string | null; detail: string; created_at: number }[];
  deliveries: { id: string; template: string; status: string; attempts: number; last_error: string; updated_at: number }[]; duplicates: { public_id: string; reference: string; status: string; submitted_at: number; title: string }[];
  consent: { consent_version: string; policy_revision: string; created_at: number } | null;
}
const RUBRIC: Record<string, string[]> = { technical: ['shipped_work', 'technical_depth', 'production_judgment', 'security', 'communication', 'ownership'], creator: ['hook_and_story', 'shooting', 'editing', 'consistency', 'platform_fluency', 'pitch'], producer: ['creator_management', 'editorial_taste', 'organisation', 'attribution', 'communication', 'pitch'] };
const input = 'w-full rounded-xl border-2 border-ink/10 bg-white px-3 py-2 text-[14px] font-semibold outline-none focus:border-ink';
const useNoIndex = () => useEffect(() => { document.title = 'ObjectPad · Applications'; const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex,nofollow'; document.head.appendChild(m); return () => m.remove(); }, []);

function useStaff<T>(key: unknown[], path: string | null) {
  const s = useSession();
  return useQuery({ queryKey: [...APPLY_KEY, 'admin', ...key], enabled: s.authenticated && Boolean(path), retry: false, queryFn: async () => api<T>(path!, { token: await s.token() }) });
}
function useStaffMutation<T>(fn: (token: string | null, v: T) => Promise<unknown>, invalidate: unknown[] = []) {
  const s = useSession(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (v: T) => fn(await s.token(), v), onSuccess: () => { for (const k of invalidate) void qc.invalidateQueries({ queryKey: [...APPLY_KEY, 'admin', k] }); } });
}

function Gate({ children }: { children: React.ReactNode }) {
  const s = useSession(); const o = useStaff<Overview>(['overview'], '/admin/applications/overview');
  if (!s.configured) return <div className="page py-12"><OperatorNotice /></div>;
  if (!s.authenticated) return <div className="page py-16"><p className="lab">Restricted</p><h1 className="display mt-3 text-5xl">Hiring workspace</h1><p className="mt-3 text-ink/60">Sign in with an ObjectPad staff account.</p><button onClick={() => s.login()} className="btn press mt-6 min-h-12 px-7">Sign in</button></div>;
  if (o.isPending) return <div className="page py-16"><Loading label="Checking access…" /></div>;
  if (o.isError) return <div className="page py-16"><ErrorState message={applyError(o.error)} retry={() => void o.refetch()} /></div>;
  return <>{children}</>;
}

/** /admin/applications — protected dashboard for hiring staff (RBAC enforced server-side on every request). */
export default function AdminApplications() {
  useNoIndex();
  return <Gate><Dashboard /></Gate>;
}

function Dashboard() {
  const o = useStaff<Overview>(['overview'], '/admin/applications/overview'); const ov = o.data!;
  const [tab, setTab] = useState<'inbox' | 'metrics' | 'roles' | 'email'>('inbox');
  const count = (s: ApplicationStatus) => ov.byStatus.find(b => b.status === s)?.n ?? 0; const total = ov.byStatus.reduce((a, b) => a + b.n, 0);
  return <div className="page py-8 sm:py-10">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab">Restricted · {ov.role === 'admin' ? 'Hiring admin' : 'Reviewer'}</p><h1 className="display mt-2 text-[clamp(34px,5vw,54px)] leading-[0.92]">Applications</h1></div>
      <div className="flex gap-1.5" role="tablist">{(['inbox', 'metrics', ...(ov.role === 'admin' ? ['roles', 'email'] : [])] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t as typeof tab)} className={cn('press min-h-11 rounded-full px-4 text-[13.5px] font-extrabold capitalize', tab === t ? 'bg-ink text-white' : 'sunk')}>{t}</button>)}</div></div>
    {(!ov.emailConfigured || !ov.notificationInbox) && <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#FFF6D6] px-4 py-3 text-[13px] font-bold text-[#6B5200]"><TriangleAlert size={16} className="mt-0.5 shrink-0" />{!ov.emailConfigured ? 'Email provider not configured (RESEND_API_KEY + HIRING_FROM_EMAIL). Applications are saved and receipts are queued; they send once configured. ' : ''}{!ov.notificationInbox ? 'HIRING_NOTIFICATION_EMAIL is not set, so no internal new-application emails are sent.' : ''}</p>}
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      <Stat k="Total" v={total} />{(['submitted', 'in_review', 'interview', 'offer', 'withdrawn'] as ApplicationStatus[]).map(s => <Stat key={s} k={STATUS_LABEL[s]} v={s === 'submitted' ? count('submitted') + count('received') : count(s)} />)}
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">{ov.byRole.map(r => <span key={r.slug} className="sunk rounded-full px-3 py-1.5 text-[12.5px] font-bold">{r.title}: <b>{r.n}</b></span>)}</div>
    <div className="mt-6">{tab === 'inbox' ? <Inbox ov={ov} /> : tab === 'metrics' ? <MetricsView /> : tab === 'roles' ? <Roles ov={ov} /> : <Deliveries />}</div>
  </div>;
}
const Stat = ({ k, v }: { k: string; v: number | string }) => <div className="raised rounded-2xl p-3"><p className="stat-label">{k}</p><p className="mt-1 text-[24px] font-extrabold tabular-nums">{v}</p></div>;

function Inbox({ ov }: { ov: Overview }) {
  const [params, setParams] = useSearchParams(); const s = useSession(); const navigate = useNavigate();
  const qs = params.toString(); const list = useStaff<ListData>(['list', qs], `/admin/applications?${qs}`);
  const [sel, setSel] = useState<string[]>([]); const [bulk, setBulk] = useState<string>('');
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); p.delete('page'); setParams(p, { replace: true }); };
  const bulkM = useStaffMutation<{ action: string; value: string | null }>((token, v) => api('/admin/applications/bulk', { method: 'POST', token, body: { ids: sel, confirm: true, ...v } }), ['list', 'overview']);
  const filters = useStaff<{ id: string; name: string; query: string }[]>(['filters'], '/admin/applications/filters');
  const saveF = useStaffMutation<string>((token, name) => api('/admin/applications/filters', { method: 'POST', token, body: { name, query: qs } }), ['filters']);
  const [fields, setFields] = useState<string>('reference,submittedAt,role,status,name,email,timezone,workMode,source,links');
  return <>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <input aria-label="Search" className={input} placeholder="Name, exact email or OP- reference" defaultValue={params.get('q') ?? ''} onKeyDown={e => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value); }} />
      <select aria-label="Role" className={input} value={params.get('role') ?? ''} onChange={e => set('role', e.target.value)}><option value="">All roles</option>{ov.jobs.map(j => <option key={j.slug} value={j.slug}>{j.title}</option>)}</select>
      <select aria-label="Status" className={input} value={params.get('status') ?? ''} onChange={e => set('status', e.target.value)}><option value="">Active (not archived)</option>{APPLICATION_STATUSES.filter(x => x !== 'draft').map(x => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}</select>
      <select aria-label="Assignment" className={input} value={params.get('assigned') ?? ''} onChange={e => set('assigned', e.target.value)}><option value="">Anyone</option><option value="none">Unassigned</option>{ov.staff.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
      <select aria-label="Work mode" className={input} value={params.get('workMode') ?? ''} onChange={e => set('workMode', e.target.value)}><option value="">Any location</option><option value="remote">Remote</option><option value="san_francisco">San Francisco</option><option value="either">Either</option></select>
      <input aria-label="Time zone" className={input} placeholder="Time zone contains…" defaultValue={params.get('timezone') ?? ''} onBlur={e => set('timezone', e.target.value)} />
      <input aria-label="Platform" className={input} placeholder="Platform (e.g. TikTok)" defaultValue={params.get('platform') ?? ''} onBlur={e => set('platform', e.target.value)} />
      <input aria-label="Language" className={input} placeholder="Language" defaultValue={params.get('language') ?? ''} onBlur={e => set('language', e.target.value)} />
      <input aria-label="Source" className={input} placeholder="Source" defaultValue={params.get('source') ?? ''} onBlur={e => set('source', e.target.value)} />
      <input aria-label="Campaign" className={input} placeholder="UTM campaign" defaultValue={params.get('campaign') ?? ''} onBlur={e => set('campaign', e.target.value)} />
      <input aria-label="Tag" className={input} placeholder="Tag" defaultValue={params.get('tag') ?? ''} onBlur={e => set('tag', e.target.value)} />
      <label className="flex items-center gap-2 text-[13px] font-bold"><input type="date" aria-label="Submitted from" className={input} onChange={e => set('from', e.target.value ? String(new Date(e.target.value).getTime()) : '')} /></label>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-[13px] font-bold"><input type="checkbox" checked={params.get('tests') === '1'} onChange={e => set('tests', e.target.checked ? '1' : '')} />Show test records</label>
      {filters.data?.map(f => <button key={f.id} onClick={() => setParams(new URLSearchParams(f.query))} className="sunk press min-h-9 rounded-full px-3 text-[12.5px] font-extrabold">{f.name}</button>)}
      <button onClick={() => { const n = window.prompt('Name this filter'); if (n) saveF.mutate(n); }} className="press min-h-9 rounded-full px-3 text-[12.5px] font-extrabold underline"><Save size={12} className="mr-1 inline" />Save filter</button>
      {ov.role === 'admin' && <span className="ml-auto flex items-center gap-1.5"><input aria-label="Export fields" className={cn(input, 'w-72 py-1.5 text-[12px]')} value={fields} onChange={e => setFields(e.target.value)} /><button onClick={() => void s.token().then(t => downloadPrivate(`/admin/applications/export?${qs}&fields=${encodeURIComponent(fields)}`, t, 'applications.csv'))} className="btn-ghost press inline-flex min-h-10 items-center gap-1.5 px-4 text-[13px]"><Download size={14} />CSV</button></span>}
    </div>
    {sel.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-white"><span className="text-[13px] font-extrabold">{sel.length} selected</span>
      <select aria-label="Bulk action" className="rounded-lg bg-white/10 px-2 py-1.5 text-[13px] font-bold" value={bulk} onChange={e => setBulk(e.target.value)}><option value="">Choose action…</option>{ov.staff.map(x => <option key={x.id} value={`assign:${x.id}`}>Assign to {x.label}</option>)}<option value="assign:">Unassign</option>{(['in_review', 'archived'] as ApplicationStatus[]).map(x => <option key={x} value={`status:${x}`}>Move to {STATUS_LABEL[x]}</option>)}</select>
      <button disabled={!bulk || bulkM.isPending} onClick={() => { if (!window.confirm(`Apply to ${sel.length} applications? Invalid transitions are skipped; no emails are sent.`)) return; const [a, v] = bulk.split(':'); bulkM.mutate({ action: a, value: v || null }, { onSuccess: () => setSel([]) }); }} className="rounded-full bg-white px-4 py-1.5 text-[13px] font-extrabold text-ink disabled:opacity-50">Apply</button>
      {bulkM.data ? <span className="text-[12px]">Done</span> : null}</div>}
    {list.isPending ? <Loading label="Loading applications…" /> : list.isError ? <div className="mt-4"><ErrorState message={applyError(list.error)} retry={() => void list.refetch()} /></div> : list.data.items.length === 0 ? <div className="raised mt-4 rounded-2xl p-10 text-center"><Users className="mx-auto text-ink/30" /><p className="mt-3 text-[16px] font-extrabold">No applications match.</p><p className="mt-1 text-[13.5px] font-semibold text-ink/55">Real submissions appear here the moment they’re submitted.</p></div> : <>
      <div className="raised mt-4 overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[820px] text-left text-[13.5px]"><thead><tr className="border-b border-ink/10 text-[11.5px] font-extrabold uppercase tracking-wide text-ink/45"><th className="p-3"><input type="checkbox" aria-label="Select all" checked={sel.length === list.data.items.length} onChange={e => setSel(e.target.checked ? list.data.items.map(i => i.id) : [])} /></th><th className="p-3">Applicant</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Where</th><th className="p-3">Source</th><th className="p-3">Assigned</th><th className="p-3">Submitted</th></tr></thead>
          <tbody>{list.data.items.map(i => <tr key={i.id} className="cursor-pointer border-b border-ink/5 hover:bg-white/70" onClick={() => navigate(`/admin/applications/${i.id}`)}>
            <td className="p-3" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${i.reference}`} checked={sel.includes(i.id)} onChange={e => setSel(v => e.target.checked ? [...v, i.id] : v.filter(x => x !== i.id))} /></td>
            <td className="p-3"><Link to={`/admin/applications/${i.id}`} className="font-extrabold" onClick={e => e.stopPropagation()}>{i.name || '—'}</Link><div className="font-mono text-[11px] text-ink/45">{i.reference}{i.isTest && ' · TEST'}{i.duplicates > 0 && <span className="ml-1 text-[#9A6A00]">· {i.duplicates} other</span>}</div></td>
            <td className="p-3">{i.role}</td><td className="p-3"><span className="sunk rounded-full px-2.5 py-1 text-[12px] font-extrabold">{STATUS_LABEL[i.status]}</span></td><td className="p-3">{i.country} · {i.timezone}</td><td className="p-3">{i.source || '—'}{i.campaign && <div className="text-[11px] text-ink/45">{i.campaign}</div>}</td>
            <td className="p-3">{i.assigned ? ov.staff.find(s => s.id === i.assigned)?.label ?? 'Staff' : '—'}</td><td className="p-3 font-mono text-[12px]">{new Date(i.submittedAt).toLocaleDateString()}</td></tr>)}</tbody></table>
      </div>
      <div className="mt-3 flex items-center justify-between text-[13px] font-bold"><span>{list.data.total} total</span><span className="flex gap-2"><button disabled={list.data.page === 0} onClick={() => set('page', String(list.data.page - 1))} className="sunk press min-h-10 rounded-full px-4 disabled:opacity-40">Prev</button><button disabled={(list.data.page + 1) * list.data.pageSize >= list.data.total} onClick={() => { const p = new URLSearchParams(params); p.set('page', String(list.data.page + 1)); setParams(p); }} className="sunk press min-h-10 rounded-full px-4 disabled:opacity-40">Next</button></span></div>
    </>}
  </>;
}

function MetricsView() {
  const m = useStaff<Metrics>(['metrics'], '/admin/applications/metrics');
  if (m.isPending) return <Loading label="Loading metrics…" />; if (m.isError) return <ErrorState message={applyError(m.error)} />;
  const d = m.data; const f = d.funnel; const pct = (a: number, b: number) => b ? `${Math.round((a / b) * 100)}%` : '—';
  const Bars = ({ title, rows }: { title: string; rows: { dim: string; n: number }[] }) => { const max = Math.max(1, ...rows.map(r => r.n)); return <div className="raised rounded-2xl p-4"><p className="stat-label">{title}</p>{rows.length ? <ul className="mt-3 space-y-1.5">{rows.map(r => <li key={r.dim || '∅'} className="flex items-center gap-2 text-[13px] font-bold"><span className="w-32 truncate">{r.dim || '(none)'}</span><span className="h-2 flex-1 rounded-full bg-ink/10"><span className="block h-full rounded-full bg-ink" style={{ width: `${(r.n / max) * 100}%` }} /></span><span className="w-8 text-right tabular-nums">{r.n}</span></li>)}</ul> : <p className="mt-3 text-[13px] font-semibold text-ink/45">No data yet.</p>}</div>; };
  return <div className="space-y-3">
    <p className="text-[13px] font-semibold text-ink/55">Last {d.windowDays} days · aggregated counts only, no personal data. Test records excluded.</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><Stat k="Page views" v={f.views} /><Stat k="Role views" v={f.roleViews} /><Stat k="Starts" v={`${f.starts} · ${pct(f.starts, f.views)}`} /><Stat k="Submits" v={`${f.submits} · ${pct(f.submits, f.starts)}`} /><Stat k="Avg days waiting" v={d.avgDaysWaiting ?? '—'} /></div>
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><Bars title="Submits by role" rows={d.submitsByRole} /><Bars title="Applicant sources" rows={d.sources} /><Bars title="Landing UTM sources" rows={d.viewSources} /><Bars title="Time zones" rows={d.timezones} /><Bars title="Languages (creators)" rows={d.languages} /><Bars title="Validation errors by step" rows={d.validationErrors} /></div>
    <p className="text-[13px] font-bold">Uploads: {d.uploads.ok} ok · {d.uploads.error} failed</p>
  </div>;
}

function Deliveries() {
  const d = useStaff<{ id: string; template: string; status: string; attempts: number; last_error: string; reference: string | null; updated_at: number }[]>(['deliveries'], '/admin/applications/deliveries');
  const retry = useStaffMutation<string>((token, id) => api(`/admin/applications/deliveries/${id}/retry`, { method: 'POST', token }), ['deliveries']);
  if (d.isPending) return <Loading label="Loading email log…" />; if (d.isError) return <ErrorState message={applyError(d.error)} />;
  return <div className="raised overflow-x-auto rounded-2xl"><table className="w-full min-w-[640px] text-left text-[13px]"><thead><tr className="border-b border-ink/10 text-[11.5px] font-extrabold uppercase text-ink/45"><th className="p-3">Reference</th><th className="p-3">Template</th><th className="p-3">State</th><th className="p-3">Attempts</th><th className="p-3">Last error</th><th className="p-3" /></tr></thead>
    <tbody>{d.data.map(r => <tr key={r.id} className="border-b border-ink/5"><td className="p-3 font-mono">{r.reference ?? '—'}</td><td className="p-3">{r.template}</td><td className="p-3 font-extrabold">{r.status}</td><td className="p-3">{r.attempts}</td><td className="p-3 text-ink/55">{r.last_error || '—'}</td><td className="p-3">{['failed', 'not_configured', 'retry'].includes(r.status) && <button onClick={() => retry.mutate(r.id)} className="inline-flex items-center gap-1 font-extrabold underline"><RefreshCw size={12} />Retry</button>}</td></tr>)}{!d.data.length && <tr><td colSpan={6} className="p-6 text-center font-semibold text-ink/50">No emails yet.</td></tr>}</tbody></table></div>;
}

function Roles({ ov }: { ov: Overview }) {
  const [edit, setEdit] = useState<Job | 'new' | null>(null);
  const status = useStaffMutation<{ id: string; status: string }>((token, v) => api(`/admin/applications/jobs/${v.id}/status`, { method: 'POST', token, body: { status: v.status } }), ['overview']);
  const order = useStaffMutation<string[]>((token, ids) => api('/admin/applications/jobs/reorder', { method: 'POST', token, body: { ids } }), ['overview']);
  if (edit) return <JobEditor job={edit === 'new' ? null : edit} onDone={() => setEdit(null)} />;
  const move = (i: number, d: number) => { const ids = ov.jobs.map(j => j.id); const t = ids[i]; ids[i] = ids[i + d]; ids[i + d] = t; order.mutate(ids); };
  return <div className="space-y-2">
    <button onClick={() => setEdit('new')} className="btn press min-h-11 px-5 text-[14px]">New role</button>
    {status.isError && <p role="alert" className="text-[13px] font-bold text-down">{applyError(status.error)}</p>}
    {ov.jobs.map((j, i) => <div key={j.id} className="raised flex flex-wrap items-center gap-3 rounded-2xl p-4">
      <div className="flex flex-col"><button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="px-1 disabled:opacity-20">▲</button><button disabled={i === ov.jobs.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="px-1 disabled:opacity-20">▼</button></div>
      <div className="min-w-0 flex-1"><p className="text-[15px] font-extrabold">{j.title}</p><p className="text-[12.5px] font-semibold text-ink/55">{TEAM_NAME[j.team]} · {compensationLabel(j.compensation)} · /apply/{j.slug}</p></div>
      <span className={cn('rounded-full px-3 py-1 text-[12px] font-extrabold', j.status === 'published' ? 'bg-up/15 text-up' : 'sunk')}>{j.status}</span>
      <select aria-label="Change status" className={cn(input, 'w-36')} value={j.status} onChange={e => status.mutate({ id: j.id, status: e.target.value })}>{JOB_STATUSES.map(s => <option key={s}>{s}</option>)}</select>
      <button onClick={() => setEdit(j)} className="btn-ghost press min-h-10 px-4 text-[13px]">Edit</button>
    </div>)}
  </div>;
}

function JobEditor({ job, onDone }: { job: Job | null; onDone: () => void }) {
  const [v, setV] = useState(() => ({ slug: job?.slug ?? '', title: job?.title ?? '', team: job?.team ?? 'engineering', kind: job?.kind ?? 'technical', lead: job?.lead ?? false, locationMode: job?.locationMode ?? 'remote_or_sf', locations: (job?.locations ?? ['Remote worldwide']).join('\n'), timezones: (job?.timezones ?? []).join('\n'), engagementType: job?.engagementType ?? '', experience: job?.experience ?? '', openings: job?.openings ?? 'Open', summary: job?.summary ?? '', description: job?.description ?? '', responsibilities: (job?.responsibilities ?? []).join('\n'), qualifications: (job?.qualifications ?? []).join('\n'), niceToHaves: (job?.niceToHaves ?? []).join('\n'), skills: (job?.form.skills ?? []).join('\n'), requireResume: job?.form.requireResume ?? false, currency: job?.compensation.currency ?? 'USD', min: job?.compensation.min ? String(job.compensation.min) : '', max: job?.compensation.max ? String(job.compensation.max) : '', interval: job?.compensation.interval ?? 'none', display: job?.compensation.display ?? '' }));
  const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
  const save = useStaffMutation<null>((token) => api(job ? `/admin/applications/jobs/${job.id}` : '/admin/applications/jobs', { method: 'POST', token, body: { ...v, locations: lines(v.locations), timezones: lines(v.timezones), responsibilities: lines(v.responsibilities), qualifications: lines(v.qualifications), niceToHaves: lines(v.niceToHaves), skills: lines(v.skills), compensation: { currency: v.currency, min: v.min || null, max: v.max || null, interval: v.interval, display: v.display } } }), ['overview']);
  const T = ({ k, label, area }: { k: keyof typeof v; label: string; area?: boolean }) => <label className="block text-[13px] font-extrabold">{label}{area ? <textarea className={cn(input, 'mt-1 min-h-24')} value={String(v[k])} onChange={e => setV({ ...v, [k]: e.target.value })} /> : <input className={cn(input, 'mt-1')} value={String(v[k])} onChange={e => setV({ ...v, [k]: e.target.value })} />}</label>;
  return <div className="raised rounded-2xl p-5">
    <button onClick={onDone} className="inline-flex items-center gap-1 text-[13px] font-extrabold"><ArrowLeft size={14} />Back</button>
    <h2 className="mt-3 text-[22px] font-extrabold">{job ? 'Edit role' : 'New role'}</h2>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <T k="title" label="Title" /><T k="slug" label="URL slug" />
      <label className="text-[13px] font-extrabold">Team<select className={cn(input, 'mt-1')} value={v.team} onChange={e => setV({ ...v, team: e.target.value as typeof v.team })}>{JOB_TEAMS.map(t => <option key={t} value={t}>{TEAM_NAME[t]}</option>)}</select></label>
      <label className="text-[13px] font-extrabold">Form type<select className={cn(input, 'mt-1')} value={v.kind} onChange={e => setV({ ...v, kind: e.target.value as typeof v.kind })}>{ROLE_KINDS.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="text-[13px] font-extrabold">Location<select className={cn(input, 'mt-1')} value={v.locationMode} onChange={e => setV({ ...v, locationMode: e.target.value as typeof v.locationMode })}>{LOCATION_MODES.map(t => <option key={t}>{t}</option>)}</select></label>
      <T k="engagementType" label="Engagement type" /><T k="experience" label="Experience level" /><T k="openings" label="Openings text" />
      <div className="rounded-xl border border-ink/10 p-3 md:col-span-2"><p className="text-[13px] font-extrabold">Compensation</p><p className="text-[12px] font-semibold text-ink/50">A numeric minimum shows as “Starting at …”. Only enter one if it is a real, funded floor. Text can never promise guaranteed earnings.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-5"><T k="currency" label="Currency" /><T k="min" label="Minimum" /><T k="max" label="Maximum" /><label className="text-[13px] font-extrabold">Interval<select className={cn(input, 'mt-1')} value={v.interval} onChange={e => setV({ ...v, interval: e.target.value as typeof v.interval })}>{COMP_INTERVALS.map(t => <option key={t}>{t}</option>)}</select></label><T k="display" label="Display text" /></div></div>
      <label className="flex items-center gap-2 text-[13px] font-extrabold"><input type="checkbox" checked={v.lead} onChange={e => setV({ ...v, lead: e.target.checked })} />Lead role (asks leadership question)</label>
      <label className="flex items-center gap-2 text-[13px] font-extrabold"><input type="checkbox" checked={v.requireResume} onChange={e => setV({ ...v, requireResume: e.target.checked })} />Résumé required</label>
      <div className="md:col-span-2"><T k="summary" label="Summary" area /></div><div className="md:col-span-2"><T k="description" label="Description" area /></div>
      <T k="responsibilities" label="Responsibilities (one per line)" area /><T k="qualifications" label="Qualifications (one per line)" area /><T k="niceToHaves" label="Nice to have (one per line)" area /><T k="skills" label="Skill checkboxes (technical, one per line)" area />
      <T k="locations" label="Locations (one per line)" area /><T k="timezones" label="Time-zone bands (one per line)" area />
    </div>
    {save.isError && <p role="alert" className="mt-3 text-[13px] font-bold text-down">{applyError(save.error)}</p>}
    <button onClick={() => save.mutate(null, { onSuccess: onDone })} disabled={save.isPending} className="btn press mt-4 min-h-12 px-6 disabled:opacity-60">{save.isPending ? 'Saving…' : 'Save role'}</button>
    <p className="mt-2 text-[12px] font-semibold text-ink/50">New roles start as drafts. Publish from the list.</p>
  </div>;
}

/** /admin/applications/:applicationId — review workspace. */
export function AdminApplicationDetail() {
  useNoIndex();
  return <Gate><DetailView /></Gate>;
}
function DetailView() {
  const { applicationId = '' } = useParams(); const s = useSession(); const ov = useStaff<Overview>(['overview'], '/admin/applications/overview').data!;
  const d = useStaff<Detail>(['detail', applicationId], `/admin/applications/${applicationId}`); const qc = useQueryClient();
  const act = useStaffMutation<{ path: string; body: unknown }>((token, v) => api<Detail>(`/admin/applications/${applicationId}/${v.path}`, { method: 'POST', token, body: v.body }).then(r => { qc.setQueryData([...APPLY_KEY, 'admin', 'detail', applicationId], r); return r; }), ['list', 'overview']);
  const [to, setTo] = useState<ApplicationStatus | ''>(''); const [sendEmail, setSendEmail] = useState<boolean>(false); const [message, setMessage] = useState<string>(''); const [note, setNote] = useState<string>('');
  const [scores, setScores] = useState<Record<string, number>>({}); const [rec, setRec] = useState<string>('');
  const preview = useQuery({ queryKey: [...APPLY_KEY, 'admin', 'preview', applicationId, to, message], enabled: Boolean(to && sendEmail), queryFn: async () => api<{ template: string | null; subject?: string; text?: string }>(`/admin/applications/${applicationId}/preview`, { method: 'POST', token: await s.token(), body: { to, message } }) });
  const del = useStaffMutation<null>((token) => api(`/admin/applications/${applicationId}`, { method: 'DELETE', token }), ['list', 'overview']); const navigate = useNavigate();
  const emailable = useMemo(() => ['rejected', 'interview', 'requested_material'].includes(to), [to]);
  if (d.isPending) return <div className="page py-12"><Loading label="Loading application…" /></div>;
  if (d.isError) return <div className="page py-12"><ErrorState message={applyError(d.error)} retry={() => void d.refetch()} /></div>;
  const a = d.data; const ans = a.answers; const tech = a.job.kind === 'technical';
  const Block = ({ t, v }: { t: string; v: string | string[] }) => (Array.isArray(v) ? v.filter(Boolean).length : v) ? <div><p className="stat-label">{t}</p><p className="mt-1 whitespace-pre-line break-words text-[14px] font-semibold">{Array.isArray(v) ? v.filter(Boolean).join(', ') : v}</p></div> : null;
  return <div className="page py-8">
    <Link to="/admin/applications" className="inline-flex items-center gap-1 text-[13px] font-extrabold"><ArrowLeft size={14} />All applications</Link>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[12px] font-bold text-ink/50">{a.reference}{a.isTest && ' · TEST RECORD'}</p><h1 className="display mt-1 text-[clamp(30px,4.5vw,46px)] leading-[0.95]">{a.applicant.name}</h1><p className="mt-1 text-[14px] font-bold text-ink/60">{a.job.title} · submitted {new Date(a.submittedAt).toLocaleString()}</p></div><span className="rounded-full bg-ink px-4 py-2 text-[13px] font-extrabold text-white">{a.statusLabel}</span></div>
    {a.duplicates.length > 0 && <p className="mt-3 flex items-center gap-2 rounded-2xl bg-[#FFF6D6] px-4 py-2.5 text-[13px] font-bold text-[#6B5200]"><TriangleAlert size={15} />Same email also applied: {a.duplicates.map(x => <Link key={x.public_id} to={`/admin/applications/${x.public_id}`} className="underline">{x.reference} ({x.title}, {STATUS_LABEL[x.status as ApplicationStatus] ?? x.status})</Link>)}. Not auto-rejected.</p>}
    <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <section className="raised space-y-4 rounded-2xl p-5"><h2 className="text-[16px] font-extrabold">Applicant</h2>
          <div className="grid gap-4 sm:grid-cols-2"><Block t="Email" v={a.applicant.email} /><Block t="Location" v={`${a.applicant.country} · ${a.applicant.timezone} · ${a.applicant.workMode}`} /><Block t="Availability" v={a.applicant.availability} /><Block t="Start" v={a.applicant.startDate} /></div>
          <Block t="Summary" v={a.applicant.summary} />
          <div><p className="stat-label">Links</p><ul className="mt-1 space-y-1">{a.links.map(l => <li key={l.url} className="text-[13.5px] font-semibold"><span className="mr-2 font-mono text-[11px] uppercase text-ink/45">{l.kind}</span><a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">{l.url}</a></li>)}{!a.links.length && <li className="text-[13px] text-ink/45">None</li>}</ul></div>
          <div><p className="stat-label">Files</p>{a.files.length ? a.files.map(f => <div key={f.id} className="sunk mt-1.5 flex items-center gap-3 rounded-xl px-3 py-2"><FileText size={16} /><span className="flex-1 text-[13px] font-bold">{f.filename} · {(f.size / 1_048_576).toFixed(1)} MB<span className={cn('ml-2 font-mono text-[11px]', f.scanStatus === 'clean' ? 'text-up' : 'text-down')}>{f.scanStatus}</span><span className="block text-[11.5px] font-semibold text-ink/45">{f.scanDetail}</span></span>{f.scanStatus === 'clean' && <button onClick={() => void s.token().then(t => downloadPrivate(`/admin/applications/${a.id}/files/${f.id}`, t, `${a.reference}-${f.filename}`))} className="inline-flex items-center gap-1 text-[12.5px] font-extrabold underline"><Download size={13} />Download</button>}</div>) : <p className="mt-1 text-[13px] text-ink/45">None</p>}<p className="mt-1 text-[11.5px] font-semibold text-ink/45">Files download as attachments and are never rendered in the browser.</p></div>
        </section>
        <section className="raised space-y-4 rounded-2xl p-5"><h2 className="text-[16px] font-extrabold">Role answers <span className="font-mono text-[11px] text-ink/40">form v{a.job.formVersion}</span></h2>
          {tech ? <><Block t="Experience" v={ans.experienceYears} /><Block t="Skills" v={ans.skills} /><Block t="Hard production problem" v={ans.hardProblem} /><Block t="Scenario (idempotent launch)" v={ans.scenario} /><Block t="Leadership" v={ans.leadership} /><Block t="Compensation expectation" v={ans.compExpectation} /></>
            : <><Block t="Platforms" v={ans.platforms} /><Block t="Handles" v={ans.handles} /><Block t="Niches" v={ans.niches} /><Block t="Examples" v={ans.examples} /><Block t="Tools" v={ans.tools} /><Block t="On camera" v={ans.onCamera} /><Block t="Languages" v={ans.languages} /><Block t="Weekly capacity" v={ans.weeklyCapacity} /><Block t="Program experience" v={ans.leadership} /><Block t="20-second pitch" v={ans.pitch} /></>}
          <Block t="Heard via" v={a.attribution.source} /><Block t="UTM" v={Object.entries(a.attribution.utm).map(([k, x]) => `${k}=${x}`).join(' · ')} />
        </section>
        <section className="raised rounded-2xl p-5"><h2 className="text-[16px] font-extrabold">History</h2><ol className="mt-3 space-y-1.5">{a.events.map((e, i) => <li key={i} className="flex gap-3 text-[12.5px] font-semibold"><span className="w-36 shrink-0 font-mono text-ink/45">{new Date(e.created_at).toLocaleString()}</span><span>{e.event.replace(/_/g, ' ')}{e.to_status ? ` → ${STATUS_LABEL[e.to_status as ApplicationStatus] ?? e.to_status}` : ''}{e.detail ? ` · ${e.detail}` : ''} <span className="text-ink/40">({e.actor})</span></span></li>)}</ol>
          <p className="mt-4 stat-label">Emails</p>{a.deliveries.map(x => <p key={x.id} className="mt-1 flex items-center gap-2 text-[12.5px] font-semibold"><Mail size={12} />{x.template} · <b>{x.status}</b> · {x.attempts} attempt(s){x.last_error && <span className="text-ink/45"> · {x.last_error}</span>}</p>)}{!a.deliveries.length && <p className="text-[12.5px] text-ink/45">None</p>}
          {a.consent && <p className="mt-3 text-[11.5px] font-semibold text-ink/45">Consent recorded · retention until {a.retentionAt ? new Date(a.retentionAt).toLocaleDateString() : '—'}</p>}</section>
      </div>
      <aside className="space-y-4">
        <section className="raised rounded-2xl p-5"><h2 className="text-[16px] font-extrabold">Move stage</h2>
          <select aria-label="Next status" className={cn(input, 'mt-3')} value={to} onChange={e => { setTo(e.target.value as ApplicationStatus); setSendEmail(false); }}><option value="">Choose next stage…</option>{a.next.map(n => <option key={n} value={n}>{STATUS_LABEL[n]}</option>)}</select>
          {emailable && <label className="mt-3 flex items-center gap-2 text-[13px] font-extrabold"><input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />Email the applicant (I approve this message)</label>}
          {sendEmail && <><textarea aria-label="Personal message" className={cn(input, 'mt-2 min-h-24')} placeholder="Optional personal message (e.g. what material you need, or interview scheduling details)" value={message} onChange={e => setMessage(e.target.value)} maxLength={1500} />{preview.data?.text && <pre className="sunk mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl p-3 text-[12px] font-semibold">Subject: {preview.data.subject}{'\n\n'}{preview.data.text}</pre>}</>}
          <button disabled={!to || act.isPending} onClick={() => { if (to === 'rejected' && !window.confirm('Close this application? A person made this decision.')) return; act.mutate({ path: 'transition', body: { to, sendEmail, message } }, { onSuccess: () => { setTo(''); setMessage(''); setSendEmail(false); } }); }} className="btn press mt-3 min-h-11 w-full text-[14px] disabled:opacity-50">{act.isPending ? <LoaderCircle size={16} className="mx-auto animate-spin" /> : 'Update stage'}</button>
          {act.isError && <p role="alert" className="mt-2 text-[12.5px] font-bold text-down">{applyError(act.error)}</p>}
        </section>
        <section className="raised rounded-2xl p-5"><h2 className="text-[16px] font-extrabold">Assignment & tags</h2>
          <select aria-label="Reviewer" className={cn(input, 'mt-3')} value={a.assigned ?? ''} onChange={e => act.mutate({ path: 'assign', body: { reviewer: e.target.value || null } })}><option value="">Unassigned</option>{ov.staff.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          <input aria-label="Tags" className={cn(input, 'mt-2')} placeholder="tags, comma separated" defaultValue={a.tags.join(', ')} onBlur={e => act.mutate({ path: 'tags', body: { tags: e.target.value.split(',') } })} />
        </section>
        <section className="raised rounded-2xl p-5"><h2 className="text-[16px] font-extrabold">Scorecard <span className="font-mono text-[11px] text-ink/40">rubric v1 · 1–4</span></h2>
          <div className="mt-3 space-y-2">{RUBRIC[a.job.kind].map(c => <div key={c} className="flex items-center justify-between gap-2"><span className="text-[13px] font-bold capitalize">{c.replace(/_/g, ' ')}</span><span className="flex gap-1">{[1, 2, 3, 4].map(n => <button key={n} aria-label={`${c} ${n}`} aria-pressed={scores[c] === n} onClick={() => setScores({ ...scores, [c]: n })} className={cn('size-9 rounded-lg text-[13px] font-extrabold', scores[c] === n ? 'bg-ink text-white' : 'sunk')}>{n}</button>)}</span></div>)}</div>
          <select aria-label="Recommendation" className={cn(input, 'mt-3')} value={rec} onChange={e => setRec(e.target.value)}><option value="">Recommendation…</option><option value="strong_yes">Strong yes</option><option value="yes">Yes</option><option value="no">No</option><option value="strong_no">Strong no</option></select>
          <button disabled={!rec || RUBRIC[a.job.kind].some(c => !scores[c])} onClick={() => act.mutate({ path: 'score', body: { scores, recommendation: rec } }, { onSuccess: () => { setScores({}); setRec(''); } })} className="btn-ghost press mt-2 min-h-10 w-full text-[13px] disabled:opacity-40">Submit score</button>
          {a.scores.map(x => <p key={x.id} className="mt-2 text-[12px] font-semibold text-ink/60">{x.reviewer}: <b>{x.recommendation.replace('_', ' ')}</b> · avg {(Object.values(x.scores).reduce((p, n) => p + n, 0) / Object.values(x.scores).length).toFixed(1)}</p>)}
        </section>
        <section className="raised rounded-2xl p-5"><h2 className="text-[16px] font-extrabold">Private notes</h2>
          {a.notes.map(n => <div key={n.id} className="mt-2 rounded-xl bg-white/70 p-2.5 text-[13px]"><p className="whitespace-pre-line font-semibold">{n.body}</p><p className="mt-1 font-mono text-[10.5px] text-ink/40">{n.author} · {new Date(n.created_at).toLocaleString()}</p></div>)}
          <textarea aria-label="New note" className={cn(input, 'mt-3 min-h-20')} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} />
          <button disabled={!note.trim()} onClick={() => act.mutate({ path: 'notes', body: { body: note } }, { onSuccess: () => setNote('') })} className="btn-ghost press mt-2 min-h-10 w-full text-[13px] disabled:opacity-40">Add note</button>
        </section>
        {ov.role === 'admin' && <button onClick={() => { if (window.confirm('Permanently delete this applicant’s data and files? The audit event is kept.')) del.mutate(null, { onSuccess: () => navigate('/admin/applications') }); }} className="w-full rounded-full border border-down/40 py-3 text-[13px] font-extrabold text-down">Delete applicant data</button>}
      </aside>
    </div>
  </div>;
}
