import { memo, useDeferredValue, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Search } from 'lucide-react';
import { PAIR_KINDS, usePairs, type PairQuote } from '@/lib/pairs';
import { chain } from '@/lib/chain';
import { PairLogo } from '@/components/PairBadge';
import { FusionStage, useCombos, type ComboView } from '@/components/FusionStage';
import { SpinSprite } from '@/components/SpinSprite';
import { Reveal } from '@/components/Reveal';
import { OBJECTPAD_X_URL } from '@/lib/brand';
import { pct, usd } from '@/lib/format';
import { cn } from '@/lib/utils';

export const V2_POSTS: string[] = [
  'ObjectPad V2 is live.\n\nScan any real object, pair it with a tokenized stock, and launch it as a coin on Robinhood Chain. Free.\n\nNVDA. TSLA. AAPL. SPCX. GME. SPY. GLD. 70+ assets.\n\nobjectpad.fun',
  'New in V2: the AI now suggests a stock for your object.\n\nScan a sneaker and it may point you to a footwear name. Scan a console and it may point to gaming. One tap to accept, or keep ETH.\n\nYour coin gets a story, not just a picture.',
  'Stock-paired coins, bought with ETH.\n\nV2 routes your ETH through Uniswap V3 on Robinhood Chain into the pair asset, then into the curve. Quoted on-chain, signed in your wallet, no custody.',
  'On iPhone? You don’t have to wait for the App Store.\n\nOpen objectpad.fun/app in Safari → Share → Add to Home Screen.\n\nThe full ObjectPad iOS app, on your home screen, free.',
];

const FACTORY = '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e';
const short = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;
const KIND_LABEL: Record<string, string> = { native: 'Native', stock: 'Stock', etf: 'ETF', commodity: 'Commodity', stable: 'Stable', crypto: 'Crypto', community: 'Community' };

/** What shipped in V2.0, as a release log. Every entry is live today. */
const LOG: { tag: 'NEW' | 'IMP' | 'SHIP'; id: string; text: string }[] = [
  { tag: 'NEW', id: 'stock-pairing', text: 'launchToken(pairToken) on Pons V2: pair any coin with a stock, ETF, commodity or crypto' },
  { tag: 'NEW', id: 'ai-pair-pick', text: 'object → best-fit stock with a one-line reason · opt-in, ETH stays default' },
  { tag: 'NEW', id: 'eth-paired-buy', text: 'ETH → Uniswap V3 SwapRouter02 → pair asset → curve · quoted by QuoterV2' },
  { tag: 'NEW', id: 'pair-board', text: 'every asset priced from its deepest V3 pool · 30s refresh · no off-chain feeds' },
  { tag: 'NEW', id: 'market-pairs', text: 'pair badge + live 24h on every coin · filter the market by pair' },
  { tag: 'NEW', id: 'iphone-web-app', text: 'objectpad.fun/app · the full iOS app via Add to Home Screen' },
  { tag: 'IMP', id: 'qr-free-launch', text: 'launch from your phone without scanning a desktop QR code' },
  { tag: 'SHIP', id: 'android', text: 'APK updated with pairing, paired buys and the V2 log' },
  { tag: 'SHIP', id: 'ios-native', text: 'TestFlight live · submitted for App Store review' },
];
const STATUS: [string, 'live' | 'review'][] = [['web', 'live'], ['android', 'live'], ['iphone-web', 'live'], ['ios', 'review'], ['engine', 'live']];
const NEXT: [string, string][] = [['next', 'one-signature paired buys (swap + approve + buy)'], ['next', 'iOS public release on the App Store'], ['soon', 'pair performance leaderboard'], ['soon', 'crafting table: combine object coins']];

function useBlock() {
  return useQuery({ queryKey: ['objectpad', 'block'], queryFn: () => chain.getBlockNumber(), refetchInterval: 4_000, staleTime: 2_000, retry: 1 });
}

function TermLine({ i, children, className }: { i: number; children: ReactNode; className?: string }) {
  return <div className={cn('term-line whitespace-pre-wrap break-words', className)} style={{ '--delay': `${180 + i * 70}ms` } as CSSProperties}>{children}</div>;
}
const Prompt = () => <span className="text-[#1BD56A]">objectpad@robinhood<span className="text-white/40">:</span><span className="text-[#7FB2FF]">~</span><span className="text-white/40">$</span> </span>;

