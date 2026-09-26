import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowDownRight, ArrowUpRight, ChevronsRight, CloudRain, Coins, Flame, Gift, LogIn, MessageCircle, Rocket, Send, Smile, Sparkles, X } from 'lucide-react';
import { useActivity, useChat, useSocial, useUserSearch, mentionParts, amountLabel, socialError, type ActivityItem, type ChatMessage, type Rain } from '@/lib/social';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { timeAgo, shortAddress } from '@/lib/format';
import { UserAvatar, UserLink } from './UserChip';
import { cn } from '@/lib/utils';

const EMOJI = ['🔥', '🚀', '💎', '🙌', '😂', '👀', '🫡', '💯', '🌧️', '🦆', '🐂', '📈', '📉', '🤝', '❤️', '🎉', '🤑', '🧠', '⚡', '🪙', '👑', '🥇', '😤', '🙏'];

function Clock() { const [, setT] = useState<number>(0); useEffect(() => { const id = setInterval(() => setT(v => v + 1), 15_000); return () => clearInterval(id); }, []); return null; }

/** Chat text with clickable @mentions. */
function Body({ text }: { text: string }) {
  return <>{mentionParts(text).map((p, i) => p.mention ? <Link key={i} to={`/u/${p.text.slice(1)}`} className="rounded-md bg-[#2F7BF2]/10 px-1 font-extrabold text-[#2F7BF2] hover:bg-[#2F7BF2]/20">{p.text}</Link> : <span key={i}>{p.text}</span>)}</>;
}

