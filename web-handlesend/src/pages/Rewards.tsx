import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { parseEther, type Address } from 'viem';
import { ArrowLeft, ArrowRight, Camera, Check, Coins, Crown, ExternalLink, ImagePlus, Loader2, Lock, Plus, ScanLine, Search, Share2, ShieldCheck, Sparkles, Trash2, Trophy, Upload, Wallet, X as XIcon } from 'lucide-react';
import { useSession } from '@/lib/session';
import { useSigner, sendEth } from '@/lib/wallet';
import { copyText, shortAddress, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { EarnSwitch } from '@/components/EarnSwitch';
import { RewardShare } from '@/components/RewardShare';
import { Avatar, RewardStatusPill, Scramble, SkyPoster, Voxels } from '@/components/RewardArt';
import { CATEGORY_LABEL, addressUrl, rewardError, txUrl, useCancelReward, useCreateReward, useFundReward, usePayout, useReviewProof, useReward, useRewardBoard, useSubmitProof, useUploadPhoto, type Reward, type RewardCategory, type RewardProof } from '@/lib/rewards';

type Filter = 'all' | 'open' | 'objectpad' | 'community' | 'paid' | 'mine';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'open', label: 'Open now' }, { id: 'objectpad', label: 'By ObjectPad' }, { id: 'community', label: 'Community' }, { id: 'paid', label: 'Paid out' }, { id: 'mine', label: 'Mine' }];
const money = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;

function useCount(target: number, ms = 1100): number {
  const [v, setV] = useState<number>(0); const from = useRef<number>(0);
  useEffect(() => { const start = performance.now(); const a = from.current; let raf = 0; const step = (t: number) => { const p = Math.min(1, (t - start) / ms); const n = a + (target - a) * (1 - Math.pow(1 - p, 3)); setV(n); from.current = n; if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [target, ms]);
  return v;
}

function Stat({ label, value, format, live = false, delay = 0 }: { label: string; value: number; format: (v: number) => string; live?: boolean; delay?: number }) {
  const v = useCount(value);
  return <div className="raised card-pop rounded-[22px] px-4 py-3.5" style={{ ['--delay' as string]: `${delay}ms` }}>
    <p className="stat-label flex items-center gap-1.5">{live && <span className="pulse-dot size-1.5 rounded-full bg-up"/>}{label}</p>
    <p className="display mt-1 text-[30px] leading-none tnum sm:text-[34px]">{format(v)}</p>
  </div>;
}

/** Terminal-style boot lines that type in on first load. */
function BootLog({ lines }: { lines: string[] }) {
  return <div className="smoke relative overflow-hidden rounded-[22px] p-4 font-mono text-[11.5px] leading-[1.7] text-white/75">
    {lines.map((l, i) => <p key={l} className="boot-line" style={{ ['--delay' as string]: `${200 + i * 260}ms` }}><span className="text-white/40">{String(i).padStart(2, '0')} ›</span> {l}</p>)}
    <p className="boot-line" style={{ ['--delay' as string]: `${200 + lines.length * 260}ms` }}><span className="text-white/40">{String(lines.length).padStart(2, '0')} ›</span> ready<span className="blink">▌</span></p>
  </div>;
}

/** Live ribbon of real board events (from each bounty's public audit log). */
function Ribbon({ bounties }: { bounties: Reward[] }) {
  const events = useMemo(() => bounties.flatMap(b => b.audit.slice(0, 3).map(a => ({ key: `${b.id}-${a.at}-${a.event}`, text: `${a.event.replace('_', ' ').toUpperCase()} · ${b.title} · ${timeAgo(a.at)}` }))).slice(0, 16), [bounties]);
  const items = events.length ? events : bounties.map(b => ({ key: b.id, text: `${b.status === 'paid' ? 'PAID' : 'OPEN'} · ${b.title} · ${money(b.rewardUsd)}` }));
  if (!items.length) return null;
  return <div className="marquee-mask sunk mt-5 overflow-hidden rounded-2xl py-2.5">
    <div className="ascii-ticker flex w-max gap-8 whitespace-nowrap font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink/60">
      {[...items, ...items].map((e, i) => <span key={`${e.key}-${i}`} className="flex items-center gap-2"><span className="text-ink/30">░▒▓</span>{e.text}</span>)}
    </div>
  </div>;
}

const RewardCard = memo(function RewardCard({ reward, index }: { reward: Reward; index: number }) {
  const proofs = reward.submissions.length;
  return <Link to={`/rewards/${reward.id}`} className="card-pop app-card group block overflow-hidden rounded-[28px] reward-glow" style={{ ['--delay' as string]: `${Math.min(index, 8) * 70}ms` }}>
    <div className="relative">
      <SkyPoster reward={reward} reveal={!reward.adult} className="aspect-[16/9] w-full"/>
      <RewardStatusPill reward={reward} className="absolute left-3 top-3"/>
      <span className="absolute right-3 top-3 rounded-2xl bg-ink/85 px-3 py-1.5 font-display text-[22px] font-black leading-none text-white backdrop-blur-md tnum">{money(reward.rewardUsd)}</span>
      {reward.kind === 'community' && reward.status === 'open' && <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 font-mono text-[10.5px] font-extrabold uppercase text-ink"><Lock size={11}/>Escrowed</span>}
    </div>
    <div className="p-4">
      <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink/55"><span>{CATEGORY_LABEL[reward.category] ?? 'Find it'}</span><span>·</span><span>{reward.kind === 'platform' ? 'ObjectPad' : 'Community'}</span></div>
      <h3 className="display mt-1.5 text-[23px] leading-[0.98]">{reward.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink/65">{reward.tagline}</p>
      <div className="mt-3 flex items-center gap-2 border-t border-ink/[0.07] pt-3">
        <Avatar src={reward.poster.avatar} name={reward.poster.handle || reward.poster.name} size={26}/>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink/70">{reward.poster.handle ? `@${reward.poster.handle}` : reward.poster.name || 'Anonymous poster'}</span>
        <span className="font-mono text-[11.5px] font-bold text-ink/55">{proofs} {proofs === 1 ? 'proof' : 'proofs'}</span>
        <ArrowRight size={16} className="text-ink/35 transition-transform group-hover:translate-x-1 group-hover:text-ink"/>
      </div>
    </div>
  </Link>;
});

/** Wall of paid bounties with the verified winner facts. */
function WinnersWall({ bounties }: { bounties: Reward[] }) {
  const paid = bounties.filter(b => b.status === 'paid'); if (!paid.length) return null;
  return <section className="mt-12" aria-labelledby="wins">
    <div className="flex items-end justify-between gap-3"><div><p className="lab">Hall of finds</p><h2 id="wins" className="display mt-1 text-[32px] sm:text-[40px]">Paid out. For real.</h2></div><Trophy size={30} className="shrink-0"/></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2">{paid.map(b => { const win = b.submissions.find(s => s.state === 'paid'); const w = b.winner; const tx = win?.payoutTx ?? b.payoutTx;
      return <Link key={b.id} to={`/rewards/${b.id}`} className="raised press group flex items-center gap-4 rounded-[26px] p-3 pr-5">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-[20px]"><SkyPoster reward={b} className="h-full w-full"/></div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-mono text-[11px] font-extrabold uppercase tracking-[0.08em] text-up"><Check size={12} strokeWidth={3}/>{money(b.rewardUsd)} paid</p>
          <p className="display mt-1 truncate text-[20px] leading-none">{b.title}</p>
          <div className="mt-2 flex items-center gap-2">
            <Avatar src={win?.avatar || w?.avatar} name={win?.handle || w?.handle || 'W'} size={24}/>
            <span className="truncate text-[12.5px] font-bold text-ink/70">{win?.handle ? `@${win.handle}` : w?.handle ? `@${w.handle}` : w ? `${w.coinName} · ${shortAddress(w.creatorWallet)}` : 'Winner'}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] font-bold text-ink/50">{tx ? `tx ${shortAddress(tx, 8, 6)}` : 'Confirmed by ObjectPad'}</p>
        </div>
      </Link>; })}</div>
  </section>;
}

