import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock, Copy, Download, ExternalLink, Loader2, RotateCcw, Send, Share2, ShieldCheck, Shuffle, Sparkles, Wallet, X as XIcon } from 'lucide-react';
import { useSession } from '@/lib/session';
import { EarnSwitch } from '@/components/EarnSwitch';
import { copyText, shortAddress, timeAgo } from '@/lib/format';
import { RequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EARN_CA, EARN_ERRORS, EXPLORER_TX, draftChecks, postIdFrom, track, useClaimReward, useEarnFeed, useEarnLeaderboard, useEarnMarket, useEarnMe, useEarnRules, useSubmitPost, type EarnCheck, type EarnClaim, type EarnMarket, type EarnSubmission, type FeedFilter, type FeedItem } from '@/lib/earn';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Trophy } from 'lucide-react';

const money = (v: number): string => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bigMoney = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;
const tiny = (v: number): string => v >= 0.01 ? `$${v.toFixed(4)}` : `$${v.toPrecision(3)}`;
const errorText = (e: unknown): string => e instanceof RequestError ? (EARN_ERRORS[e.code] ?? e.message) : e instanceof Error ? e.message : 'Something went wrong. Try again.';
const newKey = (): string => crypto.randomUUID();
const TEMPLATES = [
  `Scan any real object, launch its coin for $0. Every coin is one physical thing — 3D-scanned, can't be copied.\n\n$ObjectPad ${EARN_CA}\nobjectpad.fun`,
  `Found a way to turn any object on my desk into a real coin in under a minute. No fee, no wallet setup, just scan and launch.\n\n$ObjectPad ${EARN_CA}\nobjectpad.fun`,
  `The first coin backed by a literal physical object. Scan it once on your phone and it's yours forever — nobody can fake the 3D scan.\n\n$ObjectPad ${EARN_CA}\nobjectpad.fun`,
  `Everyone's launching coins from thin air. ObjectPad makes you scan something real first. Free, instant, on-chain.\n\n$ObjectPad ${EARN_CA}\nobjectpad.fun`,
  `Your keys, your shoes, your coffee mug — all launchable as coins in seconds with ObjectPad. I just tried it, it's wild.\n\n$ObjectPad ${EARN_CA}\nobjectpad.fun`,
];
/** ObjectPad requires a visible paid-post disclosure on X itself; keep it out of the editable draft so people don't delete it by accident. */
const DISCLOSURE_TAG = '#ad';

