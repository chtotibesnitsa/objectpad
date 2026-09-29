import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Box, Camera, Coins, ArrowRight, Briefcase, Building2, FileText, Fingerprint, Handshake, Megaphone, MousePointer2, PiggyBank, ScanFace, ShieldCheck, Target, Trophy, UserPlus, Wallet } from 'lucide-react';
import { Loading } from '@/components/Feedback';
import { PointCloud } from '@/components/PointCloud';
import { AsciiField } from '@/components/AsciiField';
import { Reveal } from '@/components/Reveal';
import { PeopleStory, tickerOf } from '@/components/people/PeopleStory';
import { BuildTimeline, ChainLedger, PhotoPipeline, SplitCalculator } from '@/components/people/PeopleInfographics';
import { PEOPLE_X_POST, shareOnX } from '@/components/people/features';
import { usePeopleStatus } from '@/lib/people';
import { cn } from '@/lib/utils';

const HalfHuman = lazy(() => import('@/components/people/HalfHuman').then(m => ({ default: m.HalfHuman })));

const PeopleStart = lazy(() => import('./PeopleStart'));
const PeopleDraftPage = lazy(() => import('./PeopleStart').then(m => ({ default: m.PeopleDraftPage })));
const Nominate = lazy(() => import('./PeopleForms').then(m => ({ default: m.Nominate })));
const Apply = lazy(() => import('./PeopleForms').then(m => ({ default: m.Apply })));
const Invite = lazy(() => import('./PeopleForms').then(m => ({ default: m.Invite })));
const PersonProfile = lazy(() => import('./PeopleProfile'));
const PeopleDemo = lazy(() => import('./PeopleProfile').then(m => ({ default: m.PeopleDemo })));
const PeopleAdmin = lazy(() => import('./PeopleProfile').then(m => ({ default: m.PeopleAdmin })));
const PeoplePhone = lazy(() => import('./PeoplePhone'));

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
    <Route path="phone/:token" element={<PeoplePhone/>}/>
    <Route path="admin" element={<PeopleAdmin/>}/>
    <Route path="*" element={<Navigate to="/People" replace/>}/>
  </Routes></Suspense>;
}

const HERO_FALLBACK = <div className="absolute inset-0"><PointCloud src="/models/points/human.json" mode="swirl" size={1.7} speed={0.5}/></div>;

const INCOME: { icon: typeof Wallet; title: string; line: string; math: string; when: string }[] = [
  { icon: Wallet, title: 'Creator fees', line: 'Your share of the fees your coin actually collects.', math: 'you = F − ⌊F·L/10⁴⌋ − ⌊F·P/10⁴⌋', when: 'Split signing works today. Payout routing turns on before any People coin launches.' },
  { icon: Target, title: 'Paid missions', line: 'Fans fund a task. You accept it, do it, get paid from escrow.', math: 'payout = escrow − fee, released on proof', when: 'Next up' },
  { icon: Handshake, title: 'Sponsorships', line: 'Brand deals on your profile, always labelled as paid.', math: 'terms published before you accept', when: 'Next up' },
  { icon: PiggyBank, title: 'Milestone funding', line: 'Holders fund gear and projects in public, step by step.', math: 'release_k only after milestone k is shown', when: 'Next up' },
];

const ROLES: { title: string; where: string; what: string }[] = [
  { title: 'Genesis creators', where: 'Remote', what: 'Be among the first doubles on People. Paid pilot terms are posted before anyone is accepted.' },
  { title: 'Streamers & KOLs', where: 'Remote', what: 'Go live from your profile and run missions with your community.' },
  { title: 'UGC & 3D artists', where: 'Remote or SF', what: 'Direct captures, clean up doubles, make launch content.' },
  { title: 'Community & engineering', where: 'San Francisco', what: 'Build People with us, in the office.' },
];