const Message = memo(function Message({ m, grouped, onTip, me }: { m: ChatMessage; grouped: boolean; onTip: (u: string) => void; me: string | null }) {
  if (m.kind === 'system') return <div className="chat-in mx-1 my-2 flex items-center gap-2 rounded-2xl bg-[#12A150]/10 px-3 py-2 text-[12.5px] font-bold text-[#0B7A3B]"><Sparkles size={14} className="shrink-0"/><span>{m.text}</span></div>;
  if (m.kind === 'tip' && m.tip) return <div className="chat-in mx-1 my-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#FCE7A2] via-[#F2C94C] to-[#D9A521] p-[1.5px] shadow-[0_10px_24px_-14px_rgba(217,165,33,.8)]"><div className="flex items-center gap-2.5 rounded-[15px] bg-white/85 px-3 py-2.5"><span className="tip-pop flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FCE7A2] to-[#D9A521] text-[#3A2A05]"><Gift size={16}/></span><p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-ink/80"><UserLink user={m.user}/> tipped <UserLink user={m.tip.to}/> <span className="font-mono font-black text-[#3A2A05]">{amountLabel(m.tip.amount, m.tip.decimals, m.tip.symbol)}</span>{m.text && <span className="block truncate text-ink/60">“{m.text}”</span>}</p></div></div>;
  const mine = me && m.user?.username === me; const tagged = me && m.text.toLowerCase().includes(`@${me.toLowerCase()}`);
  return <div className={cn('chat-in group relative flex gap-2.5 rounded-2xl px-2 transition-colors hover:bg-ink/[0.035]', grouped ? 'py-0.5' : 'mt-1.5 py-1.5', tagged && 'bg-[#2F7BF2]/[0.07] shadow-[inset_2px_0_0_#2F7BF2]')}>
    <div className="w-8 shrink-0">{!grouped && (m.user ? <Link to={`/u/${m.user.username}`} className="block transition-transform hover:scale-110"><UserAvatar user={m.user} size={32}/></Link> : <UserAvatar user={null} size={32}/>)}</div>
    <div className="min-w-0 flex-1">
      {!grouped && <div className="flex items-baseline gap-1.5"><UserLink user={m.user} className={cn('text-[13px]', mine ? 'text-[#12A150]' : 'text-ink')}/>{m.user?.x && <span className="truncate font-mono text-[10.5px] font-bold text-ink/40">𝕏 {m.user.x}</span>}<span className="ml-auto shrink-0 font-mono text-[10.5px] font-bold text-ink/40">{timeAgo(m.createdAt)}</span></div>}
      <p className="whitespace-pre-wrap break-words text-[13.5px] font-medium leading-[1.45] text-ink/85"><Body text={m.text}/></p>
    </div>
    {m.user && !mine && <button onClick={() => onTip(m.user!.username)} className="press absolute right-1.5 top-1 hidden items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-extrabold text-[#3A2A05] shadow-[0_0_0_1px_rgba(12,13,16,.1),0_6px_14px_-8px_rgba(12,13,16,.4)] group-hover:flex" aria-label={`Tip @${m.user.username}`}><Gift size={12}/>Tip</button>}
  </div>;
});

/** A live rain card: slots filling up, countdown, and one tap to get inside. */
const RainCard = memo(function RainCard({ rain, onJoin, joining }: { rain: Rain; onJoin: (id: string) => void; joining: boolean }) {
  const [now, setNow] = useState<number>(Date.now()); useEffect(() => { if (rain.state !== 'open') return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [rain.state]);
  const left = Math.max(0, rain.closesAt - now); const pct = Math.min(100, (rain.joined / rain.slots) * 100); const each = BigInt(rain.amount) / BigInt(Math.max(1, rain.slots));
  const status = rain.state === 'open' ? `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')} left` : rain.state === 'distributing' ? 'Distributing on-chain…' : rain.state === 'done' ? `Paid to ${rain.joined} wallets` : rain.state === 'refunding' || rain.state === 'refunded' ? 'Nobody joined · refunded' : 'Closed';
  return <div className={cn('rain-card relative mx-1 my-2 overflow-hidden rounded-[20px] p-3 text-white', rain.state === 'open' ? 'rain-live' : 'opacity-90')}>
    <div className="rain-drops pointer-events-none absolute inset-0" aria-hidden="true"/>
    <div className="relative flex items-start gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><CloudRain size={18}/></span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-white/75">{rain.by ? <><UserLink user={rain.by} className="text-white"/> made it rain</> : <span className="font-extrabold text-white">ObjectPad treasury rain</span>}</p>
        <p className="display mt-0.5 text-[22px] leading-none">{amountLabel(rain.amount, rain.decimals, rain.symbol)}</p>
        <p className="mt-1 font-mono text-[10.5px] font-bold uppercase text-white/70">first {rain.slots} · ≈{amountLabel(each, rain.decimals, rain.symbol)} each</p>
        {rain.message && <p className="mt-1.5 truncate text-[12.5px] font-semibold text-white/85">“{rain.message}”</p>}
      </div>
    </div>
    <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-white transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }}/></div>
    <div className="relative mt-1.5 flex items-center justify-between font-mono text-[10.5px] font-bold text-white/80"><span>{rain.joined}/{rain.slots} inside</span><span>{status}</span></div>
    {rain.recent.length > 0 && <div className="relative mt-2 flex -space-x-2">{rain.recent.slice(-8).map(u => <UserAvatar key={u.username} user={u} size={22}/>)}</div>}
    <div className="relative mt-3">
      {rain.you ? <div className="rain-inside flex items-center justify-center gap-2 rounded-2xl bg-white/95 py-2.5 text-[13px] font-black text-[#1A4FB8]"><CloudRain size={15}/>{rain.yourHash ? 'Your share landed ✓' : 'You’re inside the rain'}</div>
        : rain.own ? <div className="rounded-2xl bg-white/15 py-2.5 text-center text-[12.5px] font-extrabold">Your rain · {rain.joined} caught it</div>
        : rain.state === 'open' && rain.joined < rain.slots ? <button onClick={() => onJoin(rain.id)} disabled={joining} className="press rain-btn w-full rounded-2xl bg-white py-2.5 text-[14px] font-black text-[#1A4FB8] disabled:opacity-60">{joining ? 'Getting you in…' : 'Get inside the rain ☔'}</button>
        : null}
    </div>
  </div>;
});

