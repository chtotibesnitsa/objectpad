import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowRight, Briefcase, Eye, Fingerprint, Megaphone, ScanFace, ShieldCheck, UserPlus, Wallet } from 'lucide-react';
import { Loading } from '@/components/Feedback';
import { Blocker, SplitBar, StateChip } from '@/components/people/PeopleUi';
import { usePeopleStatus } from '@/lib/people';
import { defaultSplit, type PeopleFeature } from '@/shared/people';
import { cn } from '@/lib/utils';

const PeopleStart = lazy(() => import('./PeopleStart'));
const PeopleDraftPage = lazy(() => import('./PeopleStart').then(m => ({ default: m.PeopleDraftPage })));
const Nominate = lazy(() => import('./PeopleForms').then(m => ({ default: m.Nominate })));
const Apply = lazy(() => import('./PeopleForms').then(m => ({ default: m.Apply })));
const Invite = lazy(() => import('./PeopleForms').then(m => ({ default: m.Invite })));
const PersonProfile = lazy(() => import('./PeopleProfile'));
const PeopleDemo = lazy(() => import('./PeopleProfile').then(m => ({ default: m.PeopleDemo })));
const PeopleAdmin = lazy(() => import('./PeopleProfile').then(m => ({ default: m.PeopleAdmin })));

/**
 * /People is canonical. Router matching is case-insensitive, so any lowercase /people URL is redirected here
 * (the edge middleware does the same with a 308 for crawlers and link unfurlers).
 */
export default function PeopleRoutes() {
  const { pathname, search, hash } = useLocation();
  if (pathname.startsWith('/') && pathname.slice(1, 7) !== 'People') return <Navigate to={`/People${pathname.slice(7)}${search}${hash}`} replace/>;
  return <Suspense fallback={<Loading label="Opening People…"/>}><Routes>
    <Route index element={<PeopleLanding/>}/>
    <Route path="start" element={<PeopleStart/>}/>
    <Route path="start/:id" element={<PeopleDraftPage/>}/>
    <Route path="invite/:token" element={<Invite/>}/>
    <Route path="nominate" element={<Nominate/>}/>
    <Route path="apply" element={<Apply/>}/>
    <Route path="p/:id" element={<PersonProfile/>}/>
    <Route path="demo" element={<PeopleDemo/>}/>
    <Route path="admin" element={<PeopleAdmin/>}/>
    <Route path="*" element={<Navigate to="/People" replace/>}/>
  </Routes></Suspense>;
}

const PHASE_LABEL = { preview: 'Preview live · building this week', pilot: 'Pilot open · small consenting adult group', live: 'Live' } as const;

function FeatureCard({ f, i }: { f: PeopleFeature; i: number }) {
  return <li className="raised card-pop flex flex-col rounded-[24px] p-4 sm:p-5" style={{ ['--delay' as string]: `${i * 40}ms` }}>
    <div className="flex items-start justify-between gap-3"><p className="text-[15.5px] font-extrabold leading-tight">{f.label}</p><StateChip state={f.state}/></div>
    <p className="mt-2 text-[13px] font-semibold leading-5 text-ink/60">{f.detail}</p>
    {f.blocker && f.state !== 'live' && <Blocker>{f.blocker}</Blocker>}
  </li>;
}

