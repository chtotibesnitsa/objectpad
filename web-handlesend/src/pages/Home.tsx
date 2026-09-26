import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, ArrowUpRight, Check, Copy, LoaderCircle, MousePointer2, RefreshCw, Smartphone, X } from 'lucide-react';
import { ScanHero } from '@/components/ScanHero';
import { CaPill } from '@/components/CaPill';
import { MarketBoard } from '@/components/MarketBoard';
import { Reveal, CountUp } from '@/components/Reveal';
import { Donut } from '@/components/Charts';
import { PointCloud, type CloudMode } from '@/components/PointCloud';
import { AsciiField, AsciiObject } from '@/components/AsciiField';
import { GlassIcon, type GlassName } from '@/components/GlassIcon';
import { SpecimenCard, LaunchTile } from '@/components/CoinCard';
import { TxPanel, sampleTx, useLaunchTx } from '@/components/TxProof';
import { AndroidFeatureCard, QrLinkReveal } from '@/components/QrLink';
import { usePreferences } from '@/hooks/use-preferences';
import { useInView } from '@/hooks/use-in-view';
import { useTreasury } from '@/lib/treasury';
import { useMarket, useReadiness } from '@/lib/market';
import { useCoins } from '@/lib/coins';
import { useScanLink } from '@/lib/handoff';
import { isPhone } from '@/lib/creator';
import { api } from '@/lib/api';
import { copyText, shortAddress } from '@/lib/format';
import { demoHash, demoTag, exhibitById, exhibitSpecs, MEMES, TOKENIZABLE } from '@/lib/memes';
import { cn } from '@/lib/utils';
import type { PublicFeed } from '@/shared/domain';
import { BPS, CREATOR_TAX_BPS, VAULT_SPLIT } from '@/shared/economy';

const ExhibitViewer = lazy(() => import('@/components/ExhibitViewer'));
const delay = (ms: number) => ({ '--delay': `${ms}ms` } as CSSProperties);
const perTrade = (bps: number) => `${(Math.round((CREATOR_TAX_BPS * bps) / BPS) / 100).toLocaleString('en', { maximumFractionDigits: 2 })}%`;
const clock = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Section heading: a lab code, a big display title and an optional action on the right. */
function SectionHead({ code, title, aside, className }: { code: string; title: ReactNode; aside?: ReactNode; className?: string }) {
  return <Reveal className={className}><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="lab">{code}</p><h2 className="display mt-3 max-w-4xl text-[36px] sm:text-[48px] xl:text-[58px]">{title}</h2></div>{aside}</div></Reveal>;
}
/** Primary liquid-glass action with a rendered glass icon. */
function Cta({ children = 'Scan with my phone', className, to = '/launch', icon = 'qr' }: { children?: ReactNode; className?: string; to?: string; icon?: GlassName }) {
  return <Link to={to} className={cn('btn press group min-h-[62px] pl-1.5 pr-6 text-[15.5px]', className)}><span className="orb size-[50px]"><GlassIcon name={icon} size={38} className="!filter-none"/></span>{children}<ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5"/></Link>;
}
/** The main action on the page: start a scan. Visibly heavier than every pill and secondary button. */
function HeroCta() {
  return <Link to="/launch" className="cta-hero group min-h-[76px] py-2 pl-2 pr-7 text-[18px] sm:text-[19px]"><span className="orb size-[60px]"><GlassIcon name="qr" size={46} className="!filter-none"/></span><span className="flex flex-col leading-tight"><span>Scan & launch my coin</span><span className="text-[13px] font-bold text-white/65">Free · about 3 minutes</span></span><ArrowRight size={20} strokeWidth={2.6} className="ml-1 transition-transform group-hover:translate-x-1"/></Link>;
}
function Pill({ icon, children, className }: { icon: GlassName; children: ReactNode; className?: string }) {
  return <span className={cn('pill', className)}><span className="orb"><GlassIcon name={icon} size={30} className="!filter-none"/></span>{children}</span>;
}

function RotatingWord() {
  const { reducedMotion } = usePreferences(); const [index, setIndex] = useState<number>(0);
  useEffect(() => { if (reducedMotion) return; const timer = setInterval(() => setIndex(i => (i + 1) % TOKENIZABLE.length), 1800); return () => clearInterval(timer); }, [reducedMotion]);
  return <span className="relative inline-block [perspective:600px]"><span key={index} className="word-in inline-block border-b-[3px] border-ink text-ink">{TOKENIZABLE[index]}</span></span>;
}