function ActivityRow({ a }: { a: ActivityItem }) {
  const meta: Record<ActivityItem['kind'], { icon: typeof Activity; tone: string; label: string }> = {
    buy: { icon: ArrowUpRight, tone: 'bg-[#12A150]/12 text-[#12A150]', label: 'Buy' }, sell: { icon: ArrowDownRight, tone: 'bg-[#E5484D]/12 text-[#E5484D]', label: 'Sell' }, launch: { icon: Rocket, tone: 'bg-ink text-white', label: 'Launch' },
    burn: { icon: Flame, tone: 'bg-[#F97316]/15 text-[#EA580C]', label: 'Burn' }, tip: { icon: Gift, tone: 'bg-gradient-to-br from-[#FCE7A2] to-[#D9A521] text-[#3A2A05]', label: 'Tip' }, rain: { icon: CloudRain, tone: 'bg-[#2F7BF2]/12 text-[#2F7BF2]', label: 'Rain' }, claim: { icon: Coins, tone: 'bg-[#12A150]/12 text-[#0B7A3B]', label: 'Fee claim' },
  };
  const m = meta[a.kind]; const Icon = m.icon;
  const who = a.user ? <UserLink user={a.user}/> : a.wallet ? <span className="font-mono font-bold">{shortAddress(a.wallet, 5, 4)}</span> : null;
  const coin = a.symbol ? <Link to={a.path ?? '/explore'} className="font-extrabold hover:underline">${a.symbol}</Link> : null;
  const line = a.kind === 'buy' || a.kind === 'sell' ? <>{who} {a.kind === 'buy' ? 'bought' : 'sold'} {coin} <span className="font-mono font-bold">{(a.eth ?? 0).toFixed(4)} ETH</span></>
    : a.kind === 'launch' ? <>{who ?? 'A creator'} launched {coin}</>
    : a.kind === 'burn' ? <>Burned <span className="font-mono font-bold">{Math.round(a.tokens ?? 0).toLocaleString()}</span> $OBJECTPAD for {(a.eth ?? 0).toFixed(4)} ETH</>
    : a.kind === 'tip' ? <>{who} tipped <UserLink user={a.to ?? null}/> <span className="font-mono font-bold">{amountLabel(a.amount ?? '0', a.decimals ?? 18, a.symbol ?? '')}</span></>
    : a.kind === 'rain' ? <>{who ?? 'Treasury'} made it rain <span className="font-mono font-bold">{amountLabel(a.amount ?? '0', a.decimals ?? 18, a.symbol ?? '')}</span> · {a.slots} slots</>
    : <>{who} claimed <span className="font-mono font-bold">{(a.eth ?? 0).toFixed(5)} ETH</span> creator fees</>;
  return <div className="chat-in flex gap-2.5 rounded-2xl px-2 py-2 hover:bg-ink/[0.035]">
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', m.tone)}><Icon size={15} strokeWidth={2.6}/></span>
    <div className="min-w-0 flex-1">
      <p className="text-[12.5px] font-semibold leading-snug text-ink/80">{line}</p>
      <p className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] font-bold text-ink/45"><span>{m.label}</span><span>·</span><span>{new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span>·</span><span>{timeAgo(a.at)}</span>{a.feeEth ? <><span>·</span><span>fee {a.feeEth.toFixed(5)}</span></> : null}{a.hash && <a href={`https://robinhoodchain.blockscout.com/tx/${a.hash}`} target="_blank" rel="noreferrer" className="ml-auto hover:text-ink">tx ↗</a>}</p>
    </div>
  </div>;
}