function useNow(interval = 1000): number { const [now, setNow] = useState<number>(Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(t); }, [interval]); return now; }
function countdown(ms: number): string { if (ms <= 0) return 'now'; const h = Math.floor(ms / 3_600_000); const m = Math.floor((ms % 3_600_000) / 60_000); return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`; }
function useCount(target: number, ms = 900): number {
  const [v, setV] = useState<number>(target); const from = useRef<number>(target);
  useEffect(() => { const start = performance.now(); const a = from.current; let raf = 0; const step = (t: number) => { const p = Math.min(1, (t - start) / ms); const e = 1 - Math.pow(1 - p, 3); setV(a + (target - a) * e); if (p < 1) raf = requestAnimationFrame(step); else from.current = target; }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [target, ms]);
  return v;
}
/** The real X (Twitter) wordmark. */
function XGlyph({ size = 18 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }
/** The real MetaMask fox mark, official brand artwork, at a size big enough to actually recognize. */
function MetaMaskGlyph({ size = 26 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 318.6 318.6" aria-hidden="true">
  <path fill="#e2761b" d="m274.1 35.5-99.5 73.9L193 65.8z"/>
  <path fill="#e4761b" d="m44.4 35.5 98.7 74.6-17.5-44.3zm193.9 171.3-26.5 40.6 56.7 15.6 16.3-55.3zm-204.4.9L50.1 263l56.7-15.6-26.5-40.6z"/>
  <path fill="#e4761b" d="m103.6 138.2-15.8 23.9 56.3 2.5-2-60.5zm111.3 0-39-34.8-1.3 61.2 56.2-2.5zM106.8 247.4l33.8-16.5-29.2-22.8zm71.1-16.5 33.9 16.5-4.7-39.3z"/>
  <path fill="#d7c1b3" d="m211.8 247.4-33.9-16.5 2.7 22.1-.3 9.3zm-105 0 31.5 14.9-.2-9.3 2.5-22.1z"/>
  <path fill="#233447" d="m138.8 193.5-28.2-8.3 19.9-9.1zm40.9 0 8.3-17.4 20 9.1z"/>
  <path fill="#cd6116" d="m106.8 247.4 4.8-40.6-31.3.9zM207 206.8l4.8 40.6 26.5-39.7zm23.8-44.7-56.2 2.5 5.2 28.9 8.3-17.4 20 9.1zm-120.2 23.1 20-9.1 8.2 17.4 5.3-28.9-56.3-2.5z"/>
  <path fill="#e4751f" d="m87.8 162.1 23.6 46-.8-22.9zm120.3 23.1-1 22.9 23.7-46zm-64-20.6-5.3 28.9 6.6 34.1 1.5-44.9zm30.5 0-2.7 18 1.2 45 6.7-34.1z"/>
  <path fill="#f6851b" d="m179.8 193.5-6.7 34.1 4.8 3.3 29.2-22.8 1-22.9zm-69.2-8.3.8 22.9 29.2 22.8 4.8-3.3-6.6-34.1z"/>
  <path fill="#c0ad9e" d="m180.3 262.3.3-9.3-2.5-2.2h-37.7l-2.3 2.2.2 9.3-31.5-14.9 11 9 22.3 15.5h38.3l22.4-15.5 11-9z"/>
  <path fill="#161616" d="m177.9 230.9-4.8-3.3h-27.7l-4.8 3.3-2.5 22.1 2.3-2.2h37.7l2.5 2.2z"/>
  <path fill="#763d16" d="m278.3 114.2 8.5-40.8-12.7-37.9-96.2 71.4 37 31.3 52.3 15.3 11.6-13.5-5-3.6 8-7.3-6.2-4.8 8-6.1zM31.8 73.4l8.5 40.8-5.4 4 8 6.1-6.1 4.8 8 7.3-5 3.6 11.5 13.5 52.3-15.3 37-31.3-96.2-71.4z"/>
  <path fill="#f6851b" d="m267.2 153.5-52.3-15.3 15.9 23.9-23.7 46 31.2-.4h46.5zm-163.6-15.3-52.3 15.3-17.4 54.2h46.4l31.1.4-23.6-46zm71 26.4 3.3-57.7 15.2-41.1h-67.5l15 41.1 3.5 57.7 1.2 18.2.1 44.8h27.7l.2-44.8z"/>
</svg>; }
/** Big, obvious sign-in card — not a pill. `tone` picks the icon plate color. */
function AuthOption({ icon, tone, title, subtitle, onClick }: { icon: React.ReactNode; tone: 'x' | 'wallet'; title: string; subtitle: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="app-card press group flex w-full items-center gap-3.5 rounded-[22px] p-4 text-left sm:gap-4">
    <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,.25)]', tone === 'x' ? 'bg-ink text-white' : 'bg-[#FDF1E7]')}>{icon}</span>
    <div className="min-w-0 flex-1"><p className="text-[15.5px] font-extrabold leading-tight">{title}</p><p className="mt-0.5 text-[12.5px] font-semibold text-ink/55">{subtitle}</p></div>
    <ArrowRight size={17} className="shrink-0 text-ink/30 transition-transform group-hover:translate-x-0.5 group-hover:text-ink/60"/>
  </button>;
}

const Status = memo(function Status({ state, label }: { state: 'ok' | 'bad' | 'wait' | 'info'; label: string }) {
  const tone = state === 'ok' ? 'bg-up/10 text-up ring-up/25' : state === 'bad' ? 'bg-down/10 text-down ring-down/25' : state === 'wait' ? 'bg-[#1F6BFF]/10 text-[#1447C9] ring-[#1F6BFF]/25' : 'bg-ink/5 text-ink/70 ring-ink/10';
  const Icon = state === 'ok' ? Check : state === 'bad' ? XIcon : state === 'wait' ? Clock : ShieldCheck;
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-[0.06em] ring-1', tone)}><Icon size={11} strokeWidth={3} aria-hidden="true"/>{label}</span>;
});
function Skeleton({ className }: { className?: string }) { return <span className={cn('earn-shimmer block rounded-lg', className)} aria-hidden="true"/>; }

// ---------------------------------------------------------------- hero + live reward rate
const PIXELS = Array.from({ length: 14 }, (_, i) => ({ left: `${(i * 37) % 100}%`, bottom: `${(i * 23) % 40}%`, d: `${5 + (i % 5)}s`, delay: `${(i * 0.7) % 6}s` }));
function Hero({ market, loading, error, onStart }: { market?: EarnMarket; loading: boolean; error: boolean; onStart: () => void }) {
  const now = useNow(5000); const reward = useCount(market?.rewardUsd ?? 0);
  return <section className="earn-sky enter rounded-[34px] p-5 sm:p-8" aria-labelledby="earn-title">
    {PIXELS.map((p, i) => <span key={i} className="earn-pixel" style={{ left: p.left, bottom: p.bottom, ['--d' as string]: p.d, ['--delay' as string]: p.delay }}/>)}
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-end">
      <div>
        <span className="earn-glass inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[10.5px] font-extrabold uppercase tracking-[0.12em]"><Sparkles size={12}/>ObjectPad Earn</span>
        <h1 id="earn-title" className="display mt-4 text-[38px] leading-[0.95] sm:text-[58px]">Post about ObjectPad. Get verified. Earn real rewards.</h1>
        <p className="mt-4 max-w-xl text-[15px] font-semibold leading-relaxed text-white/80">Publish an eligible X post, submit its link, and watch ObjectPad verify it in real time. Approved posts earn rewards you can keep on ObjectPad or claim to your linked wallet.</p>
        <div className="mt-6 flex flex-wrap gap-2.5"><button onClick={onStart} className="press inline-flex min-h-[52px] items-center gap-2 rounded-full bg-white px-6 text-[15px] font-extrabold text-[#0B3BD6] shadow-[0_18px_40px_-16px_rgba(0,0,0,.6)]">Start earning<ArrowRight size={17}/></button><a href="#rules" className="earn-glass press inline-flex min-h-[52px] items-center rounded-full px-5 text-[14px] font-bold">Rules</a></div>
      </div>
      <div className="earn-glass rounded-[26px] p-5" aria-live="polite">
        <div className="flex items-center justify-between"><span className="font-mono text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-white/70">Reward per approved post</span>{market && <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold text-white/70"><span className="pulse-dot size-1.5 rounded-full bg-up"/>Live · {timeAgo(market.at, now)}</span>}</div>
        {loading ? <Skeleton className="mt-3 h-16 w-40 bg-white/20"/> : error || !market ? <div className="mt-3"><p className="text-[22px] font-extrabold">Market data unavailable</p><p className="mt-1 text-[12.5px] font-semibold text-white/70">We can’t confirm the live market cap right now, so no reward rate is shown. Submissions calculate it at approval.</p></div> : <>
          <p className="display mt-2 text-[64px] leading-none tabular-nums sm:text-[76px]">${reward.toFixed(2)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/10 p-3"><p className="font-mono text-[10px] font-bold uppercase text-white/60">Market cap</p><p className="mt-0.5 text-[17px] font-extrabold tabular-nums">{bigMoney(market.marketCapUsd)}</p></div>
            <div className="rounded-2xl bg-white/10 p-3"><p className="font-mono text-[10px] font-bold uppercase text-white/60">$OBJECTPAD price</p><p className="mt-0.5 text-[17px] font-extrabold tabular-nums">{tiny(market.priceUsd)}</p></div>
          </div>
        </>}
      </div>
    </div>
  </section>;
}

function Milestone({ market }: { market?: EarnMarket }) {
  const [shown, setShown] = useState<number>(0); useEffect(() => { const t = setTimeout(() => setShown(market?.progress ?? 0), 150); return () => clearTimeout(t); }, [market?.progress]);
  return <section className="raised card-pop mt-4 rounded-[28px] p-5 sm:p-6" aria-labelledby="tier-title">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab">Reward rate</p><h2 id="tier-title" className="mt-1.5 text-[19px] font-extrabold tracking-[-0.02em] sm:text-[22px]">$1 per approved post up to $100K market cap. Every complete $100K after that adds another $1.</h2></div></div>
    {market ? <>
      <div className="mt-5 flex items-center justify-between font-mono text-[11px] font-extrabold uppercase text-ink/60"><span>Now {money(market.rewardUsd)}</span><span>Next {money(market.nextRewardUsd)} at {bigMoney(market.nextMilestoneUsd)}</span></div>
      <div className="earn-meter sunk relative mt-2 h-4 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(market.progress * 100)} aria-label="Progress to the next reward milestone"><span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#1F6BFF] to-[#7FB2FF] shadow-[0_0_16px_rgba(31,107,255,.6)]" style={{ width: `${Math.max(2, shown * 100)}%` }}/></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">{[['Market cap', bigMoney(market.marketCapUsd)], ['Current reward', money(market.rewardUsd)], ['Next reward', money(market.nextRewardUsd)], ['Needed to unlock', bigMoney(market.remainingUsd)]].map(([k, v]) => <div key={k} className="sunk rounded-2xl p-3"><p className="font-mono text-[10px] font-bold uppercase text-ink/55">{k}</p><p className="mt-0.5 text-[16px] font-extrabold tabular-nums">{v}</p></div>)}</div>
      <p className="mt-3 text-[11.5px] font-semibold text-ink/55">$1 base, then +$1 for every complete $100,000 of market cap above the first $100,000 (so $1 up to $100K, $2 at $200K, $3 at $300K...). Price from {market.source}, market cap = price × on-chain supply ({market.supply.toLocaleString('en-US')}) of {shortAddress(EARN_CA)} on Robinhood Chain. Your reward is locked the moment your post is approved.</p>
    </> : <Skeleton className="mt-5 h-24 w-full"/>}
  </section>;
}

// ---------------------------------------------------------------- how it works
const STEPS = [
  { n: '01', t: 'Sign in', d: 'Connect X (and MetaMask for payouts). We read your X account straight from X.' },
  { n: '02', t: 'Publish a post', d: 'Include $ObjectPad, the contract, objectpad.fun and mark it #ad on X.' },
  { n: '03', t: 'Paste the link', d: 'We fetch the post from X and verify every rule live.' },
  { n: '04', t: 'Earn & claim', d: 'Credited after 24h live. Claim to your wallet any time.' },
];

// ---------------------------------------------------------------- composer
function Composer() {
  const [idea, setIdea] = useState<number>(0); const [text, setText] = useState<string>(TEMPLATES[0]); const [copied, setCopied] = useState<boolean>(false); const checks = useMemo(() => draftChecks(text), [text]);
  const copy = async () => { if (await copyText(`${text}\n\n${DISCLOSURE_TAG}`)) { setCopied(true); track('post_draft_copied'); setTimeout(() => setCopied(false), 1800); } };
  const shuffle = () => { const next = (idea + 1 + Math.floor(Math.random() * (TEMPLATES.length - 1))) % TEMPLATES.length; setIdea(next); setText(TEMPLATES[next]); };
  return <div className="raised card-pop rounded-[28px] p-5">
    <div className="flex items-center justify-between"><p className="lab">1 · Write your post</p><span className="font-mono text-[11px] font-bold text-ink/50">{text.length}/280+</span></div>
    <label htmlFor="earn-draft" className="sr-only">Draft your X post</label>
    <textarea id="earn-draft" value={text} onChange={e => setText(e.target.value)} rows={6} className="sunk mt-3 w-full resize-none rounded-[18px] p-4 text-[14.5px] font-medium leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-[#1F6BFF]"/>
    <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold text-ink/45"><ShieldCheck size={12}/>Posted with a visible <span className="font-mono font-extrabold text-ink/70">#ad</span> tag on X, as required by disclosure rules.</p>
    <ul className="mt-3 grid grid-cols-2 gap-1.5" aria-label="Required items">{checks.map(c => <li key={c.id} className={cn('flex items-center gap-2 rounded-xl px-2.5 py-2 text-[12.5px] font-bold transition-colors', c.ok ? 'bg-up/10 text-ink' : 'bg-down/5 text-ink/70')}><span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full transition-transform', c.ok ? 'earn-tick bg-up text-white' : 'bg-ink/10 text-ink/50')}>{c.ok ? <Check size={12} strokeWidth={3.5}/> : <XIcon size={11} strokeWidth={3}/>}</span><span>{c.label}<span className="sr-only">{c.ok ? ' included' : ' missing'}</span></span></li>)}</ul>
    <p className="mt-2 text-[11.5px] font-semibold text-ink/55">Add a sentence in your own words. Copy-paste templates are checked for duplicates.</p>
    <div className="mt-4 grid grid-cols-[auto_1fr_1fr] gap-2">
      <button onClick={shuffle} className="btn-ghost press min-h-12 px-4 text-[14px]" aria-label="Generate a different post idea"><Shuffle size={16}/></button>
      <button onClick={() => void copy()} className="btn press min-h-12 text-[14px]">{copied ? <Check size={16}/> : <Copy size={16}/>}{copied ? 'Copied' : 'Copy post'}</button>
      <a href={`https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n${DISCLOSURE_TAG}`)}`} target="_blank" rel="noreferrer" onClick={() => track('post_draft_copied')} className="cta-hero press justify-center py-1.5 pl-1.5 pr-4 text-[14px]"><span className="orb size-9"><Send size={15} className="text-ink"/></span>Open X</a>
    </div>
    <p className="mt-2 text-center text-[11px] font-semibold text-ink/50">Nothing posts automatically. You publish it yourself on X.</p>
  </div>;
}