/** Live numbers under the hero: treasury, free launches left, cost per launch and system health. */
function LiveStrip() {
  const t = useTreasury(); const status = useReadiness(); const market = useMarket(); const checks = status.data?.checks ?? [];
  const cells: { label: string; value: ReactNode; icon: GlassName; to: string }[] = [
    { label: 'Launch treasury', value: t.balanceEth === null ? t.label : <CountUp value={t.balanceEth} format={v => `${v.toFixed(4)} ETH`}/>, icon: 'vault', to: '/treasury' },
    { label: 'Free launches today', value: t.loading ? '…' : t.open ? `${t.launchesLeft} left` : 'Topping up', icon: 'rocket', to: '/launch' },
    { label: 'Per launch · paid by us', value: t.costUsd, icon: 'coins', to: '/treasury' },
    { label: 'Object coins live', value: market.data ? String(market.data.objectpad.launched) : '…', icon: 'chart', to: '/explore' },
    { label: 'Systems', value: checks.length ? `${checks.filter(c => c.ready).length}/${checks.length} live` : '…', icon: 'shield', to: '/status' },
  ];
  return <div className="raised grid grid-cols-2 overflow-hidden rounded-[26px] sm:grid-cols-3 lg:grid-cols-5">{cells.map((cell, i) => <Link key={cell.label} to={cell.to} className={cn('group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink/[0.025]', i > 0 && 'lg:border-l lg:border-ink/[0.08]', i === 4 && 'col-span-2 sm:col-span-1')}>
    <GlassIcon name={cell.icon} size={44} className="transition-transform group-hover:scale-110"/>
    <span className="min-w-0"><span className="block font-mono text-[11px] font-extrabold uppercase tracking-wide text-ink/65">{cell.label}</span><span className="mt-0.5 block truncate text-[18px] font-extrabold tnum">{cell.value}</span></span>
  </Link>)}</div>;
}

function Hero() {
  return <section className="page pb-8 pt-8 sm:pt-12">
    <div className="grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12 2xl:gap-16">
      <div className="relative z-10">
        <p className="enter lab">ObjectPad · launching soon · the physical-object launchpad</p>
        <Link to="/download" className="enter slide-in group mt-4 flex items-center gap-2.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-extrabold text-white transition-transform hover:scale-[1.02]" style={delay(30)}><span className="pulse-dot size-1.5 shrink-0 rounded-full bg-up"/>Update #2 · Free launches are now unlimited for everyone<ArrowRight size={14} className="shrink-0 transition-transform group-hover:translate-x-0.5"/></Link>
        <h1 className="enter display mt-5 text-[clamp(40px,10.5vw,64px)] leading-[0.92] lg:text-[clamp(52px,4.1vw,76px)]" style={delay(60)}><span className="block whitespace-nowrap">Tokenize the</span><span className="block whitespace-nowrap">physical world.</span></h1>
        <p className="enter mt-6 max-w-xl text-[22px] font-extrabold leading-[1.35] tracking-[-0.015em] sm:text-[26px]" style={delay(120)}>Scan your <RotatingWord/> with your phone. We launch its coin. <span className="whitespace-nowrap">You pay $0.</span></p>
        <div className="enter mt-7 flex flex-col gap-3 sm:flex-row sm:items-center" style={delay(180)}><HeroCta/><Link to="/explore" className="btn-ghost press min-h-[56px] px-6 text-[15px]">See the coins<ArrowUpRight size={16}/></Link></div>
        <div className="enter mt-4 max-w-[560px]" style={delay(210)}><CaPill/></div>
        <div className="enter mt-3 max-w-[560px]" style={delay(225)}><AndroidFeatureCard layout="wide"/></div>
        <div className="enter mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[14.5px] font-extrabold text-ink/70" style={delay(240)}>{['$0 launch', 'No account', 'Full 3D scan', '1 object = 1 coin'].map(t => <span key={t} className="flex items-center gap-1.5"><Check size={16} strokeWidth={3} className="text-ink"/>{t}</span>)}</div>
      </div>
      <div className="enter" style={delay(100)}><ScanHero/></div>
    </div>
    <div className="enter mt-6" style={delay(300)}><LiveStrip/></div>
  </section>;
}

/**
 * The promise plus a private QR code for this visitor. Scanning it opens this visitor's own scan on their phone, and
 * this page follows into the live studio as soon as the phone connects.
 */