/** How posting a bounty works: the trust loop in four steps. */
function EscrowExplainer({ onPost }: { onPost: () => void }) {
  const steps: [string, string, ReactNode][] = [['Post the ask', 'Any object you want found, scanned or tokenized. Your coin, your meme, your merch.', <Plus key="a" size={18}/>], ['Lock the reward', 'ETH goes into the public ObjectPad escrow wallet. It goes live only once the deposit is verified on-chain.', <Lock key="b" size={18}/>], ['Hunters send proof', 'Photos from the real world, plus the ObjectPad coin they launched for it.', <Camera key="c" size={18}/>], ['Pay the first real one', 'One tap sends the escrow straight to the winner. Every step is public, linked to Robinhood Chain.', <Coins key="d" size={18}/>]];
  return <section className="steel relative mt-12 overflow-hidden rounded-[32px] p-5 sm:p-8">
    <Voxels seed={42} count={30} className="-right-4 top-0 hidden h-full w-[40%] opacity-60 md:block"/>
    <div className="relative max-w-3xl">
      <p className="lab">Post your own bounty</p>
      <h2 className="display mt-2 text-[34px] leading-[0.95] sm:text-[48px]">Want something in the real world tokenized? Put money on it.</h2>
      <p className="mt-3 max-w-xl text-[15px] font-bold leading-snug text-ink/65">Pay hunters to find, scan and launch the objects you want to see on-chain. Promote your coin with an IRL 3D replica, get your meme printed and scanned, or send people hunting for the weirdest thing in their city.</p>
    </div>
    <ol className="relative mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{steps.map(([t, d, icon], i) => <li key={t} className="raised card-pop rounded-[22px] p-4" style={{ ['--delay' as string]: `${i * 80}ms` }}>
      <span className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white">{icon}</span>
      <p className="mt-3 font-mono text-[11px] font-extrabold text-ink/45">0{i + 1}</p><p className="text-[15.5px] font-extrabold">{t}</p><p className="mt-1 text-[12.5px] font-semibold leading-snug text-ink/60">{d}</p>
    </li>)}</ol>
    <button onClick={onPost} className="btn press relative mt-6 min-h-14 px-7 text-[15px]"><Plus size={18}/>Post a bounty</button>
  </section>;
}

// ---------------- Create + fund ----------------

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className="block"><span className="flex items-baseline justify-between px-1 text-[12.5px] font-extrabold">{label}{hint && <span className="font-mono text-[10.5px] font-bold text-ink/45">{hint}</span>}</span><div className="mt-1">{children}</div></label>; }
const input = 'sunk w-full rounded-2xl px-4 py-3 text-[14px] font-semibold outline-none placeholder:text-ink/40 focus:ring-2 focus:ring-ink/20';