// ---------------------------------------------------------------- verification stage
const PENDING_STEPS = ['Fetching authoritative X post…', 'Confirming post author…', 'Checking $ObjectPad…', 'Checking contract address…', 'Checking objectpad.fun…', 'Checking daily allowance…', 'Checking duplicate submissions…', 'Running integrity checks…', 'Calculating live reward…'];
function highlight(text: string): (string | { m: string })[] {
  const re = new RegExp(`(\\$objectpad\\b|${EARN_CA}|(?:https?:\\/\\/)?(?:www\\.)?objectpad\\.fun\\S*|#ad\\b|#sponsored\\b)`, 'gi');
  const out: (string | { m: string })[] = []; let last = 0; for (const match of text.matchAll(re)) { const i = match.index ?? 0; if (i > last) out.push(text.slice(last, i)); out.push({ m: match[0] }); last = i + match[0].length; } if (last < text.length) out.push(text.slice(last)); return out;
}
function PostCard({ s, revealed, scanning, className }: { s: EarnSubmission; revealed: number; scanning: boolean; className?: string }) {
  const lines = s.text ? s.text.split('\n') : [];
  return <article className={cn('relative overflow-hidden rounded-[22px] bg-white p-4 shadow-[0_0_0_1px_rgba(12,13,16,.08),0_20px_40px_-24px_rgba(12,13,16,.35)]', className)} aria-label={`Post by @${s.handle}`}>
    {scanning && <span className="earn-scan" aria-hidden="true"/>}
    <header className="flex items-center gap-3">{s.avatar ? <img src={s.avatar} alt="" className="size-11 rounded-full bg-ink/5" width={44} height={44}/> : <span className="size-11 rounded-full bg-ink/10"/>}<div className="min-w-0 flex-1"><p className="truncate text-[14.5px] font-extrabold">{s.name || s.handle}</p><p className="truncate font-mono text-[12px] font-semibold text-ink/55">@{s.handle}{s.postedAt ? ` · ${new Date(s.postedAt).toLocaleString()}` : ''}</p></div><a href={s.url} target="_blank" rel="noreferrer" className="press flex size-10 items-center justify-center rounded-full hover:bg-ink/5" aria-label="Open original post on X"><ArrowUpRight size={17}/></a></header>
    {s.text ? <div className="mt-3 space-y-0.5 text-[14.5px] font-medium leading-relaxed">{lines.map((line, i) => <p key={i} className={cn('min-h-[1.2em] break-words rounded-md px-1 -mx-1', i < revealed && 'earn-lift')} style={{ animationDelay: `${i * 90}ms` }}>{highlight(line).map((part, j) => typeof part === 'string' ? <span key={j}>{part}</span> : <mark key={j} className={cn('rounded px-0.5 transition-colors duration-500', i < revealed ? 'bg-[#1F6BFF]/15 text-[#0B3BD6]' : 'bg-transparent text-inherit')}>{part.m}</mark>)}</p>)}</div>
      : <p className="mt-3 rounded-xl bg-ink/5 p-3 text-[13px] font-semibold text-ink/60">Post content unavailable. It may be deleted, protected or X did not answer.</p>}
    {s.media.length > 0 && <div className={cn('mt-3 grid gap-1.5 overflow-hidden rounded-2xl', s.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>{s.media.map(m => <div key={m.url} className="aspect-video bg-ink/5"><img src={m.url} alt="" loading="lazy" className="size-full object-cover"/></div>)}</div>}
    <footer className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] font-bold text-ink/55">{s.metrics && ['like_count', 'retweet_count', 'reply_count', 'impression_count'].filter(k => typeof s.metrics?.[k] === 'number').map(k => <span key={k}>{(s.metrics?.[k] ?? 0).toLocaleString()} {k.replace('_count', '').replace('retweet', 'reposts').replace('like', 'likes').replace('reply', 'replies').replace('impression', 'views')}</span>)}<span>Verified {timeAgo(s.verifiedAt)}</span></footer>
  </article>;
}
function CheckRow({ c, index }: { c: EarnCheck; index: number }) {
  const Icon = c.state === 'pass' ? Check : c.state === 'fail' ? XIcon : c.state === 'pending' ? Clock : ArrowRight;
  return <li className="earn-float-up flex items-start gap-3 rounded-2xl px-3 py-2.5" style={{ animationDelay: `${index * 40}ms` }}>
    <span className={cn('earn-tick mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', c.state === 'pass' ? 'bg-up text-white shadow-[0_0_0_4px_rgba(18,161,80,.15)]' : c.state === 'fail' ? 'bg-down text-white' : c.state === 'pending' ? 'bg-amber-400 text-white' : 'bg-ink/10 text-ink/50')}><Icon size={13} strokeWidth={3.2} aria-hidden="true"/></span>
    <div className="min-w-0"><p className="text-[13.5px] font-extrabold">{c.label}<span className="sr-only"> — {c.state === 'pass' ? 'passed' : c.state === 'fail' ? 'failed' : c.state === 'pending' ? 'pending' : 'skipped'}</span></p><p className={cn('text-[12px] font-semibold', c.state === 'fail' ? 'text-down' : 'text-ink/55')}>{c.detail}</p></div>
  </li>;
}

function Verify({ pending, result, error, onReset, onRetry, remaining }: { pending: boolean; result: EarnSubmission | null; error: string | null; onReset: () => void; onRetry: () => void; remaining: number | null }) {
  const [shown, setShown] = useState<number>(0); const [celebrate, setCelebrate] = useState<boolean>(false); const [tick, setTick] = useState<number>(0);
  useEffect(() => { if (!pending) return; setTick(0); const t = setInterval(() => setTick(v => Math.min(v + 1, PENDING_STEPS.length - 1)), 900); return () => clearInterval(t); }, [pending]);
  // Replays the server's real check results in order, one every 260ms. Nothing is shown that the server didn't return.
  useEffect(() => { if (!result) return; setShown(0); const t = setInterval(() => setShown(v => { if (v >= result.checks.length) { clearInterval(t); return v; } return v + 1; }), 260); return () => clearInterval(t); }, [result]);
  const done = result ? shown >= result.checks.length : false;
  useEffect(() => { if (done && result?.state === 'approved') { setCelebrate(true); try { navigator.vibrate?.([18, 40, 28]); } catch { /* unsupported */ } } }, [done, result?.state]);
  if (!pending && !result && !error) return null;
  const lines = result?.text ? result.text.split('\n').length : 0; const revealed = result ? Math.round((shown / Math.max(1, result.checks.length)) * lines) : 0;
  return <div className="relative mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]" aria-live="polite">
    <div className={cn('relative rounded-[28px] p-3 transition-all duration-500', result?.state === 'approved' && done ? 'bg-up/10 earn-sweep-ok' : result && done && result.state === 'rejected' ? 'bg-down/5 earn-cut' : 'bg-[#1F6BFF]/8')}>
      {result ? <PostCard s={result} revealed={revealed} scanning={!done}/> : <div className="relative overflow-hidden rounded-[22px] bg-white p-4 shadow-[0_0_0_1px_rgba(12,13,16,.08)]"><span className="earn-scan" aria-hidden="true"/><div className="flex items-center gap-3"><Skeleton className="size-11 rounded-full"/><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/3"/><Skeleton className="h-3 w-1/4"/></div></div><div className="mt-4 space-y-2"><Skeleton className="h-3.5 w-full"/><Skeleton className="h-3.5 w-5/6"/><Skeleton className="h-3.5 w-2/3"/></div></div>}
    </div>
    <div className="raised rounded-[28px] p-4">
      <div className="flex items-center justify-between px-1"><p className="lab">Verification scan</p>{result && done ? <Status state={result.state === 'approved' ? 'ok' : result.state === 'rejected' ? 'bad' : 'wait'} label={result.state === 'approved' ? 'Approved' : result.state === 'rejected' ? 'Rejected' : result.state === 'pending_review' ? 'In review' : 'Try again'}/> : <Status state="wait" label="Scanning"/>}</div>
      <ul className="mt-2">{result ? result.checks.slice(0, shown).map((c, i) => <CheckRow key={c.id} c={c} index={i}/>) : pending ? PENDING_STEPS.slice(0, tick + 1).map((label, i) => <li key={label} className="flex items-center gap-3 rounded-2xl px-3 py-2.5"><span className={cn('flex size-6 items-center justify-center rounded-full', i === tick ? 'bg-[#1F6BFF]/15 text-[#1F6BFF]' : 'bg-ink/10 text-ink/40')}>{i === tick ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none"/> : <Clock size={12}/>}</span><span className={cn('text-[13.5px] font-bold', i === tick ? 'text-ink' : 'text-ink/45')}>{label}</span></li>) : null}</ul>
      {error && <div className="earn-cut mt-2 rounded-2xl bg-down/10 p-4"><p className="flex items-center gap-2 text-[14px] font-extrabold text-down"><AlertTriangle size={16}/>{error}</p><div className="mt-3 flex gap-2"><button onClick={onRetry} className="btn press min-h-11 px-4 text-[13px]"><RotateCcw size={14}/>Try again</button><button onClick={onReset} className="btn-ghost press min-h-11 px-4 text-[13px]">Edit link</button></div></div>}
      {result && done && result.state !== 'approved' && <div className="mt-2 space-y-2">{result.reasons.map(r => <div key={r.code} className={cn('rounded-2xl p-3.5', result.state === 'rejected' ? 'bg-down/8 ring-1 ring-down/20' : 'bg-amber-400/10 ring-1 ring-amber-500/25')}><p className="text-[14px] font-extrabold">{r.message}</p><p className="mt-0.5 text-[12.5px] font-semibold text-ink/65">{r.fix}</p></div>)}<div className="flex flex-wrap gap-2 pt-1">{result.state === 'verification_error' || result.reasons.some(r => r.retryable) ? <button onClick={onRetry} className="btn press min-h-11 px-4 text-[13px]"><RotateCcw size={14}/>Verify again</button> : null}<button onClick={onReset} className="btn-ghost press min-h-11 px-4 text-[13px]">Submit a different post</button></div></div>}
    </div>
    {celebrate && result && <Celebration s={result} remaining={remaining} onClose={() => setCelebrate(false)} onAnother={() => { setCelebrate(false); onReset(); }}/>}
  </div>;
}

// ---------------------------------------------------------------- approval + proof card
function Celebration({ s, remaining, onClose, onAnother }: { s: EarnSubmission; remaining: number | null; onClose: () => void; onAnother: () => void }) {
  const amount = useCount(s.rewardUsd, 1100);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-[3px] sm:items-center" role="dialog" aria-modal="true" aria-label="Post verified" onClick={onClose}>
    <div className="earn-sky card-pop w-full max-w-[420px] rounded-[32px] p-6 text-center" onClick={e => e.stopPropagation()}>
      {PIXELS.slice(0, 8).map((p, i) => <span key={i} className="earn-pixel" style={{ left: p.left, bottom: '10%', ['--d' as string]: '3s', ['--delay' as string]: `${i * 0.2}s` }}/>)}
      <button onClick={onClose} className="press absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-white/15" aria-label="Skip"><XIcon size={17}/></button>
      <span className="earn-tick mx-auto flex size-20 items-center justify-center rounded-full bg-up shadow-[0_0_0_10px_rgba(18,161,80,.25),0_0_60px_rgba(18,161,80,.6)]"><Check size={40} strokeWidth={3.5}/></span>
      <p className="mt-5 font-mono text-[12px] font-extrabold uppercase tracking-[0.2em] text-white/80">Post verified</p>
      <p className="display mt-1 text-[56px] leading-none tabular-nums">+{money(amount)}</p>
      <p className="mt-1 text-[14px] font-bold text-white/80">earned</p>
      <div className="earn-glass mt-4 space-y-1 rounded-2xl p-3 text-[13px] font-semibold">{remaining !== null && <p>{remaining} daily rewards remaining</p>}<p>Reward locked at approval · credits after 24h live</p></div>
      <div className="mt-5 grid gap-2"><ProofShare s={s}/><div className="grid grid-cols-2 gap-2"><a href="#dashboard" onClick={onClose} className="earn-glass press flex min-h-12 items-center justify-center rounded-full text-[14px] font-bold">View reward</a><button onClick={onAnother} className="earn-glass press min-h-12 rounded-full text-[14px] font-bold">Submit another</button></div></div>
    </div>
  </div>;
}
function proofUrl(id: string): string { return `${window.location.origin}/earn/proof/${id}`; }
function caption(s: { rewardUsd: number }): string { return `Just got verified on @ObjectPadFun Earn: +$${s.rewardUsd.toFixed(2)} for posting about $ObjectPad.\n\nScan any real object, launch its coin free → objectpad.fun/earn`; }
async function renderProof(s: EarnSubmission, hash?: string | null): Promise<Blob> {
  const W = 1200; const H = 675; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); if (!g) throw new Error('Canvas unavailable');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1B5BFF'); bg.addColorStop(0.5, '#0B3BD6'); bg.addColorStop(1, '#07195E'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.07)'; for (let x = 0; x < W; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = '#fff'; g.font = '800 30px Geist, system-ui, sans-serif'; g.fillText('ObjectPad Earn', 64, 90);
  g.font = '700 22px "Geist Mono", monospace'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(hash ? 'PAID ON-CHAIN' : 'POST VERIFIED', 64, 130);
  g.fillStyle = '#12A150'; g.beginPath(); g.arc(W - 110, 100, 44, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(W - 130, 100); g.lineTo(W - 115, 116); g.lineTo(W - 88, 86); g.stroke();
  g.fillStyle = '#fff'; g.font = '900 150px Anybody, Geist, system-ui, sans-serif'; g.fillText(`+$${s.rewardUsd.toFixed(2)}`, 60, 300);
  g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(64, 350, W - 128, 190, 28); g.fill();
  g.fillStyle = '#fff'; g.font = '800 28px Geist, system-ui, sans-serif'; g.fillText(`@${s.handle}`, 96, 400);
  g.font = '500 24px Geist, system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)'; const words = s.text.replace(/\s+/g, ' ').split(' '); let line = ''; let y = 445; for (const w of words) { if (g.measureText(`${line} ${w}`).width > W - 200) { g.fillText(line, 96, y); line = w; y += 34; if (y > 515) { line += ' …'; break; } } else line = line ? `${line} ${w}` : w; } if (y <= 515) g.fillText(line, 96, y);
  g.font = '700 20px "Geist Mono", monospace'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(`Verified ${new Date(s.verifiedAt).toUTCString().slice(5, 22)} UTC · reward locked at approval`, 64, 590);
  if (hash) g.fillText(`tx ${hash.slice(0, 18)}…${hash.slice(-8)}`, 64, 622);
  g.fillStyle = '#fff'; g.font = '800 26px Geist, system-ui, sans-serif'; g.textAlign = 'right'; g.fillText('objectpad.fun/earn', W - 64, 622);
  return new Promise<Blob>((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('Render failed')), 'image/png'));
}
function ProofShare({ s, hash, light = false }: { s: EarnSubmission; hash?: string | null; light?: boolean }) {
  const [busy, setBusy] = useState<boolean>(false);
  const download = async () => { setBusy(true); try { const blob = await renderProof(s, hash); const file = new File([blob], `objectpad-earn-${s.postId}.png`, { type: 'image/png' }); if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: caption(s) }); else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } track('proof_shared'); } catch { /* cancelled */ } finally { setBusy(false); } };
  return <div className="grid grid-cols-[1fr_auto] gap-2">
    <a href={`https://x.com/intent/post?text=${encodeURIComponent(caption(s))}&url=${encodeURIComponent(proofUrl(s.id))}`} target="_blank" rel="noreferrer" onClick={() => track('proof_shared')} className={cn('press flex min-h-12 items-center justify-center gap-2 rounded-full text-[14.5px] font-extrabold', light ? 'cta-hero' : 'bg-white text-[#0B3BD6]')}><Share2 size={16}/>Share my proof</a>
    <button onClick={() => void download()} disabled={busy} className={cn('press flex size-12 items-center justify-center rounded-full', light ? 'btn' : 'earn-glass')} aria-label="Download proof card">{busy ? <Loader2 size={17} className="animate-spin"/> : <Download size={17}/>}</button>
  </div>;
}

// ---------------------------------------------------------------- submit flow
function SubmitPanel({ onSubmitted }: { onSubmitted: () => void }) {
  const session = useSession(); const me = useEarnMe(); const submit = useSubmitPost();
  const [url, setUrl] = useState<string>(''); const [result, setResult] = useState<EarnSubmission | null>(null); const [error, setError] = useState<string | null>(null);
  const valid = postIdFrom(url) !== null; const x = me.data?.x;
  const run = useCallback(async (link: string) => { setError(null); setResult(null); try { const r = await submit.mutateAsync(link); setResult(r.submission); onSubmitted(); } catch (e) { setError(errorText(e)); } }, [submit, onSubmitted]);
  const daily = me.data?.daily; const remaining = daily ? Math.max(0, daily.max - daily.used) : null;
  const gate = !session.authenticated ? <div>
      <p className="text-[13.5px] font-bold text-ink/70">Sign in to submit a post. We confirm authorship straight from your X account — only signed-in creators can use Earn.</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <AuthOption icon={<XGlyph size={19}/>} tone="x" title="Sign in with X" subtitle="Required · confirms you wrote the post" onClick={() => { track('auth_started'); session.login(['twitter']); }}/>
        <AuthOption icon={<MetaMaskGlyph size={28}/>} tone="wallet" title="Connect MetaMask" subtitle="Optional · lets you claim rewards on-chain" onClick={() => { track('auth_started'); session.login(['wallet']); }}/>
      </div>
    </div>
    : me.isLoading ? <Skeleton className="h-20 w-full"/>
    : !x ? <div>
      <p className="text-[13.5px] font-bold text-ink/70">{me.data?.xError ? (EARN_ERRORS[me.data.xError] ?? 'Could not read your X account.') : 'Connect your X account so we can confirm the post is yours. Read-only: we never post for you.'}</p>
      {session.linkX && <div className="mt-3"><AuthOption icon={<XGlyph size={19}/>} tone="x" title="Connect X" subtitle="One more step to submit posts" onClick={() => { track('auth_started'); session.linkX?.(); }}/></div>}
    </div> : null;
  return <div className="raised rounded-[28px] p-5">
    <div className="flex items-center justify-between"><p className="lab">2 · Submit the link</p>{x && <span className="inline-flex items-center gap-2 font-mono text-[11.5px] font-bold text-ink/60">{x.avatar && <img src={x.avatar} alt="" className="size-5 rounded-full"/>}@{x.handle}</span>}</div>
    {gate ?? <form onSubmit={e => { e.preventDefault(); if (valid && !submit.isPending) void run(url); }} className="mt-3">
      <label htmlFor="earn-url" className="sr-only">Paste your X post link</label>
      <div className={cn('relative flex items-center gap-2 rounded-[22px] p-2 transition-all duration-300', valid ? 'bg-[#1F6BFF]/10 ring-2 ring-[#1F6BFF]/40' : 'sunk')}>
        <input id="earn-url" value={url} onChange={e => setUrl(e.target.value)} onPaste={() => track('post_link_pasted')} inputMode="url" autoComplete="off" placeholder="Paste your X post link" className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-[16px] font-semibold outline-none placeholder:text-ink/40"/>
        <button type="submit" disabled={!valid || submit.isPending || me.data?.rules.submissionsOpen === false} className="cta-hero press shrink-0 py-1.5 pl-1.5 pr-4 text-[14px] disabled:opacity-40">{submit.isPending ? <span className="orb size-9"><Loader2 size={15} className="animate-spin text-ink"/></span> : <span className="orb size-9"><ShieldCheck size={15} className="text-ink"/></span>}Verify</button>
      </div>
      <p className={cn('mt-2 px-1 text-[12px] font-semibold', url && !valid ? 'text-down' : 'text-ink/50')}>{url && !valid ? 'That isn’t an x.com post link yet. Use Share → Copy link on your post.' : me.data?.rules.submissionsOpen === false ? 'Submissions are paused by the campaign operator.' : 'x.com or twitter.com links. We fetch the post straight from X.'}</p>
    </form>}
    <Verify pending={submit.isPending} result={result} error={error} remaining={remaining} onReset={() => { setResult(null); setError(null); setUrl(''); submit.reset(); }} onRetry={() => void run(url)}/>
  </div>;
}

// ---------------------------------------------------------------- dashboard + claim
function Dashboard({ market }: { market?: EarnMarket }) {
  const session = useSession(); const me = useEarnMe(); const now = useNow(30_000); const [claiming, setClaiming] = useState<boolean>(false);
  const available = useCount(me.data?.balances.availableUsd ?? 0);
  if (!session.authenticated) return null;
  if (me.isLoading || !me.data) return <section id="dashboard" className="mt-4 grid gap-3 sm:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-28 rounded-[24px]"/>)}</section>;
  const d = me.data; const b = d.balances; const left = Math.max(0, d.daily.max - d.daily.used);
  return <section id="dashboard" className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]" aria-label="Your earnings">
    <div className="earn-sky rounded-[30px] p-5 sm:p-6">
      <div className="flex items-center justify-between"><p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/70">Available to claim</p>{d.x && <span className="earn-glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold">{d.x.avatar && <img src={d.x.avatar} alt="" className="size-4 rounded-full"/>}@{d.x.handle}</span>}</div>
      <p className="display mt-2 text-[56px] leading-none tabular-nums sm:text-[68px]">{money(available)}</p>
      <p className="mt-1 text-[12.5px] font-semibold text-white/70">USD rewards · paid in ETH on Robinhood Chain at the live ETH price when you claim</p>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Pending verification', b.pendingVerificationUsd], ['Pending payout', b.pendingPayoutUsd], ['Lifetime earned', b.lifetimeUsd], ['Claimed', b.claimedUsd]].map(([k, v]) => <div key={k as string} className="rounded-2xl bg-white/10 p-3"><p className="font-mono text-[9.5px] font-bold uppercase text-white/60">{k}</p><p className="mt-0.5 text-[16px] font-extrabold tabular-nums">{money(v as number)}</p></div>)}</div>
      <button onClick={() => setClaiming(true)} disabled={b.availableUsd < d.rules.minClaimUsd || !d.rules.payoutsOpen || d.blocked} className="press mt-5 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-white text-[15.5px] font-extrabold text-[#0B3BD6] disabled:opacity-50"><Wallet size={17}/>{!d.rules.payoutsOpen ? 'Payouts paused' : b.availableUsd < d.rules.minClaimUsd ? `Claims start at ${money(d.rules.minClaimUsd)}` : `Claim ${money(b.availableUsd)}`}</button>
      <p className="mt-2 text-center text-[11.5px] font-semibold text-white/65">Or keep it on ObjectPad. Your balance never expires.</p>
    </div>
    <div className="grid gap-3">
      <div className="raised rounded-[26px] p-5">
        <p className="lab">Daily allowance</p>
        <p className="mt-2 text-[22px] font-extrabold tabular-nums">{d.daily.used} of {d.daily.max} rewarded posts used</p>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">{Array.from({ length: d.daily.max }, (_, i) => <span key={i} className={cn('h-2.5 flex-1 rounded-full transition-colors duration-500', i < d.daily.used ? 'bg-[#1F6BFF]' : 'bg-ink/10')}/>)}</div>
        <p className="mt-2 text-[13px] font-semibold text-ink/60">{d.daily.resetsAt ? `Next slot frees in ${countdown(d.daily.resetsAt - now)}` : `${left} rewards available right now`}</p>
      </div>
      <div className="raised grid grid-cols-2 gap-3 rounded-[26px] p-5">
        <div><p className="lab">Reward rate</p><p className="mt-1 text-[20px] font-extrabold">{market ? money(market.rewardUsd) : '—'}</p></div>
        <div><p className="lab">Payout wallet</p><p className="mt-1 truncate font-mono text-[13px] font-bold">{d.wallets[0] ? shortAddress(d.wallets[0].address) : 'None'}</p><Link to="/wallet" className="text-[12px] font-bold text-[#1447C9] underline underline-offset-4">Manage</Link></div>
      </div>
    </div>
    {claiming && <ClaimSheet available={b.availableUsd} wallets={d.wallets} ethUsd={market?.ethUsd ?? null} onClose={() => setClaiming(false)}/>}
  </section>;
}
function ClaimSheet({ available, wallets, ethUsd, onClose }: { available: number; wallets: { address: string; kind: string }[]; ethUsd: number | null; onClose: () => void }) {
  const claim = useClaimReward(); const [wallet, setWallet] = useState<string>(wallets[0]?.address ?? ''); const [key] = useState<string>(newKey); const [result, setResult] = useState<EarnClaim | null>(null); const [error, setError] = useState<string | null>(null);
  const cents = Math.floor(available * 100); const estEth = ethUsd ? cents / 100 / ethUsd : null;
  const confirm = async () => { setError(null); try { setResult(await claim.mutateAsync({ amountCents: cents, wallet, idempotencyKey: key })); } catch (e) { setError(errorText(e)); } };
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-[3px] sm:items-center" role="dialog" aria-modal="true" aria-label="Claim rewards" onClick={() => !claim.isPending && onClose()}>
    <div className="raised card-pop w-full max-w-[440px] rounded-[30px] p-6" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between"><p className="lab">Confirm claim</p><button onClick={onClose} disabled={claim.isPending} className="press flex size-10 items-center justify-center rounded-full hover:bg-ink/5" aria-label="Close"><XIcon size={17}/></button></div>
      {!result ? <>
        <p className="display mt-2 text-[44px] leading-none">Claim {money(cents / 100)}</p>
        <dl className="mt-5 space-y-3 text-[14px]">
          <div><dt className="font-mono text-[11px] font-bold uppercase text-ink/55">Destination</dt><dd className="mt-1">{wallets.length ? <select value={wallet} onChange={e => setWallet(e.target.value)} className="sunk min-h-12 w-full rounded-2xl px-3 font-mono text-[13px] font-bold outline-none">{wallets.map(w => <option key={w.address} value={w.address}>{shortAddress(w.address, 8, 6)} · {w.kind === 'account' ? 'Account wallet' : 'Linked wallet'}</option>)}</select> : <p className="font-semibold text-down">No wallet linked. <Link to="/wallet" className="underline">Link MetaMask</Link> first.</p>}</dd></div>
          <div className="flex justify-between"><dt className="text-ink/60">Method</dt><dd className="font-bold">Wallet transfer</dd></div>
          <div className="flex justify-between"><dt className="text-ink/60">Network</dt><dd className="font-bold">Robinhood Chain (4663)</dd></div>
          <div className="flex justify-between"><dt className="text-ink/60">You will receive</dt><dd className="text-right font-bold">{estEth ? `≈ ${estEth.toFixed(6)} ETH` : 'Priced at confirm'}<span className="block text-[11px] font-semibold text-ink/50">Exact ETH set at the live price on confirm</span></dd></div>
          <div className="flex justify-between"><dt className="text-ink/60">Network fee</dt><dd className="font-bold">Paid by ObjectPad</dd></div>
        </dl>
        {error && <p className="mt-4 rounded-2xl bg-down/10 p-3 text-[13px] font-bold text-down">{error}</p>}
        <button onClick={() => void confirm()} disabled={!wallet || claim.isPending} className="cta-hero press mt-5 w-full justify-center py-2 text-[15px] disabled:opacity-50">{claim.isPending ? <><Loader2 size={17} className="animate-spin"/>Sending payout…</> : <>Confirm claim<ArrowRight size={17}/></>}</button>
        <p className="mt-2 text-center text-[11px] font-semibold text-ink/50">Safe to retry: this claim can only be paid once.</p>
      </> : <ClaimResult c={result} onClose={onClose}/>}
    </div>
  </div>;
}
function ClaimResult({ c, onClose }: { c: EarnClaim; onClose: () => void }) {
  const me = useEarnMe(); const live = me.data?.claims.find(x => x.id === c.id) ?? c;
  const ok = live.state === 'confirmed'; const bad = live.state === 'failed';
  return <div className="mt-3 text-center">
    <span className={cn('earn-tick mx-auto flex size-16 items-center justify-center rounded-full text-white', ok ? 'bg-up' : bad ? 'bg-down' : 'bg-[#1F6BFF]')}>{ok ? <Check size={30} strokeWidth={3.5}/> : bad ? <XIcon size={28} strokeWidth={3}/> : <Loader2 size={26} className="animate-spin"/>}</span>
    <p className="mt-4 text-[22px] font-extrabold">{ok ? 'Paid on-chain' : bad ? 'Payout failed' : 'Payout submitted'}</p>
    <p className="mt-1 text-[13.5px] font-semibold text-ink/60">{ok ? `${money(live.amountUsd)} sent to ${shortAddress(live.wallet)}.` : bad ? `${live.error ?? 'The payout did not go through'}. The amount is back in your balance.` : 'Waiting for confirmation on Robinhood Chain…'}</p>
    {live.hash && <a href={EXPLORER_TX(live.hash)} target="_blank" rel="noreferrer" className="btn press mt-4 min-h-11 px-5 text-[13px]">View transaction<ExternalLink size={14}/></a>}
    <button onClick={onClose} className="btn-ghost press mt-3 block min-h-11 w-full text-[13px]">Done</button>
  </div>;
}