function FreeLaunch() {
  const t = useTreasury(); const ref = useRef<HTMLElement>(null); const seen = useInView(ref, '200px', true); const phone = useMemo(() => isPhone(), []);
  const link = useScanLink(seen && !phone); const [now, setNow] = useState<number>(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const resume = link.session && (link.session.deviceConnected || link.session.views.length > 0);
  const gauge = t.affordable ? Math.min(1, t.affordable / 60) : 0;
  return <section ref={ref} className="page py-10 sm:py-14">
    <Reveal><div className="raised relative overflow-hidden rounded-[40px]">
      <div className="grid-paper pointer-events-none absolute inset-0 opacity-70" aria-hidden="true"/>
      <AsciiObject src="/models/points/pepe.json" cols={70} rows={34} className="absolute -left-10 bottom-[-40px] hidden text-[11.5px] text-ink/[0.09] lg:block"/>
      <div className="relative grid items-stretch gap-6 p-5 sm:p-8 lg:grid-cols-[1.15fr_auto] lg:gap-10 lg:p-12">
        <div className="flex flex-col">
          <p className="lab">02 · Free launch program</p>
          <h2 className="display mt-4 text-[42px] leading-[0.93] sm:text-[72px]">We fund<br/>every launch.</h2>
          <p className="mt-4 max-w-md text-[19px] font-extrabold text-ink/70">Your phone scans it. Our treasury pays for it. It goes live.</p>
          <div className="mt-6 hidden flex-wrap gap-2.5 sm:flex"><Pill icon="wallet">You pay $0</Pill><Pill icon="rocket">{t.loading ? '…' : t.open ? `${t.launchesLeft} free launches today` : 'Launches queue free'}</Pill><Pill icon="burn">First buy burned</Pill></div>
          <div className="steel mt-auto rounded-[26px] p-4 sm:p-5 lg:mt-8">
            <div className="flex items-center gap-3 sm:gap-4">
              <GlassIcon name="vault" size={52} float/>
              <div className="min-w-0 flex-1"><p className="flex items-center gap-2 font-mono text-[11px] font-extrabold uppercase text-ink/70"><span className={cn('size-2 shrink-0 rounded-full', t.open ? 'pulse-dot bg-up' : 'bg-ink/40')}/>Launch treasury</p><p className="display mt-1 whitespace-nowrap text-[30px] leading-none tnum sm:text-[44px]">{t.balanceEth === null ? t.label : <CountUp value={t.balanceEth} format={v => `${v.toFixed(4)} ETH`}/>}</p></div>
              <Link to="/treasury" className="btn press hidden min-h-12 px-5 text-sm sm:inline-flex">Fund it<ArrowUpRight size={15}/></Link>
            </div>
            <div className="sunk mt-4 h-2.5 overflow-hidden rounded-full"><div className="bar-grow h-full rounded-full bg-ink" style={{ width: `${Math.max(2, gauge * 100)}%` }}/></div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] font-extrabold uppercase text-ink/65 sm:flex sm:flex-wrap sm:justify-between"><span>Covers {t.affordable} launches</span><span className="text-right sm:text-left">{t.costUsd} each</span><span>{t.perPerson} free / person / day</span>{t.address && <span className="text-right sm:text-left">{shortAddress(t.address, 6, 4)}</span>}</div>
            <Link to="/treasury" className="btn press mt-4 min-h-12 w-full px-5 text-sm sm:hidden">Fund the treasury<ArrowUpRight size={15}/></Link>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[340px] flex-col items-center">
          {phone ? <div className="flex w-full flex-col gap-3"><div className="sunk grid grid-cols-3 gap-1 rounded-[22px] p-1.5 text-center">{[['1', 'Scan'], ['2', '3D build'], ['3', 'Coin live']].map(([n, l]) => <div key={n} className="raised rounded-[16px] px-2 py-2.5"><p className="display text-[22px] leading-none">{n}</p><p className="mt-1 text-[12px] font-extrabold">{l}</p></div>)}</div><Link to="/launch" className="cta-hero min-h-[64px] w-full justify-between py-2 pl-2 pr-5 text-[16px]"><span className="orb size-[48px]"><GlassIcon name="qr" size={36} className="!filter-none"/></span><span className="flex-1">Open the scanner</span><ArrowRight size={18}/></Link></div>
            : <>
              <div className="raised crop relative flex aspect-square w-full items-center justify-center rounded-[34px] p-6"><i/><i/><i/><i/>
                {resume ? <div className="text-center"><GlassIcon name="mesh" size={110} float className="mx-auto"/><p className="display mt-4 text-2xl">Scan in progress</p><Link to={`/launch/${link.session?.id}`} className="btn press mt-4 min-h-12 px-5 text-sm">Resume my scan<ArrowRight size={15}/></Link></div>
                  : link.url && link.expires > now ? <QRCodeSVG value={link.url} size={260} level="M" marginSize={0} fgColor="#0C0D10" className="h-full w-full" title="Scan with your phone to start your coin"/>
                  : link.error ? <div className="text-center"><p className="text-sm font-bold">Couldn’t make your code.</p><button onClick={link.retry} className="btn press mt-3 min-h-11 px-4 text-sm"><RefreshCw size={14}/>Try again</button></div>
                  : <div className="flex flex-col items-center gap-3 text-ink/65"><LoaderCircle className="animate-spin"/><span className="font-mono text-[11px] font-bold uppercase">Making your private code…</span></div>}
              </div>
              <p className="mt-4 flex items-center gap-2 whitespace-nowrap text-[19px] font-extrabold"><Smartphone size={20} strokeWidth={2.6}/>Scan with your phone</p>
              {link.url && !resume && <a href={`/capture/claim${link.url.includes('#') ? link.url.slice(link.url.indexOf('#')) : ''}`} className="mt-1.5 text-[14px] font-bold text-ink/60 underline underline-offset-4 hover:text-ink">or use this computer’s camera</a>}
              {link.url && !resume && link.expires > now && <QrLinkReveal url={link.url} className="mt-1"/>}
              <p className="mt-3 flex items-center gap-2 font-mono text-[11.5px] font-extrabold uppercase text-ink/65">{resume ? <><span className="pulse-dot size-2 rounded-full bg-up"/>Phone connected</> : link.url && link.expires > now ? <><span className="pulse-signal size-2 rounded-full bg-ink"/>Private to you · waiting for your phone · {clock(link.expires - now)}</> : 'Single-use · no account'}</p>
              <AndroidFeatureCard className="mt-4" badge="Or, install the app"/>
            </>}
        </div>
      </div>
    </div></Reveal>
  </section>;
}