/** /People landing. Feature progress comes from the server registry; the 3D person shown is a fictional sample scan. */
function PeopleLanding() {
  useEffect(() => { document.title = 'ObjectPad People · People are next'; }, []);
  const status = usePeopleStatus(); const s = status.data;
  const [name, setName] = useState<string>(''); const ticker = tickerOf(name);

  return <div className="page py-5 sm:py-8">
    {/* HERO: black mirror */}
    <section className="raised relative overflow-hidden rounded-[36px] sm:rounded-[44px]">
      <div aria-hidden className="grid-smoke absolute inset-0 opacity-70"/>
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_60%_at_72%_50%,rgba(12,13,16,.06),transparent_70%)]"/>
      <div className="relative grid lg:grid-cols-[1fr_1fr]">
        <div className="relative z-10 flex flex-col justify-center p-6 pb-2 sm:p-10 lg:py-16">
          <div className="flex items-center gap-2.5"><img src="/brand/duck-mark-96.png" alt="" className="size-8"/><span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/55">ObjectPad People</span></div>
          <h1 className="display mt-6 text-[clamp(60px,10.5vw,142px)] uppercase leading-[0.82] tracking-[-0.045em]"><span className="word-in block">People</span><span className="word-in block" style={{ animationDelay: '90ms' }}>are</span><span className="word-in block" style={{ animationDelay: '180ms' }}>next<span className="text-[#12A150]">.</span></span></h1>
          <p className="mt-6 max-w-[31rem] text-[clamp(18px,1.7vw,22px)] font-extrabold leading-snug tracking-[-0.015em] text-ink/75">Walk around, watch green triangles draw your 3D double, prove it’s really you, then launch your own coin and keep up to 90% of its creator fees.</p>
          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <Link to="/People/start" className="press group inline-flex min-h-[56px] items-center justify-center gap-2 rounded-full bg-ink px-7 text-[16px] font-extrabold text-white shadow-[0_18px_40px_-14px_rgba(12,13,16,.6)]"><ScanFace size={19}/>Make my 3D double<ArrowRight size={17} className="transition-transform group-hover:translate-x-1"/></Link>
            <Link to="/People/apply" className="press inline-flex min-h-[56px] items-center justify-center gap-2 btn-ghost px-6 text-[15px] font-extrabold"><Briefcase size={16}/>Apply as a creator</Link>
          </div>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-2">
            {[['90%', 'max creator-fee share'], ['1 walk', 'around you to 3D'], ['0', 'face data on-chain']].map(([v, l]) => <div key={l} className="sunk rounded-2xl px-3 py-3"><p className="display text-[26px] leading-none tnum">{v}</p><p className="mt-1 text-[11.5px] font-bold leading-4 text-ink/55">{l}</p></div>)}
          </div>
        </div>
        <div className="relative h-[440px] sm:h-[560px] lg:h-auto lg:min-h-[640px]">
          <Suspense fallback={HERO_FALLBACK}><HalfHuman src="/models/people/human-v1.glb" fallback={HERO_FALLBACK} camera={[0, 0.1, 3.6]}/></Suspense>
          <p className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/80 px-3 py-1.5 font-mono text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink/55 shadow-[0_0_0_1px_rgba(12,13,16,.08)] backdrop-blur"><MousePointer2 size={11}/>Drag to spin · sample scan</p>
        </div>
      </div>
    </section>

    {/* 4-STEP STORY */}
    <section className="raised relative mt-4 overflow-hidden rounded-[36px] p-5 sm:mt-5 sm:rounded-[44px] sm:p-10">
      <div aria-hidden className="grid-smoke absolute inset-0 opacity-40"/>
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#12A150]">How you become a coin</p><h2 className="display mt-3 text-[clamp(34px,5vw,64px)] leading-[0.92]">Four steps.<br className="sm:hidden"/> One of you.</h2></div>
        <label className="w-full max-w-[300px]"><span className="font-mono text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-ink/45">Try it with your name</span>
          <span className="sunk mt-1.5 flex items-center gap-2 rounded-2xl px-4 focus-within:shadow-[inset_0_0_0_2px_#12A150]"><input value={name} onChange={e => setName(e.target.value.slice(0, 28))} placeholder="Your name" className="min-h-[50px] min-w-0 flex-1 bg-transparent text-[16px] font-bold text-ink outline-none placeholder:text-ink/30" autoComplete="off"/><span className="font-mono text-[13px] font-extrabold text-[#12A150]">${ticker}</span></span></label>
      </div>
      <div className="relative mt-8"><PeopleStory name={name.trim()} ticker={ticker}/></div>
    </section>

    {/* IMAGE TRIPTYCH */}
    <section className="mt-14 sm:mt-20">
      <Reveal><p className="lab">What it feels like</p><h2 className="display mt-3 max-w-3xl text-[clamp(32px,4.6vw,58px)] leading-[0.94]">Just walk around. The triangles do the rest.</h2></Reveal>
      <div className="mt-7 grid gap-3 md:grid-cols-3">
        {([[Camera, '01 · Walk around', 'Point your phone and circle a face, an object or a whole body. Green triangles draw on the 3D shape as each angle is covered.'], [Box, '02 · Pick the object', 'The camera outlines what it is tracking, so you always see exactly which object is being picked up.'], [Coins, '03 · Tokenize', 'Approve your double, add your ticker and signed split, then launch. One photo works too and makes a bust.']] as const).map(([Icon, t, d], i) => <Reveal key={t} delay={i * 90}><div className="raised h-full rounded-[30px] p-6">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-ink text-white"><Icon size={21}/></span>
          <p className="mt-5 font-mono text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#12A150]">{t}</p><p className="mt-1.5 text-[15px] font-bold leading-6 text-ink/65">{d}</p>
        </div></Reveal>)}
      </div>
    </section>

    {/* ROADMAP */}
    <section className="mt-16 sm:mt-24">
      <Reveal><p className="lab">Roadmap · building in public</p><h2 className="display mt-3 text-[clamp(32px,4.6vw,58px)] leading-[0.94]">Watch it get built.</h2></Reveal>
      <div className="mt-8">{status.isPending ? <Loading label="Loading the build…"/> : status.isError || !s ? <p className="raised rounded-[28px] p-6 text-[15px] font-bold text-ink/60">The roadmap couldn’t load. Everything counts as off until it does.</p> : <BuildTimeline features={s.features}/>}</div>
      <div className="mt-8 flex flex-wrap gap-2"><a href={shareOnX(PEOPLE_X_POST)} target="_blank" rel="noreferrer" className="btn press min-h-12 px-6 text-[14.5px]">Share the build on X<ArrowRight size={15}/></a><Link to="/whitepaper#people" className="btn-ghost press min-h-12 px-6 text-[14.5px]"><FileText size={15}/>Read the maths</Link></div>
    </section>

    {/* PAYOUTS */}
    <section className="raised relative mt-16 overflow-hidden rounded-[36px] p-5 sm:mt-24 sm:rounded-[44px] sm:p-10">
      <div className="relative">
        <p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#B8860B]">Payouts · exact integer maths</p>
        <h2 className="display mt-3 max-w-2xl text-[clamp(32px,4.8vw,60px)] leading-[0.92]">You sign the split. The numbers can’t drift.</h2>
        <p className="mt-4 max-w-2xl text-[15.5px] font-semibold leading-relaxed text-ink/60">Shares are integer basis points of creator fees actually collected, never trading volume. ObjectPad’s 1,000 bps is fixed, a collaborator can get at most 2,000, and every leftover wei of rounding goes to you.</p>
        <div className="mt-8"><SplitCalculator/></div>
      </div>
    </section>

    {/* INCOME STACK */}
    <section className="mt-16 sm:mt-24">
      <Reveal><p className="lab">Ways to earn</p><h2 className="display mt-3 text-[clamp(32px,4.6vw,58px)] leading-[0.94]">More than a chart.</h2></Reveal>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {INCOME.map((it, i) => <Reveal key={it.title} delay={i * 70}><div className="raised relative h-full overflow-hidden rounded-[30px] p-6">
          <div className="flex items-start gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-white"><it.icon size={21}/></span><div className="min-w-0"><p className="text-[20px] font-extrabold tracking-[-0.02em]">{it.title}</p><p className="mt-1 text-[14px] font-semibold leading-5 text-ink/55">{it.line}</p></div></div>
          <p className="mt-5 overflow-x-auto rounded-2xl bg-ink px-4 py-3 font-mono text-[12.5px] font-bold text-[#2EE584]">{it.math}</p>
          <p className="mt-3 text-[12.5px] font-bold text-ink/45">{it.when}</p>
        </div></Reveal>)}
      </div>
    </section>

    {/* OFFICE + JOBS */}
    <section className="raised mt-16 overflow-hidden rounded-[36px] sm:mt-24 sm:rounded-[44px]">
      <div className="grid lg:grid-cols-[1.1fr_1fr]">
        <div className="relative min-h-[300px] sm:min-h-[420px]">
          <div aria-hidden className="grid-smoke absolute inset-0 opacity-60"/>
          <div className="absolute inset-x-0 bottom-0 top-4 mx-auto w-[220px] sm:w-[280px]"><PointCloud src="/models/points/human.json" mode="wire" size={1.3} speed={0.8}/></div>
        </div>
        <div className="relative p-6 sm:p-10">
          <p className="flex items-center gap-2 font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink/50"><Building2 size={13}/>ObjectPad office · San Francisco</p>
          <h2 className="display mt-3 text-[clamp(32px,4.4vw,54px)] leading-[0.92]">Get paid to be early.</h2>
          <p className="mt-3 text-[15px] font-semibold leading-6 text-ink/60">Selected creators can take paid roles and pilots, remote or in the SF office. Every role is posted with its pay, term and deadline before anyone is hired. You never need to buy a token to apply.</p>
          <ul className="mt-6 grid gap-2">{ROLES.map(r => <li key={r.title} className="sunk rounded-2xl p-4"><div className="flex items-center justify-between gap-3"><p className="text-[16px] font-extrabold">{r.title}</p><span className="shrink-0 font-mono text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-ink/45">{r.where}</span></div><p className="mt-1 text-[13px] font-semibold leading-5 text-ink/55">{r.what}</p></li>)}</ul>
          <Link to="/People/apply" className="press mt-6 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-extrabold text-white"><Briefcase size={16}/>Apply now<ArrowRight size={15}/></Link>
        </div>
      </div>
    </section>

    {/* PIPELINE */}
    <section className="mt-16 sm:mt-24">
      <Reveal><p className="lab">Your photos, step by step</p><h2 className="display mt-3 max-w-3xl text-[clamp(32px,4.6vw,58px)] leading-[0.94]">Seven gates. Then your photos are gone.</h2></Reveal>
      <div className="raised mt-8 rounded-[32px] px-4 py-8 sm:px-8"><PhotoPipeline/></div>
    </section>

    {/* TRUST */}
    <section className="raised relative mt-16 overflow-hidden rounded-[36px] p-5 sm:mt-24 sm:rounded-[44px] sm:p-10">
      <div aria-hidden className="grid-smoke absolute inset-0 opacity-40"/>
      <div className="relative grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#12A150]">Proof, not promises</p>
          <h2 className="display mt-3 text-[clamp(32px,4.6vw,56px)] leading-[0.92]">A coin never means someone owns you.</h2>
          <ul className="mt-6 grid gap-3">{[[Fingerprint, 'One official profile per person', 'Unique keys on your X account ID and wallet. A second claim goes to human review.'], [ShieldCheck, 'Badges say exactly what passed', 'Each badge names its check and date. A live check from an independent provider is required to publish.'], [Trophy, 'You stay in control', 'Withdraw or delete any time. Copies others already downloaded can’t be recalled.']].map(([I, t, d]) => { const Icon = I as typeof Wallet; return <li key={t as string} className="flex gap-3.5"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-white"><Icon size={18}/></span><div><p className="text-[16px] font-extrabold">{t as string}</p><p className="mt-0.5 text-[13.5px] font-semibold leading-5 text-ink/55">{d as string}</p></div></li>; })}</ul>
        </div>
        <ChainLedger/>
      </div>
    </section>

    {/* GENESIS SLOT + FINAL CTA */}
    <section className="mt-16 grid gap-4 sm:mt-24 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="raised relative overflow-hidden rounded-[36px] p-6 sm:p-8">
        <div className="relative mx-auto h-[260px] w-[200px]"><PointCloud src="/models/points/human-bust.json" mode="scan" size={1.4} speed={0.6}/><div aria-hidden className="absolute inset-0 rounded-[28px] shadow-[inset_0_0_0_2px_rgba(18,161,80,.35)]"/></div>
        <p className="mt-5 font-mono text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#12A150]">Creator No. 001</p>
        <p className="display mt-2 text-[34px] leading-none">This spot is waiting.</p>
        <p className="mt-2 text-[14px] font-semibold leading-5 text-ink/55">The first creator appears here only after they scan themselves, pass every check and approve their own double.{s?.genesis ? ` ${s.genesis.remaining} of ${s.genesis.slots} genesis places left · ${s.genesis.awardDisplay} each.` : ' Genesis rewards and terms are posted before anyone is accepted.'}</p>
      </div>
      <div className="raised relative flex flex-col justify-between overflow-hidden rounded-[36px] p-6 sm:p-10">
        <div aria-hidden className="dot-grid absolute inset-0 opacity-60"/>
        <h2 className="display relative text-[clamp(38px,5.6vw,72px)] leading-[0.9]">Be one of<br/>the first.</h2>
        <div className="relative mt-8 grid gap-2.5">
          {[[ScanFace, 'Make my 3D double', 'Private draft. Shoot on your phone. Saves as you go.', '/People/start'], [Megaphone, 'Nominate a creator', 'Tell us who should be on People next.', '/People/nominate'], [UserPlus, 'Set up someone you work with', 'You prepare it. They accept and take control.', '/People/start']].map(([I, t, d, to], i) => { const Icon = I as typeof Wallet; return <Link key={t as string} to={to as string} className={cn('press group flex items-center gap-4 rounded-[24px] p-4 transition-colors', i === 0 ? 'bg-ink text-white' : 'raised text-ink')}><Icon size={22} className="shrink-0"/><span className="min-w-0 flex-1"><span className="block text-[17px] font-extrabold">{t as string}</span><span className={cn('block text-[13px] font-semibold leading-5', i === 0 ? 'text-white/65' : 'text-ink/55')}>{d as string}</span></span><ArrowRight size={17} className="shrink-0 transition-transform group-hover:translate-x-1"/></Link>; })}
        </div>
        <p className="relative mt-6 text-[12px] font-bold text-ink/40"><Link to="/People/demo" className="underline underline-offset-2">Illustrative demo profile</Link> · a made-up person, not tradable.</p>
      </div>
    </section>
  </div>;
}