/** V2.0 release notes as a live terminal session, with the chain head ticking in the title bar. */
const ReleaseTerminal = memo(function ReleaseTerminal({ assets }: { assets: number }) {
  const block = useBlock(); let n = 0;
  return <div className="relative overflow-hidden rounded-[28px] bg-[#0B0C0F] text-[12.5px] leading-[1.65] text-white/85 shadow-[0_0_0_1px_rgba(12,13,16,.9),0_40px_80px_-30px_rgba(12,13,16,.7)] sm:text-[13px]" style={{ fontFamily: '"Geist Mono", ui-monospace, monospace' }}>
    <div className="term-scan pointer-events-none absolute inset-0" aria-hidden="true"/>
    <div className="flex items-center gap-3 border-b border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <span className="flex gap-1.5" aria-hidden="true"><span className="size-3 rounded-full bg-[#E5484D]"/><span className="size-3 rounded-full bg-[#F2C94C]"/><span className="size-3 rounded-full bg-[#12A150]"/></span>
      <span className="flex-1 truncate text-[11.5px] font-bold text-white/55">release-notes · v2.0.0 · 26 sep 2026</span>
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-white/55"><span className="pulse-dot size-1.5 rounded-full bg-[#1BD56A]"/>chain 4663 · #{block.data ? block.data.toString() : '…'}</span>
    </div>
    <div className="relative px-4 py-4 sm:px-5">
      <TermLine i={n++}><Prompt/><span className="text-white">objectpad release --version 2.0.0</span></TermLine>
      <TermLine i={n++} className="text-white/55">✓ factory {short(FACTORY)} · pair assets approved: <span className="text-[#F2C94C]">{assets || 71}</span></TermLine>
      <div className="mt-1.5">{LOG.map(l => <TermLine key={l.id} i={n++} className="grid grid-cols-[52px_1fr] gap-x-2 sm:grid-cols-[52px_150px_1fr]"><span className={cn('font-black', l.tag === 'NEW' ? 'text-[#F2C94C]' : l.tag === 'IMP' ? 'text-[#7FB2FF]' : 'term-glow text-[#1BD56A]')}>[{l.tag}]</span><span className="font-bold text-white">{l.id}</span><span className="col-span-2 text-white/60 sm:col-span-1">{l.text}</span></TermLine>)}</div>
      <TermLine i={n++} className="mt-3"><Prompt/><span className="text-white">objectpad status</span></TermLine>
      <TermLine i={n++} className="flex flex-wrap gap-x-4">{STATUS.map(([k, s]) => <span key={k}><span className={s === 'live' ? 'term-glow text-[#1BD56A]' : 'text-[#F2C94C]'}>{s === 'live' ? '●' : '◐'}</span> {k} <span className="text-white/45">{s}</span></span>)}</TermLine>
      <TermLine i={n++} className="mt-3"><Prompt/><span className="text-white">objectpad roadmap</span></TermLine>
      {NEXT.map(([w, t]) => <TermLine key={t} i={n++}><span className={w === 'next' ? 'text-[#7FB2FF]' : 'text-white/40'}>{w.padEnd(5, ' ')}</span> {t}</TermLine>)}
      <TermLine i={n++} className="mt-3"><Prompt/><span className="blink text-white">▍</span></TermLine>
    </div>
  </div>;
});

/** Every asset the Pons V2 factory approves, grouped by kind, each priced from its Robinhood Chain pool. */
function PairBoard() {
  const pairs = usePairs(); const [kind, setKind] = useState<string>('all'); const [q, setQ] = useState<string>(''); const query = useDeferredValue(q);
  const assets = useMemo(() => (pairs.data?.assets ?? []).filter(a => a.approved), [pairs.data]);
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const a of assets) m.set(a.kind, (m.get(a.kind) ?? 0) + 1); return m; }, [assets]);
  const shown = useMemo(() => { const s = query.trim().toLowerCase(); return assets.filter(a => (kind === 'all' || a.kind === kind) && (!s || `${a.symbol} ${a.name} ${a.sector ?? ''}`.toLowerCase().includes(s))); }, [assets, kind, query]);
  const tabs = PAIR_KINDS.filter(k => k.id === 'all' || (k.id !== 'popular' && counts.has(k.id)));
  return <div className="raised flex flex-col rounded-[28px] p-3 sm:p-4">
    <div className="flex flex-wrap items-end justify-between gap-3 px-1.5 pt-1">
      <div><p className="lab"><span className="pulse-dot size-1.5 rounded-full bg-up"/>Live on Robinhood Chain</p><h2 className="display mt-2 text-[28px] leading-none sm:text-[34px]"><span className="tnum">{assets.length || 71}</span> pair assets, priced on-chain.</h2></div>
      <p className="font-mono text-[11px] font-extrabold uppercase text-ink/55">{pairs.data ? `ETH ${usd(pairs.data.ethUsd ?? 0)} · refreshed 30s` : 'Reading pools…'}</p>
    </div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">{tabs.map(t => <button key={t.id} onClick={() => setKind(t.id)} className={cn('press min-h-9 shrink-0 rounded-full px-3 text-[12.5px] font-extrabold', kind === t.id ? 'bg-ink text-white' : 'bg-ink/[0.05] text-ink/70 hover:text-ink')}>{t.label}<span className="ml-1 font-mono text-[11px] opacity-60">{t.id === 'all' ? assets.length : counts.get(t.id)}</span></button>)}</div>
      <label className="sunk flex min-h-10 items-center gap-2 rounded-full px-3.5 sm:w-52"><Search size={15} className="text-ink/50"/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search NVDA, gold…" aria-label="Search pair assets" className="w-full bg-transparent text-[13.5px] font-bold outline-none placeholder:text-ink/40"/></label>
    </div>
    <div className="no-scrollbar mt-3 grid max-h-[520px] grid-cols-2 gap-1.5 overflow-y-auto pr-0.5 sm:grid-cols-3">
      {shown.map(a => <AssetTile key={a.address} a={a}/>)}
      {!shown.length && <p className="col-span-full px-2 py-6 text-center text-[13.5px] font-bold text-ink/55">{pairs.isError ? 'Pair prices are unavailable right now.' : pairs.isLoading ? 'Reading every pool on Robinhood Chain…' : 'No asset matches that search.'}</p>}
    </div>
  </div>;
}
const AssetTile = memo(function AssetTile({ a }: { a: PairQuote }) {
  return <Link to="/launch" className="group flex items-center gap-2.5 rounded-2xl bg-ink/[0.03] p-2.5 transition-colors hover:bg-ink/[0.06]" title={`${a.name}${a.pool ? ` · pool fee ${(a.pool.fee / 10_000).toFixed(2)}%` : ''}`}>
    <PairLogo src={a.logo} symbol={a.symbol} size={34} className="transition-transform group-hover:scale-110"/>
    <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-1"><span className="truncate text-[14px] font-extrabold">{a.symbol}</span>{a.change24h !== null && <span className={cn('font-mono text-[11px] font-bold', a.change24h >= 0 ? 'text-up' : 'text-down')}>{pct(a.change24h)}</span>}</span>
      <span className="flex items-baseline justify-between gap-1"><span className="truncate text-[11.5px] font-semibold text-ink/55">{a.sector ?? KIND_LABEL[a.kind]}</span><span className="font-mono text-[11.5px] font-bold tnum">{a.priceUsd ? usd(a.priceUsd) : '—'}</span></span></span>
  </Link>;
});

