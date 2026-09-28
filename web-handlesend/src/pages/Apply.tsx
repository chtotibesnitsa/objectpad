import { memo, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Camera, ChevronDown, Clapperboard, Code2, Globe2, Rocket, Search, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { Reveal } from '@/components/Reveal';
import { Loading, ErrorState } from '@/components/Feedback';
import { track, useJobs, type JobsPayload } from '@/lib/apply';
import { compensationLabel, LOCATION_LABEL, TEAM_NAME, type JobTeam, type PublicJob } from '@/shared/apply';
import { cn } from '@/lib/utils';

export const HERO_768 = '/assets/hiring/apply-hero-768.webp';
export const HERO_1536 = '/assets/hiring/apply-hero-1536.webp';
export const DISCLOSURE = 'Launching is free. Creator fees depend on real market activity and are variable; earnings are not guaranteed. Applying for a role never requires buying or holding a token.';
const YELLOW = '#FFD400';

/** Sets title, description, canonical and robots for SPA navigation (link unfurlers get the same tags from middleware). */
export function usePageMeta(title: string, description: string, canonical: string, index = true): void {
  useEffect(() => {
    document.title = title;
    const set = (sel: string, make: () => HTMLElement, attr: string, value: string) => { let el = document.head.querySelector<HTMLElement>(sel); if (!el) { el = make(); document.head.appendChild(el); } el.setAttribute(attr, value); return el; };
    set('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), 'content', description);
    const link = set('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', `https://www.objectpad.fun${canonical}`);
    const robots = set('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' }), 'content', index ? 'index,follow' : 'noindex,nofollow');
    return () => { link.remove(); robots.setAttribute('content', 'index,follow'); };
  }, [title, description, canonical, index]);
}

/** /apply — ObjectPad recruitment landing and openings directory. Every count and role comes from the live database. */
export default function Apply() {
  const jobs = useJobs();
  usePageMeta('ObjectPad — We’re hiring: 100+ creator roles, lead developers from $5,000/month', 'Build what the world touches. ObjectPad is hiring engineers across time zones and 100+ short-form creators. Remote worldwide + San Francisco. No purchase, wallet or token needed to apply.', '/apply');
  useEffect(() => { track('apply_view'); }, []);
  useJobPostingSchema(jobs.data?.jobs ?? []);
  return <div className="pb-24">
    <Hero data={jobs.data} />
    <TwoTeams />
    <section id="roles" className="page mt-24 scroll-mt-24">
      <Reveal><p className="lab">Open roles</p><h2 className="display mt-3 text-[clamp(34px,5vw,58px)] leading-[0.95]">Find your seat.</h2></Reveal>
      {jobs.isPending ? <Loading label="Loading open roles…" /> : jobs.isError ? <div className="mt-8"><ErrorState message="Open roles couldn’t be loaded. Your connection may be offline." retry={() => void jobs.refetch()} /></div> : <RoleDirectory jobs={jobs.data.jobs} />}
    </section>
    <WhyNow social={jobs.data?.social ?? null} />
    <ProductPanels />
    <CreatorBlock />
    <EngineeringBlock />
    <MapBlock />
    <Faq retentionDays={jobs.data?.retentionDays ?? 365} privacy={jobs.data?.privacyContact ?? null} />
    <FinalCta privacy={jobs.data?.privacyContact ?? null} />
  </div>;
}