/** Funds a draft: one-tap from the signed-in wallet, or paste a hash from any wallet (MetaMask etc.). */
export function FundPanel({ reward, onDone }: { reward: Reward; onDone?: (r: Reward) => void }) {
  const session = useSession(); const signer = useSigner(); const fund = useFundReward();
  const [hash, setHash] = useState<string>(''); const [sending, setSending] = useState<boolean>(false); const [err, setErr] = useState<string>(''); const [copied, setCopied] = useState<boolean>(false);
  const eth = reward.rewardEth ?? 0; const escrow = reward.escrow ?? '';
  const payFromWallet = async () => {
    setErr(''); const s = session.wallet ? signer(session.wallet) : null; if (!s) { setErr('Connect a wallet first, or send from any wallet and paste the hash below.'); return; }
    setSending(true);
    try { const h = await sendEth(s, escrow as Address, BigInt(reward.rewardWei ?? parseEther(String(eth)).toString())); setHash(h); fund.mutate({ id: reward.id, hash: h }, { onSuccess: r => onDone?.(r) }); }
    catch (e) { setErr(e instanceof Error ? e.message.split('\n')[0].slice(0, 160) : 'The transfer didn’t go through.'); }
    finally { setSending(false); }
  };
  return <div className="space-y-3">
    <div className="smoke rounded-[22px] p-4 text-white">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-white/55">Lock in escrow</p>
      <p className="display mt-1 text-[34px] leading-none tnum">{eth.toFixed(6)} ETH</p>
      <p className="mt-1 font-mono text-[11.5px] text-white/55">= {money(reward.rewardUsd)} at the live rate · Robinhood Chain (4663)</p>
      <button onClick={() => void copyText(escrow).then(ok => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1400); } })} className="press mt-3 flex w-full items-center gap-2 rounded-2xl bg-white/10 px-3 py-2.5 text-left font-mono text-[12px] font-bold">
        <span className="min-w-0 flex-1 break-all">{escrow}</span>{copied ? <Check size={14}/> : <span className="text-white/50">copy</span>}
      </button>
      <a href={addressUrl(escrow)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] font-bold text-white/60 underline">ObjectPad Rewards escrow on Blockscout<ExternalLink size={11}/></a>
    </div>
    <button onClick={() => void payFromWallet()} disabled={sending || fund.isPending || !session.authenticated} className="btn press min-h-13 w-full py-3.5 text-[14.5px] disabled:opacity-50">{sending || fund.isPending ? <Loader2 size={16} className="animate-spin"/> : <Wallet size={16}/>}{sending ? 'Confirm in your wallet…' : fund.isPending ? 'Verifying on-chain…' : 'Fund from my ObjectPad wallet'}</button>
    <div className="flex items-center gap-2 text-[11.5px] font-bold text-ink/45"><span className="h-px flex-1 bg-ink/10"/>or send from MetaMask / any wallet<span className="h-px flex-1 bg-ink/10"/></div>
    <div className="sunk flex items-center gap-2 rounded-2xl p-1.5 pl-4">
      <input value={hash} onChange={e => setHash(e.target.value.trim())} placeholder="Paste deposit tx hash 0x…" className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[12.5px] font-semibold outline-none placeholder:text-ink/40"/>
      <button onClick={() => fund.mutate({ id: reward.id, hash }, { onSuccess: r => onDone?.(r) })} disabled={!/^0x[a-fA-F0-9]{64}$/.test(hash) || fund.isPending} className="btn press min-h-11 shrink-0 px-4 text-[13px] disabled:opacity-40">Verify</button>
    </div>
    {(err || fund.isError) && <p className="px-1 text-[12.5px] font-bold text-down">{err || rewardError(fund.error)}</p>}
    <p className="px-1 text-[11.5px] font-semibold leading-snug text-ink/50">Your bounty goes live the moment the deposit is confirmed. You can cancel any time before a hunter submits proof and get a full refund (minus the network fee) to the wallet that funded it.</p>
  </div>;
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const session = useSession(); const create = useCreateReward(); const upload = useUploadPhoto(); const navigate = useNavigate();
  const [object, setObject] = useState<string>(''); const [brief, setBrief] = useState<string>(''); const [usd, setUsd] = useState<number>(50); const [category, setCategory] = useState<RewardCategory>('find');
  const [days, setDays] = useState<number>(14); const [promo, setPromo] = useState<string>(''); const [adult, setAdult] = useState<boolean>(false); const [cover, setCover] = useState<{ hash: string; url: string } | null>(null);
  const [rules, setRules] = useState<string>('A real object, found and scanned in person\nClear photo proof of the object\nFirst approved proof wins');
  const [draft, setDraft] = useState<Reward | null>(null);
  const reset = () => { setDraft(null); create.reset(); };
  const ready = object.trim().length >= 2 && brief.trim().length >= 10 && usd >= 5 && usd <= 10_000;
  const submit = () => create.mutate({ object: object.trim(), title: `First ${object.trim()} scan`, brief: brief.trim(), rules: rules.split('\n').map(r => r.trim()).filter(Boolean), category, adult, rewardUsd: usd, promoUrl: promo.trim(), days, cover: cover?.hash ?? '' }, { onSuccess: r => setDraft(r) });
  return <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }} title={draft ? 'Lock the reward' : 'Post a bounty'} description={draft ? 'Step 2 of 2 · fund the escrow so hunters know the money is real.' : 'Step 1 of 2 · say what you want found, scanned or tokenized.'}>
    {!session.authenticated ? <div className="space-y-3"><p className="text-[14px] font-semibold text-ink/70">Sign in with X, email or a wallet to post bounties and get paid for proofs.</p><button onClick={() => session.login()} className="btn press min-h-12 w-full">Sign in / Sign up</button></div>
      : draft ? <div className="space-y-3">
        <div className="overflow-hidden rounded-[20px]"><SkyPoster reward={draft} className="aspect-[16/9] w-full"/></div>
        <FundPanel reward={draft} onDone={r => { onOpenChange(false); reset(); navigate(`/rewards/${r.id}?live=1`); }}/>
        <button onClick={() => { onOpenChange(false); navigate(`/rewards/${draft.id}`); }} className="btn-ghost press min-h-11 w-full text-[13px]">Fund later from the bounty page</button>
      </div>
      : <form onSubmit={e => { e.preventDefault(); if (ready) submit(); }} className="space-y-3.5">
        <Field label="What should hunters find?" hint={`${object.length}/60`}><input value={object} onChange={e => setObject(e.target.value.slice(0, 60))} placeholder="Rotary phone, Pepe plush, a $DOGE billboard…" className={input}/></Field>
        <Field label="The ask" hint={`${brief.length}/280`}><textarea value={brief} onChange={e => setBrief(e.target.value.slice(0, 280))} rows={3} placeholder="Find a real one in the wild, scan it on ObjectPad and launch its coin." className={cn(input, 'resize-none')}/></Field>
        <Field label="Reward" hint="$5 – $10,000 · paid in ETH">
          <div className="flex flex-wrap gap-1.5">{[25, 50, 100, 250, 500].map(v => <button type="button" key={v} onClick={() => setUsd(v)} className={cn('press min-h-10 rounded-xl px-3.5 text-[13px] font-extrabold', usd === v ? 'btn' : 'btn-ghost')}>${v}</button>)}
            <input type="number" min={5} max={10000} value={usd} onChange={e => setUsd(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))} className="sunk min-h-10 w-24 rounded-xl px-3 font-mono text-[13px] font-bold outline-none" aria-label="Custom reward in USD"/></div>
        </Field>
        <Field label="Type"><div className="flex flex-wrap gap-1.5">{(Object.keys(CATEGORY_LABEL) as RewardCategory[]).map(c => <button type="button" key={c} onClick={() => setCategory(c)} className={cn('press min-h-10 rounded-xl px-3 text-[12.5px] font-extrabold', category === c ? 'btn' : 'btn-ghost')}>{CATEGORY_LABEL[c]}</button>)}</div></Field>
        <Field label="Rules" hint="one per line · max 4"><textarea value={rules} onChange={e => setRules(e.target.value)} rows={3} className={cn(input, 'resize-none text-[13px]')}/></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Runs for"><select value={days} onChange={e => setDays(Number(e.target.value))} className={input}>{[3, 7, 14, 30].map(d => <option key={d} value={d}>{d} days</option>)}<option value={0}>Until won</option></select></Field>
          <Field label="Your link" hint="optional"><input value={promo} onChange={e => setPromo(e.target.value)} placeholder="https://x.com/…" className={input}/></Field>
        </div>
        <Field label="Cover" hint={cover ? 'your photo' : 'AI paints one if empty'}>
          <label className="sunk press flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-3">
            {cover ? <img src={cover.url} alt="" className="size-10 rounded-xl object-cover"/> : <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-white">{upload.isPending ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}</span>}
            <span className="flex-1 text-[13px] font-bold text-ink/70">{upload.isPending ? 'Uploading…' : cover ? 'Replace photo' : 'Leave empty for an AI sky poster, or upload a photo'}</span>
            <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) upload.mutate(f, { onSuccess: setCover }); e.target.value = ''; }}/>
          </label>
          {upload.isError && <p className="mt-1 px-1 text-[12px] font-bold text-down">{rewardError(upload.error)}</p>}
        </Field>
        <label className="flex min-h-10 items-center gap-2 px-1 text-[12.5px] font-bold text-ink/70"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="size-4 accent-ink"/>18+ object (cover is blurred until tapped)</label>
        {create.isError && <p className="px-1 text-[12.5px] font-bold text-down">{rewardError(create.error)}</p>}
        <button type="submit" disabled={!ready || create.isPending || upload.isPending} className="btn press min-h-13 w-full py-3.5 text-[14.5px] disabled:opacity-40">{create.isPending ? <Loader2 size={16} className="animate-spin"/> : <ArrowRight size={16}/>}Continue to escrow · {money(usd)}</button>
        <p className="px-1 text-center text-[11px] font-semibold text-ink/45">Bounties must follow the Safety rules. ObjectPad can remove abusive bounties; funded ones are refunded.</p>
      </form>}
  </Dialog>;
}

