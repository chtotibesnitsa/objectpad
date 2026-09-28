import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, BadgeCheck, Box, Camera, Check, ChevronDown, FileText, Fingerprint, Link2, Pause, Rocket, Send, ShieldCheck, Upload, Users, X as XIcon, Zap } from 'lucide-react';
import { Loading, ErrorState } from '@/components/Feedback';
import { Reveal } from '@/components/Reveal';
import { Field, inputCls, Notice } from '@/components/people/PeopleUi';
import { api } from '@/lib/api';
import { ENGAGEMENT_LABEL, hiringError, isPlaceholder, REMOTE_LABEL, TEAM_LABEL, useHiring, type HiringFaq, type HiringRole, type HiringTeam } from '@/lib/hiring';
import { cn } from '@/lib/utils';

const HERO_VIDEO = '/media/recruiting/hiring-hero-web.mp4';
const HERO_POSTER = '/media/recruiting/hiring-hero-poster.jpg';
const CLOSING_CARD = '/media/recruiting/closing-card-16x9.jpg';
const RESUME_MAX = 5 * 1024 * 1024;

/** Keeps a hidden page out of search indexes, even when opened directly. */
function useRobots(index: boolean): void {
  useEffect(() => {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="robots"]'); const created = !tag;
    if (!tag) { tag = document.createElement('meta'); tag.name = 'robots'; document.head.appendChild(tag); }
    const previous = tag.content; tag.content = index ? 'index,follow' : 'noindex,nofollow';
    return () => { if (created) tag?.remove(); else if (tag) tag.content = previous; };
  }, [index]);
}

/** Highlights editable "[TBD …]" placeholders in the operator preview. */
function T({ children }: { children: string }) {
  return isPlaceholder(children) ? <mark className="rounded bg-[#FFE27A] px-1 text-ink">{children}</mark> : <>{children}</>;
}

