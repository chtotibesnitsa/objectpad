import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleAlert, Copy, FileText, Film, LoaderCircle, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Loading, ErrorState } from '@/components/Feedback';
import { RequestError } from '@/lib/api';
import { applyError, clearHandle, createDraft, deleteFile, getDraft, loadHandle, patchDraft, saveHandle, submitDraft, track, uploadFile, useJob, type DraftFile, type Receipt } from '@/lib/apply';
import {
  CAPACITY, compensationLabel, CREATOR_NICHES, CREATOR_PLATFORMS, EDIT_TOOLS, EMPTY_DRAFT, FIELD_MESSAGE, FILE_RULES, LOCATION_LABEL, ON_CAMERA, ON_CAMERA_LABEL, SOURCES, STEPS, TEAM_NAME, validateStep, WORK_MODE_LABEL, WORK_MODES,
  type ApplicationDraft, type FieldErrors, type FilePurpose, type PublicJob, type StepId,
} from '@/shared/apply';
import { DISCLOSURE, usePageMeta } from './Apply';
import { cn } from '@/lib/utils';

const input = 'w-full rounded-2xl border-2 border-ink/10 bg-white px-4 py-3 text-[15px] font-semibold outline-none transition focus:border-ink placeholder:text-ink/30 aria-[invalid=true]:border-down';
type Handle = { publicId: string; secret: string; reference: string };

/** /apply/:roleSlug — role detail plus the account-free, autosaving application. */
export default function ApplyRole() {
  const { roleSlug = '' } = useParams();
  const q = useJob(roleSlug);
  const job = q.data?.job;
  usePageMeta(job ? `${job.title} — ObjectPad careers` : 'ObjectPad careers', job?.summary ?? 'Apply to ObjectPad.', `/apply/${roleSlug}`, Boolean(job));
  useEffect(() => { if (job) track('role_view', job.slug); }, [job]);
  if (q.isPending) return <div className="page py-24"><Loading label="Loading role…" /></div>;
  if (q.isError) {
    if (q.error instanceof RequestError && q.error.status === 404) return <div className="page py-24"><p className="lab">404 · Role not open</p><h1 className="display mt-3 text-5xl">This role isn’t open.</h1><p className="mt-4 max-w-lg text-[15px] font-semibold text-ink/60">It may have been filled, paused or closed. See every open role instead.</p><Link to="/apply" className="btn press mt-8 inline-flex min-h-12 items-center gap-2 px-6">All open roles<ArrowRight size={16} /></Link></div>;
    return <div className="page py-24"><ErrorState message={applyError(q.error)} retry={() => void q.refetch()} /></div>;
  }
  return <div className="pb-24">
    <div className="page pt-6"><nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] font-bold text-ink/55"><Link to="/apply" className="hover:text-ink">Careers</Link><ChevronRight size={13} /><span>{TEAM_NAME[job!.team]}</span><ChevronRight size={13} /><span aria-current="page" className="text-ink">{job!.title}</span></nav></div>
    <div className="page mt-6 grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:items-start">
      <RoleDetail job={job!} />
      <div className="lg:sticky lg:top-24"><Application job={job!} privacy={q.data!.privacyContact} /></div>
    </div>
  </div>;
}