// ---------------------------------------------------------------- history
function History() {
  const session = useSession(); const me = useEarnMe(); const [open, setOpen] = useState<string | null>(null);
  if (!session.authenticated || !me.data) return null;
  const { submissions, claims } = me.data;
  if (!submissions.length && !claims.length) return null;
  const reward = (s: EarnSubmission): { state: 'ok' | 'bad' | 'wait' | 'info'; label: string } => s.state === 'rejected' ? { state: 'bad', label: 'Rejected' } : s.state === 'verification_error' ? { state: 'wait', label: 'Try again' } : s.state === 'pending_review' ? { state: 'wait', label: 'In review' } : s.rewardState === 'available' ? { state: 'ok', label: 'Ready to claim' } : s.rewardState === 'review' ? { state: 'wait', label: 'Under review' } : s.rewardState === 'reversed' ? { state: 'bad', label: 'Reversed' } : { state: 'info', label: 'Approved · 24h hold' };
  return <section className="mt-10" aria-labelledby="history-title">
    <h2 id="history-title" className="display text-[30px] sm:text-[38px]">Your history</h2>
    <ol className="mt-4 space-y-2">
      {claims.map(c => <li key={c.id} className="raised flex flex-wrap items-center gap-3 rounded-[22px] p-4"><span className="flex size-10 items-center justify-center rounded-full bg-[#1F6BFF]/10 text-[#1447C9]"><Wallet size={17}/></span><div className="min-w-0 flex-1"><p className="text-[14.5px] font-extrabold">Claim {money(c.amountUsd)} → {shortAddress(c.wallet)}</p><p className="text-[12px] font-semibold text-ink/55">{timeAgo(c.createdAt)} · ETH ${c.ethUsd.toFixed(2)}</p></div><Status state={c.state === 'confirmed' ? 'ok' : c.state === 'failed' ? 'bad' : 'wait'} label={c.state === 'confirmed' ? 'Paid' : c.state === 'failed' ? 'Failed · refunded' : 'Confirming'}/>{c.hash && <a href={EXPLORER_TX(c.hash)} target="_blank" rel="noreferrer" className="press flex size-10 items-center justify-center rounded-full hover:bg-ink/5" aria-label="View transaction"><ExternalLink size={15}/></a>}</li>)}
      {submissions.map(s => { const r = reward(s); const isOpen = open === s.id; return <li key={s.id} className="raised overflow-hidden rounded-[22px]">
        <button onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-4 text-left"><div className="min-w-0 flex-1"><p className="truncate text-[14px] font-bold">{s.text || `Post ${s.postId}`}</p><p className="mt-0.5 text-[12px] font-semibold text-ink/55">{timeAgo(s.submittedAt)}{s.rewardUsd ? ` · ${money(s.rewardUsd)} locked` : ''}{s.reasons[0] && s.state !== 'approved' ? ` · ${s.reasons[0].message}` : ''}</p></div><Status {...r}/><ChevronDown size={17} className={cn('shrink-0 transition-transform', isOpen && 'rotate-180')}/></button>
        {isOpen && <div className="slide-in border-t border-ink/5 p-4">
          <div className="grid gap-2 sm:grid-cols-4">{[['Locked reward', s.rewardUsd ? money(s.rewardUsd) : '—'], ['Market cap at approval', s.marketCapUsd ? bigMoney(s.marketCapUsd) : '—'], ['Reward tier', s.rewardUsd ? `${money(s.rewardUsd)} / post` : '—'], ['Credits', s.maturesAt ? new Date(s.maturesAt).toLocaleString() : '—']].map(([k, v]) => <div key={k} className="sunk rounded-2xl p-3"><p className="font-mono text-[9.5px] font-bold uppercase text-ink/55">{k}</p><p className="mt-0.5 text-[13.5px] font-extrabold">{v}</p></div>)}</div>
          <p className="lab mt-4">Audit trail</p><ol className="mt-2 space-y-1.5 border-l-2 border-ink/10 pl-4">{(s.audit ?? []).map((a, i) => <li key={i} className="text-[12.5px]"><span className="font-mono font-bold uppercase text-ink/70">{a.event.replace(/_/g, ' ')}</span> <span className="text-ink/45">· {new Date(a.at).toLocaleString()}</span><p className="font-semibold text-ink/65">{a.detail}</p></li>)}</ol>
          <div className="mt-3 flex flex-wrap gap-2"><a href={s.url} target="_blank" rel="noreferrer" className="btn-ghost press min-h-10 px-4 text-[12.5px]">Original post<ArrowUpRight size={13}/></a>{s.state === 'approved' && <Link to={`/earn/proof/${s.id}`} className="btn-ghost press min-h-10 px-4 text-[12.5px]">Proof page</Link>}</div>
        </div>}
      </li>; })}
    </ol>
  </section>;
}