function Hero({ data }: { data: JobsPayload | undefined }) {
  const open = data?.jobs.length ?? 0;
  return <section className="relative overflow-hidden">
    <div aria-hidden="true" className="grid-paper absolute inset-0 [mask-image:linear-gradient(180deg,#000,transparent_90%)]" />
    <Coords />
    <div className="page relative grid items-center gap-8 pt-8 sm:pt-14 lg:grid-cols-[1.02fr_1fr] lg:gap-12">
      <div className="enter">
        <p className="flex items-center gap-2 font-mono text-[12px] font-extrabold tracking-[0.14em] text-ink/55">
          <span className={cn('size-2 rounded-full', open ? 'bg-up pulse-dot' : 'bg-ink/25')} />
          {data ? `${open} ${open === 1 ? 'ROLE' : 'ROLES'} OPEN` : 'OBJECTPAD · HIRING'} · WE’RE HIRING.
        </p>
        <h1 className="display mt-4 text-[clamp(44px,7.6vw,96px)] leading-[0.88] tracking-[-0.05em]">BUILD WHAT THE WORLD TOUCHES.</h1>
        <div className="mt-6 flex flex-wrap items-stretch gap-2">
          <span className="inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-[15px] font-extrabold text-white"><span className="size-2 rounded-full" style={{ background: YELLOW }} />100+ CREATOR ROLES</span>
          <span className="raised inline-flex items-center rounded-2xl px-4 py-2.5 text-[14px] font-extrabold">Lead developer roles from $5,000/month</span>
          <span className="raised inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-[14px] font-extrabold"><Globe2 size={15} />Remote worldwide + San Francisco</span>
        </div>
        <p className="mt-6 max-w-[36rem] text-[16.5px] font-semibold leading-relaxed text-ink/65">ObjectPad turns a phone camera into a free launchpad for the physical world. We are expanding engineering across time zones—and building the creator network that will take it beyond crypto.</p>
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
          <a href="#roles" className="btn press inline-flex min-h-[54px] items-center justify-center gap-2 px-7 text-[15.5px]">Explore open roles<ArrowRight size={17} /></a>
          <Link to="/apply/ugc-short-form-creator" className="btn-ghost press inline-flex min-h-[54px] items-center justify-center gap-2 px-6 text-[15.5px]"><Clapperboard size={16} />Apply as a creator</Link>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-[13px] font-bold text-ink/55"><ShieldCheck size={14} className="text-up" />No purchase, wallet, or token holding is required to apply.</p>
      </div>
      <div className="enter [--delay:120ms]">
        <div className="raised relative overflow-hidden rounded-[30px] p-1.5">
          <div className="relative aspect-[3/2] overflow-hidden rounded-[24px] bg-white">
            <img src={HERO_768} srcSet={`${HERO_768} 768w, ${HERO_1536} 1536w`} sizes="(min-width: 1024px) 48vw, 94vw" width={1536} height={1024} alt="A phone camera frames a yellow duck on a plinth; the capture becomes an ObjectPad object card and three vertical video frames, over a dotted world map linking time zones with San Francisco highlighted." className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" decoding="async" />
            <Marks />
            <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 font-mono text-[10.5px] font-extrabold tracking-[0.12em] text-ink/70 shadow-sm">CAPTURE → OBJECT → STORY</span>
            <span className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 font-mono text-[10.5px] font-extrabold text-ink/70 shadow-sm"><span className="size-1.5 rounded-full bg-up" />SF · 37.77°N 122.42°W</span>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
const Coords = memo(function Coords() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-3 hidden justify-between px-6 font-mono text-[10px] font-bold tracking-[0.14em] text-ink/25 lg:flex">{['180°W', '120°W', '60°W', '0°', '60°E', '120°E', '180°E'].map(c => <span key={c}>{c}</span>)}</div>;
});
const Marks = memo(function Marks() {
  const c = 'absolute size-5 border-ink/50';
  return <div aria-hidden="true"><span className={cn(c, 'left-3 top-3 border-l-2 border-t-2')} /><span className={cn(c, 'right-3 top-3 border-r-2 border-t-2')} /><span className={cn(c, 'bottom-3 left-3 border-b-2 border-l-2')} /><span className={cn(c, 'bottom-3 right-3 border-b-2 border-r-2')} /></div>;
});