/** Scrolling logo wall of every supported asset. */
function LogoWall() {
  const pairs = usePairs(); const list = useMemo(() => (pairs.data?.assets ?? []).filter(a => a.approved && a.kind !== 'native'), [pairs.data]);
  const rows = [list.filter((_, i) => i % 2 === 0), list.filter((_, i) => i % 2 === 1)];
  if (!list.length) return null;
  return <div className="marquee-mask mt-8 flex flex-col gap-2 overflow-hidden" aria-hidden="true">{rows.map((row, r) => <div key={r} className="flex w-max gap-2" style={{ animation: `marquee ${r ? 80 : 95}s linear infinite${r ? ' reverse' : ''}` }}>{[...row, ...row].map((a, i) => <span key={`${a.address}${i}`} className="raised flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3.5"><PairLogo src={a.logo} symbol={a.symbol} size={26}/><span className="text-[13px] font-extrabold">{a.symbol}</span>{a.change24h !== null && <span className={cn('font-mono text-[11px] font-bold', a.change24h >= 0 ? 'text-up' : 'text-down')}>{pct(a.change24h)}</span>}</span>)}</div>)}</div>;
}

/** Four-step pipeline, each step with a working visual rather than a paragraph. */
function Pipeline({ combo }: { combo: ComboView | undefined }) {
  const ticker = combo?.exhibit.ticker ?? 'QUACK'; const sym = combo?.symbol ?? 'NVDA'; const logo = combo?.quote?.logo;
  const steps: { n: string; title: string; body: string; spec: string; visual: ReactNode }[] = [
    { n: '01', title: 'Scan it', body: 'Six photos from your phone become a real 3D mesh. AI checks it is one of one.', spec: '~90k triangles · fingerprinted', visual: combo ? <SpinSprite src={combo.exhibit.spin} className="h-full" duration={6}/> : null },
    { n: '02', title: 'Pair it', body: 'Pick any of 71 assets, or take the AI’s pick for your object. ETH stays the default.', spec: 'stocks · ETFs · gold · BTC', visual: <div className="flex items-center justify-center gap-2"><img src={combo?.exhibit.coin ?? '/assets/objects/coin-duck.webp'} alt="" className="size-16 rounded-full object-cover shadow-[0_10px_24px_-10px_rgba(12,13,16,.4)]"/><span className="display text-[26px] text-ink/40">×</span><PairLogo src={logo} symbol={sym} size={64} className="shadow-[0_10px_24px_-10px_rgba(12,13,16,.4)]"/></div> },
    { n: '03', title: 'Launch it', body: 'One transaction on the Pons V2 factory. The treasury pays the gas, so you pay nothing.', spec: '$0 · Robinhood Chain 4663', visual: <code className="block rounded-2xl bg-[#0B0C0F] px-3 py-2.5 font-mono text-[11.5px] leading-5 text-white/80"><span className="text-[#7FB2FF]">launchToken</span>(<br/>&nbsp;&nbsp;<span className="text-[#F2C94C]">"${ticker}"</span>,<br/>&nbsp;&nbsp;pairToken: <span className="text-[#1BD56A]">{sym}</span><br/>)</code> },
    { n: '04', title: 'Trade it', body: 'Buyers pay in ETH. It routes on-chain into the pair asset, then into your coin’s curve.', spec: 'Uniswap V3 → Pons curve', visual: <div className="flex flex-wrap items-center justify-center gap-1 font-mono text-[11.5px] font-extrabold">{['ETH', 'V3', sym, 'curve', `$${ticker}`].map((s, i) => <span key={s} className="flex items-center gap-1"><span className={cn('rounded-full px-2 py-1', i === 4 ? 'v2-pill text-[#3A2A05]' : i % 2 ? 'bg-ink/[0.06]' : 'bg-ink text-white')}>{s}</span>{i < 4 && <ArrowRight size={12} className="text-ink/40"/>}</span>)}</div> },
  ];
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{steps.map((s, i) => <Reveal key={s.n} delay={i * 80}><div className="raised lift flex h-full flex-col rounded-[26px] p-4">
    <div className="steel flex h-[150px] items-center justify-center overflow-hidden rounded-[20px] p-3">{s.visual}</div>
    <div className="mt-4 flex items-baseline gap-2.5"><span className="display text-[34px] leading-none text-ink/20">{s.n}</span><h3 className="display text-[26px] leading-none">{s.title}</h3></div>
    <p className="mt-2.5 text-[14.5px] font-semibold leading-snug text-ink/75">{s.body}</p>
    <p className="mt-auto pt-3 font-mono text-[11px] font-extrabold uppercase text-ink/50">{s.spec}</p>
  </div></Reveal>)}</div>;
}