/** /hiring — public only while HIRING_PAGE_ENABLED is on; signed-in operators see a labelled preview. */
export default function Hiring() {
  const query = useHiring();
  const data = query.data;
  const visible = Boolean(data && (data.enabled || ('preview' in data && data.preview)));
  useRobots(data?.enabled === true);
  useEffect(() => { document.title = data?.enabled ? 'ObjectPad — Now Recruiting' : 'ObjectPad'; }, [data?.enabled]);
  const [roleId, setRoleId] = useState<string>('general');
  const formRef = useRef<HTMLDivElement>(null);
  const applyFor = (id: string) => { setRoleId(id); formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  if (query.isPending) return <div className="page py-24"><Loading label="Loading…"/></div>;
  if (query.isError) return <div className="page py-24"><ErrorState message="This page could not be loaded." retry={() => void query.refetch()}/></div>;
  if (!visible || !data || !('faq' in data)) return <div className="page py-24"><h1 className="display text-5xl">Nothing here.</h1><p className="mt-4 text-muted">This page doesn’t exist.</p><Link to="/" className="btn press mt-8 inline-flex min-h-12 px-6">Back to ObjectPad</Link></div>;

  const openRoles = data.roles.filter(r => r.status === 'open');
  return <div className="pb-24">
    {data.preview && <div className="sticky top-0 z-40 border-b border-[#E0B000]/40 bg-[#FFF6D6] px-4 py-2.5 text-center text-[13px] font-extrabold text-[#6B5200]">Operator preview · this page is hidden from the public, navigation and search until every readiness check passes. <Link to="/hiring/admin" className="underline">Open hiring admin</Link></div>}
    <Hero preview={data.preview} openCount={openRoles.length} onGeneral={() => applyFor('general')}/>
    <ProductProof/>
    <Roles roles={data.roles} onApply={applyFor}/>
    <WorkingStyle/>
    <div ref={formRef} id="apply" className="scroll-mt-24"><ApplicationForm roles={openRoles} roleId={roleId} setRoleId={setRoleId} canSubmit={data.enabled}/></div>
    <Faq items={data.faq} privacyContact={data.privacyContact}/>
    <Closing onGeneral={() => applyFor('general')}/>
  </div>;
}

function Hero({ preview, openCount, onGeneral }: { preview: boolean; openCount: number; onGeneral: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [reduced] = useState<boolean>(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { if (reduced) video.current?.pause(); }, [reduced]);
  return <section className="relative overflow-hidden">
    <div aria-hidden="true" className="grid-paper absolute inset-0 [mask-image:linear-gradient(180deg,#000,transparent_85%)]"/>
    <div className="page relative grid items-center gap-10 pt-10 sm:pt-16 lg:grid-cols-[1fr_1.12fr] lg:gap-14">
      <div className="enter">
        <p className="lab">OBJECTPAD · TEAM</p>
        <h1 className="display mt-4 text-[clamp(46px,7.4vw,92px)] leading-[0.9] tracking-[-0.045em]">Build the physical world onchain.</h1>
        <p className="mt-6 max-w-[34rem] text-[17px] font-semibold leading-relaxed text-ink/65">ObjectPad turns a real object into a verified 3D record and a coin, straight from a phone camera. We’re looking for engineers, designers and storytellers who want to build that bridge in public.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#roles" className="btn press inline-flex min-h-[52px] items-center gap-2 px-7 text-[15px]">View open roles<ArrowRight size={17}/></a>
          <button onClick={onGeneral} className="btn-ghost press inline-flex min-h-[52px] items-center gap-2 px-6 text-[15px]"><Send size={16}/>Send a general application</button>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] font-semibold text-ink/55">
          <span className="flex items-center gap-1.5"><span className={cn('size-2 rounded-full', openCount ? 'bg-up pulse-dot' : 'bg-ink/25')}/>{openCount} open {openCount === 1 ? 'role' : 'roles'}{preview && ' (preview)'}</span>
          <span>Engineering · Mobile · Design · Growth</span>
        </div>
      </div>
      <div className="enter [--delay:120ms]">
        <div className="raised relative overflow-hidden rounded-[30px] p-1.5">
          <div className="relative aspect-video overflow-hidden rounded-[24px] bg-[#2F7BF2]">
            <video ref={video} src={HERO_VIDEO} poster={HERO_POSTER} autoPlay={!reduced} muted loop playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" aria-label="ObjectPad recruiting film: four glass workstations above the clouds for engineering, mobile, design and growth. A phone captures a backpack from six angles and it rebuilds as a 3D model."/>
          </div>
        </div>
        <p className="mt-3 px-2 font-mono text-[11.5px] font-semibold text-ink/45">Campaign film · 12 s · captures synced to a desktop, rebuilt in 3D</p>
      </div>
    </div>
  </section>;
}

const PIPELINE: { icon: typeof Camera; title: string; body: string; meta: string }[] = [
  { icon: Camera, title: 'Phone capture', body: 'Six guided angles of one real object, checked for blur, framing and duplicates.', meta: '6 views · validated' },
  { icon: Box, title: '3D reconstruction', body: 'The photos rebuild into a textured 3D model you can spin in the browser.', meta: 'GLB · in-browser viewer' },
  { icon: Fingerprint, title: 'Object fingerprint', body: 'Hashes and a uniqueness check tie one object to one record, so a scan can’t be reused.', meta: 'SHA-256 · uniqueness v2' },
  { icon: Rocket, title: 'Onchain coin', body: 'The sealed record launches as a coin anyone can verify from the proof.', meta: 'Public proof · verifiable' },
];
function ProductProof() {
  return <section className="page mt-24">
    <Reveal><p className="lab">Live product</p><h2 className="display mt-3 max-w-3xl text-[clamp(34px,5vw,58px)] leading-[0.95]">This already works. Come make it great.</h2></Reveal>
    <div className="relative mt-10 grid gap-3 md:grid-cols-4">
      <div aria-hidden="true" className="absolute left-[12%] right-[12%] top-[46px] hidden h-px bg-[repeating-linear-gradient(90deg,rgba(12,13,16,.25)_0_6px,transparent_6px_12px)] md:block"/>
      {PIPELINE.map((s, i) => <Reveal key={s.title} delay={i * 90}><div className="raised relative h-full rounded-[26px] p-5">
        <div className="flex items-center justify-between"><span className="flex size-12 items-center justify-center rounded-2xl bg-ink text-white"><s.icon size={21}/></span><span className="font-mono text-[11px] font-extrabold text-ink/35">0{i + 1}</span></div>
        <h3 className="mt-5 text-[18px] font-extrabold tracking-[-0.02em]">{s.title}</h3>
        <p className="mt-2 text-[14px] font-semibold leading-relaxed text-ink/60">{s.body}</p>
        <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] font-bold text-up"><BadgeCheck size={13}/>{s.meta}</p>
      </div></Reveal>)}
    </div>
    <div className="mt-5 flex flex-wrap gap-2">
      <Link to="/launch" className="btn-ghost press inline-flex min-h-11 items-center gap-2 px-5 text-[14px]"><Camera size={15}/>Try the live flow</Link>
      <Link to="/verify" className="btn-ghost press inline-flex min-h-11 items-center gap-2 px-5 text-[14px]"><ShieldCheck size={15}/>Verify a coin</Link>
      <Link to="/whitepaper" className="btn-ghost press inline-flex min-h-11 items-center gap-2 px-5 text-[14px]"><FileText size={15}/>Read the white paper</Link>
    </div>
  </section>;
}