// ---------------- Board page ----------------

export default function Rewards() {
  const board = useRewardBoard(); const session = useSession(); const [filter, setFilter] = useState<Filter>('all'); const [q, setQ] = useState<string>(''); const [creating, setCreating] = useState<boolean>(false);
  const all = useMemo(() => board.data?.bounties ?? [], [board.data]); const stats = board.data?.stats;
  const list = useMemo(() => all.filter(b => filter === 'all' ? b.status !== 'cancelled' : filter === 'open' ? b.status === 'open' : filter === 'objectpad' ? b.kind === 'platform' : filter === 'community' ? b.kind === 'community' && b.status !== 'cancelled' : filter === 'paid' ? b.status === 'paid' : b.mine || b.submissions.some(s => s.mine))
    .filter(b => !q.trim() || `${b.title} ${b.object} ${b.tagline} ${b.poster.handle}`.toLowerCase().includes(q.trim().toLowerCase())), [all, filter, q]);
  const post = () => { if (!session.authenticated) session.login(); else setCreating(true); };
  return <div className="page pb-24 pt-6 sm:pt-10">
    <EarnSwitch className="enter"/>
    <section className="relative mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-end">
      <div>
        <p className="enter lab">ObjectPad · Paid Rewards</p>
        <h1 className="display mt-3 text-[clamp(44px,9.5vw,88px)] leading-[0.9]"><Scramble text={'Scan it first.\nGet paid.'}/></h1>
        <p className="enter mt-4 max-w-xl text-[17px] font-bold leading-snug text-ink/70">Cash bounties for finding, scanning and tokenizing real objects. Hunt ObjectPad’s rewards, or post your own and lock the money in escrow. Rewards only go up.</p>
        <div className="enter mt-5 flex flex-wrap gap-2">
          <button onClick={post} className="btn press min-h-14 px-6 text-[15px]"><Plus size={18}/>Post a bounty</button>
          <Link to="/launch" className="btn-ghost press min-h-14 px-6 text-[15px]"><ScanLine size={18}/>Scan something</Link>
        </div>
      </div>
      <BootLog lines={['mount escrow 0x' + (board.data?.escrow ?? '…').slice(2, 8) + '…  chain=4663', `bounties.open = ${stats?.open ?? '…'}  paid = ${stats?.paid ?? '…'}`, `proofs.received = ${stats?.proofs ?? '…'}  hunters = ${stats?.hunters ?? '…'}`, 'verify(photo, coin, wallet) → release()']}/>
    </section>
    <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Stat label="Open rewards" value={stats?.openUsd ?? 0} format={money} live/>
      <Stat label="Paid to hunters" value={stats?.paidUsd ?? 0} format={money} delay={70}/>
      <Stat label="Locked in escrow" value={stats?.escrowEth ?? 0} format={v => `${v.toFixed(4)} Ξ`} delay={140}/>
      <Stat label="Proofs submitted" value={stats?.proofs ?? 0} format={v => Math.round(v).toLocaleString('en-US')} delay={210}/>
    </div>
    <Ribbon bounties={all}/>

    <div className="sticky top-[62px] z-30 -mx-4 mt-8 bg-paper/80 px-4 py-2 backdrop-blur-xl lg:top-[92px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">{FILTERS.map(f => <button key={f.id} onClick={() => setFilter(f.id)} className={cn('press min-h-10 shrink-0 rounded-full px-4 text-[13px] font-extrabold transition-colors', filter === f.id ? 'bg-ink text-white' : 'sunk text-ink/70 hover:text-ink')}>{f.label}</button>)}</div>
        <label className="sunk flex min-h-10 flex-1 items-center gap-2 rounded-full px-4 sm:max-w-xs sm:ml-auto"><Search size={15} className="text-ink/45"/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search objects" className="min-w-0 flex-1 bg-transparent text-[13.5px] font-semibold outline-none placeholder:text-ink/40"/></label>
      </div>
    </div>

    {board.isError ? <p className="mt-8 font-bold text-down">Rewards couldn’t load. <button className="underline" onClick={() => void board.refetch()}>Retry</button></p>
      : <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {board.isPending ? [0, 1, 2].map(i => <div key={i} className="raised aspect-[4/5] animate-pulse rounded-[28px]"/>) : list.map((b, i) => <RewardCard key={b.id} reward={b} index={i}/>)}
        {!board.isPending && <button onClick={post} className="card-pop sunk press group flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[28px] border-2 border-dashed border-ink/15 p-6 text-center" style={{ ['--delay' as string]: `${Math.min(list.length, 8) * 70}ms` }}>
          <span className="flex size-16 items-center justify-center rounded-[22px] bg-ink text-white transition-transform group-hover:scale-110 group-hover:rotate-6"><Plus size={28}/></span>
          <span className="display text-[24px]">Your bounty here</span><span className="max-w-[240px] text-[13px] font-semibold text-ink/55">Name an object, lock the reward, watch hunters go find it.</span>
        </button>}
      </div>}
    {!board.isPending && !list.length && <p className="mt-4 text-[14px] font-semibold text-ink/55">{filter === 'mine' ? (session.authenticated ? 'Nothing yet. Post a bounty or send a proof.' : 'Sign in to see your bounties and proofs.') : 'No bounties match.'}</p>}

    <WinnersWall bounties={all}/>
    <EscrowExplainer onPost={post}/>
    <p className="mt-6 text-[12px] font-semibold leading-relaxed text-ink/50">ObjectPad bounties are judged by the ObjectPad team and paid from the team wallet. Community bounties are posted by users; the reward is held in the ObjectPad Rewards escrow wallet and released by the poster (or ObjectPad) to the winner’s wallet, or refunded to the funder on cancel. Every deposit, payout and refund is linked to Robinhood Chain.</p>
    <CreateDialog open={creating} onOpenChange={setCreating}/>
  </div>;
}