function TwoTeams() {
  const teams = [
    { icon: Code2, code: 'TEAM 01', title: 'Engineering & Product', body: 'Lead full-stack, frontend/UI and backend/Web3 engineers who have shipped production software and want to own it across time zones.', meta: 'Lead roles from $5,000/month', href: '#roles' },
    { icon: Clapperboard, code: 'TEAM 02', title: 'Creator Network', body: '100+ creator opportunities planned for people who can hook attention, shoot clean footage, edit fast and make a new product feel obvious.', meta: 'Paid · rate agreed per creator', href: '/apply/ugc-short-form-creator' },
  ];
  return <section className="page mt-20">
    <Reveal><p className="lab">Two teams. One mission.</p><h2 className="display mt-3 max-w-4xl text-[clamp(32px,4.8vw,56px)] leading-[0.95]">Crypto built for crypto. We’re building for everyone else.</h2></Reveal>
    <div className="mt-8 grid gap-3 md:grid-cols-2">{teams.map((t, i) => <Reveal key={t.title} delay={i * 90}>
      <a href={t.href} className="raised press group flex h-full flex-col rounded-[28px] p-6 sm:p-7">
        <div className="flex items-center justify-between"><span className="flex size-12 items-center justify-center rounded-2xl bg-ink text-white"><t.icon size={21} /></span><span className="font-mono text-[11px] font-extrabold tracking-[0.12em] text-ink/35">{t.code}</span></div>
        <h3 className="mt-6 text-[26px] font-extrabold tracking-[-0.03em]">{t.title}</h3>
        <p className="mt-2 max-w-md text-[15px] font-semibold leading-relaxed text-ink/60">{t.body}</p>
        <div className="mt-auto flex items-center justify-between pt-6"><span className="rounded-full px-3 py-1 text-[12.5px] font-extrabold" style={{ background: '#FFF3B0' }}>{t.meta}</span><ArrowRight size={18} className="transition group-hover:translate-x-1" /></div>
      </a></Reveal>)}</div>
  </section>;
}