/** Composer with @mention autocomplete (keyboard + tap), emoji picker, tip and rain shortcuts. */
function Composer({ onSend, sending }: { onSend: (t: string) => Promise<void>; sending: boolean }) {
  const social = useSocial(); const [text, setText] = useState<string>(''); const [emoji, setEmoji] = useState<boolean>(false); const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null); const [caret, setCaret] = useState<number>(0); const [active, setActive] = useState<number>(0);
  const mention = useMemo(() => { const upto = text.slice(0, caret); const m = upto.match(/(?:^|\s)@([A-Za-z0-9_]{0,20})$/); return m ? m[1] : null; }, [text, caret]);
  const results = useUserSearch(mention); const list = (mention !== null ? results.data ?? [] : []).slice(0, 10);
  useEffect(() => { setActive(0); }, [mention]);
  const pick = useCallback((name: string) => { const upto = text.slice(0, caret); const start = upto.lastIndexOf('@'); const next = `${text.slice(0, start)}@${name} ${text.slice(caret)}`; setText(next); const pos = start + name.length + 2; requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(pos, pos); setCaret(pos); }); }, [text, caret]);
  const submit = useCallback(async () => { const t = text.trim(); if (!t || sending) return; setError(null); try { await onSend(t); setText(''); setEmoji(false); } catch (e) { setError(socialError(e)); } }, [text, sending, onSend]);
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (list.length) { if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % list.length); return; } if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + list.length) % list.length); return; } if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(list[active].username); return; } if (e.key === 'Escape') { setCaret(0); return; } }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); }
  };
  return <div className="relative border-t border-ink/[0.07] p-2.5">
    {list.length > 0 && <div className="mention-pop absolute inset-x-2.5 bottom-[calc(100%-4px)] z-10 overflow-hidden rounded-2xl bg-white p-1 shadow-[0_0_0_1px_rgba(12,13,16,.1),0_20px_40px_-16px_rgba(12,13,16,.45)]" role="listbox">
      <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] font-extrabold uppercase tracking-wider text-ink/45">Tag someone</p>
      {list.map((u, i) => <button key={u.username} role="option" aria-selected={i === active} onMouseDown={e => { e.preventDefault(); pick(u.username); }} onMouseEnter={() => setActive(i)} className={cn('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors', i === active ? 'bg-ink text-white' : 'hover:bg-ink/[0.05]')}><UserAvatar user={u} size={26}/><span className="text-[13px] font-extrabold">@{u.username}</span>{u.x && <span className={cn('ml-auto font-mono text-[10.5px] font-bold', i === active ? 'text-white/60' : 'text-ink/40')}>𝕏 {u.x}</span>}</button>)}
    </div>}
    {emoji && <div className="mention-pop absolute inset-x-2.5 bottom-[calc(100%-4px)] z-10 grid grid-cols-8 gap-0.5 rounded-2xl bg-white p-2 shadow-[0_0_0_1px_rgba(12,13,16,.1),0_20px_40px_-16px_rgba(12,13,16,.45)]">{EMOJI.map(e => <button key={e} onClick={() => { setText(t => t + e); input.current?.focus(); }} className="press flex size-9 items-center justify-center rounded-xl text-[19px] hover:scale-125 hover:bg-ink/[0.05]">{e}</button>)}</div>}
    {error && <p className="mb-2 rounded-xl bg-[#E5484D]/10 px-3 py-2 text-[12px] font-bold text-[#C52F35]">{error}</p>}
    <div className="sunk flex items-end gap-1 rounded-[18px] p-1.5">
      <textarea ref={input} value={text} onChange={e => { setText(e.target.value.slice(0, 400)); setCaret(e.target.selectionStart ?? 0); }} onKeyUp={e => setCaret(e.currentTarget.selectionStart ?? 0)} onClick={e => setCaret(e.currentTarget.selectionStart ?? 0)} onKeyDown={key} rows={1} placeholder="Say gm… type @ to tag" aria-label="Chat message" className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[13.5px] font-medium outline-none placeholder:text-ink/40"/>
      <button onClick={() => setEmoji(v => !v)} className={cn('press flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors', emoji ? 'bg-ink text-white' : 'text-ink/55 hover:bg-white')} aria-label="Emoji"><Smile size={18}/></button>
      <button onClick={() => void submit()} disabled={!text.trim() || sending} className="press flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition-opacity disabled:opacity-30" aria-label="Send"><Send size={16}/></button>
    </div>
    <div className="mt-2 flex gap-1.5">
      <button onClick={() => social.openTip('')} className="press flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[#FCE7A2] via-[#F2C94C] to-[#D9A521] text-[12.5px] font-black text-[#3A2A05] shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_6px_14px_-8px_rgba(217,165,33,.9)]"><Gift size={14}/>Tip</button>
      <button onClick={() => social.setRainOpen(true)} className="press flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[#5B9BFF] to-[#1A4FB8] text-[12.5px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_6px_14px_-8px_rgba(47,123,242,.9)]"><CloudRain size={14}/>Make it rain</button>
    </div>
  </div>;
}