// ---------------------------------------------------------------- public feed
const FILTERS: { id: FeedFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'approved', label: 'Approved' }, { id: 'paid', label: 'Paid' }, { id: 'pending', label: 'Pending' }, { id: 'rejected', label: 'Rejected' }];
function feedStatus(i: FeedItem): { state: 'ok' | 'bad' | 'wait' | 'info'; label: string } {
  if (i.kind === 'payout') return i.state === 'confirmed' ? { state: 'ok', label: 'Confirmed' } : i.state === 'failed' ? { state: 'bad', label: 'Failed' } : { state: 'wait', label: 'Payout submitted' };
  if (i.state === 'rejected') return { state: 'bad', label: 'Rejected' }; if (i.state === 'pending_review') return { state: 'wait', label: 'Pending review' }; if (i.state === 'verification_error') return { state: 'wait', label: 'Retrying' };
  return i.rewardState === 'available' ? { state: 'ok', label: 'Ready to claim' } : i.rewardState === 'review' ? { state: 'wait', label: 'No longer eligible?' } : { state: 'info', label: 'Approved' };
}
function Feed() {
  const [filter, setFilter] = useState<FeedFilter>('all'); const feed = useEarnFeed(filter); const now = useNow(10_000);
  return <section className="mt-12" aria-labelledby="feed-title">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab inline-flex items-center gap-2"><span className="pulse-dot size-1.5 rounded-full bg-up"/>Live</p><h2 id="feed-title" className="display mt-1 text-[30px] sm:text-[38px]">Live Earn Activity</h2></div>
      {feed.data && <div className="flex gap-4 font-mono text-[11.5px] font-bold text-ink/60"><span>{feed.data.stats.approved} approved</span><span>{feed.data.stats.earners} earners</span><span>{money(feed.data.stats.paidUsd)} paid on-chain</span></div>}</div>
    <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filter activity">{FILTERS.map(f => <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className={cn('press min-h-10 shrink-0 rounded-full px-4 text-[13px] font-bold transition-colors', filter === f.id ? 'bg-ink text-white' : 'sunk text-ink/70')}>{f.label}</button>)}</div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {feed.isLoading ? [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-[22px]"/>) : !feed.data?.items.length ? <div className="sunk col-span-full rounded-[24px] p-8 text-center"><p className="text-[16px] font-extrabold">Nothing here yet.</p><p className="mt-1 text-[13px] font-semibold text-ink/60">Only real, verified submissions and payouts appear in this feed. Be the first.</p></div>
        : feed.data.items.map(i => { const st = feedStatus(i); return <article key={`${i.kind}-${i.id}`} className="raised earn-float-up flex gap-3 rounded-[22px] p-4">
          {i.kind === 'post' ? (i.avatar ? <img src={i.avatar} alt="" className="size-10 shrink-0 rounded-full" loading="lazy"/> : <span className="size-10 shrink-0 rounded-full bg-ink/10"/>) : <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-up/10 text-up"><Wallet size={17}/></span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2"><p className="truncate text-[13.5px] font-extrabold">@{i.handle || 'anon'}</p><span className="shrink-0 font-mono text-[10.5px] font-bold text-ink/45">{timeAgo(i.at, now)}</span></div>
            {i.kind === 'post' ? <p className="mt-0.5 line-clamp-2 text-[12.5px] font-medium text-ink/70">{i.preview}</p> : <p className="mt-0.5 text-[12.5px] font-semibold text-ink/70">{money(i.amountUsd)} → <span className="font-mono">{i.wallet}</span></p>}
            <div className="mt-2 flex flex-wrap items-center gap-2"><Status {...st}/>{i.kind === 'post' && i.rewardUsd > 0 && <span className="font-mono text-[11px] font-extrabold">{money(i.rewardUsd)}</span>}{i.kind === 'post' && i.state === 'rejected' && i.reason && <span className="text-[11px] font-semibold text-ink/50">{i.reason}</span>}
              {i.kind === 'post' ? <a href={i.url} target="_blank" rel="noreferrer" className="ml-auto text-[11.5px] font-bold text-[#1447C9] underline underline-offset-2">Post</a> : i.hash && <a href={EXPLORER_TX(i.hash)} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[11px] font-bold text-[#1447C9] underline underline-offset-2">{i.hash.slice(0, 10)}…</a>}</div>
          </div>
        </article>; })}
    </div>
    <p className="mt-3 text-[12px] font-semibold text-ink/55">Approved means the post passed verification and the reward is locked. Paid means a confirmed Robinhood Chain transaction exists.</p>
  </section>;
}

// ---------------------------------------------------------------- leaderboard
const MEDAL = ['#F2C94C', '#C7CDD6', '#C97A3D'];
function Leaderboard() {
  const board = useEarnLeaderboard(); const rows = board.data?.earners ?? [];
  return <section className="mt-12" aria-labelledby="lb-title">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="lab inline-flex items-center gap-2"><Trophy size={13}/>Real earners, real payouts</p><h2 id="lb-title" className="display mt-1 text-[30px] sm:text-[38px]">Earn Leaderboard</h2></div>
      {board.data && <div className="flex gap-4 font-mono text-[11.5px] font-bold text-ink/60"><span>{money(board.data.totals.paidUsd)} paid on-chain</span><span>{money(board.data.totals.creditedUsd)} credited</span><span>{board.data.totals.earners} X accounts linked</span></div>}</div>
    {board.isLoading ? <div className="mt-4 grid gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-[22px]"/>)}</div>
      : !rows.length ? <div className="sunk mt-4 rounded-[24px] p-8 text-center"><p className="text-[16px] font-extrabold">No credited rewards yet.</p><p className="mt-1 text-[13px] font-semibold text-ink/60">The first person to earn a reward takes the top spot.</p></div>
      : <ol className="mt-4 grid gap-2">{rows.map((r, i) => <li key={r.handle} className="raised earn-float-up flex items-center gap-3 rounded-[22px] p-3.5" style={{ ['--delay' as string]: `${i * 40}ms` }}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-extrabold" style={{ background: MEDAL[i] ? `${MEDAL[i]}30` : 'rgba(12,13,16,.06)', color: MEDAL[i] ?? 'rgba(12,13,16,.55)' }}>{i + 1}</span>
          {r.avatar ? <img src={r.avatar} alt="" className="size-10 shrink-0 rounded-full" loading="lazy"/> : <span className="size-10 shrink-0 rounded-full bg-ink/10"/>}
          <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-extrabold">{r.name || `@${r.handle}`}</p><p className="truncate font-mono text-[11.5px] font-semibold text-ink/55">@{r.handle} · {r.payouts} {r.payouts === 1 ? 'payout' : 'payouts'} · last {timeAgo(r.lastAt)}</p></div>
          <div className="shrink-0 text-right"><p className="font-mono text-[15px] font-extrabold tabular-nums">{money(r.paidUsd || r.creditedUsd)}</p><p className="font-mono text-[10px] font-bold uppercase text-ink/45">{r.paidUsd ? 'paid' : 'credited'}</p></div>
        </li>)}</ol>}
    <p className="mt-3 text-[12px] font-semibold text-ink/55">Ranked by confirmed on-chain payouts, then by credited balance. Only real, verified $ObjectPad earners appear here.</p>
  </section>;
}

