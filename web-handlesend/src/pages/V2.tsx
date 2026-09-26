import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, CircleDashed, Clock, Copy } from 'lucide-react';
import { usePairs } from '@/lib/pairs';
import { PairLogo } from '@/components/PairBadge';
import { MergeExplainer } from '@/components/MergeExplainer';
import { OBJECTPAD_X_URL } from '@/lib/brand';
import { copyText, pct, usd } from '@/lib/format';
import { cn } from '@/lib/utils';

/** V2.0 release notes: each line is something that shipped and can be used today. */
const NOTES: { tag: string; title: string; body: string }[] = [
  { tag: 'New', title: 'ObjectPad for iPhone, as a web app', body: 'Add ObjectPad to your iPhone home screen from objectpad.fun/app: the full iOS app with every screen, animation, sound effect, wallet and launch feature, free and without the App Store. It is our workaround while the native app is in App Store review. Phone visitors get an “Add App” prompt automatically.' },
  { tag: 'Improved', title: 'Launch from your phone, no QR code', body: 'The downloads page and every desktop QR page now offer the iPhone web app next to the Android app, so you can install once and scan, pair and launch straight from your phone.' },
  { tag: 'New', title: 'Stock pairing at launch', body: 'Every coin can now be paired with a tokenized stock, ETF, commodity or asset approved on Pons V2, including NVDA, TSLA, AAPL, SPCX, GME, SPY, GLD, USDG and cbBTC. ETH is still the default.' },
  { tag: 'New', title: 'AI pair suggestion', body: 'After your scan, the AI reads the object and suggests the stock whose story fits it best, with a one-line reason. It is a one-tap suggestion only, and nothing is paired unless you choose it.' },
  { tag: 'New', title: 'Pay with ETH for paired coins', body: 'Buying a stock-paired coin routes your ETH through Uniswap V3 on Robinhood Chain into the pair asset, then into the curve. Every step is quoted on-chain and signed in your wallet.' },
  { tag: 'New', title: 'Pairs across the market', body: 'Market cards and rows now show what each coin is paired with, including the company logo and the asset’s live 24h move. You can filter the market by pair.' },
  { tag: 'New', title: 'Live pair board', body: 'Every approved pair asset is priced from its deepest on-chain pool on Robinhood Chain and refreshed every 30 seconds. No off-chain quote feeds are used.' },
  { tag: 'Improved', title: 'Cleaner navigation', body: 'Pixel-glyph navigation, a gold V2 marker next to the logo on every page, and this release log.' },
  { tag: 'Shipped', title: 'ObjectPad for iPhone', body: 'The native iOS app is in TestFlight and has been submitted for App Store review. It includes scan to launch, the market, rewards and a device wallet.' },
];
const STATUS: { name: string; state: 'live' | 'review' | 'next'; note: string }[] = [
  { name: 'Web app', state: 'live', note: 'objectpad.fun · V2 live' },
  { name: 'Android', state: 'live', note: 'APK available · V2 pairing' },
  { name: 'iPhone web app', state: 'live', note: 'objectpad.fun/app · Add to Home Screen' },
  { name: 'iOS', state: 'review', note: 'TestFlight live · App Store review' },
  { name: 'Launch engine', state: 'live', note: 'Pons V2 · ETH & stock pairs' },
];
const ROADMAP: { when: string; title: string; body: string }[] = [
  { when: 'Next', title: 'iOS on the App Store', body: 'Public release once Apple review clears.' },
  { when: 'Next', title: 'One-signature paired buys', body: 'Collapse swap + approve + buy into a single confirmation.' },
  { when: 'Soon', title: 'Pair performance leaderboard', body: 'Which stocks carry the strongest object coins, ranked from on-chain volume.' },
  { when: 'Soon', title: 'Crafting Table', body: 'Combine object coins into new, rarer objects.' },
];
const SHOTS: { src: string; caption: string }[] = [
  { src: '/v2/duck_stock_chart_collision.webp', caption: 'Object meets market' },
  { src: '/v2/duck_stock_coin_fusion.webp', caption: 'Object + stock = paired coin' },
  { src: '/v2/duck_coin_chart_pedestal.webp', caption: 'Pair any object with any stock' },
];
export const V2_POSTS: string[] = [
  'ObjectPad V2 is live.\n\nScan any real object, pair it with a tokenized stock, and launch it as a coin on Robinhood Chain. Free.\n\nNVDA. TSLA. AAPL. SPCX. GME. SPY. GLD. 70+ assets.\n\nobjectpad.fun',
  'New in V2: the AI now suggests a stock for your object.\n\nScan a sneaker and it may point you to a footwear name. Scan a console and it may point to gaming. One tap to accept, or keep ETH.\n\nYour coin gets a story, not just a picture.',
  'Stock-paired coins, bought with ETH.\n\nV2 routes your ETH through Uniswap V3 on Robinhood Chain into the pair asset, then into the curve. Quoted on-chain, signed in your wallet, no custody.\n\nEvery coin card now shows its pair and the pair’s live move.',
  'Build log, day 1 of V2:\n\n✅ Stock pairing live (web + Android)\n✅ iOS in TestFlight, submitted to the App Store\n✅ AI pair suggestions\n✅ Pair filter on the market\n\nNext: one-signature paired buys.\n\nTap the gold V2 pill on objectpad.fun for the full log.',
  'On iPhone? You don’t have to wait for the App Store.\n\nOpen objectpad.fun/app in Safari → Share → Add to Home Screen.\n\nThe full ObjectPad iOS app, on your home screen, free. Scan, pair with a stock, launch and claim right from your phone.',
];

