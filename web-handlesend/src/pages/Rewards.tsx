import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Crown, ExternalLink, Loader2, ScanLine, Send, ShieldCheck, Trophy, X as XIcon } from 'lucide-react';
import { useSession } from '@/lib/session';
import { useAccount } from '@/lib/account';
import { RequestError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { EXPLORER_TX } from '@/lib/earn';
import { BOUNTY_ERRORS, useBounties, useBountyQueue, useDecideBounty, useSubmitBounty, type BountyState, type BountySubmission, type LiveBounty } from '@/lib/bounties';
import { cn } from '@/lib/utils';

const errorText = (e: unknown): string => e instanceof RequestError ? (BOUNTY_ERRORS[e.code] ?? e.message) : e instanceof Error ? e.message : 'Something went wrong. Try again.';
const STATE_LABEL: Record<BountyState, string> = { submitted: 'In review', winner: 'Winner', rejected: 'Not accepted', paid: 'Paid' };

function StatePill({ state }: { state: BountyState }) {
  return <span className={cn('inline-flex min-h-[22px] items-center gap-1 whitespace-nowrap rounded-full px-2 font-mono text-[10px] font-extrabold uppercase tracking-[0.08em]',
    state === 'paid' || state === 'winner' ? 'bg-up/15 text-up' : state === 'rejected' ? 'bg-down/10 text-down' : 'bg-ink/[0.07] text-ink/70')}>
    {state === 'paid' ? <Check size={11} strokeWidth={3}/> : state === 'winner' ? <Crown size={11} strokeWidth={2.6}/> : state === 'rejected' ? <XIcon size={11} strokeWidth={3}/> : <Loader2 size={11} className="animate-spin"/>}{STATE_LABEL[state]}
  </span>;
}

function SubmissionRow({ s }: { s: BountySubmission }) {
  return <li className="flex items-center gap-3 py-2.5">
    <img src={s.image} alt="" loading="lazy" className="size-11 shrink-0 rounded-xl bg-ink/5 object-cover"/>
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2 truncate text-[14px] font-extrabold">{s.name}<span className="font-mono text-[11.5px] font-bold text-ink/55">${s.symbol}</span>{s.mine && <span className="rounded-full bg-ink px-1.5 py-0.5 font-mono text-[9.5px] font-extrabold uppercase text-white">You</span>}</p>
      <p className="truncate font-mono text-[11.5px] text-ink/55">{s.wallet} · {timeAgo(s.createdAt)}{s.reviewNote ? ` · ${s.reviewNote}` : ''}</p>
    </div>
    <div className="flex shrink-0 flex-col items-end gap-1">
      <StatePill state={s.state}/>
      <div className="flex gap-2 font-mono text-[11px] font-bold text-ink/60">
        <Link to={`/objects/${s.recordId}`} className="hover:text-ink">Coin</Link>
        {s.payoutTx && <a href={EXPLORER_TX(s.payoutTx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-up hover:underline">Payout<ExternalLink size={10}/></a>}
      </div>
    </div>
  </li>;
}

function SubmitForm({ bounty }: { bounty: LiveBounty }) {
  const session = useSession(); const submit = useSubmitBounty();
  const [coin, setCoin] = useState<string>(''); const [note, setNote] = useState<string>(''); const [adult, setAdult] = useState<boolean>(false);
  if (bounty.status !== 'open') return <div className="sunk flex items-center gap-2 rounded-2xl px-4 py-3 text-[13.5px] font-extrabold"><Trophy size={16}/>{bounty.status === 'paid' ? 'Won and paid out.' : 'Winner picked. Payout on the way.'}</div>;
  if (!session.authenticated) return <div className="flex flex-col gap-2 sm:flex-row"><Link to="/launch" className="btn press min-h-12 flex-1 text-[14px]"><ScanLine size={16}/>Scan it now</Link><button onClick={() => session.login()} className="btn-ghost press min-h-12 flex-1 text-[14px]">Sign in to submit your coin</button></div>;
  const ready = coin.trim().length >= 10 && (!bounty.adult || adult);
  return <form onSubmit={e => { e.preventDefault(); if (ready) submit.mutate({ bountyId: bounty.id, coin: coin.trim(), note }, { onSuccess: () => { setCoin(''); setNote(''); } }); }} className="space-y-2">
    <div className="sunk flex items-center gap-2 rounded-2xl p-1.5 pl-4">
      <input value={coin} onChange={e => setCoin(e.target.value)} placeholder="Coin address 0x… or objectpad.fun link" className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[13px] font-semibold outline-none placeholder:text-ink/40" aria-label="Coin address or link"/>
      <button type="submit" disabled={!ready || submit.isPending} className="btn press min-h-11 shrink-0 px-4 text-[13.5px] disabled:opacity-40">{submit.isPending ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}Submit</button>
    </div>
    <input value={note} onChange={e => setNote(e.target.value)} maxLength={280} placeholder="Optional: where you found it, anything we should know" className="sunk w-full rounded-2xl px-4 py-2.5 text-[13px] font-semibold outline-none placeholder:text-ink/40"/>
    {bounty.adult && <label className="flex min-h-10 items-center gap-2 px-1 text-[12.5px] font-bold text-ink/70"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} className="size-4 accent-ink"/>I’m 18+ and this is my own original scan.</label>}
    {submit.isError && <p className="px-1 text-[12.5px] font-bold text-down">{errorText(submit.error)}</p>}
    {submit.isSuccess && <p className="slide-in px-1 text-[12.5px] font-bold text-up">Submitted. It’s in the review queue now.</p>}
  </form>;
}

const BountyCard = memo(function BountyCard({ bounty, index }: { bounty: LiveBounty; index: number }) {
  const [reveal, setReveal] = useState<boolean>(!bounty.adult);
  return <article className="card-pop raised overflow-hidden rounded-[30px]" style={{ ['--delay' as string]: `${index * 90}ms` }}>
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink">
      <img src={bounty.image} alt={bounty.title} className={cn('h-full w-full object-cover transition-[filter] duration-500', !reveal && 'blur-2xl scale-110')}/>
      {!reveal && <button onClick={() => setReveal(true)} className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white"><span className="rounded-full border border-white/30 bg-white/15 px-4 py-2 font-mono text-[12px] font-extrabold uppercase tracking-[0.1em] backdrop-blur-md">18+ · tap to view</span></button>}
      <span className={cn('absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-extrabold uppercase tracking-[0.08em] backdrop-blur-md', bounty.status === 'open' ? 'bg-white/90 text-ink' : 'bg-up text-white')}>
        {bounty.status === 'open' ? <><span className="pulse-dot size-1.5 rounded-full bg-up"/>Open</> : bounty.status === 'paid' ? <><Check size={12} strokeWidth={3}/>Paid</> : <><Crown size={12}/>Won</>}
      </span>
      <span className="absolute right-3 top-3 rounded-2xl bg-ink/85 px-3 py-1.5 font-display text-[22px] font-black leading-none text-white backdrop-blur-md tnum">${bounty.rewardUsd}</span>
    </div>
    <div className="p-4 sm:p-5">
      <h2 className="display text-[26px] leading-[0.95] sm:text-[30px]">{bounty.title}</h2>
      <p className="mt-2 text-[14.5px] font-semibold leading-snug text-ink/70">{bounty.tagline}</p>
      <ul className="mt-3 flex flex-wrap gap-1.5">{bounty.rules.map(r => <li key={r} className="sunk inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold text-ink/75"><Check size={12} strokeWidth={3}/>{r}</li>)}</ul>
      <div className="mt-4"><SubmitForm bounty={bounty}/></div>
      <div className="mt-4 border-t border-ink/[0.08] pt-3">
        <p className="lab">{bounty.submissions.length} {bounty.submissions.length === 1 ? 'submission' : 'submissions'}</p>
        {bounty.submissions.length ? <ul className="divide-y divide-ink/[0.07]">{bounty.submissions.map(s => <SubmissionRow key={s.id} s={s}/>)}</ul>
          : <p className="py-3 text-[13px] font-semibold text-ink/55">No coins yet. The first real scan takes it.</p>}
      </div>
    </div>
  </article>;
});

function ReviewItem({ s, title }: { s: BountySubmission; title: string }) {
  const decide = useDecideBounty(); const [note, setNote] = useState<string>(s.reviewNote); const [tx, setTx] = useState<string>(s.payoutTx ?? '');
  const act = (state: BountyState) => decide.mutate({ id: s.id, state, note, tx });
  return <li className="raised rounded-[22px] p-3">
    <div className="flex items-center gap-3">
      <img src={s.image} alt="" className="size-14 rounded-xl bg-ink/5 object-cover"/>
      <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-extrabold">{s.name} <span className="font-mono text-[11.5px] text-ink/55">${s.symbol}</span></p><p className="truncate font-mono text-[11px] text-ink/60">{title} · {timeAgo(s.createdAt)}</p><p className="select-all truncate font-mono text-[11px] font-bold">Pay to: {s.wallet}</p></div>
      <StatePill state={s.state}/>
    </div>
    {s.note && <p className="mt-2 rounded-xl bg-ink/[0.04] px-3 py-2 text-[12.5px] font-semibold">“{s.note}”</p>}
    <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11.5px] font-bold"><Link to={`/objects/${s.recordId}`} target="_blank" className="inline-flex items-center gap-1 underline">Open coin + 3D scan<ArrowUpRight size={12}/></Link><span className="text-ink/50">{s.token}</span></div>
    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Review note (public)" className="sunk rounded-xl px-3 py-2 text-[12.5px] font-semibold outline-none"/>
      <input value={tx} onChange={e => setTx(e.target.value)} placeholder="Payout tx hash 0x… (to mark paid)" className="sunk rounded-xl px-3 py-2 font-mono text-[12px] outline-none"/>
    </div>
    <div className="mt-2 grid grid-cols-4 gap-1.5">
      {(['winner', 'paid', 'rejected', 'submitted'] as BountyState[]).map(st => <button key={st} disabled={decide.isPending} onClick={() => act(st)} className={cn('press min-h-10 rounded-xl text-[12px] font-extrabold', st === s.state ? 'btn' : 'btn-ghost')}>{st === 'winner' ? 'Winner' : st === 'paid' ? 'Paid' : st === 'rejected' ? 'Reject' : 'Reset'}</button>)}
    </div>
    {decide.isError && <p className="mt-1.5 text-[12px] font-bold text-down">{errorText(decide.error)}</p>}
  </li>;
}

function OperatorPanel({ bounties }: { bounties: LiveBounty[] }) {
  const account = useAccount(); const queue = useBountyQueue(Boolean(account.data?.operator));
  if (!account.data?.operator) return null;
  const titles = new Map(bounties.map(b => [b.id, b.title]));
  const items = queue.data?.submissions ?? [];
  const open = items.filter(s => s.state === 'submitted' || s.state === 'winner');
  return <section className="smoke mt-10 rounded-[30px] p-4 sm:p-6">
    <p className="flex items-center gap-2 font-mono text-[12px] font-extrabold uppercase tracking-[0.12em] text-white/70"><ShieldCheck size={15}/>Operator · reward review</p>
    <h2 className="display mt-2 text-[28px] text-white">{open.length} waiting on you</h2>
    <p className="mt-1 text-[13px] font-semibold text-white/60">Open each coin, check the 3D scan is the real object, then mark <b className="text-white">Winner</b>. Send the reward to the wallet shown, paste the tx hash and mark <b className="text-white">Paid</b>. Every decision is logged.</p>
    {queue.isPending ? <p className="mt-4 text-white/70">Loading…</p> : queue.isError ? <p className="mt-4 text-down">{errorText(queue.error)}</p>
      : <ul className="mt-4 grid gap-2 lg:grid-cols-2">{items.map(s => <ReviewItem key={s.id} s={s} title={titles.get(s.bountyId) ?? s.bountyId}/>)}{!items.length && <li className="text-[13px] text-white/60">No submissions yet.</li>}</ul>}
  </section>;
}

export default function Rewards() {
  const board = useBounties(); const bounties = board.data?.bounties ?? [];
  const pot = bounties.filter(b => b.status === 'open').reduce((t, b) => t + b.rewardUsd, 0);
  return <div className="page pb-24 pt-8 sm:pt-12">
    <p className="enter lab">ObjectPad · Paid Rewards</p>
    <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="enter display text-[clamp(40px,9vw,72px)] leading-[0.92]">Scan it first.<br/>Get paid.</h1>
        <p className="enter mt-4 max-w-xl text-[17px] font-bold leading-snug text-ink/70">Cash bounties for the first real 3D scan of specific objects. Scan it, launch its coin free, submit it here. Rewards only go up.</p>
      </div>
      <div className="enter raised flex items-center gap-4 rounded-[26px] p-4 pr-6">
        <span className="flex size-14 items-center justify-center rounded-[18px] bg-ink text-white"><Trophy size={26}/></span>
        <div><p className="stat-label">Open rewards</p><p className="display text-[40px] leading-none tnum">{board.isPending ? '…' : `$${pot.toLocaleString('en-US')}`}</p></div>
      </div>
    </div>
    <ol className="enter mt-6 grid gap-2 sm:grid-cols-3">
      {[['1', 'Find the object', 'The real thing, in person.'], ['2', 'Scan & launch free', 'Full 3D scan, coin live in minutes.'], ['3', 'Submit your coin', 'Paste its address. We verify, then pay.']].map(([n, t, d]) => <li key={n} className="sunk flex items-center gap-3 rounded-2xl p-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink font-mono text-[14px] font-extrabold text-white">{n}</span><span><span className="block text-[14px] font-extrabold">{t}</span><span className="block text-[12.5px] font-semibold text-ink/60">{d}</span></span></li>)}
    </ol>
    {board.isError ? <p className="mt-8 font-bold text-down">Rewards couldn’t load. <button className="underline" onClick={() => void board.refetch()}>Retry</button></p>
      : <div className="mt-8 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">{board.isPending ? [0, 1, 2].map(i => <div key={i} className="raised aspect-[4/5] animate-pulse rounded-[30px]"/>) : bounties.map((b, i) => <BountyCard key={b.id} bounty={b} index={i}/>)}</div>}
    <p className="mt-6 text-[12.5px] font-semibold text-ink/55">Winners are picked by the ObjectPad team after checking the 3D scan is an original capture of the real object. First valid coin wins. Rewards are paid to the wallet that launched the coin and the payout transaction is linked here.</p>
    <OperatorPanel bounties={bounties}/>
  </div>;
}