/** Coins from real scanned objects, each a real spinning 3D scan with its own coin page. */
function CoinsShelf() {
  const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null; const feed = useCoins(); const coins = useMemo(() => (feed.data?.items ?? []).slice(0, 7), [feed.data]);
  return <section className="page py-12 sm:py-16">
    <SectionHead code="03 · Object coins" title="Real things. Real charts." aside={<Link to="/explore" className="pill press !pr-5"><span className="orb"><GlassIcon name="chart" size={30} className="!filter-none"/></span>All coins<ArrowRight size={15}/></Link>}/>
    <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">{coins.map((coin, i) => <Reveal key={coin.id} delay={i * 50}><SpecimenCard coin={coin} ethUsd={ethUsd} index={i}/></Reveal>)}<Reveal delay={350}><LaunchTile/></Reveal></div>
  </section>;
}

const STAGE_MS = [1500, 1300, 1600, 2200];
const ENGINE_MODES: { mode: CloudMode; label: string; spec: string; icon: GlassName }[] = [
  { mode: 'swirl', label: 'Capture', spec: 'points orbit → lock on', icon: 'qr' },
  { mode: 'assemble', label: 'Reconstruct', spec: 'photos → real mesh', icon: 'mesh' },
  { mode: 'solid', label: 'Texture', spec: 'full colour · PBR', icon: 'ai' },
  { mode: 'solid', label: 'Fingerprint', spec: '1 of 1 · sealed', icon: 'fingerprint' },
];