const TEAM_FILTERS: ('all' | JobTeam)[] = ['all', 'engineering', 'product', 'creator'];
function RoleDirectory({ jobs }: { jobs: PublicJob[] }) {
  const [team, setTeam] = useState<'all' | JobTeam>('all'); const [q, setQ] = useState<string>('');
  const shown = useMemo(() => jobs.filter(j => (team === 'all' || j.team === team) && (!q.trim() || `${j.title} ${j.summary} ${j.locations.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))), [jobs, team, q]);
  if (!jobs.length) return <div className="raised mt-8 rounded-[26px] p-8 text-center"><p className="text-[18px] font-extrabold">No roles are open right now.</p><p className="mt-2 text-[14px] font-semibold text-ink/55">Check back soon — new openings are published here first.</p></div>;
  return <>
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="relative flex-1"><span className="sr-only">Search roles</span><Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search roles" className="sunk min-h-12 w-full rounded-full pl-11 pr-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ink" /></label>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Filter by team">{TEAM_FILTERS.map(t => <button key={t} aria-pressed={team === t} onClick={() => setTeam(t)} className={cn('press min-h-11 shrink-0 rounded-full px-4 text-[13.5px] font-extrabold', team === t ? 'bg-ink text-white' : 'sunk')}>{t === 'all' ? `All · ${jobs.length}` : TEAM_NAME[t]}</button>)}</div>
    </div>
    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">{shown.map((j, i) => <Reveal key={j.slug} delay={Math.min(i, 5) * 60}><RoleCard job={j} /></Reveal>)}</div>
    {!shown.length && <p className="mt-6 text-[14px] font-semibold text-ink/55">No roles match that search.</p>}
  </>;
}
export function RoleCard({ job }: { job: PublicJob }) {
  const comp = compensationLabel(job.compensation); const floor = Boolean(job.compensation.min);
  return <Link to={`/apply/${job.slug}`} className="raised press group flex h-full flex-col rounded-[26px] p-5">
    <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] font-extrabold tracking-[0.12em] text-ink/45">{TEAM_NAME[job.team].toUpperCase()}</span><span className="flex items-center gap-1.5 font-mono text-[11px] font-extrabold text-up"><span className="size-1.5 rounded-full bg-up" />OPEN</span></div>
    <h3 className="mt-3 text-[20px] font-extrabold leading-tight tracking-[-0.02em]">{job.title}</h3>
    <p className="mt-2 line-clamp-3 text-[14px] font-semibold leading-relaxed text-ink/60">{job.summary}</p>
    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
      <div><dt className="stat-label">Location</dt><dd className="font-bold">{LOCATION_LABEL[job.locationMode]}</dd></div>
      <div><dt className="stat-label">Type</dt><dd className="font-bold">{job.engagementType}</dd></div>
      <div><dt className="stat-label">Level</dt><dd className="font-bold">{job.experience}</dd></div>
      <div><dt className="stat-label">Compensation</dt><dd className={cn('font-bold', floor && 'rounded-md px-1 -mx-1')} style={floor ? { background: '#FFF3B0' } : undefined}>{comp}</dd></div>
    </dl>
    {job.team === 'creator' && job.kind === 'creator' && <p className="mt-3 font-mono text-[11.5px] font-bold text-ink/55">{job.openings}</p>}
    <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[14px] font-extrabold">View role<ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
  </Link>;
}

function WhyNow({ social }: { social: JobsPayload['social'] | null }) {
  const live = social && (social.tiktok || social.instagram);
  const steps = [
    { t: 'Weekend launch', b: 'ObjectPad launched: photograph an object, launch it for $0.' },
    { t: 'Marketing team formed', b: 'The marketing team is in place and shipping.' },
    { t: 'Engineering across time zones', b: 'Expanding frontend, backend and Web3 coverage around the clock.' },
    { t: 'TikTok + Instagram rollout', b: live ? 'Short-form channels are live.' : 'Social channels launching soon.' },
    { t: 'Launch livestream + team reveal', b: 'Coming next.' },
  ];
  return <section className="page mt-24">
    <Reveal><p className="lab">Why now</p><h2 className="display mt-3 text-[clamp(32px,4.8vw,56px)] leading-[0.95]">Launched this weekend. Scaling this week.</h2></Reveal>
    <ol className="relative mt-10 grid gap-3 md:grid-cols-5">
      <div aria-hidden="true" className="absolute left-[10%] right-[10%] top-[22px] hidden h-px bg-[repeating-linear-gradient(90deg,rgba(12,13,16,.3)_0_5px,transparent_5px_10px)] md:block" />
      {steps.map((s, i) => <Reveal key={s.t} delay={i * 70}><li className="relative"><span className={cn('relative z-10 flex size-11 items-center justify-center rounded-full font-mono text-[13px] font-extrabold', i < 3 ? 'bg-ink text-white' : 'raised')}>{String(i + 1).padStart(2, '0')}</span><h3 className="mt-4 text-[16px] font-extrabold tracking-[-0.01em]">{s.t}</h3><p className="mt-1 text-[13.5px] font-semibold leading-relaxed text-ink/55">{s.b}</p></li></Reveal>)}
    </ol>
    <div className="mt-6 flex flex-wrap gap-2">
      <a href={social?.x ?? 'https://x.com/objectpadfun'} target="_blank" rel="noreferrer" className="btn-ghost press inline-flex min-h-11 items-center gap-2 px-5 text-[14px]">Follow on X<ArrowUpRight size={14} /></a>
      {social?.tiktok && <a href={social.tiktok} target="_blank" rel="noreferrer" className="btn-ghost press inline-flex min-h-11 items-center gap-2 px-5 text-[14px]">TikTok<ArrowUpRight size={14} /></a>}
      {social?.instagram && <a href={social.instagram} target="_blank" rel="noreferrer" className="btn-ghost press inline-flex min-h-11 items-center gap-2 px-5 text-[14px]">Instagram<ArrowUpRight size={14} /></a>}
      {!live && <span className="sunk inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-bold text-ink/55">Social channels launching soon</span>}
    </div>
  </section>;
}

function ProductPanels() {
  const panels = [{ icon: Camera, t: 'Take a photo', b: 'Photograph a toy, collectible, meme, object—or build a verified profile.' }, { icon: Rocket, t: 'Launch for $0', b: 'ObjectPad turns the capture into a launch flow at no cost to the creator.' }, { icon: Wallet, t: 'Earn variable creator fees when people trade', b: 'Creator fees may accrue when people trade. They are not guaranteed.' }];
  return <section className="page mt-24">
    <Reveal><p className="lab">The product</p><h2 className="display mt-3 text-[clamp(32px,4.8vw,56px)] leading-[0.95]">One camera. Any object. A live market in minutes.</h2></Reveal>
    <div className="mt-8 grid gap-3 md:grid-cols-3">{panels.map((p, i) => <Reveal key={p.t} delay={i * 80}><div className="raised h-full rounded-[26px] p-6"><div className="flex items-center justify-between"><span className="flex size-12 items-center justify-center rounded-2xl" style={{ background: YELLOW }}><p.icon size={21} /></span><span className="font-mono text-[11px] font-extrabold text-ink/35">STEP 0{i + 1}</span></div><h3 className="mt-5 text-[19px] font-extrabold tracking-[-0.02em]">{p.t}</h3><p className="mt-2 text-[14px] font-semibold leading-relaxed text-ink/60">{p.b}</p></div></Reveal>)}</div>
    <p className="sunk mt-4 rounded-2xl px-4 py-3 text-[13px] font-bold leading-relaxed text-ink/65" role="note">{DISCLOSURE}</p>
  </section>;
}

function CreatorBlock() {
  const signals = ['Storytelling', 'Shooting', 'Editing', 'Consistency', 'Platform fluency'];
  return <section className="mt-24 bg-ink py-20 text-white">
    <div className="page grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
      <Reveal><p className="font-mono text-[12px] font-extrabold tracking-[0.14em] text-white/50">CREATOR NETWORK · 100+ OPPORTUNITIES PLANNED</p>
        <h2 className="display mt-4 text-[clamp(34px,5vw,62px)] leading-[0.92]">Your follower count is not your résumé. Your work is.</h2>
        <p className="mt-5 max-w-xl text-[16px] font-semibold leading-relaxed text-white/65">If you know how to hook attention, shoot clean footage, edit quickly, and make a new product feel obvious, we want to see what you can do. Crypto experience is optional. Taste, consistency, and storytelling are not.</p>
        <Link to="/apply/ugc-short-form-creator" className="press mt-7 inline-flex min-h-[54px] items-center gap-2 rounded-full px-7 text-[15px] font-extrabold text-ink" style={{ background: YELLOW }}>Join the creator network<ArrowRight size={16} /></Link></Reveal>
      <Reveal delay={100}><div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
        <p className="font-mono text-[11px] font-extrabold tracking-[0.12em] text-white/45">WHAT WE LOOK AT</p>
        <ul className="mt-4 space-y-2">{signals.map((s, i) => <li key={s} className="flex items-center gap-3"><span className="w-7 font-mono text-[12px] font-bold text-white/35">0{i + 1}</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${92 - i * 6}%`, background: i === 0 ? YELLOW : 'rgba(255,255,255,.7)' }} /></span><span className="w-36 text-right text-[14px] font-extrabold">{s}</span></li>)}
          <li className="flex items-center gap-3 opacity-50"><span className="w-7 font-mono text-[12px] font-bold">06</span><span className="h-2 flex-1 rounded-full bg-white/10"><span className="block h-full w-[18%] rounded-full bg-white/40" /></span><span className="w-36 text-right text-[14px] font-extrabold">Follower count</span></li></ul>
        <p className="mt-5 text-[12.5px] font-semibold text-white/45">Illustrative weighting. Every application is read by a person.</p>
      </div></Reveal>
    </div>
  </section>;
}