/** /People landing. Every status shown comes from the server status registry; there are no demo figures on this page. */
function PeopleLanding() {
  useEffect(() => { document.title = 'ObjectPad People · People are next'; }, []);
  const status = usePeopleStatus(); const s = status.data;
  const foundation = useMemo(() => s?.features.filter(f => f.group === 'foundation') ?? [], [s]);
  const utility = useMemo(() => s?.features.filter(f => f.group === 'utility') ?? [], [s]);
  const counts = useMemo(() => ({ live: s?.features.filter(f => f.state === 'live').length ?? 0, pilot: s?.features.filter(f => f.state === 'pilot').length ?? 0, planned: s?.features.filter(f => f.state === 'planned').length ?? 0 }), [s]);

  return <div className="page py-6 sm:py-10">
    <section className="raised relative overflow-hidden rounded-[36px] sm:rounded-[44px]">
      <div aria-hidden className="grid-paper pointer-events-none absolute inset-0 opacity-70"/>
      <div className="relative grid items-end lg:grid-cols-[1.05fr_1fr]">
        <div className="relative z-10 p-6 pb-0 sm:p-10 lg:pb-12">
          <div className="flex items-center gap-2.5"><img src="/brand/duck-mark-96.png" alt="" className="size-8"/><span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.16em] text-ink/55">ObjectPad People</span></div>
          <h1 className="display mt-6 text-[clamp(64px,11vw,148px)] uppercase leading-[0.84] tracking-[-0.04em]"><span className="word-in block">People</span><span className="word-in block" style={{ animationDelay: '90ms' }}>are</span><span className="word-in block" style={{ animationDelay: '180ms' }}>next<span className="text-[#E0B000]">.</span></span></h1>
          <p className="mt-6 font-mono text-[12px] font-bold uppercase tracking-[0.16em] text-ink/55">{s ? PHASE_LABEL[s.phase] : 'Reading status…'}</p>
          <p className="mt-4 max-w-[34rem] text-[clamp(16px,1.6vw,19px)] font-bold leading-snug text-ink/70">A consenting adult creates a 3D presence, proves their account and wallet, passes an independent liveness check, approves their profile, then launches a creator token with a fee split they sign.</p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link to="/People/start" className="btn press min-h-12 px-6 text-[14.5px]"><ScanFace size={17}/>Start your profile</Link>
            <Link to="/People/nominate" className="btn-ghost press min-h-12 px-5 text-[14px]"><UserPlus size={16}/>Nominate a creator</Link>
            <Link to="/People/apply" className="btn-ghost press min-h-12 px-5 text-[14px]"><Briefcase size={16}/>Apply as a creator</Link>
          </div>
        </div>
        <div className="relative -mt-4 lg:mt-0"><img src="/people/hero-bust-v1.jpg" alt="A white marble bust dissolving into black dots on one side" className="mx-auto w-full max-w-[640px] mix-blend-multiply [mask-image:linear-gradient(to_top,transparent,black_18%)]" draggable={false}/></div>
      </div>
    </section>

    <section className="no-scrollbar mt-4 flex gap-2.5 overflow-x-auto sm:grid sm:grid-cols-4 sm:overflow-visible">
      {[['Published profiles', s ? String(s.publishedProfiles) : '…'], ['Live features', s ? String(counts.live) : '…'], ['In pilot', s ? String(counts.pilot) : '…'], ['Planned', s ? String(counts.planned) : '…']].map(([k, v]) => <div key={k} className="sunk min-w-[140px] shrink-0 rounded-2xl px-4 py-3.5 sm:min-w-0"><p className="stat-label">{k}</p><p className="mt-1 text-[24px] font-extrabold tnum">{v}</p></div>)}
    </section>
    {s && s.publishedProfiles === 0 && <p className="mt-3 px-1 text-[13px] font-semibold text-ink/50">No profiles are published yet. Real participants appear here only after they pass every check and give permission.</p>}

    <section className="mt-12 sm:mt-16">
      <p className="lab">Foundations</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><h2 className="display text-[clamp(30px,4.4vw,52px)]">What works today, honestly labeled.</h2><span className="flex gap-1.5"><StateChip state="live"/><StateChip state="pilot"/><StateChip state="planned"/></span></div>
      {status.isPending ? <div className="mt-6"><Loading label="Reading People status…"/></div> : status.isError ? <p className="mt-6 text-sm font-bold text-ink/55">Status is unavailable right now, so every feature is treated as off.</p>
        : <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{foundation.map((f, i) => <FeatureCard key={f.id} f={f} i={i}/>)}</ul>}
    </section>

    <section className="mt-12 grid gap-4 lg:grid-cols-[1fr_1.1fr] lg:items-center">
      <div><p className="lab">Fees</p><h2 className="display mt-3 text-[clamp(30px,4.4vw,52px)]">The person signs the split.</h2>
        <p className="mt-4 max-w-xl text-[15.5px] font-semibold leading-relaxed text-ink/65">Proposed default for an assisted launch: 70% to the person, up to 20% to the collaborator who prepared it, 10% to ObjectPad. A self-launch gives the person 90%. The subject signs the exact split before any launch, from a wallet they proved they control.</p>
        {s && (() => { const f = s.features.find(x => x.id === 'fee_split'); return f ? <div className="mt-4 flex flex-wrap items-center gap-2"><StateChip state={f.state}/>{f.blocker && <span className="text-[12.5px] font-semibold text-ink/55">{f.blocker}</span>}</div> : null; })()}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="raised rounded-[26px] p-5"><p className="stat-label">Assisted launch</p><div className="mt-3"><SplitBar split={defaultSplit('assisted')}/></div></div>
        <div className="raised rounded-[26px] p-5"><p className="stat-label">Self-launch</p><div className="mt-3"><SplitBar split={defaultSplit('self')}/></div></div>
      </div>
    </section>

    <section className="mt-12 sm:mt-16">
      <p className="lab">Profile utilities</p><h2 className="display mt-3 text-[clamp(30px,4.4vw,52px)]">Staged after the foundations pass.</h2>
      {s && <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{utility.map((f, i) => <FeatureCard key={f.id} f={f} i={i}/>)}</ul>}
    </section>

    <section className="mt-12 grid gap-3 md:grid-cols-3">
      {[[Eye, 'What goes on-chain', 'At most a random subject reference and the digest of the model you approved. Never face images, liveness video, embeddings or biometric hashes. A hash of personal data is not automatically anonymous.'],
        [Fingerprint, 'What “verified” means', 'Each badge names the exact checks that passed and when. A liveness check shows a live person completed it once. It is not an ongoing health claim or proof against every deepfake.'],
        [ShieldCheck, 'Not ownership of a person', 'A token never conveys ownership of a person, their body, labor, identity or future income. You can withdraw consent; hosted copies are removed, but others’ downloads and on-chain history cannot be recalled.']].map(([I, a, b]) => { const Icon = I as typeof Eye; return <div key={a as string} className="sunk flex gap-3 rounded-[22px] p-4"><Icon size={19} className="mt-0.5 shrink-0"/><div><p className="text-[15px] font-extrabold">{a as string}</p><p className="mt-1 text-[13px] font-semibold leading-5 text-ink/60">{b as string}</p></div></div>; })}
    </section>

    <section className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="raised rounded-[28px] p-6">
        <div className="flex items-center justify-between gap-3"><p className="stat-label">Genesis People program</p><StateChip state={s?.genesis ? 'pilot' : 'planned'}/></div>
        {s?.genesis ? <><p className="display mt-3 text-[34px] tnum">{s.genesis.remaining} / {s.genesis.slots} places</p><p className="mt-1 text-[14px] font-bold text-ink/60">{s.genesis.awardDisplay} per accepted creator · <a href={s.genesis.termsUrl} className="underline underline-offset-2">terms</a></p></>
          : <p className="mt-3 text-[14px] font-semibold leading-6 text-ink/60">Not funded yet. Budget, number of places, award per accepted creator and full terms will be published here before a single place opens. Rewards will be for accepted original work, never for uploading faces, and never require buying a token.</p>}
      </div>
      <div className="raised rounded-[28px] p-6">
        <p className="stat-label">Services behind People</p>
        <ul className="mt-3 space-y-2">{(s?.providers ?? []).map(p => <li key={p.id} className="flex items-start gap-2.5 text-[13.5px]"><span className={cn('mt-1.5 size-2 shrink-0 rounded-full', p.configured ? 'bg-up' : 'bg-ink/25')}/><span><span className="font-extrabold">{p.label}</span><span className="font-semibold text-ink/55"> · {p.configured ? 'configured' : 'not configured'}. {p.note}</span></span></li>)}</ul>
      </div>
    </section>

    <section className="smoke relative mt-12 overflow-hidden rounded-[36px] px-6 py-12 sm:py-16">
      <div aria-hidden className="grid-smoke absolute inset-0 opacity-60"/>
      <div className="relative grid gap-6 md:grid-cols-3">
        {[[ScanFace, 'Start your profile', 'Private draft, separate consents, account and wallet proof. Resume any time.', '/People/start'], [Megaphone, 'Nominate a creator', 'Suggest a public account. Stays private and unclaimed; nothing is generated.', '/People/nominate'], [Wallet, 'Apply as a creator', 'Remote or San Francisco. Selected creators can apply for paid roles.', '/People/apply']].map(([I, t, d, to]) => { const Icon = I as typeof Eye; return <Link key={t as string} to={to as string} className="press group rounded-[26px] bg-white/[0.06] p-5 text-white transition-colors hover:bg-white/[0.1]"><Icon size={22}/><p className="mt-4 text-[19px] font-extrabold">{t as string}</p><p className="mt-1 text-[13.5px] font-semibold leading-5 text-white/60">{d as string}</p><span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-extrabold">Open<ArrowRight size={14} className="transition-transform group-hover:translate-x-1"/></span></Link>; })}
      </div>
      <p className="relative mt-8 text-center text-[12.5px] font-bold text-white/45"><Link to="/People/demo" className="underline underline-offset-2">See the illustrative demo</Link> · a fictional person with made-up figures, not tradable.</p>
    </section>
  </div>;
}