function RoleCard({ role, onApply }: { role: HiringRole; onApply: (id: string) => void }) {
  const [open, setOpen] = useState<boolean>(false);
  const status = role.status === 'open' ? { label: 'Open', cls: 'bg-up/10 text-up' } : role.status === 'paused' ? { label: 'Paused', cls: 'bg-[#F5C400]/20 text-[#7A5E00]' } : { label: 'Draft · preview', cls: 'bg-ink/[0.06] text-ink/55' };
  return <article className="raised flex h-full flex-col rounded-[26px] p-5 sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <p className="font-mono text-[11px] font-extrabold uppercase tracking-wider text-ink/45">{TEAM_LABEL[role.team]}</p>
      <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-[10.5px] font-extrabold uppercase', status.cls)}>{role.status === 'open' && <span className="size-1.5 rounded-full bg-up"/>}{status.label}</span>
    </div>
    <h3 className="mt-2 text-[22px] font-extrabold leading-tight tracking-[-0.025em]"><T>{role.title}</T></h3>
    <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[11.5px] font-bold text-ink/60">
      <span className="sunk rounded-full px-2.5 py-1"><T>{role.location}</T></span>
      <span className={cn('sunk rounded-full px-2.5 py-1', role.remotePolicy === 'tbd' && 'bg-[#FFE27A]')}>{REMOTE_LABEL[role.remotePolicy]}</span>
      <span className={cn('sunk rounded-full px-2.5 py-1', role.engagementType === 'tbd' && 'bg-[#FFE27A]')}>{ENGAGEMENT_LABEL[role.engagementType]}</span>
    </div>
    <p className="mt-4 text-[14.5px] font-semibold leading-relaxed text-ink/65"><T>{role.summary}</T></p>
    <div className="mt-4"><p className="stat-label">Required</p><ul className="mt-2 grid gap-1.5">{role.requiredSkills.map(s => <li key={s} className="flex items-start gap-2 text-[13.5px] font-bold"><Check size={14} className="mt-[3px] shrink-0 text-up"/><T>{s}</T></li>)}</ul></div>
    {open && <div className="mt-4 grid gap-4 border-t border-ink/[0.07] pt-4">
      <div><p className="stat-label">You’ll own</p><ul className="mt-2 grid gap-1.5">{role.responsibilities.map(s => <li key={s} className="flex items-start gap-2 text-[13.5px] font-semibold text-ink/70"><span className="mt-[8px] size-1.5 shrink-0 rounded-full bg-ink/40"/><T>{s}</T></li>)}</ul></div>
      {role.preferredSkills.length > 0 && <div><p className="stat-label">Nice to have</p><div className="mt-2 flex flex-wrap gap-1.5">{role.preferredSkills.map(s => <span key={s} className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[12.5px] font-bold text-ink/65"><T>{s}</T></span>)}</div></div>}
    </div>}
    <div className="mt-auto flex flex-wrap gap-2 pt-5">
      <button onClick={() => onApply(role.id)} disabled={role.status !== 'open'} className="btn press inline-flex min-h-11 flex-1 items-center justify-center gap-2 px-5 text-[14px] disabled:opacity-50">{role.status === 'paused' ? <><Pause size={15}/>Paused</> : <>Apply<ArrowRight size={15}/></>}</button>
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} className="btn-ghost press inline-flex min-h-11 items-center gap-1.5 px-4 text-[14px]">{open ? 'Less' : 'Details'}<ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')}/></button>
    </div>
  </article>;
}

function Roles({ roles, onApply }: { roles: HiringRole[]; onApply: (id: string) => void }) {
  const teams = useMemo<HiringTeam[]>(() => [...new Set(roles.map(r => r.team))], [roles]);
  const [team, setTeam] = useState<HiringTeam | 'all'>('all');
  const shown = team === 'all' ? roles : roles.filter(r => r.team === team);
  return <section id="roles" className="page mt-24 scroll-mt-24">
    <Reveal><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="lab">Open roles</p><h2 className="display mt-3 text-[clamp(34px,5vw,58px)] leading-[0.95]">Four stations. One launchpad.</h2></div>
      {teams.length > 1 && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by team">{(['all', ...teams] as const).map(t => <button key={t} onClick={() => setTeam(t)} aria-pressed={team === t} className={cn('press min-h-10 rounded-full px-4 text-[13.5px] font-extrabold', team === t ? 'bg-ink text-white' : 'sunk')}>{t === 'all' ? 'All' : TEAM_LABEL[t]}</button>)}</div>}
    </div></Reveal>
    {shown.length ? <div className="mt-8 grid gap-4 md:grid-cols-2">{shown.map((r, i) => <Reveal key={r.id} delay={i * 70} className="h-full"><RoleCard role={r} onApply={onApply}/></Reveal>)}</div>
      : <div className="sunk mt-8 rounded-[26px] p-8 text-center"><p className="text-[16px] font-extrabold">No roles listed right now.</p><p className="mt-2 text-[14px] font-semibold text-ink/55">You can still send a general application below.</p></div>}
  </section>;
}

const STYLE: { icon: typeof Users; title: string; body: string }[] = [
  { icon: Users, title: 'Small team', body: 'Few people, direct conversations, no layers between an idea and the person building it.' },
  { icon: BadgeCheck, title: 'High ownership', body: 'You own a surface end to end: design, build, ship, measure and fix.' },
  { icon: Zap, title: 'Rapid shipping', body: 'Small changes go out often. The product you see today changed this week.' },
  { icon: Link2, title: 'Public build logs', body: 'We ship in public: release notes, a white paper and proofs anyone can check.' },
  { icon: Send, title: 'Direct user feedback', body: 'Creators and traders tell us what’s broken. You hear it first-hand.' },
];
function WorkingStyle() {
  return <section className="page mt-24">
    <Reveal><p className="lab">How we work</p><h2 className="display mt-3 text-[clamp(34px,5vw,58px)] leading-[0.95]">Ship it, show it, learn.</h2></Reveal>
    <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{STYLE.map((s, i) => <Reveal key={s.title} delay={i * 60} className="h-full"><div className="sunk h-full rounded-[24px] p-5"><s.icon size={20} className="text-ink/70"/><h3 className="mt-4 text-[16px] font-extrabold">{s.title}</h3><p className="mt-1.5 text-[13.5px] font-semibold leading-relaxed text-ink/60">{s.body}</p></div></Reveal>)}</div>
  </section>;
}

const https = z.string().trim().max(300).refine(v => v === '' || /^https:\/\/[^\s]+\.[^\s]+/.test(v), 'Use a full https:// link').optional().default('');
const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().email('Enter a valid email').max(254),
  xHandle: z.string().trim().max(16).refine(v => v === '' || /^@?[A-Za-z0-9_]{1,15}$/.test(v), 'Letters, numbers and _ only').optional().default(''),
  location: z.string().trim().min(2, 'Where are you based?').max(80),
  timezone: z.string().trim().min(2, 'Add your time zone').max(60),
  portfolio: https, github: https, linkedin: https,
  strongestProject: z.string().trim().min(30, 'At least 30 characters').max(2000),
  whyObjectPad: z.string().trim().min(30, 'At least 30 characters').max(2000),
  availability: z.string().trim().min(2, 'When could you start?').max(120),
  consent: z.literal(true, { errorMap: () => ({ message: 'Required to apply' }) }),
  website: z.string().max(0).optional().default(''),
}).refine(v => Boolean(v.portfolio || v.github || v.linkedin), { message: 'Add at least one link', path: ['portfolio'] });
type FormValues = z.infer<typeof schema>;

function ApplicationForm({ roles, roleId, setRoleId, canSubmit }: { roles: HiringRole[]; roleId: string; setRoleId: (id: string) => void; canSubmit: boolean }) {
  const tz = useMemo<string>(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } }, []);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', xHandle: '', location: '', timezone: tz, portfolio: '', github: '', linkedin: '', strongestProject: '', whyObjectPad: '', availability: '', website: '' } });
  const token = useQuery({ queryKey: ['objectpad', 'hiring', 'form-token'], enabled: canSubmit, staleTime: Infinity, gcTime: 0, retry: 1, queryFn: () => api<{ token: string }>('/hiring/form-token', { method: 'POST' }) });
  const [resume, setResume] = useState<File | null>(null); const [fileError, setFileError] = useState<string>('');
  const [done, setDone] = useState<{ resumeFailed: boolean } | null>(null);
  const submit = useMutation({
    mutationFn: async (v: FormValues) => {
      const result = await api<{ id: string; resumeTicket: string | null }>('/hiring/applications', { method: 'POST', body: { ...v, xHandle: v.xHandle.replace(/^@/, ''), roleId, formToken: token.data?.token ?? '', withResume: Boolean(resume) } });
      let resumeFailed = false;
      if (resume && result.resumeTicket) { try { await api(`/hiring/applications/${result.id}/resume`, { method: 'PUT', binary: resume, headers: { 'X-Upload-Token': result.resumeTicket }, timeout: 60_000 }); } catch { resumeFailed = true; } }
      return { resumeFailed };
    },
    onSuccess: r => { setDone(r); form.reset(); setResume(null); },
    onError: () => { void token.refetch(); },
  });
  const pickFile = (file: File | undefined) => { setFileError(''); if (!file) { setResume(null); return; } if (file.type !== 'application/pdf') { setFileError('Use a PDF.'); return; } if (file.size > RESUME_MAX) { setFileError('Max 5 MB.'); return; } setResume(file); };
  const err = form.formState.errors;
  const e = (k: keyof FormValues) => err[k]?.message ? <span className="mt-1.5 block text-[12.5px] font-bold text-down">{String(err[k]?.message)}</span> : null;
  const selected = roleId === 'general' ? null : roles.find(r => r.id === roleId);

  return <section className="page mt-24 max-w-4xl">
    <Reveal><p className="lab">Apply</p><h2 className="display mt-3 text-[clamp(34px,5vw,58px)] leading-[0.95]">Show us what you’ve shipped.</h2><p className="mt-4 max-w-xl text-[15.5px] font-semibold text-ink/60">No cover letter needed. Links to real work matter more than titles.</p></Reveal>
    {done ? <div className="raised mt-8 rounded-[28px] p-8 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-up text-white mark-pop"><Check size={26}/></span><h3 className="display mt-5 text-[30px]">Application received.</h3><p className="mx-auto mt-2 max-w-md text-[14.5px] font-semibold text-ink/60">Thanks — it’s stored privately and only the hiring team can read it.{done.resumeFailed && ' Your résumé didn’t upload, but your application and links did.'}</p><button onClick={() => { setDone(null); void token.refetch(); }} className="btn-ghost press mt-6 min-h-11 px-5 text-[14px]">Send another</button></div> :
    <form noValidate onSubmit={form.handleSubmit(v => submit.mutate(v))} className="raised mt-8 grid gap-5 rounded-[28px] p-5 sm:p-8">
      <Field label="Role">
        <div className="flex flex-wrap gap-1.5">{[...roles.map(r => ({ id: r.id, label: r.title })), { id: 'general', label: 'General application' }].map(o => <button type="button" key={o.id} onClick={() => setRoleId(o.id)} aria-pressed={roleId === o.id} className={cn('press min-h-10 rounded-full px-4 text-[13.5px] font-extrabold', roleId === o.id ? 'bg-ink text-white' : 'sunk')}>{o.label}</button>)}</div>
      </Field>
      {roleId === 'general' && <p className="-mt-2 text-[13px] font-semibold text-ink/55">Don’t see your role? Tell us what you’d own at ObjectPad in “Why ObjectPad”.</p>}
      {selected && <p className="-mt-2 font-mono text-[12px] font-bold text-ink/50">{TEAM_LABEL[selected.team]} · {REMOTE_LABEL[selected.remotePolicy]} · {ENGAGEMENT_LABEL[selected.engagementType]}</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name"><input {...form.register('name')} autoComplete="name" className={inputCls}/>{e('name')}</Field>
        <Field label="Email"><input {...form.register('email')} type="email" autoComplete="email" inputMode="email" className={inputCls}/>{e('email')}</Field>
        <Field label="X handle (optional)"><input {...form.register('xHandle')} placeholder="@handle" autoComplete="off" className={inputCls}/>{e('xHandle')}</Field>
        <Field label="Availability"><input {...form.register('availability')} placeholder="e.g. 2 weeks’ notice" className={inputCls}/>{e('availability')}</Field>
        <Field label="Location"><input {...form.register('location')} placeholder="City, country" autoComplete="address-level2" className={inputCls}/>{e('location')}</Field>
        <Field label="Time zone"><input {...form.register('timezone')} className={inputCls}/>{e('timezone')}</Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Portfolio"><input {...form.register('portfolio')} placeholder="https://" inputMode="url" className={inputCls}/>{e('portfolio')}</Field>
        <Field label="GitHub"><input {...form.register('github')} placeholder="https://github.com/…" inputMode="url" className={inputCls}/>{e('github')}</Field>
        <Field label="LinkedIn"><input {...form.register('linkedin')} placeholder="https://linkedin.com/in/…" inputMode="url" className={inputCls}/>{e('linkedin')}</Field>
      </div>
      <Field label="Strongest shipped project" hint="What it was, what you personally built, and a link if it’s public."><textarea {...form.register('strongestProject')} rows={4} className={cn(inputCls, 'resize-y')}/>{e('strongestProject')}</Field>
      <Field label="Why ObjectPad"><textarea {...form.register('whyObjectPad')} rows={4} className={cn(inputCls, 'resize-y')}/>{e('whyObjectPad')}</Field>
      <Field label="Résumé (optional)" hint="PDF, up to 5 MB. Stored privately, never published.">
        <label className="sunk press flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-4">
          {resume ? <FileText size={18}/> : <Upload size={18}/>}<span className="min-w-0 flex-1 truncate text-[14px] font-bold">{resume ? resume.name : 'Choose a PDF'}</span>
          {resume && <button type="button" aria-label="Remove résumé" onClick={ev => { ev.preventDefault(); pickFile(undefined); }} className="flex size-8 items-center justify-center rounded-full bg-white"><XIcon size={14}/></button>}
          <input type="file" accept="application/pdf" className="sr-only" onChange={ev => pickFile(ev.target.files?.[0])}/>
        </label>
        {fileError && <span className="mt-1.5 block text-[12.5px] font-bold text-down">{fileError}</span>}
      </Field>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden"><label>Website<input {...form.register('website')} tabIndex={-1} autoComplete="off"/></label></div>
      <label className="flex items-start gap-3 text-[13.5px] font-bold leading-5"><input type="checkbox" {...form.register('consent')} className="mt-0.5 size-5 shrink-0 accent-ink"/>I agree that ObjectPad may store this application and contact me about roles. Only the hiring team can read it, and I can ask for it to be deleted at any time.</label>
      {e('consent')}
      {!canSubmit && <Notice>Applications open when this page goes public. The form is shown here for preview only.</Notice>}
      {token.isError && canSubmit && <Notice tone="error">The form couldn’t start. Reload the page to try again.</Notice>}
      {submit.isError && <Notice tone="error">{hiringError(submit.error)}</Notice>}
      <button type="submit" disabled={!canSubmit || submit.isPending || !token.data} className="btn press inline-flex min-h-[52px] w-full items-center justify-center gap-2 text-[15px] disabled:opacity-50 sm:w-auto sm:px-10"><Send size={16}/>{submit.isPending ? 'Sending…' : 'Submit application'}</button>
    </form>}
  </section>;
}