// ---------------------------------------------------------------- rules
function Rules() {
  const rules = useEarnRules(); const r = rules.data;
  return <section id="rules" className="mt-12 grid gap-4 lg:grid-cols-2" aria-labelledby="rules-title">
    <div className="raised rounded-[28px] p-6">
      <h2 id="rules-title" className="display text-[28px]">Rules & limits</h2>
      <ul className="mt-4 space-y-3 text-[14px] font-semibold leading-relaxed text-ink/75">
        <li><b className="text-ink">Rewards.</b> Rewards start at $1 per approved post. Every complete $100K in ObjectPad market cap adds another $1 to every post reward.</li>
        <li><b className="text-ink">Daily limit.</b> Earn rewards for up to {r?.dailyMax ?? 5} approved posts per rolling 24-hour period. Your authenticated X account, submission history, and campaign integrity checks determine eligibility.</li>
        <li><b className="text-ink">Required in every post.</b> $ObjectPad, the contract address {shortAddress(EARN_CA, 8, 6)}, objectpad.fun, and #ad on X (its paid-partnership label). At least {r?.minOwnChars ?? 25} characters in your own words.</li>
        <li><b className="text-ink">Minimum live period.</b> Rewards credit after your post stays live for {r?.holdHours ?? 24} hours. Posts deleted earlier move to review. Confirmed payouts are never clawed back.</li>
        <li><b className="text-ink">Eligible posts.</b> Standalone public posts from the connected X account, published in the last {r?.postMaxAgeDays ?? 7} days and after the campaign started. No replies, reposts, hidden text or reused text.</li>
        <li><b className="text-ink">Payouts.</b> {r?.payout ?? 'ETH on Robinhood Chain at the live ETH/USD price when you claim'}. Minimum claim {money(r?.minClaimUsd ?? 1)}. ObjectPad pays the network fee.</li>
        {r && <li><b className="text-ink">Campaign budget.</b> {money(r.budgetLeftUsd)} of {money(r.budgetUsd)} remaining.</li>}
      </ul>
    </div>
    <div className="grid gap-4">
      <div className="earn-sky rounded-[28px] p-6"><ShieldCheck size={26}/><p className="mt-3 text-[18px] font-extrabold leading-snug">Every displayed post, approval, reward, and payout is backed by real verification data. Confirmed wallet payouts include a public blockchain transaction.</p></div>
      <div className="raised rounded-[28px] p-6"><p className="lab">Disclosure & fraud policy</p><p className="mt-2 text-[13.5px] font-semibold leading-relaxed text-ink/70">Posts created through this campaign must clearly disclose that they are incentivized. Approval is subject to campaign rules, verification, anti-abuse checks, and available reward funds. Each X account can be linked to one ObjectPad account. Duplicate, coordinated or automated submissions are rejected or sent to manual review.</p><a href="https://x.com/ObjectPadFun" target="_blank" rel="noreferrer" className="btn-ghost press mt-4 min-h-11 px-4 text-[13px]">Appeal or get help<ArrowUpRight size={14}/></a></div>
    </div>
  </section>;
}