function RoleDetail({ job }: { job: PublicJob }) {
  const floor = Boolean(job.compensation.min);
  const List = ({ title, items }: { title: string; items: string[] }) => items.length ? <div className="mt-7"><h2 className="text-[17px] font-extrabold">{title}</h2><ul className="mt-3 space-y-2">{items.map(i => <li key={i} className="flex gap-2.5 text-[14.5px] font-semibold leading-relaxed text-ink/70"><Check size={16} className="mt-1 shrink-0 text-up" />{i}</li>)}</ul></div> : null;
  return <article>
    <p className="flex items-center gap-2 font-mono text-[11.5px] font-extrabold tracking-[0.12em] text-ink/50"><span className="size-2 rounded-full bg-up pulse-dot" />OPEN · {TEAM_NAME[job.team].toUpperCase()}</p>
    <h1 className="display mt-3 text-[clamp(36px,5.4vw,62px)] leading-[0.92]">{job.title}</h1>
    <p className="mt-4 text-[16.5px] font-semibold leading-relaxed text-ink/65">{job.summary}</p>
    <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[['Location', LOCATION_LABEL[job.locationMode]], ['Type', job.engagementType], ['Level', job.experience], ['Compensation', compensationLabel(job.compensation)]].map(([k, v]) => <div key={k} className="raised rounded-2xl p-3" style={k === 'Compensation' && floor ? { background: '#FFF3B0' } : undefined}><dt className="stat-label">{k}</dt><dd className="mt-1 text-[13.5px] font-extrabold leading-snug">{v}</dd></div>)}
    </dl>
    {job.kind === 'creator' && <p className="mt-3 font-mono text-[12px] font-bold text-ink/55">{job.openings}</p>}
    <p className="mt-7 text-[15px] font-semibold leading-relaxed text-ink/70">{job.description}</p>
    <List title="What you’ll do" items={job.responsibilities} />
    <List title="What we look for" items={job.qualifications} />
    <List title="Nice to have" items={job.niceToHaves} />
    <div className="mt-7"><h2 className="text-[17px] font-extrabold">Where & when</h2><p className="mt-2 text-[14.5px] font-semibold text-ink/65">{job.locations.join(' · ')}</p>{job.timezones[0] !== 'Any' && <p className="mt-1 text-[14px] font-semibold text-ink/55">Time-zone bands: {job.timezones.join(' · ')}</p>}</div>
    <p className="sunk mt-7 rounded-2xl px-4 py-3 text-[12.5px] font-bold leading-relaxed text-ink/60">{job.compensation.min ? 'This role has a funded compensation floor. ' : ''}{DISCLOSURE}</p>
  </article>;
}

const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