function EngineeringBlock() {
  const items = [['Shipped products', 'Links to real work beat years on a CV.'], ['Production judgment', 'Trade-offs you made and why.'], ['Security', 'Wallets, uploads and launch paths are attack surface.'], ['Reliability', 'Idempotency, monitoring, recovery.'], ['Ownership', 'You ship it, you watch it, you fix it.']];
  return <section className="page mt-24">
    <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
      <Reveal><p className="lab">Engineering standards</p><h2 className="display mt-3 text-[clamp(32px,4.8vw,56px)] leading-[0.95]">Production experience required. Ownership expected.</h2>
        <p className="mt-5 max-w-lg text-[15.5px] font-semibold leading-relaxed text-ink/60">We are expanding frontend, backend, and Web3 engineering across time zones. Show us what you shipped, what broke, how you fixed it, and what you would build better next time.</p>
        <Link to="/apply/lead-full-stack-web3-developer" className="btn press mt-7 inline-flex min-h-[52px] items-center gap-2 px-7 text-[15px]">Lead developer role<ArrowRight size={16} /></Link></Reveal>
      <div className="grid gap-2">{items.map(([t, b], i) => <Reveal key={t} delay={i * 60}><div className="raised flex items-center gap-4 rounded-2xl px-5 py-4"><span className="font-mono text-[12px] font-extrabold text-ink/35">{String(i + 1).padStart(2, '0')}</span><div><p className="text-[16px] font-extrabold">{t}</p><p className="text-[13.5px] font-semibold text-ink/55">{b}</p></div></div></Reveal>)}</div>
    </div>
  </section>;
}