/** R&D bay: a real object's surface points go from sensor noise to a coloured model, with live measurements. */
function ScanEngine() {
  const [stage, setStage] = useState<number>(0); const [object, setObject] = useState<number>(0); const ref = useRef<HTMLDivElement>(null); const visible = useInView(ref); const { reducedMotion } = usePreferences();
  useEffect(() => { if (!visible || reducedMotion) return; const timer = setTimeout(() => setStage(s => { if (s === ENGINE_MODES.length - 1) setObject(o => (o + 1) % MEMES.length); return (s + 1) % ENGINE_MODES.length; }), STAGE_MS[stage]); return () => clearTimeout(timer); }, [visible, reducedMotion, stage]);
  const solid = stage >= 2 || reducedMotion;
  const exhibit = MEMES[object % MEMES.length]; const current = ENGINE_MODES[reducedMotion ? 3 : stage];
  return <section className="page py-12 sm:py-20">
    <SectionHead code="04 · Scan engine" title={<>Phone camera in.<br/>Real 3D asset out.</>}/>
    <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Reveal><div ref={ref} className="steel relative h-[440px] overflow-hidden rounded-[32px] sm:h-[540px]">
        <AsciiField className="absolute inset-0 h-full w-full" cell={15} density={0.08} tone={0.09}/>
        <div className="raised crop absolute inset-3 overflow-hidden rounded-[24px] sm:inset-4"><i/><i/><i/><i/>
          <div className="scan-grid absolute inset-0" aria-hidden="true"/>
          <div className="ticks-x pointer-events-none absolute inset-x-12 bottom-3 h-3 opacity-60" aria-hidden="true"/><div className="ticks-y pointer-events-none absolute inset-y-16 left-3 w-3 opacity-60" aria-hidden="true"/>
          <div className={cn('absolute inset-0 transition-opacity duration-500', solid ? 'opacity-0' : 'opacity-100')}><PointCloud key={exhibit.id} src={exhibit.points} mode={current.mode} size={2.4} speed={1.4} className="absolute inset-0"/></div>
          {visible && <div className={cn('absolute inset-0 transition-[opacity,transform] duration-700', solid ? 'scale-100 opacity-100' : 'scale-95 opacity-0')}><Suspense fallback={null}><ExhibitViewer src={exhibit.url} active={visible && solid} fallback={null} front/></Suspense></div>}
          {stage === 3 && <div key={`fp-${object}`} className="stamp pointer-events-none absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-white/95 px-4 py-2 font-mono text-[12px] font-extrabold uppercase text-ink shadow-[0_0_0_2px_#0C0D10,0_20px_40px_-20px_rgba(12,13,16,.6)]"><Check size={15} strokeWidth={3}/>{demoTag(exhibit)} · sealed</div>}
          <div className="absolute left-4 top-4 flex items-center gap-3 sm:left-5 sm:top-5"><GlassIcon key={current.icon} name={current.icon} size={44} className="card-pop"/><div><p key={current.label} className="slide-left display text-[24px] leading-none sm:text-[30px]">{current.label}</p><p className="mt-1 font-mono text-[12px] font-extrabold text-ink/65">{current.spec}</p></div></div>
          <div className="absolute right-5 top-5 hidden text-right font-mono text-[12px] font-bold leading-5 text-ink/70 md:block"><p className="font-extrabold text-ink">{exhibit.catalog}</p><p>tris {exhibit.triangles.toLocaleString()}</p><p>verts {exhibit.vertices.toLocaleString()}</p><p>dims {exhibit.dims.map(d => d.toFixed(2)).join('×')}</p></div>
          <div className="absolute inset-x-3 bottom-3 grid grid-cols-4 gap-1 sm:inset-x-4 sm:bottom-4 sm:gap-1.5">{ENGINE_MODES.map((m, i) => <button key={m.label} onClick={() => setStage(i)} className={cn('min-h-12 rounded-2xl px-1.5 py-2 text-center text-[11px] font-extrabold transition-all sm:px-3 sm:py-2.5 sm:text-left sm:text-[13px]', i === stage ? 'raised scale-[1.02]' : 'sunk text-ink/60 hover:text-ink')}><span className="font-mono text-[11px] opacity-60">0{i + 1}</span><span className="block truncate">{m.label}</span></button>)}</div>
        </div>
      </div></Reveal>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[{ icon: 'qr' as GlassName, title: 'Auto-shutter', stat: '6', unit: 'angles' }, { icon: 'mesh' as GlassName, title: 'Full-colour mesh', stat: '~90K', unit: 'triangles' }, { icon: 'fingerprint' as GlassName, title: 'AI fingerprint', stat: '1/1', unit: 'per object' }, { icon: 'shield' as GlassName, title: 'Hashed & sealed', stat: 'SHA', unit: '256' }].map((card, i) => <Reveal key={card.title} delay={i * 60}><div className="raised lift flex h-full flex-col justify-between rounded-[24px] p-4 sm:rounded-[28px] sm:p-5"><GlassIcon name={card.icon} size={48}/><div className="mt-4 sm:mt-6"><p className="display text-[30px] leading-none sm:text-[40px]">{card.stat}<span className="ml-1 font-sans text-[12px] font-bold text-ink/60 sm:text-sm">{card.unit}</span></p><p className="mt-2 text-[14px] font-extrabold sm:text-[15.5px]">{card.title}</p></div></div></Reveal>)}
      </div>
    </div>
  </section>;
}

/** The object's name and 3D fingerprint, readable straight from its launch transaction. */
function NamedOnChain() {
  const feed = useQuery({ queryKey: ['objectpad', 'archive-latest'], queryFn: () => api<PublicFeed>('/objects'), retry: false, staleTime: 60_000 });
  const latest = feed.data?.items.find(item => item.launchTransactionHash) ?? null; const tx = useLaunchTx(latest?.launchTransactionHash);
  const demo = exhibitById('pepe') ?? MEMES[0]; const sample = useMemo(() => sampleTx({ tag: demoTag(demo), objectName: demo.catalog, objectId: demoHash(`${demo.id}-object`, 64), coinName: demo.name, symbol: demo.ticker, specs: exhibitSpecs(demo) }), [demo]);
  const real = latest && tx.data?.record ? tx.data : null;
  const rows: { icon: GlassName; t: string; d: string }[] = [{ icon: 'ai', t: 'Its name', d: 'catalogued by AI from the photos' }, { icon: 'mesh', t: 'Its 3D fingerprint', d: 'triangles · vertices · edges · proportions' }, { icon: 'fingerprint', t: 'Its tag', d: 'OP-XXXX-XXXX · one object, once' }, { icon: 'chain', t: 'Written into the tx', d: 'readable on Robinhood Chain · can’t be edited' }];
  return <section className="page py-12 sm:py-20">
    <div className="grid items-center gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
      <div>
        <SectionHead code="05 · On-chain record" title={<>The object lives<br/>in its launch.</>}/>
        <Reveal delay={80}><ul className="mt-7 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">{rows.map(item => <li key={item.t} className="raised flex items-center gap-3 rounded-[22px] p-2.5 pr-4"><GlassIcon name={item.icon} size={50}/><span><span className="block text-[16px] font-extrabold">{item.t}</span><span className="block text-[13.5px] font-bold text-ink/60">{item.d}</span></span></li>)}</ul></Reveal>
      </div>
      <Reveal delay={100}><TxPanel view={real ?? sample} expected={real && latest ? { objectTag: latest.objectTag } : undefined} colors={demo.colors} coin={real ? undefined : demo.coin} image={real ? undefined : demo.image}/></Reveal>
    </div>
  </section>;
}