function Application({ job, privacy }: { job: PublicJob; privacy: string | null }) {
  const [handle, setHandle] = useState<Handle | null>(() => loadHandle(job.slug));
  const [draft, setDraft] = useState<ApplicationDraft>(EMPTY_DRAFT);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [step, setStep] = useState<number>(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState<boolean>(Boolean(handle));
  const [starting, setStarting] = useState<boolean>(false);
  const [fatal, setFatal] = useState<string>('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [honey, setHoney] = useState<string>('');
  const dirty = useRef<boolean>(false); const heading = useRef<HTMLHeadingElement>(null); const tracked = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!handle) return; let live = true;
    getDraft(handle).then(d => { if (!live) return; if (d.status !== 'draft') { clearHandle(job.slug); setHandle(null); setLoading(false); return; } setDraft({ ...EMPTY_DRAFT, ...d.draft }); setFiles(d.files); setLoading(false); })
      .catch(() => { if (!live) return; clearHandle(job.slug); setHandle(null); setLoading(false); });
    return () => { live = false; };
  }, [handle?.publicId]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    setStarting(true); setFatal('');
    try {
      const key = sessionStorage.getItem(`op-apply-key:${job.slug}`) ?? newKey(); sessionStorage.setItem(`op-apply-key:${job.slug}`, key);
      const d = await createDraft(job.slug, key); if (!d.draftSecret) { sessionStorage.setItem(`op-apply-key:${job.slug}`, newKey()); return void start(); }
      const h = { publicId: d.publicId, secret: d.draftSecret, reference: d.reference }; saveHandle(job.slug, h); setHandle(h);
      setDraft(v => ({ ...v, timezone: v.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '' }));
    } catch (e) { setFatal(applyError(e)); } finally { setStarting(false); }
  }, [job.slug]);

  // Autosave (debounced) to the server-side draft.
  useEffect(() => {
    if (!handle || !dirty.current) return; setSaved('saving');
    const t = window.setTimeout(() => { patchDraft(handle, draft).then(() => setSaved('saved')).catch(e => { setSaved('error'); if (e instanceof RequestError && e.code === 'DRAFT_NOT_FOUND') { clearHandle(job.slug); setFatal(applyError(e)); } }); }, 900);
    return () => window.clearTimeout(t);
  }, [draft, handle, job.slug]);

  const set = useCallback(<K extends keyof ApplicationDraft>(k: K, v: ApplicationDraft[K]) => { dirty.current = true; setDraft(d => ({ ...d, [k]: v })); setErrors(e => { if (!e[k as string]) return e; const n = { ...e }; delete n[k as string]; return n; }); }, []);
  const fileState = useMemo(() => ({ resume: files.some(f => f.purpose === 'resume' && f.scanStatus === 'clean'), sample: files.some(f => f.purpose === 'sample' && f.scanStatus === 'clean') }), [files]);
  const stepId: StepId = STEPS[step].id;
  const focusFirst = (e: FieldErrors) => { const k = Object.keys(e)[0]; if (!k) return; window.setTimeout(() => document.getElementById(`f-${k.replace('.', '-')}`)?.focus(), 30); };
  const next = async () => {
    const e = validateStep(stepId, draft, job.form, fileState); setErrors(e);
    if (Object.keys(e).length) { track('validation_error', `${stepId}`); focusFirst(e); return; }
    if (handle) await patchDraft(handle, draft).catch(() => undefined);
    const id = `step_${stepId}` as const; if (!tracked.current.has(id)) { tracked.current.add(id); track(id, job.slug); }
    setStep(s => Math.min(STEPS.length - 1, s + 1)); window.setTimeout(() => heading.current?.focus(), 40);
  };
  const back = () => { setStep(s => Math.max(0, s - 1)); window.setTimeout(() => heading.current?.focus(), 40); };
  const submit = async () => {
    if (!handle || submitting) return; const e = validateStep('all', draft, job.form, fileState); setErrors(e);
    if (Object.keys(e).length) { const first = Object.keys(e)[0]; const target = ['preferredName', 'email', 'country', 'timezone', 'workMode', 'availability'].includes(first) ? 0 : first.startsWith('links') || ['summary', 'resume', 'source'].includes(first) ? 1 : first === 'consent' || first === 'privacyAck' ? 3 : 2; setStep(target); focusFirst(e); return; }
    setSubmitting(true); setFatal('');
    try {
      await patchDraft(handle, draft);
      const out = await submitDraft(handle, honey);
      if (!out.ok) { setErrors(out.errors); setFatal('Some answers need attention.'); return; }
      clearHandle(job.slug); sessionStorage.removeItem(`op-apply-key:${job.slug}`); setReceipt(out.receipt); track('application_submit', job.slug);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setFatal(applyError(err)); } finally { setSubmitting(false); }
  };

  if (receipt) return <ReceiptCard receipt={receipt} privacy={privacy} />;
  return <section aria-labelledby="apply-h" className="raised rounded-[30px] p-5 sm:p-7">
    <div className="flex items-center justify-between gap-3"><p className="lab">Apply · no account or wallet needed</p>{handle && <span className="font-mono text-[11px] font-bold text-ink/45" aria-live="polite">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : saved === 'error' ? 'Not saved — retrying' : handle.reference}</span>}</div>
    <h2 id="apply-h" ref={heading} tabIndex={-1} className="mt-2 text-[26px] font-extrabold tracking-[-0.03em] outline-none">{handle ? STEPS[step].label : `Apply for ${job.title}`}</h2>
    {!handle ? <div className="mt-4">
      <p className="text-[14.5px] font-semibold leading-relaxed text-ink/60">About 6–8 minutes. Your progress saves automatically and you can come back on this device. We only ask what we need to evaluate your work.</p>
      <ul className="mt-4 space-y-1.5 text-[13.5px] font-semibold text-ink/60">{['No purchase, wallet or token holding required', 'No date of birth, photo or financial details', job.form.requireResume ? 'Résumé required for this role' : 'Résumé optional — links to your work matter more'].map(t => <li key={t} className="flex items-center gap-2"><ShieldCheck size={15} className="text-up" />{t}</li>)}</ul>
      {fatal && <p role="alert" className="mt-4 rounded-2xl bg-down/10 px-4 py-3 text-[14px] font-bold text-down">{fatal}</p>}
      <button onClick={() => void start()} disabled={starting || loading} className="btn press mt-6 inline-flex min-h-[54px] w-full items-center justify-center gap-2 text-[15.5px] disabled:opacity-60">{starting || loading ? <LoaderCircle size={18} className="animate-spin" /> : null}Start application<ArrowRight size={17} /></button>
    </div> : <>
      <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Progress">{STEPS.map((s, i) => <li key={s.id} aria-current={i === step ? 'step' : undefined}><span className={cn('block h-1.5 rounded-full transition-colors', i <= step ? 'bg-ink' : 'bg-ink/10')} /><span className={cn('mt-1.5 hidden text-[11.5px] font-extrabold sm:block', i === step ? 'text-ink' : 'text-ink/40')}>{s.label}</span></li>)}</ol>
      <p className="sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step].label}</p>
      <form className="mt-6 space-y-5" onSubmit={e => { e.preventDefault(); if (step < 3) void next(); else void submit(); }} noValidate>
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={honey} onChange={e => setHoney(e.target.value)} /></label></div>
        {stepId === 'about' && <AboutStep d={draft} set={set} e={errors} />}
        {stepId === 'links' && <LinksStep d={draft} set={set} e={errors} job={job} handle={handle} files={files} setFiles={setFiles} />}
        {stepId === 'role' && <RoleStep d={draft} set={set} e={errors} job={job} handle={handle} files={files} setFiles={setFiles} />}
        {stepId === 'review' && <ReviewStep d={draft} set={set} e={errors} job={job} files={files} goTo={setStep} privacy={privacy} />}
        {fatal && <p role="alert" className="rounded-2xl bg-down/10 px-4 py-3 text-[14px] font-bold text-down">{fatal}</p>}
        <div className="flex gap-2 pt-2">
          {step > 0 && <button type="button" onClick={back} className="btn-ghost press inline-flex min-h-[52px] items-center gap-2 px-5 text-[15px]"><ArrowLeft size={16} />Back</button>}
          <button type="submit" disabled={submitting} className="btn press inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 text-[15px] disabled:opacity-60">{submitting && <LoaderCircle size={18} className="animate-spin" />}{step < 3 ? <>Continue<ArrowRight size={16} /></> : submitting ? 'Submitting…' : 'Submit application'}</button>
        </div>
      </form>
    </>}
  </section>;
}