const HUBS: { x: number; y: number; label: string }[] = [{ x: 16, y: 40, label: 'San Francisco' }, { x: 30, y: 44, label: 'Americas' }, { x: 50, y: 34, label: 'Europe' }, { x: 55, y: 58, label: 'Africa' }, { x: 72, y: 42, label: 'Asia' }, { x: 84, y: 70, label: 'Oceania' }];
function MapBlock() {
  const dots = useMemo(() => { const out: [number, number][] = []; for (let y = 8; y < 92; y += 4) for (let x = 3; x < 98; x += 2.2) { const land = (x > 8 && x < 34 && y > 20 && y < 58) || (x > 22 && x < 36 && y >= 58 && y < 88) || (x > 44 && x < 60 && y > 18 && y < 44) || (x > 46 && x < 62 && y >= 44 && y < 80) || (x > 60 && x < 90 && y > 18 && y < 56) || (x > 78 && x < 92 && y > 62 && y < 80); if (land && ((x * 7 + y * 3) % 5 > 0.6)) out.push([x, y]); } return out; }, []);
  return <section className="page mt-24">
    <Reveal><p className="lab">Remote worldwide + San Francisco</p><h2 className="display mt-3 text-[clamp(32px,4.8vw,56px)] leading-[0.95]">Work where you do your best work.</h2></Reveal>
    <div className="raised relative mt-8 overflow-hidden rounded-[30px] p-2">
      <svg viewBox="0 0 100 60" className="block w-full" role="img" aria-label="Dotted world map with arcs linking time-zone regions to San Francisco">
        <rect width="100" height="60" fill="#F7F8FA" />
        {dots.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y * 0.6} r="0.32" fill="#0C0D10" opacity="0.22" />)}
        {HUBS.slice(1).map(h => <path key={h.label} d={`M${HUBS[0].x},${HUBS[0].y * 0.6} Q${(HUBS[0].x + h.x) / 2},${Math.min(HUBS[0].y, h.y) * 0.6 - 10} ${h.x},${h.y * 0.6}`} fill="none" stroke="#0C0D10" strokeWidth="0.18" strokeDasharray="0.8 0.8" opacity="0.55" />)}
        {HUBS.map((h, i) => <g key={h.label}><circle cx={h.x} cy={h.y * 0.6} r={i === 0 ? 1.1 : 0.7} fill={i === 0 ? '#12A150' : '#0C0D10'} className={i === 0 ? 'motion-safe:animate-pulse' : undefined} /><text x={h.x + 1.4} y={h.y * 0.6 + 0.8} fontSize="1.9" fontWeight="700" fill="#0C0D10" opacity="0.7">{h.label}</text></g>)}
      </svg>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="raised rounded-2xl p-4"><p className="stat-label">Remote</p><p className="mt-1 text-[15px] font-extrabold">Worldwide, where legally supported</p></div>
      <div className="raised rounded-2xl p-4"><p className="stat-label">San Francisco</p><p className="mt-1 text-[15px] font-extrabold">Optional in-person collaboration</p></div>
      <div className="raised rounded-2xl p-4"><p className="stat-label">Time zones</p><p className="mt-1 text-[15px] font-extrabold">Americas · Europe & Africa · Asia-Pacific</p></div>
    </div>
    <p className="mt-3 text-[12.5px] font-semibold text-ink/45">Map is illustrative. We don’t publish a private office address.</p>
  </section>;
}