function Faq({ items, privacyContact }: { items: HiringFaq[]; privacyContact: string | null }) {
  return <section className="page mt-24 max-w-4xl">
    <Reveal><p className="lab">FAQ</p><h2 className="display mt-3 text-[clamp(34px,5vw,58px)] leading-[0.95]">Good questions.</h2></Reveal>
    <div className="mt-8 grid gap-2">{items.map(f => <details key={f.q} className="raised group rounded-[22px] px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-extrabold"><T>{f.q}</T><ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180"/></summary>
      <p className="mt-2 text-[14.5px] font-semibold leading-relaxed text-ink/65"><T>{f.a}</T></p>
    </details>)}</div>
    {privacyContact && <p className="mt-4 font-mono text-[12px] font-semibold text-ink/50">Privacy or deletion requests: <a className="underline" href={`mailto:${privacyContact}`}>{privacyContact}</a></p>}
  </section>;
}

function Closing({ onGeneral }: { onGeneral: () => void }) {
  return <section className="page mt-24">
    <Reveal><div className="raised overflow-hidden rounded-[30px] p-1.5"><div className="relative overflow-hidden rounded-[24px]">
      <img src={CLOSING_CARD} alt="Come build what’s next. Engineering, mobile, design, growth. objectpad.fun/hiring" className="block aspect-video w-full object-cover" loading="lazy"/>
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 bg-gradient-to-t from-black/45 to-transparent p-4 sm:p-6">
        <a href="#roles" className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-extrabold text-ink">View open roles<ArrowRight size={15}/></a>
        <button onClick={onGeneral} className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-white/20 px-5 text-[14px] font-extrabold text-white backdrop-blur">General application</button>
      </div>
    </div></div></Reveal>
  </section>;
}