// ---------------- Detail page ----------------

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 36 }, (_, i) => ({ i, dx: `${(Math.random() - 0.5) * 520}px`, dy: `${-120 - Math.random() * 320}px`, c: ['#12A150', '#1F6FEB', '#0C0D10', '#9CCBFF'][i % 4], d: Math.random() * 0.3 })), []);
  return <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2">{bits.map(b => <span key={b.i} className="confetti-bit" style={{ background: b.c, ['--dx' as string]: b.dx, ['--dy' as string]: b.dy, animationDelay: `${b.d}s` }}/>)}</div>;
}

function ProofForm({ reward }: { reward: Reward }) {
  const session = useSession(); const upload = useUploadPhoto(); const submit = useSubmitProof();
  const [photo, setPhoto] = useState<{ hash: string; url: string } | null>(null); const [coin, setCoin] = useState<string>(''); const [note, setNote] = useState<string>(''); const [adult, setAdult] = useState<boolean>(false);
  if (reward.status !== 'open') return null;
  if (!session.authenticated) return <div className="raised rounded-[24px] p-4"><p className="display text-[22px]">Found it?</p><p className="mt-1 text-[13.5px] font-semibold text-ink/60">Sign in to send a photo proof and get paid to your wallet.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><button onClick={() => session.login()} className="btn press min-h-12">Sign in / Sign up</button><Link to="/launch" className="btn-ghost press min-h-12"><ScanLine size={16}/>Scan it now</Link></div></div>;
  if (reward.mine) return null;
  const ready = (Boolean(photo) || coin.trim().length >= 10) && (!reward.adult || adult);
  return <form onSubmit={e => { e.preventDefault(); if (ready) submit.mutate({ id: reward.id, photo: photo?.hash ?? '', coin: coin.trim(), note }, { onSuccess: () => { setPhoto(null); setCoin(''); setNote(''); } }); }} className="raised space-y-2.5 rounded-[24px] p-4">
    <p className="display text-[22px]">Submit your proof</p>
    <label className="sunk press relative flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-[20px] text-center">
      {photo ? <img src={photo.url} alt="Your proof" className="absolute inset-0 h-full w-full object-cover"/> : <><span className="flex size-12 items-center justify-center rounded-2xl bg-ink text-white">{upload.isPending ? <Loader2 size={20} className="animate-spin"/> : <ImagePlus size={20}/>}</span><span className="text-[13.5px] font-extrabold">{upload.isPending ? 'Uploading…' : 'Add a photo of the real object'}</span><span className="font-mono text-[11px] text-ink/50">JPG/PNG · location data is stripped</span></>}
      {photo && <span className="absolute bottom-2 right-2 rounded-full bg-ink/80 px-3 py-1 font-mono text-[11px] font-bold text-white">Replace</span>}
      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) upload.mutate(f, { onSuccess: setPhoto }); e.target.value = ''; }}/>
    </label>
    {upload.isError && <p className="px-1 text-[12px] font-bold text-down">{rewardError(upload.error)}</p>}
    <input value={coin} onChange={e => setCoin(e.target.value)} placeholder={reward.kind === 'platform' ? 'Your ObjectPad coin: 0x… or objectpad.fun link' : 'Optional: the coin you launched for it (0x… or link)'} className={cn(input, 'font-mono text-[12.5px]')}/>
    <input value={note} onChange={e => setNote(e.target.value)} maxLength={280} placeholder="Where you found it, anything the poster should know" className={cn(input, 'text-[13px]')}/>
    {reward.adult && <label className="flex min-h-10 items-center gap-2 px-1 text-[12.5px] font-bold text-ink/70"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="size-4 accent-ink"/>I’m 18+ and this is my own original photo.</label>}
    {submit.isError && <p className="px-1 text-[12.5px] font-bold text-down">{rewardError(submit.error)}</p>}
    {submit.isSuccess && <p className="slide-in px-1 text-[12.5px] font-bold text-up">Proof sent. The {reward.kind === 'platform' ? 'ObjectPad team' : 'poster'} reviews it next.</p>}
    <button type="submit" disabled={!ready || submit.isPending || upload.isPending} className="btn press min-h-12 w-full disabled:opacity-40">{submit.isPending ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>}Submit proof</button>
  </form>;
}

