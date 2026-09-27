import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, ArrowUpRight, Check, Circle, Copy, Fingerprint, Search } from 'lucide-react';
import { api, fetchReadiness, NOT_CONFIGURED } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Empty, ErrorState, Loading } from '@/components/Feedback';
import type { PublicFeed } from '@/shared/domain';
import { PointCloud, type CloudMode } from '@/components/PointCloud';
import { TxPanel, sampleTx } from '@/components/TxProof';
import { demoHash, demoTag, exhibitSpecs, MEMES } from '@/lib/memes';
import { AsciiField, AsciiObject } from '@/components/AsciiField';
import { GlassIcon, type GlassName } from '@/components/GlassIcon';
import { cn } from '@/lib/utils';
import { useTreasury } from '@/lib/treasury';
import { useTreasurySnapshot } from '@/lib/earn';
import { usd } from '@/lib/format';
import { copyText } from '@/lib/format';
import { Donut } from '@/components/Charts';
import { Reveal } from '@/components/Reveal';
import { AndroidFeatureCard } from '@/components/QrLink';
import { CREATOR_TAX_BPS, VAULT_SPLIT } from '@/shared/economy';
import { DevActivity } from '@/components/DevActivity';

const ExhibitViewer = lazy(() => import('@/components/ExhibitViewer'));
export const documentation = [
  ['No account needed', 'Tap Scan & launch. On a computer, a single-use QR code moves the session to your phone; on a phone the camera opens right away. Signing in with X, a wallet or email is optional and only needed to keep scans in an inventory.'],
  ['Six guided photos, taken automatically', 'Walk around the object: four sides, then two from above. The scanner fires the shutter when you reach a new side. Every photo is stripped of location and camera data and screened for people, documents and screens before it is stored privately.'],
  ['One object, one coin', 'Before any 3D work, AI describes your object and compares it with every similar object already on ObjectPad. The same object, or a practically identical copy, is blocked. Reused photos are rejected across the whole archive.'],
  ['3D rebuild', 'Your photos become a textured, full-colour 3D model in about 2–4 minutes. ObjectPad checks the file, geometry and textures, then seals the model and every photo under SHA-256 hashes.'],
  ['Free launch', 'Name the coin and launch. The ObjectPad treasury pays the launch fee, the minimum first buy (burned, so nobody starts with a bag) and gas. You never sign or pay. Every launch is simulated first.'],
  ['Written on-chain', 'The launch transaction carries the object’s AI name, its OP- tag, its ID and its 3D fingerprint (triangles, vertices, proportions, materials). The coin page only appears once the confirmed transaction matches exactly.'],
  ['Fees', 'Every trade pays a 1.5% creator fee, split three ways: 0.5% buys and burns $OBJECTPAD, 0.5% goes to the creator, 0.5% goes to long-term holders.'],
  ['Limits', 'A scan proves a capture process and a digital model. It does not prove legal ownership or authenticity. Coins carry no redemption right and no promise of value.'],
];
const DOC_STEPS: { title: string; line: string; mode: CloudMode; stat: string; statLabel: string; icon: GlassName; id: string }[] = [
  { title: 'Scan', line: 'Walk around it. Six angles, auto shutter.', mode: 'swirl', stat: '6', statLabel: 'angles', icon: 'qr', id: 'pepe' },
  { title: 'Rebuild', line: 'Photos become a full-colour 3D model.', mode: 'assemble', stat: '~3', statLabel: 'minutes', icon: 'mesh', id: 'bull' },
  { title: 'Prove', line: 'Already on ObjectPad? Blocked.', mode: 'scan', stat: '1/1', statLabel: 'per object', icon: 'fingerprint', id: 'fine' },
  { title: 'Launch', line: 'Name + 3D fingerprint go on-chain.', mode: 'solid', stat: '$0', statLabel: 'to you', icon: 'rocket', id: 'wojak' },
];
const FAQ: [string, string][] = [
  ['Do I need an account?', 'No. Scan and launch first. Sign in after, if you want.'],
  ['What does it cost?', '$0. Our treasury pays the launch, first buy and gas.'],
  ['Can someone copy my object?', 'No. AI blocks any rescan of an object already on ObjectPad.'],
  ['What goes on-chain?', 'The object’s name, its OP- tag and its 3D measurements.'],
  ['Where do fees go?', '0.5% burn · 0.5% creator · 0.5% long-term holders.'],
  ['What doesn’t it prove?', 'Legal ownership, authenticity or value. Coins can’t be redeemed.'],
];