/** Real textured 3D models of meme-famous objects. */
function Museum() {
  const [index, setIndex] = useState<number>(0); const stage = useRef<HTMLDivElement>(null); const visible = useInView(stage); const [armed, setArmed] = useState<boolean>(false);
  useEffect(() => { if (visible) setArmed(true); }, [visible]);
  const exhibit = MEMES[index]; const fallback = <div className="flex h-full items-center justify-center"><img src={exhibit.image} alt="" className="h-[70%] object-contain"/></div>;
  return <section className="page py-12 sm:py-20">
    <SectionHead code="06 · Specimen archive" title={<>Memes you can hold.<br/>Coins you can trade.</>}/>
    <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Reveal><div ref={stage} className="raised crop relative h-[440px] overflow-hidden rounded-[32px] sm:h-[580px]"><i/><i/><i/><i/>
        <div className="scan-stage absolute inset-[6px] rounded-[27px]" aria-hidden="true"/><div className="scan-grid absolute inset-0" aria-hidden="true"/>
        {armed ? <Suspense fallback={fallback}><ExhibitViewer src={exhibit.url} active={visible} fallback={fallback}/></Suspense> : fallback}
        <div className="pointer-events-none absolute left-6 top-6"><p className="lab">{exhibit.kind}</p><p key={exhibit.id} className="slide-in display mt-2 text-[36px]">{exhibit.name}</p><p className="mt-1 text-[15px] font-extrabold text-ink/60">{exhibit.nod}</p></div>
        <span className="chip pointer-events-none absolute right-6 top-6"><MousePointer2 size={12}/>Drag 360°</span>
        <div className="pointer-events-none absolute inset-x-6 bottom-6 flex flex-wrap items-center gap-2"><span className="pill !min-h-11 !pr-4"><img src={exhibit.coin} alt="" className="size-9 rounded-full"/>${exhibit.ticker}</span><span className="chip">{exhibit.triangles.toLocaleString()} tris</span><span className="chip">{exhibit.vertices.toLocaleString()} verts</span><span className="chip">{exhibit.materials.join(' · ')}</span></div>
      </div></Reveal>
      <div className="flex flex-col gap-4">
        <div className="steel grid grid-cols-4 gap-2 rounded-[26px] p-2.5 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6">{MEMES.map((meme, i) => <button key={meme.id} onClick={() => setIndex(i)} aria-pressed={i === index} aria-label={meme.name} className={cn('press flex aspect-square items-center justify-center rounded-2xl p-1 transition-all', i === index ? 'raised scale-105' : 'hover:bg-white/60')}><img src={meme.image} alt="" loading="lazy" className="h-full w-full object-contain"/></button>)}</div>
        <div key={exhibit.id} className="raised slide-in flex flex-1 flex-col rounded-[28px] p-6">
          <p className="text-[21px] font-extrabold leading-snug">{exhibit.caption}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">{exhibit.colors.map(c => <span key={c} className="size-8 rounded-xl ring-2 ring-white shadow-[0_0_0_1px_rgba(12,13,16,.14)]" style={{ background: c }}/>)}<span className="ml-1 font-mono text-[12px] font-extrabold uppercase text-ink/65">colour print · dims {exhibit.dims.map(d => d.toFixed(2)).join('×')}</span></div>
          <Cta className="mt-6 justify-between lg:mt-auto">Scan your own</Cta>
        </div>
      </div>
    </div>
  </section>;
}