/** /earn: rewards for verified X posts about $OBJECTPAD. Everything shown comes from the ObjectPad backend. */
export default function Earn() {
  const market = useEarnMarket(); const session = useSession(); const me = useEarnMe(); const submitRef = useRef<HTMLDivElement>(null);
  useEffect(() => { track('earn_page_viewed'); }, []);
  const authed = useRef<boolean>(session.authenticated); useEffect(() => { if (session.authenticated && !authed.current) track('auth_completed'); authed.current = session.authenticated; }, [session.authenticated]);
  const refresh = useCallback(() => { void me.refetch(); }, [me]);
  return <div className="page py-6 sm:py-10">
    <EarnSwitch className="enter mb-6"/>
    <Hero market={market.data} loading={market.isLoading} error={market.isError} onStart={() => submitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}/>
    <Milestone market={market.data}/>
    <Dashboard market={market.data}/>
    <section className="mt-12" aria-labelledby="how-title"><h2 id="how-title" className="display text-[30px] sm:text-[38px]">How it works</h2>
      <ol className="mt-4 grid gap-2 sm:grid-cols-4">{STEPS.map((s, i) => <li key={s.n} className="raised card-pop rounded-[22px] p-4" style={{ ['--delay' as string]: `${i * 70}ms` }}><span className="font-mono text-[12px] font-extrabold text-[#1447C9]">{s.n}</span><p className="mt-2 text-[16px] font-extrabold">{s.t}</p><p className="mt-1 text-[13px] font-semibold text-ink/60">{s.d}</p></li>)}</ol>
    </section>
    <div ref={submitRef} className="mt-8 grid scroll-mt-24 gap-4 lg:grid-cols-[1fr_1.35fr]"><Composer/><SubmitPanel onSubmitted={refresh}/></div>
    <History/>
    <Feed/>
    <Leaderboard/>
    <Rules/>
  </div>;
}