type StepProps = { d: ApplicationDraft; set: <K extends keyof ApplicationDraft>(k: K, v: ApplicationDraft[K]) => void; e: FieldErrors };
function F({ id, label, hint, error, children, optional }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode; optional?: boolean }) {
  return <div><label htmlFor={`f-${id}`} className="flex items-baseline justify-between gap-2 text-[14px] font-extrabold">{label}{optional && <span className="text-[12px] font-bold text-ink/40">Optional</span>}</label>{hint && <p id={`h-${id}`} className="mt-0.5 text-[12.5px] font-semibold text-ink/50">{hint}</p>}<div className="mt-1.5">{children}</div>{error && <p id={`e-${id}`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold text-down"><CircleAlert size={14} />{FIELD_MESSAGE[error] ?? error}</p>}</div>;
}
const aria = (id: string, e?: string, hint?: boolean) => ({ id: `f-${id}`, 'aria-invalid': e ? true : undefined, 'aria-describedby': [hint ? `h-${id}` : '', e ? `e-${id}` : ''].filter(Boolean).join(' ') || undefined });
function Chips({ id, options, value, onChange, labels, error, single }: { id: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void; labels?: Record<string, string>; error?: string; single?: boolean }) {
  return <div id={`f-${id}`} tabIndex={-1} role="group" aria-invalid={error ? true : undefined} className="flex flex-wrap gap-1.5 outline-none">{options.map(o => { const on = value.includes(o); return <button key={o} type="button" aria-pressed={on} onClick={() => onChange(single ? [o] : on ? value.filter(v => v !== o) : [...value, o].slice(0, 12))} className={cn('press min-h-11 rounded-full px-4 text-[13.5px] font-extrabold transition-colors', on ? 'bg-ink text-white' : 'sunk text-ink/70')}>{on && !single && <Check size={13} className="-ml-1 mr-1 inline" />}{labels?.[o] ?? o}</button>; })}</div>;
}

function AboutStep({ d, set, e }: StepProps) {
  return <>
    <F id="preferredName" label="Preferred name" error={e.preferredName}><input {...aria('preferredName', e.preferredName)} className={input} autoComplete="given-name" value={d.preferredName} onChange={x => set('preferredName', x.target.value)} maxLength={80} /></F>
    <F id="email" label="Email" hint="Your receipt and private status link go here." error={e.email}><input {...aria('email', e.email, true)} className={input} type="email" inputMode="email" autoComplete="email" value={d.email} onChange={x => set('email', x.target.value)} maxLength={254} /></F>
    <div className="grid gap-5 sm:grid-cols-2">
      <F id="country" label="Country / region" error={e.country}><input {...aria('country', e.country)} className={input} autoComplete="country-name" value={d.country} onChange={x => set('country', x.target.value)} maxLength={60} /></F>
      <F id="timezone" label="Time zone" error={e.timezone}><input {...aria('timezone', e.timezone)} className={input} placeholder="e.g. Europe/Berlin" value={d.timezone} onChange={x => set('timezone', x.target.value)} maxLength={64} /></F>
    </div>
    <F id="workMode" label="Where would you work?" error={e.workMode}><Chips id="workMode" single options={WORK_MODES} labels={WORK_MODE_LABEL} value={d.workMode ? [d.workMode] : []} onChange={v => set('workMode', (v[0] ?? '') as ApplicationDraft['workMode'])} error={e.workMode} /></F>
    <div className="grid gap-5 sm:grid-cols-2">
      <F id="availability" label="Availability" hint="Full-time, part-time, hours/week…" error={e.availability}><input {...aria('availability', e.availability, true)} className={input} value={d.availability} onChange={x => set('availability', x.target.value)} maxLength={120} /></F>
      <F id="startDate" label="Earliest start" optional><input {...aria('startDate')} className={input} placeholder="e.g. Immediately, 2 weeks" value={d.startDate} onChange={x => set('startDate', x.target.value)} maxLength={40} /></F>
    </div>
  </>;
}

type FileProps = { job: PublicJob; handle: Handle; files: DraftFile[]; setFiles: React.Dispatch<React.SetStateAction<DraftFile[]>> };
function LinksStep({ d, set, e, job, handle, files, setFiles }: StepProps & FileProps) {
  const link = (k: keyof ApplicationDraft['links'], label: string, placeholder: string) => <F id={`links-${k}`} label={label} optional error={e[`links.${k}`]}><input {...aria(`links-${k}`, e[`links.${k}`])} className={input} inputMode="url" placeholder={placeholder} value={d.links[k] ?? ''} onChange={x => set('links', { ...d.links, [k]: x.target.value })} maxLength={500} /></F>;
  const tech = job.kind === 'technical';
  return <>
    {link('portfolio', 'Portfolio or personal site', 'https://')}
    <div className="grid gap-5 sm:grid-cols-2">
      {tech ? <>{link('github', 'GitHub', 'https://github.com/you')}{link('linkedin', 'LinkedIn', 'https://linkedin.com/in/you')}</> : <>{link('tiktok', 'TikTok', 'https://tiktok.com/@you')}{link('instagram', 'Instagram', 'https://instagram.com/you')}</>}
      {link('x', 'X', 'https://x.com/you')}
      {tech ? link('youtube', 'YouTube', 'https://youtube.com/@you') : link('youtube', 'YouTube', 'https://youtube.com/@you')}
      {!tech && link('linkedin', 'LinkedIn', 'https://linkedin.com/in/you')}
    </div>
    <F id="summary" label="Experience summary" hint="A few sentences about what you’ve built or made." error={e.summary}><textarea {...aria('summary', e.summary, true)} className={cn(input, 'min-h-32')} value={d.summary} onChange={x => set('summary', x.target.value)} maxLength={1200} /><Counter v={d.summary} max={1200} /></F>
    <FileField purpose="resume" label={job.form.requireResume ? 'Résumé' : 'Résumé (optional)'} icon={FileText} handle={handle} files={files} setFiles={setFiles} error={e.resume} />
    <F id="source" label="How did you hear about ObjectPad?" error={e.source}><select {...aria('source', e.source)} className={input} value={d.source} onChange={x => set('source', x.target.value)}><option value="">Choose one</option>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></F>
  </>;
}
const Counter = ({ v, max }: { v: string; max: number }) => <p className="mt-1 text-right font-mono text-[11px] font-bold text-ink/35">{v.length}/{max}</p>;

function RoleStep({ d, set, e, job, handle, files, setFiles }: StepProps & FileProps) {
  if (job.kind === 'technical') return <>
    <F id="shippedLinks-0" label="Shipped product links" hint="Live products, repos or case studies (up to 3)." optional error={e['shippedLinks.0']}>{[0, 1, 2].map(i => <input key={i} id={i === 0 ? 'f-shippedLinks-0' : undefined} className={cn(input, i && 'mt-2')} inputMode="url" placeholder="https://" value={d.shippedLinks[i] ?? ''} onChange={x => { const v = [...d.shippedLinks]; v[i] = x.target.value; set('shippedLinks', v); }} maxLength={500} />)}</F>
    <F id="experienceYears" label="Relevant experience" error={e.experienceYears}><Chips id="experienceYears" single options={['<2 years', '2–4 years', '5–7 years', '8+ years']} value={d.experienceYears ? [d.experienceYears] : []} onChange={v => set('experienceYears', v[0] ?? '')} error={e.experienceYears} /></F>
    {job.form.skills.length > 0 && <F id="skills" label="Stack & skills" hint="Pick the ones you’ve used in production." error={e.skills}><Chips id="skills" options={job.form.skills} value={d.skills} onChange={v => set('skills', v)} error={e.skills} /></F>}
    <F id="hardProblem" label="A hard production problem you solved" hint="What broke, how you found it, what you changed." error={e.hardProblem}><textarea {...aria('hardProblem', e.hardProblem, true)} className={cn(input, 'min-h-32')} value={d.hardProblem} onChange={x => set('hardProblem', x.target.value)} maxLength={1500} /><Counter v={d.hardProblem} max={1500} /></F>
    <F id="scenario" label="Scenario" hint="A launch transaction is broadcast, but the RPC times out before a receipt. The user retries. How do you make sure the coin launches exactly once?" error={e.scenario}><textarea {...aria('scenario', e.scenario, true)} className={cn(input, 'min-h-28')} value={d.scenario} onChange={x => set('scenario', x.target.value)} maxLength={1500} /><Counter v={d.scenario} max={1500} /></F>
    {job.form.lead && <F id="leadership" label="Leadership / ownership example" error={e.leadership}><textarea {...aria('leadership', e.leadership)} className={cn(input, 'min-h-28')} value={d.leadership} onChange={x => set('leadership', x.target.value)} maxLength={1500} /></F>}
    <F id="compExpectation" label="Compensation expectations" hint="Optional. It never affects whether your application is read." optional><input {...aria('compExpectation', undefined, true)} className={input} value={d.compExpectation} onChange={x => set('compExpectation', x.target.value)} maxLength={160} /></F>
  </>;
  return <>
    <F id="platforms" label="Primary platforms" error={e.platforms}><Chips id="platforms" options={CREATOR_PLATFORMS} value={d.platforms} onChange={v => set('platforms', v)} error={e.platforms} /></F>
    <F id="handles" label="Handles" hint="e.g. @you on TikTok, @you on Instagram" optional><input {...aria('handles', undefined, true)} className={input} value={d.handles} onChange={x => set('handles', x.target.value)} maxLength={300} /></F>
    <F id="niches" label="Content categories" error={e.niches}><Chips id="niches" options={CREATOR_NICHES} value={d.niches} onChange={v => set('niches', v)} error={e.niches} /></F>
    <F id="examples-0" label="Your three strongest videos" hint="Links to TikToks, Reels, Shorts or a portfolio." error={e['examples.0']}>{[0, 1, 2].map(i => <input key={i} id={`f-examples-${i}`} aria-invalid={e[`examples.${i}`] ? true : undefined} className={cn(input, i && 'mt-2')} inputMode="url" placeholder={`https:// (video ${i + 1})`} value={d.examples[i] ?? ''} onChange={x => { const v = [...d.examples]; v[i] = x.target.value; set('examples', v); }} maxLength={500} />)}</F>
    <FileField purpose="sample" label="Or upload one short sample (optional)" icon={Film} handle={handle} files={files} setFiles={setFiles} />
    <F id="tools" label="Editing tools" error={e.tools}><Chips id="tools" options={EDIT_TOOLS} value={d.tools} onChange={v => set('tools', v)} error={e.tools} /></F>
    <F id="onCamera" label="On-camera comfort" error={e.onCamera}><Chips id="onCamera" single options={ON_CAMERA} labels={ON_CAMERA_LABEL} value={d.onCamera ? [d.onCamera] : []} onChange={v => set('onCamera', v[0] ?? '')} error={e.onCamera} /></F>
    <div className="grid gap-5 sm:grid-cols-2">
      <F id="languages" label="Languages you create in" error={e.languages}><input {...aria('languages', e.languages)} className={input} placeholder="English, Spanish…" value={d.languages} onChange={x => set('languages', x.target.value)} maxLength={120} /></F>
      <F id="weeklyCapacity" label="Videos per week" error={e.weeklyCapacity}><Chips id="weeklyCapacity" single options={CAPACITY} value={d.weeklyCapacity ? [d.weeklyCapacity] : []} onChange={v => set('weeklyCapacity', v[0] ?? '')} error={e.weeklyCapacity} /></F>
    </div>
    {job.kind === 'producer' && <F id="leadership" label="A creator program you ran" hint="Briefs, calendars, approvals, results." error={e.leadership}><textarea {...aria('leadership', e.leadership, true)} className={cn(input, 'min-h-28')} value={d.leadership} onChange={x => set('leadership', x.target.value)} maxLength={1500} /></F>}
    <F id="pitch" label="Your 20-second pitch" hint="In 3–5 sentences, pitch a 20-second video that makes “photograph an object and launch it for free” understandable to someone outside crypto." error={e.pitch}><textarea {...aria('pitch', e.pitch, true)} className={cn(input, 'min-h-32')} value={d.pitch} onChange={x => set('pitch', x.target.value)} maxLength={900} /><Counter v={d.pitch} max={900} /></F>
  </>;
}

function FileField({ purpose, label, icon: Icon, handle, files, setFiles, error }: { purpose: FilePurpose; label: string; icon: typeof FileText; error?: string } & Omit<FileProps, 'job'>) {
  const current = files.find(f => f.purpose === purpose); const [pct, setPct] = useState<number | null>(null); const [err, setErr] = useState<string>(''); const [last, setLast] = useState<File | null>(null); const ref = useRef<HTMLInputElement>(null);
  const rule = FILE_RULES[purpose];
  const send = async (file: File) => {
    setErr(''); setLast(file);
    if (!rule.mimes.includes(file.type) || file.size > rule.max) { setErr(`Use ${rule.label}.`); track('upload_error', purpose); return; }
    setPct(0);
    try { const f = await uploadFile(handle, purpose, file, setPct); setFiles(list => [...list.filter(x => x.purpose !== purpose), f]); track('upload_ok', purpose); setLast(null); }
    catch (e) { setErr(applyError(e)); track('upload_error', purpose); } finally { setPct(null); }
  };
  const remove = async () => { if (!current) return; await deleteFile(handle, current.id).catch(() => undefined); setFiles(list => list.filter(x => x.id !== current.id)); };
  return <div>
    <p className="text-[14px] font-extrabold">{label}</p><p className="mt-0.5 text-[12.5px] font-semibold text-ink/50">{rule.label}. Stored privately and checked before a reviewer can open it.</p>
    {current && current.scanStatus === 'clean' ? <div className="sunk mt-2 flex items-center gap-3 rounded-2xl px-4 py-3"><Icon size={18} /><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-extrabold">{current.filename}</span><span className="block font-mono text-[11px] font-bold text-up">{(current.size / 1_048_576).toFixed(1)} MB · checked · private</span></span><button type="button" onClick={() => void remove()} aria-label={`Remove ${current.filename}`} className="press flex size-11 items-center justify-center rounded-full hover:bg-white"><Trash2 size={16} /></button></div>
      : <button id={`f-${purpose}`} type="button" onClick={() => ref.current?.click()} disabled={pct !== null} aria-invalid={error ? true : undefined} className={cn('press mt-2 flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-[14px] font-extrabold', error ? 'border-down text-down' : 'border-ink/15 text-ink/60 hover:border-ink/40')}>{pct !== null ? <><LoaderCircle size={16} className="animate-spin" />Uploading privately… {pct}%</> : <><Upload size={16} />Choose file</>}</button>}
    {pct !== null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><div className="h-full bg-ink transition-[width]" style={{ width: `${pct}%` }} /></div>}
    {(err || error) && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold text-down"><CircleAlert size={14} />{err || FIELD_MESSAGE[error!]}{last && err && <button type="button" onClick={() => void send(last)} className="ml-2 inline-flex items-center gap-1 underline"><RefreshCw size={12} />Retry</button>}</p>}
    <input ref={ref} type="file" className="sr-only" tabIndex={-1} accept={rule.mimes.join(',')} onChange={x => { const f = x.target.files?.[0]; x.target.value = ''; if (f) void send(f); }} />
  </div>;
}

function ReviewStep({ d, set, e, job, files, goTo, privacy }: StepProps & { job: PublicJob; files: DraftFile[]; goTo: (n: number) => void; privacy: string | null }) {
  const links = Object.entries(d.links).filter(([, v]) => v);
  const rows: [string, string, number][] = [['Name', d.preferredName, 0], ['Email', d.email, 0], ['Location', `${d.country} · ${d.timezone} · ${d.workMode ? WORK_MODE_LABEL[d.workMode] : ''}`, 0], ['Availability', [d.availability, d.startDate].filter(Boolean).join(' · '), 0], ['Links', links.map(([k]) => k).join(', ') || '—', 1], ['Files', files.filter(f => f.scanStatus === 'clean').map(f => f.filename).join(', ') || 'None', 1], ['Summary', d.summary, 1]];
  if (job.kind === 'technical') rows.push(['Experience', `${d.experienceYears} · ${d.skills.join(', ')}`, 2], ['Hard problem', d.hardProblem, 2]); else rows.push(['Platforms', d.platforms.join(', '), 2], ['Examples', `${d.examples.filter(Boolean).length} link(s)`, 2], ['Pitch', d.pitch, 2]);
  return <>
    <dl className="divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/10">{rows.map(([k, v, s]) => <div key={k} className="flex gap-3 px-4 py-3"><dt className="w-28 shrink-0 text-[12.5px] font-extrabold text-ink/50">{k}</dt><dd className="min-w-0 flex-1 whitespace-pre-line break-words text-[14px] font-semibold line-clamp-4">{v || '—'}</dd><button type="button" onClick={() => goTo(s)} className="shrink-0 text-[12.5px] font-extrabold underline">Edit</button></div>)}</dl>
    <label className="flex gap-3 rounded-2xl p-1"><input id="f-consent" type="checkbox" className="mt-1 size-5 shrink-0 accent-ink" checked={d.consent} onChange={x => set('consent', x.target.checked)} aria-invalid={e.consent ? true : undefined} /><span className="text-[14px] font-semibold leading-relaxed">I agree that ObjectPad may process this application to evaluate me for roles. Only authorised hiring staff can read it.</span></label>
    <label className="flex gap-3 rounded-2xl p-1"><input id="f-privacyAck" type="checkbox" className="mt-1 size-5 shrink-0 accent-ink" checked={d.privacyAck} onChange={x => set('privacyAck', x.target.checked)} aria-invalid={e.privacyAck ? true : undefined} /><span className="text-[14px] font-semibold leading-relaxed">I’ve read how my data is handled: stored privately, kept for up to 12 months unless I withdraw, deletable on request{privacy ? ` (${privacy})` : ''}. I understand applying never requires buying or holding a token.</span></label>
    {(e.consent || e.privacyAck) && <p role="alert" className="text-[13px] font-bold text-down">Both confirmations are required to submit.</p>}
  </>;
}

function ReceiptCard({ receipt, privacy }: { receipt: Receipt; privacy: string | null }) {
  const [copied, setCopied] = useState<boolean>(false); const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const statusPath = `/apply/status#t=${receipt.statusToken}`;
  return <section className="raised rounded-[30px] p-6 sm:p-8" aria-labelledby="receipt-h">
    <span className="flex size-14 items-center justify-center rounded-2xl bg-up text-white"><Check size={26} /></span>
    <h2 id="receipt-h" ref={ref} tabIndex={-1} className="mt-5 text-[28px] font-extrabold tracking-[-0.03em] outline-none">Application received.</h2>
    <p className="mt-2 text-[15px] font-semibold text-ink/60">It’s stored securely. A person on the hiring team will review it.</p>
    <dl className="mt-6 grid gap-2 sm:grid-cols-3">
      <div className="sunk rounded-2xl p-3"><dt className="stat-label">Reference</dt><dd className="mt-1 font-mono text-[15px] font-extrabold">{receipt.reference}</dd></div>
      <div className="sunk rounded-2xl p-3"><dt className="stat-label">Role</dt><dd className="mt-1 text-[14px] font-extrabold">{receipt.role}</dd></div>
      <div className="sunk rounded-2xl p-3"><dt className="stat-label">Submitted</dt><dd className="mt-1 text-[14px] font-extrabold">{receipt.submittedAt ? new Date(receipt.submittedAt).toLocaleString() : '—'}</dd></div>
    </dl>
    <h3 className="mt-7 text-[16px] font-extrabold">What happens next</h3>
    <ol className="mt-2 space-y-1.5 text-[14px] font-semibold text-ink/65"><li>1. We email you a receipt with your private status link.</li><li>2. A reviewer reads your application and work.</li><li>3. If there’s a fit, we contact you by email to set up a conversation.</li></ol>
    <p className="mt-4 rounded-2xl bg-[#FFF6D6] px-4 py-3 text-[13px] font-bold text-[#6B5200]">Save this page’s status link — it’s the private way to check or withdraw your application. It’s also in your receipt email.</p>
    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
      <Link to={statusPath} className="btn press inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 px-6 text-[15px]">Check application status<ArrowRight size={16} /></Link>
      <button onClick={() => { void navigator.clipboard?.writeText(receipt.statusUrl).then(() => setCopied(true)); }} className="btn-ghost press inline-flex min-h-[52px] items-center justify-center gap-2 px-5 text-[14.5px]"><Copy size={15} />{copied ? 'Copied' : 'Copy status link'}</button>
    </div>
    <p className="mt-4 text-[13px] font-semibold text-ink/55">Changed your mind? <Link to={statusPath} className="font-extrabold underline">Withdraw application</Link>. {privacy ? <>Privacy questions: <a className="font-extrabold underline" href={`mailto:${privacy}`}>{privacy}</a>.</> : null} <Link to="/apply" className="font-extrabold underline">See other roles</Link>.</p>
  </section>;
}