/** Same object, new photos, different room: still blocked. */
function NoCopies() {
  return <section className="page py-12 sm:py-20">
    <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <SectionHead code="07 · Non-replicable" title={<>One object.<br/>One coin. Ever.</>}/>
        <Reveal delay={80}><p className="mt-5 max-w-md text-[19px] font-extrabold leading-snug">Each real object can be tokenized <span className="border-b-[3px] border-ink">once</span>. Scan the same thing again and our AI knows.</p><ul className="mt-6 grid max-w-md grid-cols-2 gap-2.5">{['New photos', 'Other room', 'Other light', 'Reused frames'].map(t => <li key={t} className="pill !pr-4"><span className="orb !size-9 text-down"><X size={16} strokeWidth={3.2}/></span>{t}</li>)}</ul>
          <p className="mt-6 max-w-md text-[15px] font-bold leading-snug text-ink/60">Every scan is matched against every object on ObjectPad. No two real objects ever share a coin.</p></Reveal>
      </div>
      <Reveal delay={120}><div className="grid grid-cols-2 gap-4">
        {[{ src: '/assets/objects/beanie.webp', label: 'Scan #1', status: 'Launched', ok: true, note: 'Daylight · desk' }, { src: '/assets/objects/beanie-blue.webp', label: 'Scan #2', status: 'Blocked', ok: false, note: 'Blue light · other room' }].map(item => <figure key={item.label} className="raised overflow-hidden rounded-[28px]">
          <div className="scan-stage crop relative aspect-square"><i/><i/><i/><i/><img src={item.src} alt={`${item.label}: the same knitted beanie, ${item.note}`} loading="lazy" className="h-full w-full object-contain p-6"/>
            <span className="chip absolute left-4 top-4">{item.label}</span>
            {!item.ok && <div className="absolute inset-0 flex items-center justify-center"><span className="stamp flex -rotate-6 items-center gap-2 rounded-xl bg-white/95 px-4 py-2 font-mono text-sm font-extrabold uppercase text-down shadow-[0_0_0_2px_#E5484D,0_20px_40px_-20px_rgba(229,72,77,.6)] backdrop-blur"><X size={18} strokeWidth={3}/>Same object</span></div>}</div>
          <figcaption className="flex items-center justify-between border-t border-ink/[0.08] px-4 py-3"><div><p className="font-extrabold">{item.status}</p><p className="text-[13px] font-bold text-ink/60">{item.note}</p></div><span className={cn('flex size-9 items-center justify-center rounded-full text-white', item.ok ? 'bg-up' : 'bg-down')}>{item.ok ? <Check size={16} strokeWidth={3}/> : <X size={16} strokeWidth={3}/>}</span></figcaption>
        </figure>)}
      </div></Reveal>
    </div>
  </section>;
}

const FEE_SPLIT: { title: string; sub: string; share: number; color: string; icon: GlassName }[] = [
  { title: 'Buyback & burn', sub: 'Buys $OBJECTPAD and burns it', share: VAULT_SPLIT.burnBps, color: '#1B1D22', icon: 'burn' },
  { title: 'Creator', sub: 'Whoever scanned the object', share: VAULT_SPLIT.creatorBps, color: '#7C8391', icon: 'coins' },
  { title: 'Diamond hands', sub: 'Longest holders earn most', share: VAULT_SPLIT.forgeBps, color: '#C3C8D1', icon: 'diamond' },
];
function Fees() {
  return <section className="page py-12 sm:py-20">
    <Reveal><div className="steel relative grid items-center gap-8 overflow-hidden rounded-[40px] p-6 sm:p-10 lg:grid-cols-[auto_1fr] xl:gap-14">
      <AsciiField className="absolute inset-0 h-full w-full" cell={16} density={0.06} tone={0.08}/>
      <div className="raised relative mx-auto rounded-full p-5"><Donut size={240} thickness={32} slices={FEE_SPLIT.map(leg => ({ label: leg.title, value: leg.share, color: leg.color }))} center={<><span className="display text-5xl">{(CREATOR_TAX_BPS / 100).toFixed(1)}%</span><span className="spec mt-1">every trade</span></>}/></div>
      <div className="relative"><p className="lab">08 · Fee split</p><h2 className="display mt-3 text-[38px] sm:text-[52px]">Every trade pays back.</h2>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">{FEE_SPLIT.map(leg => <div key={leg.title} className="raised lift rounded-[24px] p-5"><div className="flex items-start justify-between"><GlassIcon name={leg.icon} size={58}/><span className="display text-[36px]">{perTrade(leg.share)}</span></div><p className="mt-5 flex items-center gap-2 text-[16px] font-extrabold"><span className="size-3 rounded-[4px]" style={{ background: leg.color }}/>{leg.title}</p><p className="mt-0.5 text-[13px] font-semibold text-ink/65">{leg.sub}</p></div>)}</div>
      </div>
    </div></Reveal>
  </section>;
}