function Faq({ retentionDays, privacy }: { retentionDays: number; privacy: string | null }) {
  const items: [string, string][] = [
    ['Does every role pay $5,000/month?', 'No. The $5,000/month starting figure applies only to eligible lead developer roles. Every role lists its own compensation. Creator roles are paid per video, retainer or campaign at a rate agreed with each creator. Other roles are discussed with each candidate.'],
    ['Is the work remote?', 'Yes — remote worldwide where we can legally engage you, with optional in-person collaboration in San Francisco. Some engineering roles prefer overlap with a specific time-zone band; it’s listed on each role.'],
    ['What should I include?', 'Engineers: GitHub, shipped products, and the hardest production problem you solved. Creators: links to your three strongest short-form videos. A résumé is optional unless the role says otherwise.'],
    ['Do I need a big following?', 'No. We look at storytelling, shooting, editing, consistency and platform fluency. An audience helps; it isn’t required.'],
    ['Do I need crypto experience?', 'Not for creator roles. For Web3 engineering roles, chain experience is listed where it matters. You never need to buy, hold or promote a token to apply.'],
    ['How do I check my application?', 'After you submit you get a reference number and a private status link (also emailed). From there you can see your stage or withdraw at any time.'],
    ['What happens to my data?', `Applications are stored privately and are visible only to authorised members of the hiring team. Files are checked before anyone can open them. We keep applications for up to ${retentionDays} days unless you withdraw sooner${privacy ? `; email ${privacy} to request deletion` : ''}.`],
    ['When will I hear back?', 'Every application is read by a person. Timing depends on volume and the role — your status page updates as soon as a reviewer moves your application.'],
  ];
  return <section className="page mt-24" id="faq">
    <Reveal><p className="lab">FAQ</p><h2 className="display mt-3 text-[clamp(32px,4.8vw,56px)] leading-[0.95]">Straight answers.</h2></Reveal>
    <div className="mt-8 grid gap-2">{items.map(([q, a]) => <details key={q} className="raised group rounded-2xl px-5 py-4 [&_summary::-webkit-details-marker]:hidden"><summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-extrabold">{q}<ChevronDown size={18} className="shrink-0 transition group-open:rotate-180 motion-reduce:transition-none" /></summary><p className="mt-3 text-[14.5px] font-semibold leading-relaxed text-ink/60">{a}</p></details>)}</div>
  </section>;
}

function FinalCta({ privacy }: { privacy: string | null }) {
  return <section className="page mt-24">
    <div className="relative overflow-hidden rounded-[34px] bg-ink px-6 py-14 text-white sm:px-12">
      <div aria-hidden="true" className="grid-smoke absolute inset-0 opacity-60" />
      <div className="relative max-w-3xl"><Sparkles size={22} style={{ color: YELLOW }} />
        <h2 className="display mt-4 text-[clamp(32px,5vw,60px)] leading-[0.93]">The next market may begin with a camera. The next chapter begins with this team.</h2>
        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row"><a href="#roles" className="press inline-flex min-h-[54px] items-center justify-center gap-2 rounded-full px-8 text-[15.5px] font-extrabold text-ink" style={{ background: YELLOW }}>Apply now<ArrowRight size={17} /></a><Link to="/apply/status" className="press inline-flex min-h-[54px] items-center justify-center rounded-full px-6 text-[15px] font-extrabold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.2)]">Check application status</Link></div>
      </div>
    </div>
    <p className="mx-auto mt-6 max-w-3xl text-center text-[12.5px] font-semibold leading-relaxed text-ink/50">ObjectPad welcomes applicants of every background and does not discriminate on the basis of race, religion, colour, national origin, sex, gender identity, sexual orientation, age, disability or any other protected characteristic. Applications are processed only to evaluate you for roles{privacy ? ` · Privacy: ${privacy}` : ''}. Compensation varies by role; the $5,000/month starting figure applies to eligible lead developer roles. No purchase is required to apply.</p>
  </section>;
}

/** schema.org JobPosting, emitted only with accurate fields (a salary only where a real minimum is configured). */
function useJobPostingSchema(jobs: PublicJob[]): void {
  useEffect(() => {
    if (!jobs.length) return;
    const data = jobs.filter(j => j.publishedAt).map(j => ({
      '@context': 'https://schema.org', '@type': 'JobPosting', title: j.title, description: `${j.summary} ${j.description}`, datePosted: new Date(j.publishedAt!).toISOString().slice(0, 10),
      ...(j.closesAt ? { validThrough: new Date(j.closesAt).toISOString() } : {}), hiringOrganization: { '@type': 'Organization', name: 'ObjectPad', sameAs: 'https://www.objectpad.fun' },
      jobLocationType: 'TELECOMMUTE', applicantLocationRequirements: { '@type': 'Country', name: 'Worldwide' }, url: `https://www.objectpad.fun/apply/${j.slug}`,
      ...(j.compensation.min && j.compensation.interval === 'month' ? { baseSalary: { '@type': 'MonetaryAmount', currency: j.compensation.currency, value: { '@type': 'QuantitativeValue', minValue: j.compensation.min, unitText: 'MONTH' } } } : {}),
    }));
    const el = document.createElement('script'); el.type = 'application/ld+json'; el.textContent = JSON.stringify(data); document.head.appendChild(el); return () => el.remove();
  }, [jobs]);
}