/** The right-hand live panel: global chat and the live activity tape. */
export function ChatPanel({ onClose, className }: { onClose?: () => void; className?: string }) {
  const social = useSocial(); const session = useSession(); const chat = useChat(); const [tab, setTab] = useState<'chat' | 'activity'>('chat');
  const activity = useActivity(tab === 'activity'); const scroller = useRef<HTMLDivElement>(null); const stick = useRef<boolean>(true); const [joining, setJoining] = useState<string | null>(null); const [joinError, setJoinError] = useState<string | null>(null);
  const me = social.me?.username ?? null;
  useLayoutEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [chat.messages.length, chat.rains.length, tab]);
  const onScroll = () => { const el = scroller.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
  const rainById = useMemo(() => new Map(chat.rains.map(r => [r.id, r])), [chat.rains]);
  const distributing = chat.rains.find(r => r.state === 'distributing'); const live = chat.rains.filter(r => r.state === 'open');
  const join = useCallback(async (id: string) => { if (!social.requireUser()) return; setJoining(id); setJoinError(null); try { await api(`/social/rains/${id}/join`, { token: await session.token(), method: 'POST', body: {} }); await chat.poll(); } catch (e) { setJoinError(socialError(e)); } finally { setJoining(null); } }, [social, session, chat]);
  const send = useCallback(async (t: string) => { await chat.send.mutateAsync(t); stick.current = true; }, [chat.send]);
  const tip = useCallback((u: string) => { if (social.requireUser()) social.openTip(u); }, [social]);
  return <aside className={cn('flex min-h-0 flex-col overflow-hidden', className)} aria-label="Live chat and activity">
    <Clock/>
    <div className="flex items-center gap-1.5 p-2.5 pb-2">
      <div className="sunk relative grid flex-1 grid-cols-2 rounded-[16px] p-1">
        <span className={cn('raised absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-[12px] transition-transform duration-500 ease-[cubic-bezier(.2,.9,.25,1.15)]', tab === 'activity' ? 'translate-x-[calc(100%+0px)]' : 'translate-x-0')} style={{ left: 4 }} aria-hidden="true"/>
        {(['chat', 'activity'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={cn('relative z-10 flex min-h-9 items-center justify-center gap-1.5 text-[13px] font-extrabold capitalize transition-colors', tab === t ? 'text-ink' : 'text-ink/55')}>{t === 'chat' ? <MessageCircle size={14}/> : <Activity size={14}/>}{t}</button>)}
      </div>
      {onClose && <button onClick={onClose} className="press raised flex size-11 shrink-0 items-center justify-center rounded-[14px]" aria-label="Hide chat"><ChevronsRight size={17} className="hidden lg:block"/><X size={17} className="lg:hidden"/></button>}
    </div>
    <div className="flex items-center justify-between px-4 pb-2 font-mono text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-ink/55"><span className="flex items-center gap-1.5">{tab === 'chat' ? 'Global chat' : 'Live activity'}<span className="text-ink/30">·</span><span className="flex items-center gap-1 text-[#12A150]"><span className="pulse-dot size-1.5 rounded-full bg-[#12A150]"/>Live</span></span><span>{tab === 'chat' ? `${chat.messages.length} loaded` : `${activity.data?.length ?? 0} events`}</span></div>
    {tab === 'chat' && distributing && <div className="rain-banner mx-2.5 mb-2 flex items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] font-black text-white"><CloudRain size={15}/>Rain is being distributed · {distributing.paid}/{distributing.joined} paid</div>}
    {tab === 'chat' && !distributing && live[0] && <button onClick={() => { const el = scroller.current; if (el) { stick.current = true; el.scrollTop = el.scrollHeight; } }} className="rain-banner mx-2.5 mb-2 flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-[12.5px] font-black text-white"><CloudRain size={15}/>It’s raining {amountLabel(live[0].amount, live[0].decimals, live[0].symbol)} · {live[0].slots - live[0].joined} spots left</button>}
    <div ref={scroller} onScroll={onScroll} className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2">
      {tab === 'chat' ? <>
        {!chat.loaded && <div className="space-y-3 p-3">{[0, 1, 2, 3, 4].map(i => <div key={i} className="flex gap-2.5"><span className="size-8 animate-pulse rounded-full bg-ink/[0.07]"/><span className="flex-1 space-y-1.5"><span className="block h-3 w-24 animate-pulse rounded bg-ink/[0.07]"/><span className="block h-3 w-full animate-pulse rounded bg-ink/[0.05]"/></span></div>)}</div>}
        {chat.loaded && !chat.messages.length && <div className="flex flex-col items-center px-6 py-14 text-center"><span className="float-soft flex size-14 items-center justify-center rounded-[20px] bg-ink text-white"><MessageCircle size={24}/></span><p className="display mt-4 text-[22px]">Be the first to say gm.</p><p className="mt-1.5 text-[13px] font-semibold text-ink/55">Tag people with @, tip them, or make it rain.</p></div>}
        {chat.messages.map((m, i) => { const prev = chat.messages[i - 1]; const grouped = Boolean(prev && prev.kind === 'text' && m.kind === 'text' && prev.user?.username === m.user?.username && m.createdAt - prev.createdAt < 120_000); const rain = m.kind === 'rain' && m.ref ? rainById.get(m.ref) : undefined; return m.kind === 'rain' ? (rain ? <RainCard key={m.id} rain={rain} onJoin={id => void join(id)} joining={joining === rain.id}/> : null) : <Message key={m.id} m={m} grouped={grouped} onTip={tip} me={me}/>; })}
        {joinError && <p className="mx-2 my-2 rounded-xl bg-[#E5484D]/10 px-3 py-2 text-[12px] font-bold text-[#C52F35]">{joinError}</p>}
      </> : <>
        {activity.isPending && <p className="p-6 text-center text-[13px] font-bold text-ink/50">Reading the chain…</p>}
        {activity.data?.map(a => <ActivityRow key={a.id} a={a}/>)}
      </>}
    </div>
    {tab === 'chat' && (!social.signedIn ? <div className="border-t border-ink/[0.07] p-2.5"><button onClick={() => session.login()} className="btn press min-h-12 w-full text-[14px]"><LogIn size={16}/>Sign in to chat</button></div>
      : !me ? <div className="border-t border-ink/[0.07] p-3 text-center text-[13px] font-bold text-ink/60">Pick a username to start chatting.</div>
      : <Composer onSend={send} sending={chat.send.isPending}/>)}
  </aside>;
}

/** Desktop: docked on the right edge. Phones: a floating button that opens the panel as a full-height sheet. */
export function ChatDock() {
  const social = useSocial(); const [sheet, setSheet] = useState<boolean>(false);
  useEffect(() => { document.documentElement.classList.toggle('chat-docked', social.chatOpen); return () => document.documentElement.classList.remove('chat-docked'); }, [social.chatOpen]);
  return <>
    <div className={cn('chat-dock glass-nav fixed bottom-3 right-3 top-3 z-[45] hidden w-[340px] flex-col rounded-[26px] transition-transform duration-500 ease-[cubic-bezier(.2,.9,.25,1.05)] lg:flex', social.chatOpen ? 'translate-x-0' : 'translate-x-[calc(100%+24px)]')}>
      <ChatPanel onClose={() => social.setChatOpen(false)} className="h-full"/>
    </div>
    {!social.chatOpen && <button onClick={() => social.setChatOpen(true)} className="chat-fab press fixed bottom-6 right-6 z-[45] hidden items-center gap-2 rounded-full bg-ink py-3 pl-4 pr-5 text-[14px] font-extrabold text-white shadow-[0_20px_40px_-14px_rgba(12,13,16,.7)] lg:flex"><MessageCircle size={18}/>Live chat<span className="pulse-dot size-2 rounded-full bg-[#12A150]"/></button>}
    <button onClick={() => setSheet(true)} className="chat-fab press fixed bottom-[calc(88px+env(safe-area-inset-bottom))] right-4 z-[46] flex size-14 items-center justify-center rounded-full bg-ink text-white shadow-[0_18px_36px_-12px_rgba(12,13,16,.7)] lg:hidden" aria-label="Open live chat"><MessageCircle size={22}/><span className="pulse-dot absolute right-1 top-1 size-3 rounded-full border-2 border-ink bg-[#12A150]"/></button>
    <div className={cn('fixed inset-0 z-[75] transition-[visibility] duration-500 lg:hidden', sheet ? 'visible' : 'invisible')}>
      <button className={cn('absolute inset-0 bg-ink/25 backdrop-blur-[2px] transition-opacity duration-500', sheet ? 'opacity-100' : 'opacity-0')} onClick={() => setSheet(false)} aria-label="Close chat"/>
      <div className={cn('glass-nav absolute inset-x-2 bottom-2 top-[max(env(safe-area-inset-top),48px)] flex flex-col rounded-[28px] transition-transform duration-500 ease-[cubic-bezier(.2,.9,.25,1.05)]', sheet ? 'translate-y-0' : 'translate-y-[110%]')}>
        {sheet && <ChatPanel onClose={() => setSheet(false)} className="h-full"/>}
      </div>
    </div>
  </>;
}