/** Object × stock pairings with a story: the meta a paired launch gives a coin. */
function Narratives({ combos }: { combos: ComboView[] }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{combos.map((c, i) => <Reveal key={c.exhibit.id} delay={i * 50}><Link to="/launch" className="raised lift group flex h-full flex-col rounded-[26px] p-3">
    <div className="steel relative aspect-square overflow-hidden rounded-[20px]"><SpinSprite src={c.exhibit.spin} className="absolute inset-[8%]" duration={7} delay={i * 0.6}/><span className="absolute right-2.5 top-2.5"><PairLogo src={c.quote?.logo} symbol={c.symbol} size={40} className="shadow-[0_8px_20px_-8px_rgba(12,13,16,.45)]"/></span></div>
    <p className="display mt-3 text-[22px] leading-none">${c.exhibit.ticker} <span className="text-ink/35">×</span> {c.symbol}</p>
    <p className="mt-1.5 flex-1 text-[13px] font-semibold leading-snug text-ink/65">{c.story}</p>
    <p className="mt-2 flex items-center justify-between font-mono text-[11.5px] font-extrabold"><span className="tnum">{c.quote?.priceUsd ? usd(c.quote.priceUsd) : '—'}</span>{c.quote?.change24h !== null && c.quote?.change24h !== undefined && <span className={c.quote.change24h >= 0 ? 'text-up' : 'text-down'}>{pct(c.quote.change24h)}</span>}</p>
  </Link></Reveal>)}</div>;
}

