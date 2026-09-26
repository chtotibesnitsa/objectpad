import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CalendarDays, Copy, ExternalLink, Gift, MessageCircle, Settings as Cog, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useProfile, useSocial } from '@/lib/social';
import { useMarket } from '@/lib/market';
import { copyText, shortAddress, timeAgo, usd } from '@/lib/format';
import { UserAvatar } from '@/components/social/UserChip';
import { Loading } from '@/components/Feedback';
import { cn } from '@/lib/utils';

const ethText = (v: number): string => `${v >= 0 ? '' : '−'}${Math.abs(v) < 0.0001 && v !== 0 ? '<0.0001' : Math.abs(v).toFixed(4)} ETH`;

/** Public profile: identity, linked accounts, wallets, coins created, buy/sell history and on-chain P&L. */
export default function Profile() {
  const { username = '' } = useParams(); const profile = useProfile(username); const social = useSocial(); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null;
  const [tab, setTab] = useState<'coins' | 'trades' | 'pnl'>('coins'); const [copied, setCopied] = useState<string>('');
  const p = profile.data; const self = Boolean(p && social.me?.username?.toLowerCase() === p.username.toLowerCase());
  const counts = useMemo(() => ({ coins: p?.coins.length ?? 0, trades: p?.trades.length ?? 0, pnl: p?.pnl.positions.length ?? 0 }), [p]);
  if (profile.isPending) return <Loading label="Opening profile…"/>;
  if (profile.isError || !p) return <div className="page py-24 text-center"><h1 className="display text-[44px]">No one here.</h1><p className="mt-3 text-[15px] font-semibold text-ink/60">There’s no ObjectPad user called @{username}.</p><Link to="/" className="btn press mt-6 min-h-12 px-6 text-[14px]">Back home</Link></div>;
  const up = p.pnl.pnlEth >= 0;
  return <div className="page py-6 sm:py-10">
    <section className="raised relative overflow-hidden rounded-[34px]">
      <div className="profile-banner relative h-[130px] sm:h-[170px]" aria-hidden="true"><div className="grid-paper absolute inset-0 opacity-40"/></div>
      <div className="relative px-5 pb-6 sm:px-8">
        <div className="-mt-14 flex flex-wrap items-end justify-between gap-4 sm:-mt-16">
          <div className="profile-pop rounded-full bg-white p-1.5 shadow-[0_20px_40px_-18px_rgba(12,13,16,.5)]"><UserAvatar user={p} size={112}/></div>
          <div className="flex flex-wrap gap-2">
            {self ? <Link to="/settings" className="btn press min-h-12 px-5 text-[14px]"><Cog size={16}/>Edit profile</Link>
              : <button onClick={() => { if (social.requireUser()) social.openTip(p.username); }} className="press flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-br from-[#FCE7A2] via-[#F2C94C] to-[#D9A521] px-6 text-[14px] font-black text-[#3A2A05] shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_14px_30px_-14px_rgba(217,165,33,.9)]"><Gift size={16}/>Tip @{p.username}</button>}
            <button onClick={() => social.setChatOpen(true)} className="btn-ghost press min-h-12 px-4 text-[14px]"><MessageCircle size={16}/>Chat</button>
          </div>
        </div>
        <h1 className="display mt-4 text-[38px] leading-none sm:text-[52px]">@{p.username}</h1>
        {p.bio && <p className="mt-3 max-w-2xl text-[16px] font-semibold leading-6 text-ink/70">{p.bio}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {p.x && <a href={`https://x.com/${p.x}`} target="_blank" rel="noreferrer" className="chip press hover:bg-white">𝕏 @{p.x}<ExternalLink size={11}/></a>}
          <span className="chip"><CalendarDays size={12}/>Joined {new Date(p.joinedAt).toLocaleDateString('en', { month: 'short', year: 'numeric' })}</span>
          <span className="chip"><Gift size={12}/>{p.stats.tipsReceived} tips received</span>
          <span className="chip">☔ {p.stats.rainsFunded} rains funded</span>
        </div>
      </div>
    </section>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className={cn('raised rounded-[26px] p-5', up ? 'pnl-up' : 'pnl-down')}><p className="stat-label">Overall P&L</p><p className={cn('display mt-2 flex items-center gap-2 text-[30px] tnum', up ? 'text-[#12A150]' : 'text-[#E5484D]')}>{up ? <TrendingUp size={24}/> : <TrendingDown size={24}/>}{ethText(p.pnl.pnlEth)}</p>{ethUsd && <p className="mt-1 font-mono text-[12px] font-bold text-ink/55">≈ {usd(p.pnl.pnlEth * ethUsd)}</p>}</div>
      <div className="raised rounded-[26px] p-5"><p className="stat-label">Bought</p><p className="display mt-2 text-[28px] tnum">{p.pnl.boughtEth.toFixed(4)}</p><p className="font-mono text-[12px] font-bold text-ink/55">ETH spent</p></div>
      <div className="raised rounded-[26px] p-5"><p className="stat-label">Sold</p><p className="display mt-2 text-[28px] tnum">{p.pnl.soldEth.toFixed(4)}</p><p className="font-mono text-[12px] font-bold text-ink/55">ETH received</p></div>
      <div className="raised rounded-[26px] p-5"><p className="stat-label">Holding now</p><p className="display mt-2 text-[28px] tnum">{p.pnl.holdingEth.toFixed(4)}</p><p className="font-mono text-[12px] font-bold text-ink/55">ETH at live prices</p></div>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="raised rounded-[30px] p-3 sm:p-4">
        <div className="sunk relative grid grid-cols-3 rounded-[18px] p-1">{(['coins', 'trades', 'pnl'] as const).map(t => <button key={t} onClick={() => setTab(t)} className={cn('press relative min-h-10 rounded-[14px] text-[13.5px] font-extrabold transition-colors', tab === t ? 'raised' : 'text-ink/55')}>{t === 'coins' ? 'Created' : t === 'trades' ? 'Buys & sells' : 'Positions'}<span className="ml-1.5 font-mono text-[11px] opacity-55">{counts[t]}</span></button>)}</div>
        <div key={tab} className="slide-in mt-3">
          {tab === 'coins' && (p.coins.length ? <div className="grid gap-2 sm:grid-cols-2">{p.coins.map(c => <Link key={c.objectId} to={c.path} className="lift flex items-center gap-3 rounded-2xl bg-ink/[0.03] p-2.5 hover:bg-ink/[0.06]"><img src={c.thumbnail} alt="" className="size-14 rounded-xl bg-white object-cover"/><span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-extrabold">${c.symbol}</span><span className="block truncate text-[12px] font-semibold text-ink/55">{c.name}</span></span><span className="text-right font-mono text-[11.5px] font-bold"><span className="block">{c.marketCapEth ? `${c.marketCapEth.toFixed(2)} ETH` : '—'}</span><span className="block text-ink/45">mcap</span></span></Link>)}</div> : <p className="px-4 py-12 text-center text-[14px] font-bold text-ink/50">No coins launched yet.</p>)}
          {tab === 'trades' && (p.trades.length ? <div className="divide-y divide-ink/[0.06]">{p.trades.map(t => <div key={`${t.hash}${t.at}`} className="flex items-center gap-3 px-2 py-2.5"><span className={cn('flex size-9 items-center justify-center rounded-xl', t.side === 'buy' ? 'bg-[#12A150]/12 text-[#12A150]' : 'bg-[#E5484D]/12 text-[#E5484D]')}>{t.side === 'buy' ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>}</span><span className="min-w-0 flex-1"><span className="block text-[14px] font-extrabold">{t.side === 'buy' ? 'Bought' : 'Sold'} <Link to={t.path} className="hover:underline">${t.symbol}</Link></span><span className="block font-mono text-[11px] font-bold text-ink/45">{timeAgo(t.at)} · {shortAddress(t.wallet, 5, 4)}</span></span><span className="text-right font-mono text-[12.5px] font-extrabold tnum">{t.eth.toFixed(4)} ETH<a href={`https://robinhoodchain.blockscout.com/tx/${t.hash}`} target="_blank" rel="noreferrer" className="block text-[10.5px] text-ink/45 hover:text-ink">tx ↗</a></span></div>)}</div> : <p className="px-4 py-12 text-center text-[14px] font-bold text-ink/50">No trades from this person’s wallets yet.</p>)}
          {tab === 'pnl' && (p.pnl.positions.length ? <div className="space-y-1.5">{p.pnl.positions.map(x => <Link key={x.curve} to={x.path} className="flex items-center gap-3 rounded-2xl bg-ink/[0.03] px-3 py-2.5 hover:bg-ink/[0.06]"><span className="w-20 truncate text-[14px] font-extrabold">${x.symbol}</span><span className="flex-1 font-mono text-[11.5px] font-bold text-ink/55">in {x.boughtEth.toFixed(4)} · out {x.soldEth.toFixed(4)} · held {x.holdingEth.toFixed(4)}</span><span className={cn('font-mono text-[13px] font-black tnum', x.pnlEth >= 0 ? 'text-[#12A150]' : 'text-[#E5484D]')}>{x.pnlEth >= 0 ? '+' : ''}{x.pnlEth.toFixed(4)}</span></Link>)}<p className="px-2 pt-2 text-[11.5px] font-semibold text-ink/45">P&L = ETH received from sells + current value of holdings − ETH spent on buys. Every figure comes from on-chain trades on the linked wallets.</p></div> : <p className="px-4 py-12 text-center text-[14px] font-bold text-ink/50">No positions yet.</p>)}
        </div>
      </section>
      <aside className="space-y-3">
        <section className="raised rounded-[26px] p-4"><p className="lab">Public wallets</p><div className="mt-3 space-y-1.5">{p.wallets.map(w => <div key={w.address} className="sunk flex items-center gap-2 rounded-2xl px-3 py-2.5"><Wallet size={15} className="text-ink/50"/><span className="min-w-0 flex-1"><span className="block text-[12px] font-extrabold">{w.kind === 'account' ? 'Account wallet' : 'Linked wallet'}</span><span className="block font-mono text-[11.5px] text-ink/60">{shortAddress(w.address, 8, 6)}</span></span><button onClick={() => void copyText(w.address).then(() => { setCopied(w.address); setTimeout(() => setCopied(''), 1400); })} className="press flex size-8 items-center justify-center rounded-lg hover:bg-white" aria-label="Copy address">{copied === w.address ? '✓' : <Copy size={13}/>}</button><a href={`https://robinhoodchain.blockscout.com/address/${w.address}`} target="_blank" rel="noreferrer" className="press flex size-8 items-center justify-center rounded-lg hover:bg-white" aria-label="View on explorer"><ExternalLink size={13}/></a></div>)}{!p.wallets.length && <p className="text-[13px] font-bold text-ink/50">No public wallets yet.</p>}</div></section>
        <section className="raised rounded-[26px] p-4"><p className="lab">Social</p><div className="mt-3 grid grid-cols-2 gap-2 text-center">{[['Messages', p.stats.messages], ['Tips sent', p.stats.tipsSent], ['Tips received', p.stats.tipsReceived], ['Rains funded', p.stats.rainsFunded]].map(([k, v]) => <div key={k} className="sunk rounded-2xl py-3"><p className="display text-[24px] tnum">{v}</p><p className="font-mono text-[10.5px] font-extrabold uppercase text-ink/50">{k}</p></div>)}</div></section>
      </aside>
    </div>
  </div>;
}