/** How it works: one live pipeline, four stations, the receipt, the fee split and short answers. */
export function Docs() {
  const split: { label: string; value: number; color: string; icon: GlassName }[] = [{ label: 'Buyback & burn', value: VAULT_SPLIT.burnBps, color: '#1B1D22', icon: 'burn' }, { label: 'Creator', value: VAULT_SPLIT.creatorBps, color: '#7C8391', icon: 'coins' }, { label: 'Long-term holders', value: VAULT_SPLIT.forgeBps, color: '#C3C8D1', icon: 'diamond' }];
  const [step, setStep] = useState<number>(0); const [open, setOpen] = useState<number>(0);
  useEffect(() => { const t = setInterval(() => setStep(s => (s + 1) % DOC_STEPS.length), 2800); return () => clearInterval(t); }, []);
  const sample = MEMES.find(m => m.id === 'pepe') ?? MEMES[0]; const current = DOC_STEPS[step]; const exhibit = MEMES.find(m => m.id === current.id) ?? sample;
  return <div className="page py-6 sm:py-10">
    <section className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
      <div><p className="lab">How it works · 4 stations</p><h1 className="display mt-4 text-[52px] leading-[0.92] sm:text-[84px]">Real thing in.<br/>Coin out.</h1><p className="mt-4 text-[20px] font-extrabold text-ink/65">About three minutes. You pay $0.</p></div>
      <Link to="/launch" className="cta-hero min-h-[72px] py-2 pl-2 pr-7 text-[18px]"><span className="orb size-[56px]"><GlassIcon name="qr" size={42} className="!filter-none"/></span>Scan & launch my coin<ArrowRight size={19} strokeWidth={2.6}/></Link>
    </section>

    <section className="steel relative mt-8 overflow-hidden rounded-[40px] p-3 sm:p-4">
      <AsciiField className="absolute inset-0 h-full w-full" cell={15} density={0.07} tone={0.09}/>
      <div className="relative grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <div className="raised crop relative h-[380px] overflow-hidden rounded-[30px] sm:h-[500px]"><i/><i/><i/><i/>
          <div className="scan-grid absolute inset-0" aria-hidden="true"/><div className="ticks-x pointer-events-none absolute inset-x-12 bottom-3 h-3 opacity-60" aria-hidden="true"/>
          <div className={cn('absolute inset-0 transition-opacity duration-500', step === 0 ? 'opacity-100' : 'opacity-0')}><PointCloud key={exhibit.id} src={exhibit.points} mode={current.mode} size={2.4} speed={0} className="absolute inset-0"/></div>
          {step > 0 && <div key={exhibit.id} className="card-pop absolute inset-0"><Suspense fallback={null}><ExhibitViewer src={exhibit.url} active front fallback={null}/></Suspense></div>}
          <div className="absolute left-6 top-6 flex items-center gap-3"><GlassIcon key={current.icon} name={current.icon} size={60} className="card-pop"/><div><p className="font-mono text-[12px] font-extrabold text-ink/65">STATION 0{step + 1}</p><p key={current.title} className="slide-left display text-[36px] leading-none">{current.title}</p></div></div>
          <div className="absolute right-6 top-6 text-right font-mono text-[12px] font-bold leading-5 text-ink/70"><p className="font-extrabold text-ink">{exhibit.catalog}</p><p>tris {exhibit.triangles.toLocaleString()}</p><p>verts {exhibit.vertices.toLocaleString()}</p></div>
          <div className="absolute inset-x-5 bottom-6"><p key={current.line} className="slide-in text-[19px] font-extrabold">{current.line}</p></div>
        </div>
        <ol className="grid grid-cols-2 gap-3">{DOC_STEPS.map((s, i) => <li key={s.title}><button onClick={() => setStep(i)} className={cn('flex h-full w-full flex-col justify-between rounded-[26px] p-4 text-left transition-all sm:p-5', i === step ? 'raised scale-[1.02]' : 'glass hover:bg-white/80')}>
          <div className="flex items-start justify-between"><GlassIcon name={s.icon} size={i === step ? 64 : 52} className="transition-all"/><span className={cn('step-num size-14 text-[32px] transition-all', i === step && 'on')}>{i + 1}</span></div>
          <div className="mt-4"><p className="display text-[34px] leading-none">{s.stat}<span className="ml-1.5 font-sans text-xs font-bold text-ink/60">{s.statLabel}</span></p><p className="mt-2 text-[17px] font-extrabold">{s.title}</p>{i === step && <span className="mt-2 block h-1 overflow-hidden rounded-full bg-ink/10"><span key={step} className="phase-fill block h-full bg-ink" style={{ animationDuration: '2800ms' }}/></span>}</div>
        </button></li>)}</ol>
      </div>
    </section>

    <section className="mt-8 grid items-center gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <Reveal><div><p className="lab">On Robinhood Chain</p><h2 className="display mt-3 text-[40px] sm:text-[54px]">The object is written into its launch.</h2><div className="mt-5 flex flex-wrap gap-2"><span className="chip">Name</span><span className="chip">OP- tag</span><span className="chip">Triangles</span><span className="chip">Vertices</span><span className="chip">Edges</span><span className="chip">Proportions</span><span className="chip">Material</span></div></div></Reveal>
      <Reveal delay={80}><TxPanel view={sampleTx({ tag: demoTag(sample), objectName: sample.catalog, objectId: demoHash(`${sample.id}-object`, 64), coinName: sample.name, symbol: sample.ticker, specs: exhibitSpecs(sample) })} colors={sample.colors}/></Reveal>
    </section>

    <section className="raised mt-8 grid items-center gap-8 rounded-[36px] p-6 sm:p-10 lg:grid-cols-[auto_1fr]">
      <div className="steel mx-auto rounded-full p-5"><Donut size={220} thickness={30} slices={split} center={<><span className="display text-4xl">{CREATOR_TAX_BPS / 100}%</span><span className="spec mt-1">every trade</span></>}/></div>
      <div><p className="lab">Fee split</p><h2 className="display mt-3 text-[38px] sm:text-[52px]">0.5 · 0.5 · 0.5</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">{split.map(leg => <div key={leg.label} className="sunk rounded-[22px] p-4"><GlassIcon name={leg.icon} size={56}/><p className="display mt-3 text-3xl">0.5%</p><p className="mt-1 flex items-center gap-2 font-extrabold"><span className="size-3 rounded-[4px]" style={{ background: leg.color }}/>{leg.label}</p></div>)}</div></div>
    </section>

    <section className="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
      <div><p className="lab">Short answers</p><h2 className="display mt-3 text-[40px] sm:text-[52px]">Questions.</h2><div className="mt-6 flex flex-wrap gap-2"><Link to="/safety" className="btn-ghost press min-h-11 px-4 text-sm">Safety & rights</Link><Link to="/treasury" className="btn-ghost press min-h-11 px-4 text-sm">Treasury</Link></div></div>
      <div className="grid gap-2.5 sm:grid-cols-2">{FAQ.map(([q, a], i) => <button key={q} onClick={() => setOpen(i)} className={cn('rounded-[22px] p-4 text-left transition-all', open === i ? 'raised' : 'glass hover:bg-white/80')}><p className="flex items-center justify-between gap-3 text-[16px] font-extrabold">{q}<span className={cn('font-mono text-lg transition-transform', open === i && 'rotate-45')}>+</span></p>{open === i && <p className="slide-in mt-2 text-[14.5px] font-semibold text-ink/65">{a}</p>}</button>)}</div>
    </section>

    <section className="steel relative mt-10 overflow-hidden rounded-[36px] p-8 text-center sm:p-12"><AsciiObject src="/models/points/fine.json" cols={64} rows={26} className="absolute -left-6 top-1/2 hidden -translate-y-1/2 text-[11.5px] text-ink/[0.09] md:block"/><AsciiObject src="/models/points/bull.json" cols={64} rows={26} className="absolute -right-6 top-1/2 hidden -translate-y-1/2 text-[11.5px] text-ink/[0.09] md:block"/><div className="relative"><GlassIcon name="rocket" size={96} float className="mx-auto"/><h2 className="display mt-4 text-[44px]">Ready?</h2><Link to="/launch" className="btn press mt-6 min-h-[62px] pl-1.5 pr-6 text-[15.5px]"><span className="orb size-[50px]"><GlassIcon name="qr" size={38} className="!filter-none"/></span>Scan with my phone<ArrowRight size={17}/></Link></div></section>
    <p className="mt-8 text-xs font-medium leading-6 text-ink/60">ObjectPad is not affiliated with Robinhood Markets, Inc. Coins carry no redemption right and no promise of value.</p>
  </div>;
}