function ProofCard({ proof, reward, canJudge, operator }: { proof: RewardProof; reward: Reward; canJudge: boolean; operator: boolean }) {
  const payout = usePayout(); const review = useReviewProof(); const [note, setNote] = useState<string>(''); const [tx, setTx] = useState<string>(''); const [confirm, setConfirm] = useState<boolean>(false);
  const community = reward.kind === 'community'; const pending = proof.state === 'submitted';
  const label = proof.state === 'paid' ? 'Paid' : proof.state === 'winner' ? 'Winner' : proof.state === 'rejected' ? 'Not accepted' : 'In review';
  return <li className={cn('raised overflow-hidden rounded-[24px]', proof.state === 'paid' && 'ring-2 ring-up')}>
    {proof.photo && <a href={proof.photo} target="_blank" rel="noreferrer" className="block"><img src={proof.photo} alt="Proof" loading="lazy" className="pixel-in aspect-[4/3] w-full object-cover"/></a>}
    <div className="p-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar src={proof.avatar} name={proof.handle || proof.wallet} size={34}/>
        <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-extrabold">{proof.handle ? `@${proof.handle}` : proof.wallet}{proof.mine && <span className="ml-1.5 rounded-full bg-ink px-1.5 py-0.5 align-middle font-mono text-[9.5px] font-extrabold uppercase text-white">You</span>}</p><p className="font-mono text-[11px] text-ink/50">{timeAgo(proof.createdAt)}</p></div>
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] font-extrabold uppercase', proof.state === 'paid' || proof.state === 'winner' ? 'bg-up/15 text-up' : proof.state === 'rejected' ? 'bg-down/10 text-down' : 'bg-ink/[0.07] text-ink/70')}>{proof.state === 'paid' ? <Check size={11} strokeWidth={3}/> : proof.state === 'winner' ? <Crown size={11}/> : proof.state === 'rejected' ? <XIcon size={11}/> : <Loader2 size={11} className="animate-spin"/>}{label}</span>
      </div>
      {proof.note && <p className="mt-2 text-[13px] font-semibold text-ink/70">“{proof.note}”</p>}
      {proof.recordId && <Link to={`/objects/${proof.recordId}`} className="sunk mt-2 flex items-center gap-2 rounded-2xl p-2 pr-3">{proof.coinImage && <img src={proof.coinImage} alt="" className="size-9 rounded-xl object-cover"/>}<span className="min-w-0 flex-1 truncate text-[13px] font-extrabold">{proof.coinName} <span className="font-mono text-[11px] text-ink/55">${proof.coinSymbol}</span></span><ArrowRight size={14}/></Link>}
      {proof.reviewNote && <p className="mt-2 font-mono text-[11.5px] text-ink/55">Review: {proof.reviewNote}</p>}
      {proof.payoutTx && <a href={txUrl(proof.payoutTx)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-mono text-[11.5px] font-bold text-up underline">Payout tx {shortAddress(proof.payoutTx, 8, 6)}<ExternalLink size={11}/></a>}
      {canJudge && community && pending && reward.status === 'open' && <div className="mt-3 space-y-2 border-t border-ink/[0.07] pt-3">
        {!confirm ? <button onClick={() => setConfirm(true)} className="btn press min-h-11 w-full text-[13.5px]"><Coins size={15}/>Pay out {money(reward.rewardUsd)}</button>
          : <div className="smoke rounded-2xl p-3 text-white"><p className="text-[13px] font-bold">Send {reward.rewardEth?.toFixed(5)} ETH from escrow to {proof.handle ? `@${proof.handle}` : proof.wallet}? This can’t be undone.</p><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setConfirm(false)} className="press min-h-10 rounded-xl bg-white/10 text-[12.5px] font-bold">Back</button><button onClick={() => payout.mutate({ subId: proof.id })} disabled={payout.isPending} className="press flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-up text-[12.5px] font-extrabold">{payout.isPending ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>}Confirm payout</button></div></div>}
        <div className="flex gap-2"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason (public)" className="sunk min-w-0 flex-1 rounded-xl px-3 py-2 text-[12.5px] font-semibold outline-none"/><button onClick={() => review.mutate({ subId: proof.id, state: 'rejected', note, tx: '' })} disabled={review.isPending || note.trim().length < 3} className="btn-ghost press min-h-10 px-3 text-[12.5px] disabled:opacity-40">Reject</button></div>
      </div>}
      {operator && !community && <div className="mt-3 space-y-2 border-t border-ink/[0.07] pt-3">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Review note (public)" className="sunk w-full rounded-xl px-3 py-2 text-[12.5px] font-semibold outline-none"/>
        <input value={tx} onChange={e => setTx(e.target.value.trim())} placeholder="Payout tx hash 0x… (to mark paid)" className="sunk w-full rounded-xl px-3 py-2 font-mono text-[12px] outline-none"/>
        <div className="grid grid-cols-4 gap-1.5">{(['winner', 'paid', 'rejected', 'submitted'] as const).map(st => <button key={st} disabled={review.isPending} onClick={() => review.mutate({ subId: proof.id, state: st, note, tx })} className={cn('press min-h-10 rounded-xl text-[12px] font-extrabold', st === proof.state ? 'btn' : 'btn-ghost')}>{st === 'submitted' ? 'Reset' : st === 'rejected' ? 'Reject' : st[0].toUpperCase() + st.slice(1)}</button>)}</div>
      </div>}
      {(payout.isError || review.isError) && <p className="mt-2 text-[12px] font-bold text-down">{rewardError(payout.error ?? review.error)}</p>}
    </div>
  </li>;
}