/** Public proof record for one approved post (/earn/proof/:id). */
export function EarnProof() {
  const { id = '' } = useParams(); const proof = useQuery({ queryKey: ['objectpad', 'earn', 'proof', id], queryFn: () => api<EarnSubmission>(`/earn/proof/${id}`), enabled: /^[0-9a-f-]{36}$/.test(id), retry: 1 });
  const s = proof.data;
  return <div className="page max-w-[720px] py-8 sm:py-12">
    {proof.isLoading ? <Skeleton className="h-96 rounded-[32px]"/> : !s ? <div className="raised rounded-[28px] p-8 text-center"><p className="text-[20px] font-extrabold">Proof not found</p><p className="mt-1 text-[13.5px] font-semibold text-ink/60">This record doesn’t exist or isn’t approved.</p><Link to="/earn" className="btn press mt-5 min-h-11 px-5 text-[13px]">Go to Earn</Link></div> : <>
      <div className="earn-sky rounded-[32px] p-5 sm:p-7">
        <div className="flex items-center justify-between"><span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/75">ObjectPad Earn · Proof</span><Status state={s.state === 'approved' ? 'ok' : 'wait'} label={s.state === 'approved' ? 'Verified' : 'In review'}/></div>
        <p className="display mt-3 text-[56px] leading-none">+{money(s.rewardUsd)}</p>
        <p className="mt-1 text-[13px] font-semibold text-white/75">Locked at approval{s.marketCapUsd ? ` · ${bigMoney(s.marketCapUsd)} market cap` : ''} · verified {new Date(s.verifiedAt).toLocaleString()}</p>
        <PostCard s={s} revealed={99} scanning={false} className="mt-5 text-ink"/>
        <div className="mt-5 flex items-center gap-4"><div className="rounded-2xl bg-white p-2"><QRCodeSVG value={`${window.location.origin}/earn/proof/${s.id}`} size={72} level="M" marginSize={0} fgColor="#0B3BD6" title="Proof record link"/></div><p className="text-[13.5px] font-bold text-white/85">Earn for your own posts at <span className="font-extrabold text-white">objectpad.fun/earn</span></p></div>
      </div>
      <div className="mt-4"><ProofShare s={s} light/></div>
      <Link to="/earn" className="btn-ghost press mt-3 flex min-h-12 items-center justify-center text-[14px]">Start earning<ArrowRight size={15}/></Link>
    </>}
  </div>;
}