/** The treasury: one ObjectPad wallet that pays every free launch AND every /earn reward payout. Nothing here is estimated. */
export function Treasury() {
  const t = useTreasury(); const snap = useTreasurySnapshot(); const [copied, setCopied] = useState<boolean>(false); const gauge = t.affordable ? Math.min(1, t.affordable / 60) : 0;
  const launches = snap.data?.launches ?? 0; const paidUsd = snap.data?.earn.paidUsd ?? 0; const creditedUsd = snap.data?.earn.creditedUsd ?? 0; const earners = snap.data?.earn.earners ?? 0;
  return <div className="page max-w-6xl py-8 sm:py-12">
    <section className="raised relative overflow-hidden rounded-[40px] p-6 sm:p-12">
      <div className="grid-paper pointer-events-none absolute inset-0 opacity-60" aria-hidden="true"/>
      <AsciiObject src="/models/points/card.json" cols={50} rows={26} className="absolute -right-6 top-1/2 hidden -translate-y-1/2 text-[11.5px] text-ink/[0.08] md:block"/>
      <div className="relative flex flex-wrap items-center gap-6"><GlassIcon name="vault" size={128} float/><div><p className="lab flex items-center gap-2"><span className={cn('size-2 rounded-full', t.open ? 'pulse-dot bg-up' : 'bg-ink/40')}/>ObjectPad treasury · live</p><p className="display mt-3 text-[54px] leading-none tnum sm:text-[84px]">{t.label}</p><p className="mt-3 text-[18px] font-extrabold text-ink/60">{t.balanceUsd} · one wallet, two jobs</p><p className="mt-2 max-w-xl text-[14.5px] font-semibold text-ink/55">This is the only ObjectPad treasury. It pays the launch fee, first buy and gas for every free coin launch, and it sends every <Link to="/earn" className="underline underline-offset-2">Earn</Link> reward payout, in ETH, from the same balance.</p></div></div>
      <div className="sunk relative mt-8 h-3 overflow-hidden rounded-full"><div className="bar-grow h-full rounded-full bg-ink" style={{ width: `${Math.max(2, gauge * 100)}%` }}/></div>
      <div className="relative mt-5 grid max-w-3xl gap-2 sm:grid-cols-3">{[['Free per person', `${t.perPerson} / day`], ['Covers now', t.loading ? '…' : `${t.affordable} launches`], ['Per launch', t.costEth ? `${t.costEth.toFixed(5)} ETH` : '…']].map(([k, v]) => <div key={k} className="sunk rounded-2xl px-4 py-3"><p className="stat-label">{k}</p><p className="mt-1 text-[22px] font-extrabold tnum">{v}</p></div>)}</div>
    </section>
    <section className="mt-4 grid gap-3 sm:grid-cols-4">
      {[['Coins launched', launches.toLocaleString('en-US'), 'rocket'], ['Paid to Earn creators', snap.isPending ? '…' : usd(paidUsd), 'coins'], ['Credited (incl. pending payout)', snap.isPending ? '…' : usd(creditedUsd), 'wallet'], ['X accounts earning', earners.toLocaleString('en-US'), 'chart']].map(([label, value, icon]) => <div key={label as string} className="raised rounded-[26px] p-5"><GlassIcon name={icon as GlassName} size={40}/><p className="stat-label mt-3">{label}</p><p className="mt-1 text-[24px] font-extrabold tnum">{value}</p></div>)}
    </section>
    <DevActivity/>
    <section className="mt-4 grid gap-4 md:grid-cols-[auto_1fr]">
      <div className="steel flex flex-col items-center rounded-[32px] p-6">{t.address ? <><div className="raised crop relative rounded-[26px] p-5"><i/><i/><i/><i/><QRCodeSVG value={t.address} size={184} level="M" marginSize={0} fgColor="#0C0D10" title="Treasury address"/></div><p className="mt-3 font-mono text-[11px] font-bold text-ink/65">Robinhood Chain · ETH · chain 4663</p><AndroidFeatureCard className="mt-4 w-full max-w-[260px]"/></> : <Loading label="Reading treasury…"/>}</div>
      <div className="raised rounded-[32px] p-6 sm:p-8">
        <h1 className="display text-[36px] sm:text-[44px]">Fund the treasury</h1>
        {t.address && <button onClick={() => void copyText(t.address ?? '').then(setCopied)} className="pill press mt-5 w-full !justify-between !pr-3 font-mono !text-[13px]"><span className="flex min-w-0 items-center gap-2.5"><span className="orb">{copied ? <Check size={16}/> : <Copy size={16}/>}</span><span className="truncate">{t.address}</span></span></button>}
        <ol className="mt-6 space-y-2.5">{([['wallet', 'Send ETH on Robinhood Chain', 'Chain ID 4663 · any wallet'], ['chain', 'Or bridge in first', 'Bridge ETH, then send it here'], ['rocket', 'That’s it', 'Funds launches and Earn payouts within 30s']] as [GlassName, string, string][]).map(([icon, h, d]) => <li key={h} className="sunk flex items-center gap-3 rounded-2xl p-2.5"><GlassIcon name={icon} size={44}/><div><p className="font-extrabold">{h}</p><p className="text-[13.5px] font-bold text-ink/60">{d}</p></div></li>)}</ol>
        <div className="mt-6 flex flex-wrap gap-2"><a href={t.address ? `https://robinhoodchain.blockscout.com/address/${t.address}` : '#'} target="_blank" rel="noreferrer" className="btn-ghost press min-h-11 px-4 text-sm">View on explorer<ArrowUpRight size={15}/></a><Link to="/earn" className="btn-ghost press min-h-11 px-4 text-sm">See the Earn leaderboard<ArrowUpRight size={15}/></Link></div>
      </div>
    </section>
  </div>;
}
export function Safety() { return <Article eyebrow="Safety & rights" title="Respect what you capture." intro="Physical things have owners, makers and histories. A digital artifact does not erase their rights." sections={[
  ['What a record proves', 'A record can show that an authenticated account completed a defined capture process and committed a particular digital artifact and metadata. It does not prove legal title, authenticity, uniqueness, physical possession at a later date, or the truth of a creator’s story.'],
  ['What you must have permission to do', 'Only upload imagery you are entitled to share and use for reconstruction. Do not tokenize stolen art or imply rights you do not have. Trademarked and counterfeit objects require careful rights review; photography alone does not grant tokenization rights.'],
  ['Content that is not accepted', 'No faces or personal documents, intimate or revenge content, private addresses, screens with personal information, weapons or prohibited items, illegal content, abuse, or attempts to exploit the image/model pipeline. Operators may restrict records while investigating a report.'],
  ['Privacy and third-party processing', 'Source photos are private by default and stripped of location and camera metadata. Two photos are sent to an AI model for the duplicate check, and four are sent to our 3D reconstruction service, both with your consent when you start a scan. Do not upload sensitive information even if you believe it will remain private.'],
  ['Takedowns and immutable commitments', 'ObjectPad can hide an exhibit and restrict hosted assets. It cannot erase a public blockchain event or files already downloaded. Append-only audit decisions document moderation. No promise of removing onchain information is made.'],
  ['Public 3D models', 'Once a coin launches, its 3D model and preview become public on the coin page. Any model rendered in a browser can be saved by that browser; ObjectPad offers no technical copy protection.'],
  ['Report a concern', 'Use Report on an object page while signed in. Reports are queued for operator review. Do not include private keys, wallet recovery phrases, personal documents or unnecessary personal information.'],
  ['Network relationship', 'ObjectPad is not affiliated with, endorsed by or officially connected with Robinhood Markets, Inc. Network references are exclusively to Robinhood Chain. ObjectPad does not use or incorporate Robinhood brand marks.'],
]}/>; }
function Article({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string; sections: string[][] }) { return <article className="page max-w-5xl py-10"><div className="spec">{eyebrow}</div><h1 className="display mt-4 text-[40px] sm:text-6xl">{title}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-muted">{intro}</p><div className="glass mt-10 divide-y divide-ink/[0.06] overflow-hidden rounded-[26px] px-6">{sections.map(([heading, body]) => <section key={heading} className="grid gap-5 py-8 md:grid-cols-[0.7fr_1.3fr]"><h2 className="text-base font-semibold">{heading}</h2><p className="text-sm leading-8 text-muted">{body}</p></section>)}</div></article>; }
export function Status() { const query = useQuery({ queryKey: ['objectpad', 'status'], queryFn: fetchReadiness, retry: false, refetchInterval: 30_000 }); const status = query.data ?? NOT_CONFIGURED; return <div className="page max-w-4xl py-14"><div className="spec">System status / evidence, not assumptions</div><h1 className="mt-5 display text-[40px] sm:text-5xl">Not live until it is proven.</h1><div className="glass mt-8 rounded-3xl p-7"><div className="flex items-center gap-3 text-lg font-medium"><span className={`size-2 rounded-full ${status.mode === 'operator_blocked' ? 'bg-clay' : 'bg-moss'}`}/>{status.mode === 'operator_blocked' ? 'Operator setup required' : 'Configured · acceptance pending'}</div><p className="mt-4 text-sm leading-7 text-muted">{status.blocker}</p><p className="mt-4 font-mono text-[11.5px] uppercase tracking-wider">Production acceptance: not completed</p></div><div className="glass mt-6 divide-y divide-ink/[0.06] overflow-hidden rounded-3xl px-6">{status.checks.map(check => <div key={check.id} className="flex items-center gap-3 py-5"><span className={check.ready ? 'text-moss' : 'text-muted'}>{check.ready ? <Check size={17}/> : <Circle size={14}/>}</span><span className="text-sm">{check.label}</span><span className="ml-auto font-mono text-[11.5px] text-muted">{check.ready ? 'CONFIGURED' : 'NOT CONNECTED'}</span></div>)}</div><p className="mt-6 text-sm leading-7 text-muted">Configuration is not evidence of a successful real capture, reconstruction, onchain registry deployment or token launch. Every financial action remains subject to server-side verification and explicit wallet approval.</p><Button variant="outline" className="mt-6" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? 'Checking…' : 'Check status again'}</Button>{query.isError && <p role="status" className="mt-4 text-xs text-muted">No independent API response received. The safe operator-blocked state is displayed.</p>}</div>; }
export function Provenance() { const [search, setSearch] = useState<string>(''); return <div className="page max-w-5xl py-14"><Fingerprint size={32} strokeWidth={1.2} className="text-moss"/><div className="spec mt-5">The provenance explorer</div><h1 className="mt-4 display text-[40px] sm:text-6xl">Follow the evidence.</h1><p className="mt-6 max-w-xl text-base leading-8 text-muted">Trace an object from accepted capture commitments to its artifact, decoded registry event and token launch.</p><form className="mt-9 flex flex-col gap-3 sm:flex-row" onSubmit={event => event.preventDefault()}><div className="relative flex-1"><Search size={18} className="absolute left-4 top-4 text-muted"/><input className="w-full pl-11" aria-label="Object, token, creator, hash or transaction" placeholder="Object name, token, content hash or transaction…" value={search} onChange={event => setSearch(event.target.value)}/></div><Button asChild><Link to={`/explore?q=${encodeURIComponent(search)}`}>Search records<ArrowUpRight/></Link></Button></form><div className="mt-12 grid gap-5 sm:grid-cols-3">{[['Capture manifest', 'A commitment to all accepted, normalized frames. Source images are not public by default.'], ['Artifact hashes', 'Exact byte identities of the model and metadata, independently checkable with SHA-256.'], ['Decoded events', 'The public name comes from a confirmed ObjectRegistered event, not just an editable database label.']].map(([title, text]) => <div key={title} className="glass rounded-2xl p-5"><h2 className="font-semibold">{title}</h2><p className="mt-3 text-sm leading-7 text-muted">{text}</p></div>)}</div><div className="glass mt-10 rounded-2xl p-6 text-sm leading-7 text-muted">Capture provenance is not proof of legal ownership, uniqueness or physical authenticity. No raw model data is represented as stored onchain.</div></div>; }
export function Activity() { const query = useQuery({ queryKey: ['objectpad', 'activity'], queryFn: () => api<PublicFeed>('/activity'), retry: false, refetchInterval: 20_000 }); return <div className="page py-14"><div className="spec">Verified activity</div><h1 className="mt-5 display text-[40px] sm:text-5xl">The archive, unfolding.</h1><p className="mt-5 text-sm leading-7 text-muted">Only confirmed ObjectPad launches. No pending transaction is presented as a success.</p>{query.isPending ? <Loading/> : query.isError ? <div className="mt-8"><ErrorState message="The verified activity stream is not connected." retry={() => void query.refetch()}/></div> : query.data.items.length ? <div className="mt-8 divide-y divide-ink/15">{query.data.items.map(item => <Link key={item.objectId} to={`/objects/${item.objectId}`} className="flex items-center gap-5 py-5"><img src={item.model.thumbnailUrl} alt={item.verifiedName} className="size-14 rounded-xl object-cover"/><div><p className="font-medium">{item.verifiedName}</p><p className="mt-1 text-xs text-muted">Confirmed record · ${item.symbol}</p></div><ArrowUpRight className="ml-auto" size={18}/></Link>)}</div> : <Empty title="Nothing confirmed yet." description="The first real, reconciled launch will appear here." action={false}/>}</div>; }