/** Verified winner facts for ObjectPad bounties settled outside the proof queue (hardcoded, confirmed by the team). */
function PlatformWinner({ reward }: { reward: Reward }) {
  const w = reward.winner; if (!w) return null;
  return <div className="raised relative overflow-hidden rounded-[24px] p-4 ring-2 ring-up">
    <p className="flex items-center gap-1.5 font-mono text-[11px] font-extrabold uppercase tracking-[0.08em] text-up"><Crown size={12}/>Winner · {money(reward.rewardUsd)} paid</p>
    <div className="mt-3 flex items-center gap-3"><Avatar src={w.avatar} name={w.handle ?? w.coinName} size={52}/>
      <div className="min-w-0 flex-1"><p className="truncate text-[16px] font-extrabold">{w.name ?? w.coinName}</p>
        {w.handle ? <a href={`https://x.com/${w.handle}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] font-bold text-ink/55">@{w.handle}</a> : <a href={addressUrl(w.creatorWallet)} target="_blank" rel="noreferrer" className="font-mono text-[12px] font-bold text-ink/55">Scanner {shortAddress(w.creatorWallet)}</a>}</div></div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[11.5px] font-bold">
      <a href={w.coinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">View {w.coinName}<ExternalLink size={11}/></a>
      <a href={`https://robinhoodchain.blockscout.com/token/${w.token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Token {shortAddress(w.token)}<ExternalLink size={11}/></a>
      {w.postUrl && <a href={w.postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">Announcement<ExternalLink size={11}/></a>}
    </div>
  </div>;
}

export function RewardDetail() {
  const { id = '' } = useParams(); const reward = useReward(id); const board = useRewardBoard(); const cancel = useCancelReward();
  const [share, setShare] = useState<boolean>(false); const [reveal, setReveal] = useState<boolean>(false); const [confirmCancel, setConfirmCancel] = useState<boolean>(false);
  const justLive = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('live') === '1';
  const r = reward.data; const operator = Boolean(board.data?.operator);
  useEffect(() => { if (r) document.title = `ObjectPad · ${r.title} · ${money(r.rewardUsd)}`; }, [r]);
  if (reward.isPending) return <div className="page py-10"><div className="raised aspect-[16/9] animate-pulse rounded-[32px]"/></div>;
  if (reward.isError || !r) return <div className="page py-24"><h1 className="display text-5xl">Bounty not found.</h1><Link to="/rewards" className="btn press mt-6 min-h-12 px-6">All rewards</Link></div>;
  const winner = r.submissions.find(s => s.state === 'paid' || s.state === 'winner') ?? null;
  const canJudge = r.mine || operator; const pending = r.submissions.filter(s => s.state === 'submitted').length;
  return <div className="page pb-24 pt-5 sm:pt-8">
    <Link to="/rewards" className="press inline-flex min-h-10 items-center gap-1.5 text-[13.5px] font-extrabold text-ink/65 hover:text-ink"><ArrowLeft size={16}/>All rewards</Link>
    <div className="relative mt-3 overflow-hidden rounded-[32px] reward-glow">
      <button onClick={() => setReveal(true)} className="block w-full text-left" disabled={!r.adult || reveal} aria-label={r.adult && !reveal ? 'Reveal 18+ cover' : r.title}><SkyPoster reward={r} big reveal={!r.adult || reveal} className="aspect-[16/9] w-full sm:aspect-[21/9]"/></button>
      <RewardStatusPill reward={r} className="absolute left-4 top-4"/>
      <span className="absolute right-4 top-4 rounded-2xl bg-ink/85 px-4 py-2 font-display text-[30px] font-black leading-none text-white backdrop-blur-md tnum">{money(r.rewardUsd)}</span>
      {(justLive || r.status === 'paid') && <Confetti/>}
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink/55"><span>{CATEGORY_LABEL[r.category] ?? 'Find it'}</span><span>·</span><span>{r.kind === 'platform' ? 'ObjectPad bounty' : 'Community bounty'}</span><span>·</span><span>posted {r.postedAt}</span>{r.deadline ? <><span>·</span><span>{r.deadline > Date.now() ? `ends ${new Date(r.deadline).toLocaleDateString()}` : 'ended'}</span></> : null}</div>
        <h1 className="display mt-2 text-[clamp(36px,6vw,60px)] leading-[0.92]"><Scramble text={r.title}/></h1>
        <p className="mt-3 text-[17px] font-bold leading-snug text-ink/70">{r.tagline}</p>
        <ul className="mt-4 flex flex-wrap gap-1.5">{r.rules.map(rule => <li key={rule} className="sunk inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-ink/75"><Check size={12} strokeWidth={3}/>{rule}</li>)}</ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2"><Avatar src={r.poster.avatar} name={r.poster.handle || r.poster.name} size={30}/><span className="text-[13.5px] font-extrabold">{r.poster.handle ? `@${r.poster.handle}` : r.poster.name || 'Anonymous'}</span></span>
          {r.promoUrl && <a href={r.promoUrl} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 font-mono text-[12px] font-bold underline">{new URL(r.promoUrl).hostname}<ExternalLink size={11}/></a>}
          <button onClick={() => setShare(true)} className="btn-ghost press ml-auto min-h-11 px-4 text-[13px]"><Share2 size={15}/>{r.status === 'paid' ? 'Share the win' : 'Share'}</button>
        </div>

        <section className="mt-8">
          <div className="flex items-end justify-between"><h2 className="display text-[28px]">Proofs</h2><span className="font-mono text-[12px] font-bold text-ink/55">{r.submissions.length} total{canJudge && pending ? ` · ${pending} waiting on you` : ''}</span></div>
          {r.submissions.length ? <ul className="mt-3 grid gap-3 sm:grid-cols-2">{r.submissions.map(p => <ProofCard key={p.id} proof={p} reward={r} canJudge={canJudge} operator={operator}/>)}</ul>
            : <div className="sunk mt-3 rounded-[24px] p-6 text-center"><Camera size={26} className="mx-auto text-ink/40"/><p className="mt-2 text-[14px] font-extrabold">{r.status === 'paid' ? 'Settled by the ObjectPad team.' : 'No proofs yet. The first real one takes it.'}</p></div>}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        {r.kind === 'platform' && <PlatformWinner reward={r}/>}
        {winner && r.kind === 'community' && <div className="raised rounded-[24px] p-4 ring-2 ring-up"><p className="flex items-center gap-1.5 font-mono text-[11px] font-extrabold uppercase text-up"><Crown size={12}/>{r.status === 'paid' ? 'Winner paid · confirmed on-chain' : 'Payout sending…'}</p><div className="mt-2 flex items-center gap-3"><Avatar src={winner.avatar} name={winner.handle || winner.wallet} size={44}/><p className="text-[15px] font-extrabold">{winner.handle ? `@${winner.handle}` : winner.wallet}</p></div>{r.payoutTx && <a href={txUrl(r.payoutTx)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-mono text-[11.5px] font-bold text-up underline">View payout<ExternalLink size={11}/></a>}</div>}
        {r.status === 'draft' && r.mine && <div className="raised rounded-[24px] p-4"><p className="display text-[22px]">Fund to go live</p><p className="mb-3 mt-1 text-[13px] font-semibold text-ink/60">Only you can see this draft until the reward is locked.</p><FundPanel reward={r}/></div>}
        <ProofForm reward={r}/>
        {r.kind === 'community' && r.status !== 'draft' && <div className="raised rounded-[24px] p-4">
          <p className="flex items-center gap-1.5 text-[14px] font-extrabold"><ShieldCheck size={16}/>Escrow</p>
          <dl className="mt-2 space-y-1.5 font-mono text-[12px]">
            <div className="flex justify-between gap-2"><dt className="text-ink/50">Locked</dt><dd className="font-bold">{r.rewardEth?.toFixed(6)} ETH</dd></div>
            {r.escrow && <div className="flex justify-between gap-2"><dt className="text-ink/50">Wallet</dt><dd><a href={addressUrl(r.escrow)} target="_blank" rel="noreferrer" className="font-bold underline">{shortAddress(r.escrow)}</a></dd></div>}
            {r.fundTx && <div className="flex justify-between gap-2"><dt className="text-ink/50">Deposit</dt><dd><a href={txUrl(r.fundTx)} target="_blank" rel="noreferrer" className="font-bold underline">{shortAddress(r.fundTx, 8, 6)}</a></dd></div>}
            {r.refundTx && <div className="flex justify-between gap-2"><dt className="text-ink/50">Refund</dt><dd><a href={txUrl(r.refundTx)} target="_blank" rel="noreferrer" className="font-bold underline">{shortAddress(r.refundTx, 8, 6)}</a></dd></div>}
          </dl>
        </div>}
        {canJudge && r.kind === 'community' && (r.status === 'open' || r.status === 'draft') && <div className="sunk rounded-[24px] p-4">
          {!confirmCancel ? <button onClick={() => setConfirmCancel(true)} className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-[13px] font-extrabold text-down"><Trash2 size={15}/>{r.status === 'draft' ? 'Delete draft' : 'Cancel & refund'}</button>
            : <div className="space-y-2"><p className="text-[13px] font-bold">{r.status === 'draft' ? 'Delete this draft?' : pending && !operator ? 'Pick a winner or reject the waiting proofs first.' : `Refund ${r.rewardEth?.toFixed(5)} ETH to the funding wallet and close the bounty?`}</p>
              <div className="grid grid-cols-2 gap-2"><button onClick={() => setConfirmCancel(false)} className="btn-ghost press min-h-10 text-[12.5px]">Keep it</button><button onClick={() => cancel.mutate({ id: r.id, reason: '' })} disabled={cancel.isPending || (pending > 0 && !operator && r.status === 'open')} className="press flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-down text-[12.5px] font-extrabold text-white disabled:opacity-40">{cancel.isPending && <Loader2 size={14} className="animate-spin"/>}Confirm</button></div>
              {cancel.isError && <p className="text-[12px] font-bold text-down">{rewardError(cancel.error)}</p>}</div>}
        </div>}
        {r.audit.length > 0 && <div className="smoke rounded-[24px] p-4 text-white">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-white/55">Public audit log</p>
          <ol className="mt-2 space-y-2">{r.audit.map(a => <li key={`${a.at}-${a.event}`} className="border-l border-white/15 pl-3"><p className="font-mono text-[10.5px] uppercase text-white/45">{a.event.replace('_', ' ')} · {timeAgo(a.at)}</p><p className="text-[12.5px] font-semibold text-white/85">{a.detail}</p>{a.tx && <a href={txUrl(a.tx)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-white/60 underline">{shortAddress(a.tx, 8, 6)}</a>}</li>)}</ol>
        </div>}
      </aside>
    </div>
    <RewardShare reward={r} winner={winner} open={share} onOpenChange={setShare}/>
  </div>;
}
