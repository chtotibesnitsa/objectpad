import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AtSign, Bell, Check, CheckCheck, CloudRain, Gift, Loader2, RotateCcw, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { amountLabel, socialError, useNotifications, useSocial, useTips, SOCIAL_ME, type Notice, type Tip } from '@/lib/social';
import { shortAddress, timeAgo } from '@/lib/format';
import { UserAvatar, UserLink } from './UserChip';
import { cn } from '@/lib/utils';

const ICON: Record<string, typeof Bell> = { mention: AtSign, tip_received: Gift, tip_accepted: Check, tip_paid: Gift, tip_delivered: CheckCheck, tip_declined: RotateCcw, tip_refunded: RotateCcw, rain_won: CloudRain, rain_refunded: RotateCcw };

/** One pending tip: pick which of your wallets it lands in, or decline and it goes back. */
export function TipCard({ tip }: { tip: Tip }) {
  const session = useSession(); const social = useSocial(); const qc = useQueryClient();
  const wallets = social.me?.wallets ?? []; const [wallet, setWallet] = useState<string>(''); const [busy, setBusy] = useState<'accept' | 'decline' | 'cancel' | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!wallet && wallets[0]) setWallet(wallets[0].address); }, [wallet, wallets]);
  const act = async (kind: 'accept' | 'decline' | 'cancel') => { setBusy(kind); setError(null); try { await api(`/social/tips/${tip.id}/${kind}`, { token: await session.token(), method: 'POST', body: kind === 'accept' ? { wallet } : {}, timeout: 30_000 }); await qc.invalidateQueries({ queryKey: ['objectpad', 'social'] }); void qc.invalidateQueries({ queryKey: SOCIAL_ME }); } catch (e) { setError(socialError(e)); } finally { setBusy(null); } };
  const other = tip.incoming ? tip.from : tip.to;
  const stateLabel: Record<string, string> = { pending: tip.incoming ? 'Waiting for you' : 'Waiting for them', accepted: 'Sending…', paid: 'Delivered', declined: 'Declined · refunding', refunded: 'Refunded', cancelled: 'Cancelled · refunding', expired: 'Expired · refunded' };
  return <div className={cn('rounded-[20px] p-3', tip.state === 'pending' && tip.incoming ? 'bg-gradient-to-br from-[#FFF6D6] to-[#FCE7A2]/60 shadow-[0_0_0_1.5px_rgba(217,165,33,.45)]' : 'sunk')}>
    <div className="flex items-center gap-2.5">
      <UserAvatar user={other} size={36}/>
      <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-ink/75">{tip.incoming ? <><UserLink user={tip.from}/> sent you</> : <>You sent <UserLink user={tip.to}/></>}</p><p className="display text-[20px] leading-tight text-[#3A2A05]">{amountLabel(tip.amount, tip.decimals, tip.symbol)}</p></div>
      <span className="font-mono text-[10.5px] font-extrabold uppercase text-ink/50">{timeAgo(tip.createdAt)}</span>
    </div>
    {tip.note && <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[13px] font-semibold text-ink/75">“{tip.note}”</p>}
    {tip.state === 'pending' && tip.incoming ? <div className="mt-3">
      <p className="mb-1.5 font-mono text-[10px] font-extrabold uppercase tracking-wider text-ink/55">Land it in</p>
      <div className="space-y-1">{wallets.map(w => <button key={w.address} onClick={() => setWallet(w.address)} className={cn('press flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] font-bold', wallet === w.address ? 'bg-ink text-white' : 'bg-white/70')}><span className={cn('size-2 rounded-full', wallet === w.address ? 'bg-[#12A150]' : 'bg-ink/20')}/>{w.kind === 'account' ? 'Account wallet' : 'Linked wallet'}<span className="ml-auto font-mono text-[11px] opacity-70">{shortAddress(w.address, 6, 4)}</span></button>)}{!wallets.length && <p className="text-[12px] font-bold text-ink/55">Link a wallet in <Link to="/settings" className="underline">Settings</Link> to accept.</p>}</div>
      <div className="mt-2.5 flex gap-1.5">
        <button onClick={() => void act('accept')} disabled={!wallet || busy !== null} className="press flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#12A150] text-[13.5px] font-black text-white disabled:opacity-50">{busy === 'accept' ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>}Accept</button>
        <button onClick={() => void act('decline')} disabled={busy !== null} className="press flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-[13.5px] font-black text-ink/75 shadow-[0_0_0_1px_rgba(12,13,16,.12)] disabled:opacity-50">{busy === 'decline' ? <Loader2 size={15} className="animate-spin"/> : <X size={15}/>}Decline</button>
      </div>
    </div> : <div className="mt-2 flex items-center justify-between gap-2"><span className={cn('rounded-full px-2.5 py-1 font-mono text-[10.5px] font-extrabold uppercase', tip.state === 'paid' ? 'bg-[#12A150]/12 text-[#0B7A3B]' : 'bg-ink/[0.06] text-ink/60')}>{stateLabel[tip.state] ?? tip.state}</span>
      {tip.state === 'pending' && !tip.incoming && <button onClick={() => void act('cancel')} disabled={busy !== null} className="text-[12px] font-extrabold text-ink/55 hover:text-ink">{busy === 'cancel' ? 'Cancelling…' : 'Take it back'}</button>}
      {tip.payoutHash && <a href={`https://robinhoodchain.blockscout.com/tx/${tip.payoutHash}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] font-bold text-ink/55 hover:text-ink">tx ↗</a>}</div>}
    {error && <p className="mt-2 text-[12px] font-bold text-[#C52F35]">{error}</p>}
  </div>;
}

function NoticeRow({ n, onOpen }: { n: Notice; onOpen: (n: Notice) => void }) {
  const Icon = ICON[n.kind] ?? Bell;
  return <button onClick={() => onOpen(n)} className={cn('flex w-full gap-2.5 rounded-2xl px-2.5 py-2.5 text-left transition-colors hover:bg-ink/[0.04]', !n.read && 'bg-[#2F7BF2]/[0.06]')}>
    <span className="relative shrink-0">{n.actor ? <UserAvatar user={n.actor} size={34}/> : <span className="flex size-[34px] items-center justify-center rounded-full bg-ink text-white"><Icon size={15}/></span>}<span className="absolute -bottom-1 -right-1 flex size-[18px] items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgba(12,13,16,.1)]"><Icon size={10} strokeWidth={3}/></span></span>
    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold leading-snug text-ink/85">{n.text}</span><span className="mt-0.5 block font-mono text-[10.5px] font-bold text-ink/45">{timeAgo(n.createdAt)}</span></span>
    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#2F7BF2]"/>}
  </button>;
}

/** The whole inbox: pending tips first, then everything you missed. Used by the bell and the /notifications page. */
export function Inbox({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const session = useSession(); const qc = useQueryClient(); const navigate = useNavigate(); const notes = useNotifications(true); const tips = useTips(true); const [tab, setTab] = useState<'all' | 'tips'>('all');
  const pending = tips.data?.incoming.filter(t => t.state === 'pending') ?? [];
  const readAll = async () => { await api('/social/notifications/read', { token: await session.token(), method: 'POST', body: {} }).catch(() => undefined); void qc.invalidateQueries({ queryKey: ['objectpad', 'social'] }); };
  const open = async (n: Notice) => { if (!n.read) void api('/social/notifications/read', { token: await session.token(), method: 'POST', body: { id: n.id } }).then(() => qc.invalidateQueries({ queryKey: ['objectpad', 'social'] })).catch(() => undefined); if (n.kind.startsWith('tip')) { setTab('tips'); return; } if (n.link?.startsWith('http')) window.open(n.link, '_blank', 'noopener'); else if (n.link) { navigate(n.link); onNavigate?.(); } };
  return <div>
    <div className="flex items-center gap-2 px-1">
      <div className="sunk grid flex-1 grid-cols-2 rounded-[14px] p-1">{(['all', 'tips'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={cn('press flex min-h-8 items-center justify-center gap-1.5 rounded-[10px] text-[12.5px] font-extrabold capitalize', tab === t ? 'raised' : 'text-ink/55')}>{t === 'all' ? 'Everything' : 'Tips'}{t === 'tips' && pending.length > 0 && <span className="rounded-full bg-[#D9A521] px-1.5 font-mono text-[10px] text-white">{pending.length}</span>}</button>)}</div>
      {(notes.data?.unread ?? 0) > 0 && <button onClick={() => void readAll()} className="press flex min-h-9 items-center gap-1 rounded-xl px-2.5 text-[12px] font-extrabold text-ink/60 hover:bg-ink/[0.05]"><CheckCheck size={14}/>Read all</button>}
    </div>
    <div className={cn('no-scrollbar mt-2 space-y-1 overflow-y-auto', compact ? 'max-h-[60vh]' : '')}>
      {tab === 'all' ? <>
        {pending.length > 0 && <button onClick={() => setTab('tips')} className="tip-glow mb-1 flex w-full items-center gap-2.5 rounded-2xl bg-gradient-to-br from-[#FCE7A2] via-[#F2C94C] to-[#D9A521] px-3 py-2.5 text-left text-[13px] font-black text-[#3A2A05]"><Gift size={17}/>{pending.length} tip{pending.length === 1 ? '' : 's'} waiting for you<span className="ml-auto">Review →</span></button>}
        {notes.isPending && <p className="p-6 text-center text-[13px] font-bold text-ink/50">Loading…</p>}
        {notes.data?.items.map(n => <NoticeRow key={n.id} n={n} onOpen={x => void open(x)}/>)}
        {notes.data && !notes.data.items.length && <div className="px-6 py-10 text-center"><Bell size={26} className="mx-auto text-ink/30"/><p className="mt-3 text-[14px] font-extrabold">You’re all caught up.</p><p className="mt-1 text-[12.5px] font-semibold text-ink/50">Mentions, tips and rain wins show up here.</p></div>}
      </> : <div className="space-y-2 p-0.5">
        {tips.data && !tips.data.incoming.length && !tips.data.outgoing.length && <p className="px-6 py-10 text-center text-[13px] font-bold text-ink/50">No tips yet. Tip someone from their profile or the chat.</p>}
        {tips.data?.incoming.map(t => <TipCard key={t.id} tip={t}/>)}
        {(tips.data?.outgoing.length ?? 0) > 0 && <p className="px-1 pt-2 font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/45">Sent</p>}
        {tips.data?.outgoing.map(t => <TipCard key={t.id} tip={t}/>)}
      </div>}
    </div>
  </div>;
}

/** Header bell: unread badge that pops when something new arrives, dropdown inbox. */
export function NotificationBell({ compact = false }: { compact?: boolean }) {
  const social = useSocial(); const [open, setOpen] = useState<boolean>(false); const root = useRef<HTMLDivElement>(null);
  const count = (social.me?.unread ?? 0) + (social.me?.pendingTips ?? 0); const last = useRef<number>(count); const [bump, setBump] = useState<boolean>(false);
  useEffect(() => { if (count > last.current) { setBump(true); const t = setTimeout(() => setBump(false), 900); last.current = count; return () => clearTimeout(t); } last.current = count; }, [count]);
  useEffect(() => { if (!open) return; const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, [open]);
  if (!social.signedIn || !social.me?.username) return null;
  return <div ref={root} className="relative">
    <button onClick={() => setOpen(v => !v)} className={cn('press raised relative flex items-center justify-center rounded-[16px]', compact ? 'size-10' : 'size-[52px]')} aria-label={`Notifications${count ? `, ${count} new` : ''}`} aria-expanded={open}>
      <Bell size={compact ? 16 : 19} strokeWidth={2.4} className={cn(bump && 'bell-ring')}/>
      {count > 0 && <span className={cn('absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-[#E5484D] px-1 font-mono text-[10.5px] font-black text-white shadow-[0_0_0_2px_#fff]', bump && 'badge-pop')}>{count > 99 ? '99+' : count}</span>}
    </button>
    {open && <div className="sheet-pop glass-nav fixed inset-x-2 top-16 z-[85] rounded-[24px] p-2.5 sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[380px]">
      <div className="flex items-center justify-between px-2 pb-2 pt-1"><p className="display text-[20px]">Notifications</p><Link to="/notifications" onClick={() => setOpen(false)} className="font-mono text-[11px] font-extrabold uppercase text-ink/55 hover:text-ink">Open all →</Link></div>
      <Inbox compact onNavigate={() => setOpen(false)}/>
    </div>}
  </div>;
}
