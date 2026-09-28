import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowRight, Box, Briefcase, Camera, ChevronDown, Eye, Fingerprint, Megaphone, Rocket, ScanFace, ShieldCheck, UserPlus, Wallet } from 'lucide-react';
import { Loading } from '@/components/Feedback';
import { SplitBar, StateChip, STATE_META } from '@/components/people/PeopleUi';
import { FALLBACK_ICON, FRIENDLY, PEOPLE_X_POST, shareOnX } from '@/components/people/features';
import { usePeopleStatus } from '@/lib/people';
import { defaultSplit, type FeatureState, type PeopleFeature } from '@/shared/people';
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


/** One feature tile. Plain name + one line; the precise detail and blocker sit behind "Details". */
function FeatureTile({ f, i }: { f: PeopleFeature; i: number }) {
  const meta = FRIENDLY[f.id]; const Icon = meta?.icon ?? FALLBACK_ICON; const live = f.state === 'live';
  return <li className={cn('card-pop group relative overflow-hidden rounded-[26px] p-4 sm:p-5', live ? 'bg-ink text-white shadow-[0_30px_50px_-30px_rgba(12,13,16,.8)]' : 'raised')} style={{ ['--delay' as string]: `${i * 35}ms` }}>
    {live && <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-[#12A150]/25 blur-2xl"/>}
    <div className="relative flex items-start justify-between gap-3">
      <span className={cn('flex size-11 items-center justify-center rounded-[14px]', live ? 'bg-white/10' : f.state === 'pilot' ? 'bg-[#F5C400]/20 text-[#7A5E00]' : 'bg-ink/[0.05] text-ink/55')}><Icon size={20} strokeWidth={2.2}/></span>
      <StateChip state={f.state}/>
    </div>
    <p className="relative mt-4 text-[17px] font-extrabold leading-tight tracking-[-0.02em]">{meta?.title ?? f.label}</p>
    <p className={cn('relative mt-1 text-[14px] font-semibold leading-5', live ? 'text-white/65' : 'text-ink/55')}>{meta?.line ?? f.detail}</p>
    <details className="relative mt-3">
      <summary className={cn('flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-bold [&::-webkit-details-marker]:hidden', live ? 'text-white/50' : 'text-ink/40')}>{f.state === 'live' ? 'Details' : 'What’s left'}<ChevronDown size={13} className="transition-transform group-open:rotate-180"/></summary>
      <p className={cn('mt-2 text-[12.5px] font-semibold leading-5', live ? 'text-white/60' : 'text-ink/55')}>{f.detail}{f.blocker && f.state !== 'live' ? ` ${f.blocker}` : ''}</p>
    </details>
  </li>;
}

const LANES: { state: FeatureState; title: string; sub: string }[] = [
  { state: 'live', title: 'Live now', sub: 'Open to everyone. Try it tonight.' },
  { state: 'pilot', title: 'In pilot', sub: 'Working, being tested with the first creators.' },
  { state: 'planned', title: 'Planned', sub: 'Being built next, in this order.' },
];

/** Animated build progress: live counts fully, pilot counts half. Numbers come from the server registry. */
function BuildMeter({ features }: { features: PeopleFeature[] }) {
  const n = features.length || 1; const live = features.filter(f => f.state === 'live').length; const pilot = features.filter(f => f.state === 'pilot').length; const planned = n - live - pilot;
  const pctDone = Math.round(((live + pilot * 0.5) / n) * 100);
  return <div className="smoke relative overflow-hidden rounded-[32px] p-6 sm:p-8">
    <div aria-hidden className="grid-smoke absolute inset-0 opacity-50"/>
    <div className="relative flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/50">Build progress · updates live</p><p className="display mt-2 text-[clamp(56px,9vw,96px)] leading-[0.85] tnum">{pctDone}<span className="text-[0.5em] text-white/40">%</span></p></div>
      <a href={shareOnX(PEOPLE_X_POST)} target="_blank" rel="noreferrer" className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-extrabold text-ink">Share progress on X<ArrowRight size={15}/></a>
    </div>
    <div className="relative mt-6 flex h-4 gap-1 overflow-hidden rounded-full bg-white/[0.08] p-[3px]">
      <span className="bar-grow h-full rounded-full" style={{ width: `${(live / n) * 100}%`, background: 'linear-gradient(90deg,#12A150,#2EE584)' }}/>
      <span className="bar-grow h-full rounded-full" style={{ width: `${(pilot / n) * 100}%`, background: 'linear-gradient(90deg,#E0B000,#FFD84A)', ['--delay' as string]: '200ms' }}/>
    </div>
    <div className="relative mt-4 grid grid-cols-3 gap-2">
      {([['live', live], ['pilot', pilot], ['planned', planned]] as const).map(([s, v]) => <div key={s} className="rounded-2xl bg-white/[0.06] px-3 py-3 sm:px-4"><p className="flex items-center gap-1.5 text-[12px] font-extrabold text-white/60"><span className="size-2 rounded-full" style={{ background: s === 'planned' ? 'rgba(255,255,255,.3)' : STATE_META[s].bar }}/>{STATE_META[s].label}</p><p className="display mt-1 text-[30px] leading-none tnum">{v}</p></div>)}
    </div>
  </div>;
}

const STEPS: { icon: typeof Eye; title: string; line: string; feature: string }[] = [
  { icon: Camera, title: 'Snap a selfie', line: 'One photo, or four angles for a better match. Private to you.', feature: 'capture' },
  { icon: Box, title: 'Get your 3D double', line: 'AI builds it in about 2 minutes. You approve it, or rebuild.', feature: 'model_jobs' },
  { icon: ShieldCheck, title: 'Prove it’s you', line: 'Connect X and your wallet, then a quick live check.', feature: 'proofs' },
  { icon: Rocket, title: 'Launch your coin', line: 'You sign your fee split. 90% of collected creator fees go to you.', feature: 'fee_split' },
];

/** /People landing. Every status shown comes from the server status registry; there are no demo figures on this page. */
function PeopleLanding() {
  useEffect(() => { document.title = 'ObjectPad People · People are next'; }, []);
  const status = usePeopleStatus(); const s = status.data;
  const byState = useMemo(() => ({ live: s?.features.filter(f => f.state === 'live') ?? [], pilot: s?.features.filter(f => f.state === 'pilot') ?? [], planned: s?.features.filter(f => f.state === 'planned') ?? [] }), [s]);
  const stateOf = (id: string): FeatureState | null => s?.features.find(f => f.id === id)?.state ?? null;

  return <div className="page py-6 sm:py-10">
    <section className="raised relative overflow-hidden rounded-[36px] sm:rounded-[44px]">
      <div aria-hidden className="grid-paper pointer-events-none absolute inset-0 opacity-70"/>
      <div className="relative grid items-end lg:grid-cols-[1.05fr_1fr]">
        <div className="relative z-10 p-6 pb-0 sm:p-10 lg:pb-12">
          <div className="flex flex-wrap items-center gap-2.5"><img src="/brand/duck-mark-96.png" alt="" className="size-8"/><span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.16em] text-ink/55">ObjectPad People</span>{s && <StateChip state={s.phase === 'live' ? 'live' : 'pilot'} className="ml-1"/>}</div>
          <h1 className="display mt-6 text-[clamp(64px,11vw,148px)] uppercase leading-[0.84] tracking-[-0.04em]"><span className="word-in block">People</span><span className="word-in block" style={{ animationDelay: '90ms' }}>are</span><span className="word-in block" style={{ animationDelay: '180ms' }}>next<span className="text-[#E0B000]">.</span></span></h1>
          <p className="mt-6 max-w-[32rem] text-[clamp(18px,1.8vw,22px)] font-extrabold leading-snug tracking-[-0.015em] text-ink/80">Turn yourself into a 3D double. Prove it’s really you. Launch your own coin and keep 90% of the creator fees.</p>
          <p className="mt-3 text-[13.5px] font-bold text-ink/50">{s ? (s.phase === 'pilot' ? 'Pilot open · first creators this week' : 'Building in public · drafts, selfies and 3D previews work tonight') : 'Loading…'}</p>
          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <Link to="/People/start" className="btn press min-h-[54px] px-7 text-[15.5px]"><ScanFace size={18}/>Make my 3D double</Link>
            <Link to="/People/nominate" className="btn-ghost press min-h-[54px] px-5 text-[14.5px]"><UserPlus size={16}/>Nominate a creator</Link>
            <Link to="/People/apply" className="btn-ghost press min-h-[54px] px-5 text-[14.5px]"><Briefcase size={16}/>Apply as a creator</Link>
          </div>
        </div>
        <div className="relative -mt-4 lg:mt-0"><img src="/people/hero-bust-v1.jpg" alt="A white marble bust dissolving into black dots on one side" className="mx-auto w-full max-w-[640px] mix-blend-multiply [mask-image:linear-gradient(to_top,transparent,black_18%)]" draggable={false}/></div>
      </div>
    </section>

    <section className="mt-10 sm:mt-14">
      <p className="lab">How it works</p>
      <h2 className="display mt-3 text-[clamp(32px,4.6vw,56px)] leading-[0.95]">Four steps. About five minutes.</h2>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => { const st = stateOf(step.feature); return <li key={step.title} className="raised card-pop relative overflow-hidden rounded-[28px] p-5" style={{ ['--delay' as string]: `${i * 60}ms` }}>
          <span aria-hidden className="display pointer-events-none absolute -right-2 -top-6 text-[120px] leading-none text-ink/[0.04]">{i + 1}</span>
          <div className="relative flex items-center justify-between"><span className="flex size-12 items-center justify-center rounded-2xl bg-ink text-white"><step.icon size={22}/></span>{st && <StateChip state={st}/>}</div>
          <p className="relative mt-5 text-[19px] font-extrabold tracking-[-0.02em]">{step.title}</p>
          <p className="relative mt-1.5 text-[14px] font-semibold leading-5 text-ink/55">{step.line}</p>
        </li>; })}
      </ol>
    </section>

    <section className="mt-10 sm:mt-14">
      {status.isPending ? <Loading label="Loading build progress…"/> : status.isError || !s ? <p className="raised rounded-[28px] p-6 text-[15px] font-bold text-ink/60">Build progress couldn’t load. Everything is treated as off until it does.</p> : <>
        <BuildMeter features={s.features}/>
        {LANES.map(lane => byState[lane.state].length > 0 && <div key={lane.state} className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="display text-[clamp(26px,3.4vw,40px)] leading-none">{lane.title}</h3><p className="mt-1.5 text-[14px] font-bold text-ink/50">{lane.sub}</p></div><StateChip state={lane.state}/></div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{byState[lane.state].map((f, i) => <FeatureTile key={f.id} f={f} i={i}/>)}</ul>
        </div>)}
      </>}
    </section>

    <section className="mt-14 grid gap-4 lg:grid-cols-[1fr_1.1fr] lg:items-center">
      <div><p className="lab">Your money</p><h2 className="display mt-3 text-[clamp(32px,4.6vw,56px)] leading-[0.95]">You sign the split.</h2>
        <p className="mt-4 max-w-xl text-[16px] font-semibold leading-relaxed text-ink/65">Launch yourself and you get 90% of the creator fees your coin collects. If a collaborator set it up, you choose their cut, up to 20%. ObjectPad keeps 10%. It’s a share of fees actually collected, not trading volume.</p>
        {s && (() => { const f = s.features.find(x => x.id === 'fee_split'); return f && f.state !== 'live' ? <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink/[0.05] py-1.5 pl-1.5 pr-4 text-[13px] font-bold text-ink/60"><StateChip state={f.state}/>You can sign it now. On-chain payout routing comes next.</p> : null; })()}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="raised rounded-[26px] p-5"><p className="text-[15px] font-extrabold">You launch it</p><div className="mt-3"><SplitBar split={defaultSplit('self')}/></div></div>
        <div className="raised rounded-[26px] p-5"><p className="text-[15px] font-extrabold">A collaborator helps</p><div className="mt-3"><SplitBar split={defaultSplit('assisted')}/></div></div>
      </div>
    </section>

    <section className="mt-14 grid gap-3 md:grid-cols-3">
      {[[Eye, 'Your photos stay private', 'Only you see your photos and preview. They’re deleted once you approve your 3D double. No face data goes on-chain.'],
        [Fingerprint, 'Badges mean something', 'Each badge says exactly which check passed and when. No one can claim to be you: copycats go to review.'],
        [ShieldCheck, 'You stay in control', 'A coin never means someone owns you. Withdraw or delete any time. Copies others already downloaded can’t be recalled.']].map(([I, a, b]) => { const Icon = I as typeof Eye; return <div key={a as string} className="raised flex gap-3.5 rounded-[26px] p-5"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink/[0.05]"><Icon size={19}/></span><div><p className="text-[16px] font-extrabold">{a as string}</p><p className="mt-1 text-[13.5px] font-semibold leading-5 text-ink/55">{b as string}</p></div></div>; })}
    </section>

    <section className="mt-4">
      <div className="raised rounded-[28px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[17px] font-extrabold">Genesis creator program</p><StateChip state={s?.genesis ? 'pilot' : 'planned'}/></div>
        {s?.genesis ? <><p className="display mt-3 text-[34px] tnum">{s.genesis.remaining} / {s.genesis.slots} places</p><p className="mt-1 text-[14px] font-bold text-ink/60">{s.genesis.awardDisplay} per accepted creator · <a href={s.genesis.termsUrl} className="underline underline-offset-2">terms</a></p></>
          : <p className="mt-2 text-[14.5px] font-semibold leading-6 text-ink/60">Rewards for the first creators are coming. The budget, number of places and terms will be posted here before anyone is accepted. You’ll never need to buy a token to apply. <Link to="/People/apply" className="font-extrabold text-ink underline underline-offset-2">Apply now to be first in line</Link>.</p>}
      </div>
    </section>

    <section className="smoke relative mt-12 overflow-hidden rounded-[36px] px-6 py-12 sm:py-16">
      <div aria-hidden className="grid-smoke absolute inset-0 opacity-60"/>
      <h2 className="display relative text-center text-[clamp(34px,5vw,60px)] leading-[0.95]">Be one of the first.</h2>
      <div className="relative mt-8 grid gap-4 md:grid-cols-3">
        {[[ScanFace, 'Make my 3D double', 'Private draft. Selfie to 3D preview in minutes. Saves as you go.', '/People/start'], [Megaphone, 'Nominate a creator', 'Tell us who should be on People. It stays private.', '/People/nominate'], [Wallet, 'Apply as a creator', 'Remote or San Francisco. Paid roles for selected creators.', '/People/apply']].map(([I, t, d, to]) => { const Icon = I as typeof Eye; return <Link key={t as string} to={to as string} className="press group rounded-[26px] bg-white/[0.07] p-5 text-white transition-colors hover:bg-white/[0.12]"><Icon size={22}/><p className="mt-4 text-[19px] font-extrabold">{t as string}</p><p className="mt-1 text-[13.5px] font-semibold leading-5 text-white/60">{d as string}</p><span className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-extrabold">Open<ArrowRight size={14} className="transition-transform group-hover:translate-x-1"/></span></Link>; })}
      </div>
      <p className="relative mt-8 text-center text-[12.5px] font-bold text-white/45"><Link to="/People/demo" className="underline underline-offset-2">See the illustrative demo</Link> · a made-up person with made-up numbers, not tradable.</p>
    </section>
  </div>;
}