function Market() {
  return <section id="market" className="page scroll-mt-28 py-12 sm:py-20">
    <SectionHead code="09 · ObjectPad market" title="The pad is moving." aside={<Link to="/explore?tab=market" className="pill press !pr-5"><span className="orb"><GlassIcon name="chart" size={30} className="!filter-none"/></span>Full list<ArrowRight size={15}/></Link>}/>
    <Reveal delay={60} className="mt-8"><MarketBoard/></Reveal>
  </section>;
}

/** Treasury address and funding, straight on the homepage. */
function Treasury() {
  const t = useTreasury(); const [copied, setCopied] = useState<boolean>(false);
  return <section className="page py-8">
    <Reveal><div className="raised grid items-center gap-6 rounded-[32px] p-6 sm:p-8 lg:grid-cols-[1fr_auto]">
      <div className="flex items-center gap-5"><GlassIcon name="vault" size={84} float/><div><p className="lab">10 · Launch treasury</p><p className="display mt-2 text-[36px] leading-none tnum sm:text-[46px]"><CountUp value={t.balanceEth ?? 0} format={v => `${v.toFixed(4)} ETH`}/></p><p className="mt-1.5 text-[15px] font-bold text-ink/60">Covers {t.affordable} free launches · {t.costUsd} each · anyone can top it up</p></div></div>
      <div className="flex flex-wrap gap-2">{t.address && <button onClick={() => void copyText(t.address ?? '').then(setCopied)} className="pill press font-mono !text-[13px]"><span className="orb">{copied ? <Check size={16}/> : <Copy size={16}/>}</span>{copied ? 'Copied' : shortAddress(t.address, 6, 4)}</button>}<Link to="/treasury" className="btn press min-h-12 px-5 text-sm">Fund & track<ArrowRight size={15}/></Link></div>
    </div></Reveal>
  </section>;
}

const RING_A = ['pepe', 'duck', 'bull', 'mug', 'console', 'fine', 'sneaker', 'wojak'];
const RING_B = ['rock', 'card', 'pizza', 'shiba', 'banana', 'penguin'];

/** Finale: real scanned objects orbit the call to action on two counter-rotating rings. Scales with its box, not the viewport. */
function DeskFinale() {
  const ref = useRef<HTMLElement>(null); const shown = useInView(ref, '0px 0px -80px 0px', true);
  const ring = (ids: string[], radius: number, size: string, reverse: boolean) => <div className={cn('pointer-events-none absolute inset-0', reverse ? 'orbit-spin-rev' : 'orbit-spin')} aria-hidden="true">{ids.map((id, i) => { const a = (i / ids.length) * Math.PI * 2; return <div key={id} className="absolute" style={{ left: `${50 + Math.cos(a) * radius}%`, top: `${50 + Math.sin(a) * radius}%`, transform: 'translate(-50%,-50%)' }}><div className={reverse ? 'orbit-counter-rev' : 'orbit-counter'}><div className="raised rounded-[22px] p-1.5"><img src={`/assets/objects/${id}.webp`} alt="" loading="lazy" className={cn('rounded-[16px] bg-[radial-gradient(circle,#fff,#EEF0F3)] object-contain', size)}/></div></div></div>; })}</div>;
  return <section ref={ref} className="page pb-6 pt-10">
    <div className={cn('steel relative overflow-hidden rounded-[44px] transition-all duration-1000', shown ? 'opacity-100' : 'translate-y-6 opacity-0')}>
      <AsciiField className="absolute inset-0 h-full w-full" cell={15} density={0.07} tone={0.08}/>
      <div className="relative mx-auto aspect-square w-full max-w-[880px]">
        <div className="orbit-ring inset-[6%]"/><div className="orbit-ring inset-[22%]"/>
        {ring(RING_A, 44, 'size-16 sm:size-24', false)}
        {ring(RING_B, 28, 'size-12 sm:size-[72px]', true)}
        <div className="absolute inset-0 flex items-center justify-center p-[30%] text-center">
          <div><h2 className="display text-[26px] sm:text-[44px] xl:text-[52px]">Tokenize what’s on your desk.</h2>
            <p className="mt-3 hidden font-mono text-[12.5px] font-extrabold uppercase text-ink/70 sm:block">One phone · one object · ~3 min · $0</p>
            <Link to="/launch" className="btn press mt-4 min-h-12 px-5 text-sm sm:mt-6 sm:min-h-14 sm:px-6 sm:text-[15px]">Scan & launch<ArrowRight size={16}/></Link></div>
        </div>
      </div>
    </div>
  </section>;
}

export default function Home() {
  return <>
    <Hero/>
    <FreeLaunch/>
    <CoinsShelf/>
    <ScanEngine/>
    <NamedOnChain/>
    <Museum/>
    <NoCopies/>
    <Fees/>
    <Treasury/>
    <Market/>
    <DeskFinale/>
  </>;
}