/** ObjectPad V2 launch page: the fusion in 3D, the release log, and every asset you can pair with, live. */
export default function V2() {
  const pairs = usePairs(); const combos = useCombos();
  const count = (pairs.data?.assets ?? []).filter(a => a.approved).length;
  return <div className="pb-12">
    <section className="page pt-6 sm:pt-10">
      <div className="grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <div>
          <p className="enter lab">Release v2.0 · 26 Sep 2026</p>
          <h1 className="enter display mt-4 text-[clamp(46px,11vw,64px)] leading-[0.92] lg:text-[clamp(56px,4.6vw,80px)]" style={{ '--delay': '60ms' } as CSSProperties}>ObjectPad <span className="v2-gold-text">V2</span><br/>is live.</h1>
          <p className="enter mt-5 max-w-md text-[19px] font-extrabold leading-snug text-ink/75 sm:text-[21px]" style={{ '--delay': '120ms' } as CSSProperties}>Pair your object’s coin with a real stock. Launch it free.</p>
          <div className="enter mt-6 flex flex-wrap gap-3" style={{ '--delay': '180ms' } as CSSProperties}><Link to="/launch" className="cta-hero group min-h-[64px] px-6 text-[16px]">Launch a paired coin<ArrowRight size={18} className="ml-1 transition-transform group-hover:translate-x-1"/></Link><Link to="/explore?pair=stocks" className="btn-ghost press min-h-[56px] px-5 text-[15px]">Paired coins<ArrowUpRight size={15}/></Link></div>
          <div className="enter mt-6 flex flex-wrap gap-2" style={{ '--delay': '240ms' } as CSSProperties}>{[[`${count || 71}`, 'pair assets'], ['$0', 'to launch'], ['4663', 'Robinhood Chain']].map(([v, l]) => <span key={l} className="sunk flex items-baseline gap-1.5 rounded-full px-3.5 py-2"><span className="display text-[20px] leading-none tnum">{v}</span><span className="font-mono text-[11px] font-extrabold uppercase text-ink/55">{l}</span></span>)}</div>
        </div>
        <div className="enter" style={{ '--delay': '100ms' } as CSSProperties}><FusionStage className="h-[460px] sm:h-[540px]"/></div>
      </div>
    </section>
    <LogoWall/>

    <section className="page mt-10 grid gap-4 lg:grid-cols-[1.08fr_1fr]">
      <ReleaseTerminal assets={count}/>
      <PairBoard/>
    </section>

    <section className="page mt-16"><Reveal><p className="lab">How a paired launch works</p><h2 className="display mt-3 text-[36px] leading-none sm:text-[52px]">Object <span className="text-ink/35">+</span> stock <span className="text-ink/35">=</span> <span className="v2-gold-text">one coin.</span></h2></Reveal><div className="mt-7"><Pipeline combo={combos[0]}/></div></section>

    <section className="page mt-16"><Reveal><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="lab">Give your coin a story</p><h2 className="display mt-3 text-[36px] leading-none sm:text-[52px]">Pick the market it rides.</h2></div><Link to="/launch" className="pill press !pr-5">Pair yours<ArrowRight size={15}/></Link></div></Reveal><div className="mt-7"><Narratives combos={combos}/></div></section>

    <section className="page mt-16"><Reveal><div className="steel relative flex flex-col items-start justify-between gap-5 overflow-hidden rounded-[34px] p-6 sm:flex-row sm:items-center sm:p-9">
      <div><p className="lab">Free on web, Android and iPhone</p><h2 className="display mt-2 text-[32px] leading-none sm:text-[44px]">Scan. Pair. Launch.</h2></div>
      <div className="flex flex-wrap gap-2.5"><Link to="/launch" className="cta-hero min-h-[60px] px-6 text-[15.5px]">Launch a paired coin<ArrowRight size={17}/></Link><a href={`https://x.com/intent/post?text=${encodeURIComponent(V2_POSTS[0])}`} target="_blank" rel="noreferrer" className="btn-ghost press min-h-[56px] px-5 text-[14px]">Share on X<ArrowUpRight size={14}/></a><a href={OBJECTPAD_X_URL} target="_blank" rel="noreferrer" className="btn-ghost press min-h-[56px] px-5 text-[14px]">@ObjectPadFun<ArrowUpRight size={14}/></a></div>
    </div></Reveal></section>
    <p className="page mt-8 text-[11.5px] font-medium leading-5 text-ink/55">Tokenized stocks on Robinhood Chain are issued by third parties. Pairing a coin with an asset does not give holders any claim on that asset or company. Not affiliated with Robinhood Markets, Inc., Pons, or any listed company. Nothing here is financial advice.</p>
  </div>;
}