function StatusDot({ state }: { state: 'live' | 'review' | 'next' }) { return <span className={cn('size-2 shrink-0 rounded-full', state === 'live' ? 'pulse-dot bg-up' : state === 'review' ? 'bg-[#D9A521]' : 'bg-ink/30')}/>; }

function PostCard({ text, index }: { text: string; index: number }) {
  const [copied, setCopied] = useState<boolean>(false);
  return <div className="raised flex flex-col rounded-[22px] p-4">
    <div className="flex items-center justify-between"><span className="font-mono text-[11px] font-extrabold uppercase text-ink/55">Post {index + 1} / {V2_POSTS.length}</span><button onClick={async () => { if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 1600); } }} className="press flex min-h-9 items-center gap-1 rounded-full bg-ink/[0.06] px-3 text-[12px] font-extrabold">{copied ? <><Check size={13}/>Copied</> : <><Copy size={13}/>Copy</>}</button></div>
    <p className="mt-3 flex-1 whitespace-pre-line text-[14px] font-semibold leading-6">{text}</p>
    <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="btn press mt-3 min-h-11 text-[13px]">Post on X<ArrowUpRight size={14}/></a>
  </div>;
}

/** ObjectPad V2: release notes, trailer, live pairs, platform status and the developer roadmap. Opened from the gold V2 pill. */
export default function V2() {
  const pairs = usePairs();
  const movers = useMemo(() => (pairs.data?.assets ?? []).filter(a => a.kind !== 'native' && a.priceUsd && a.kind !== 'community').sort((a, b) => Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0)).slice(0, 12), [pairs.data]);
  const count = (pairs.data?.assets ?? []).filter(a => a.approved).length;
  return <div className="page py-6 sm:py-10">
    <section className="grid items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <p className="lab">Release · 26 Sep 2026 · ObjectPad V2.0</p>
        <h1 className="display mt-4 text-[clamp(44px,8vw,84px)] leading-[0.92]">ObjectPad <span className="v2-gold-text">V2</span><br/>is live.</h1>
        <p className="mt-5 max-w-xl text-[20px] font-extrabold leading-[1.35] text-ink/75">Real objects, now backed by real markets. Pair any scanned object with a tokenized stock and launch it on Robinhood Chain.</p>
        <div className="mt-6 flex flex-wrap gap-3"><Link to="/launch" className="cta-hero group min-h-[64px] px-6 text-[16px]">Launch a paired coin<ArrowRight size={18} className="ml-1 transition-transform group-hover:translate-x-1"/></Link><Link to="/explore?pair=stocks" className="btn-ghost press min-h-[56px] px-5 text-[15px]">Browse paired coins<ArrowUpRight size={15}/></Link></div>
        <div className="mt-6 grid max-w-md grid-cols-3 gap-2">{[[`${count || 71}`, 'pair assets'], ['3', 'platforms'], ['$0', 'to launch']].map(([v, l]) => <div key={l} className="sunk rounded-2xl px-3 py-2.5"><p className="display text-[26px] leading-none tnum">{v}</p><p className="mt-1 font-mono text-[11px] font-extrabold uppercase text-ink/60">{l}</p></div>)}</div>
      </div>
      <div className="steel overflow-hidden rounded-[30px] p-2"><video src="/trailers/objectpad-v2-launch.mp4" poster="/v2/trailer-poster.webp" controls playsInline preload="metadata" className="aspect-video w-full rounded-[24px] bg-ink object-cover"/><p className="px-3 py-2 font-mono text-[11px] font-extrabold uppercase text-ink/60">V2 launch trailer · 36s</p></div>
    </section>

    <section className="mt-12"><p className="lab">How pairing works</p><h2 className="display mt-3 text-[34px] sm:text-[48px]">Object + stock = one coin.</h2><div className="mt-6"><MergeExplainer/></div></section>

    <section className="mt-12 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="raised rounded-[28px] p-5 sm:p-6">
        <div className="flex items-center justify-between"><h2 className="text-[20px] font-extrabold">Release notes · V2.0</h2><span className="chip">26 Sep 2026</span></div>
        <ul className="mt-4 divide-y divide-ink/[0.07]">{NOTES.map(n => <li key={n.title} className="flex gap-3 py-3.5"><span className={cn('mt-0.5 h-fit shrink-0 rounded-md px-2 py-0.5 font-mono text-[10.5px] font-black uppercase', n.tag === 'New' ? 'v2-pill text-[#3A2A05]' : n.tag === 'Shipped' ? 'bg-up/12 text-up' : 'bg-ink/[0.07] text-ink/70')}>{n.tag}</span><div><p className="text-[15.5px] font-extrabold">{n.title}</p><p className="mt-1 text-[14px] font-medium leading-6 text-ink/70">{n.body}</p></div></li>)}</ul>
      </div>
      <div className="space-y-4">
        <div className="raised rounded-[28px] p-5"><h2 className="text-[18px] font-extrabold">Platform status</h2><ul className="mt-3 space-y-2">{STATUS.map(s => <li key={s.name} className="sunk flex items-center gap-3 rounded-2xl px-3.5 py-3"><StatusDot state={s.state}/><span className="flex-1 font-extrabold">{s.name}</span><span className="font-mono text-[11.5px] font-bold text-ink/60">{s.note}</span></li>)}</ul></div>
        <div className="raised rounded-[28px] p-5"><h2 className="text-[18px] font-extrabold">Next few days</h2><ul className="mt-3 space-y-3">{ROADMAP.map(r => <li key={r.title} className="flex gap-3">{r.when === 'Next' ? <Clock size={16} className="mt-1 shrink-0"/> : <CircleDashed size={16} className="mt-1 shrink-0 text-ink/50"/>}<div><p className="font-extrabold">{r.title} <span className="font-mono text-[10.5px] uppercase text-ink/50">· {r.when}</span></p><p className="text-[13.5px] font-medium text-ink/65">{r.body}</p></div></li>)}</ul></div>
      </div>
    </section>

    <section className="mt-12"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab">Live on Robinhood Chain</p><h2 className="display mt-3 text-[30px] sm:text-[42px]">Pair assets, priced on-chain.</h2></div><Link to="/launch" className="pill press !pr-5">Pair yours<ArrowRight size={15}/></Link></div>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{movers.map(a => <div key={a.address} className="raised flex items-center gap-2.5 rounded-2xl p-3"><PairLogo src={a.logo} symbol={a.symbol} size={32}/><div className="min-w-0"><p className="font-extrabold">{a.symbol}</p><p className="font-mono text-[12px] font-bold tnum">{usd(a.priceUsd ?? 0)} <span className={(a.change24h ?? 0) >= 0 ? 'text-up' : 'text-down'}>{a.change24h === null ? '' : pct(a.change24h)}</span></p></div></div>)}{!movers.length && <p className="col-span-full text-sm font-bold text-ink/60">{pairs.isError ? 'Pair prices are unavailable right now.' : 'Reading pair prices from chain…'}</p>}</div>
    </section>

    <section className="mt-12"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab">New · iPhone web app</p><h2 className="display mt-3 text-[30px] sm:text-[42px]">The iOS app, on any iPhone today.</h2><p className="mt-3 max-w-2xl text-[15px] font-semibold text-ink/65">While the App Store review runs, open objectpad.fun/app on your iPhone and tap Share › Add to Home Screen. Same screens, animations and sounds as the native app, with no App Store needed.</p></div><div className="flex flex-wrap gap-2"><Link to="/app/?install=1" className="cta-hero min-h-[56px] px-5 text-[15px]">Get the iPhone app<ArrowRight size={16}/></Link><Link to="/download" className="btn-ghost press min-h-[56px] px-5 text-[14px]">All downloads<ArrowUpRight size={14}/></Link></div></div>
      <div className="no-scrollbar mt-5 flex gap-3 overflow-x-auto pb-2">{['home', 'market', 'coin', 'scan', 'rewards', 'wallet'].map(s => <figure key={s} className="raised shrink-0 overflow-hidden rounded-[26px] p-1.5"><img src={`/v2/app-${s}.webp`} alt={`ObjectPad iPhone app: ${s} screen`} loading="lazy" className="h-[420px] w-auto rounded-[21px]"/><figcaption className="flex items-center justify-between px-2 py-2 font-mono text-[11px] font-extrabold uppercase text-ink/60"><span>{s}</span><a href={`/v2/app-${s}.webp`} download className="underline">Download</a></figcaption></figure>)}</div>
    </section>

    <section className="mt-12"><p className="lab">From the build</p><h2 className="display mt-3 text-[30px] sm:text-[42px]">Screens & stills.</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-3">{SHOTS.map(s => <figure key={s.src} className="raised overflow-hidden rounded-[24px] p-1.5"><img src={s.src} alt={s.caption} loading="lazy" className="aspect-[3/2] w-full rounded-[19px] object-cover"/><figcaption className="px-2 py-2 font-mono text-[11.5px] font-extrabold uppercase text-ink/60">{s.caption}</figcaption></figure>)}</div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr]"><video src="/v2/v2-reel-vertical.mp4" autoPlay muted loop playsInline className="mx-auto aspect-[9/16] max-h-[520px] rounded-[24px] bg-ink object-cover"/><video src="/v2/v2-merge-explainer.mp4" autoPlay muted loop playsInline className="aspect-video w-full rounded-[24px] bg-ink object-cover"/></div>
    </section>

    <section className="mt-12"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab">Announcements</p><h2 className="display mt-3 text-[30px] sm:text-[42px]">The V2 thread.</h2></div><a href={OBJECTPAD_X_URL} target="_blank" rel="noreferrer" className="pill press !pr-5">@ObjectPadFun<ArrowUpRight size={15}/></a></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{V2_POSTS.map((p, i) => <PostCard key={i} text={p} index={i}/>)}</div>
    </section>
    <p className="mt-10 text-[11.5px] font-medium leading-5 text-ink/55">Tokenized stocks on Robinhood Chain are issued by third parties. Pairing a coin with an asset does not give holders any claim on that asset or company. Not affiliated with Robinhood Markets, Inc., Pons, or any listed company. Nothing here is financial advice.</p>
  </div>;
}
