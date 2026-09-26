import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, AtSign, BadgeCheck, CircleDollarSign, CircleUserRound, Compass, Copy, Flame, Layers, Mail, Smartphone, Volume2, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import type { EarnMarket, EarnMe, Leaderboard } from '@/lib/earn';
import { OBJECTPAD_CA } from '@/lib/brand';
import { isStandalone } from '@/lib/install';
import { cn } from '@/lib/utils';
import { useApp } from '../store';
import { Feedback, setSoundOn, soundOn } from '../feedback';
import { Fmt } from '../format';
import { PushScreen, Sheet, SheetHeader } from '../chrome';
import { Display, Enter, ErrorBanner, GlassIcon, img, Lab, PadButton, PadField, PAD, ProgressBar, PulseDot, RemoteImage, Rolling, SectionHeader, StatTile } from '../ui';

const txUrl = (h: string) => `https://robinhoodchain.blockscout.com/tx/${h}`;

/** One-tap sign-in: X, email or a wallet. Optional: scanning and launching never need it. */
export function SignInSheet() {
  const app = useApp(); const s = app.session;
  useEffect(() => { if (app.signIn && s.authenticated) { app.setSignIn(false); Feedback.success(); app.show('Signed in'); } }, [s.authenticated]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (m: 'twitter' | 'email' | 'wallet') => { Feedback.tap(); s.login([m]); };
  const btn = (title: string, Icon: typeof Mail, dark: boolean, m: 'twitter' | 'email' | 'wallet') => <button type="button" onClick={() => go(m)} className={cn('ap-press flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-full text-[15.5px] font-extrabold shadow-[0_4px_8px_rgba(12,13,16,.08)]', dark ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-ink/10')}><Icon size={17} strokeWidth={2.6}/>{title}</button>;
  return <Sheet open={app.signIn} onClose={() => app.setSignIn(false)}><div className="flex flex-col items-center gap-4 px-5 pt-2 text-center">
    <img src={img('rubber_duck_voxel_dissolve')} alt="" className="ap-bob h-[130px] object-contain"/>
    <Display size={30}>Sign in to ObjectPad</Display>
    <p className="text-[14px] font-semibold text-[#6A6E78]">Same account and wallet as objectpad.fun. Needed for bounties, Post & earn and free claim gas. Launching stays free without one.</p>
    {!app.signInAvailable ? <ErrorBanner message="Sign-in isn’t switched on yet. You can still scan, launch and claim as a guest."/> : <>
      {btn('Continue with X', AtSign, true, 'twitter')}{btn('Continue with email', Mail, false, 'email')}{btn('Connect a wallet', Wallet, false, 'wallet')}
    </>}
  </div></Sheet>;
}

export function AccountSheet() {
  const app = useApp(); const [alias, setAlias] = useState<string>(app.profile?.alias ?? ''); const [sound, setSound] = useState<boolean>(soundOn()); const [saving, setSaving] = useState<boolean>(false);
  useEffect(() => { if (app.account) setAlias(app.profile?.alias ?? ''); }, [app.account]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => app.setAccount(false);
  const row = (title: string, Icon: typeof Flame, action: () => void, trailing?: string) => <button type="button" onClick={() => { close(); action(); }} className="flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[16px] font-semibold"><Icon size={19} className="text-ink"/><span className="flex-1">{title}</span>{trailing && <ArrowUpRight size={14} className="text-[#6A6E78]"/>}</button>;
  const group = (title: string | null, children: React.ReactNode) => <div><p className="px-4 pb-1.5 text-[13px] font-semibold uppercase text-[#6A6E78]">{title}</p><div className="divide-y divide-ink/[0.07] overflow-hidden rounded-[14px] bg-white">{children}</div></div>;
  return <Sheet open={app.account} onClose={close}><SheetHeader title="Account" onDone={close}/><div className="flex flex-col gap-6 px-4 pt-2">
    {group(null, <>
      <div className="flex items-center gap-3.5 p-4"><img src={img('duck_mark')} alt="" className="size-[54px] rounded-full object-cover"/><div><p className="text-[18px] font-extrabold">{app.displayName}</p><p className="text-[12.5px] font-semibold text-[#6A6E78]">{app.signedIn ? 'Signed in' : 'Guest · launches never need an account'}</p></div></div>
      {app.signedIn ? <div className="flex items-center gap-2 px-4 py-2"><input value={alias} onChange={e => setAlias(e.target.value)} placeholder="Public creator name" className="ap-bare min-w-0 flex-1 py-2 text-[16px]"/><button type="button" disabled={alias.length < 2 || saving} onClick={() => { setSaving(true); void app.setAlias(alias).then(() => Feedback.success()).finally(() => setSaving(false)); }} className="text-[16px] font-bold disabled:opacity-40">Save</button></div>
        : row('Sign in or create account', CircleUserRound, () => app.setSignIn(true))}
    </>)}
    {group('Explore', <>
      {row('Buyback & burn', Flame, () => app.push('/app/burn'))}{row('Post & earn', CircleDollarSign, () => app.push('/app/earn'))}{row('Your coins', Layers, () => app.push('/app/launches'))}{row('What’s new in V2', BadgeCheck, () => app.setV2(true))}
      {!isStandalone() && row('Add to Home Screen', Smartphone, () => app.setInstall(true))}
      <a href="https://www.objectpad.fun" target="_blank" rel="noreferrer" className="flex min-h-[48px] items-center gap-3 px-4 text-[16px] font-semibold"><Compass size={19}/><span className="flex-1">objectpad.fun</span><ArrowUpRight size={14} className="text-[#6A6E78]"/></a>
      <a href="https://x.com/ObjectPadFun" target="_blank" rel="noreferrer" className="flex min-h-[48px] items-center gap-3 px-4 text-[16px] font-semibold"><AtSign size={19}/><span className="flex-1">@ObjectPadFun on X</span><ArrowUpRight size={14} className="text-[#6A6E78]"/></a>
    </>)}
    {group('Settings', <label className="flex min-h-[48px] items-center gap-3 px-4 text-[16px] font-semibold"><Volume2 size={19}/><span className="flex-1">Sounds</span>
      <input type="checkbox" checked={sound} onChange={e => { setSound(e.target.checked); setSoundOn(e.target.checked); if (e.target.checked) Feedback.play('success'); }} className="peer sr-only"/><span className="relative h-[31px] w-[51px] rounded-full bg-ink/15 transition-colors peer-checked:bg-[#12A150] after:absolute after:left-[2px] after:top-[2px] after:size-[27px] after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"/></label>)}
    {group(null, <>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(OBJECTPAD_CA); app.show('Address copied'); }} className="ap-mono flex min-h-[48px] w-full items-center gap-2 px-4 text-left text-[12px] font-bold text-[#6A6E78]"><span className="flex-1">$OBJECTPAD · {Fmt.short(OBJECTPAD_CA, 8, 6)}</span><Copy size={14}/></button>
      {app.signedIn && <button type="button" onClick={() => { app.session.logout(); close(); }} className="flex min-h-[48px] w-full items-center px-4 text-[16px] font-semibold text-[#E5484D]">Sign out</button>}
    </>)}
  </div></Sheet>;
}

/** Buyback & burn: every trade's protocol share buys $OBJECTPAD and burns it on a schedule. */
export function BurnView() {
  const app = useApp(); const b = app.burns; const now = useNowSec();
  const tokens = (v: string) => Fmt.compact(Number(BigInt(v || '0') / 10n ** 14n) / 1e4); const eth = (v: string) => Fmt.units(BigInt(v || '0'), 5);
  const left = b?.nextAt ? Math.max(0, Math.floor(b.nextAt / 1000 - now)) : null;
  return <PushScreen title="Burn"><div className="flex flex-col gap-3.5 px-4 pb-28">
    <Enter><div className="ap-smoke flex flex-col gap-3 rounded-[28px] p-[18px]">
      <div className="flex items-center"><Lab className="flex-1 !text-white/60">Buyback & burn</Lab>{b?.live && <span className="flex items-center gap-1.5"><PulseDot color={PAD.amber} size={6}/><span className="ap-mono text-[10px] font-extrabold">LIVE</span></span>}</div>
      <div className="flex justify-center"><GlassIcon name="glass_burn" size={90} float/></div>
      <Rolling text={`${tokens(b?.totalTokens ?? '0')} burned`} className="ap-display" style={{ fontSize: 36 }}/>
      <p className="text-[13.5px] font-semibold text-white/70">{Fmt.units(BigInt(b?.totalEth ?? '0'), 4)} ETH of fees spent buying $OBJECTPAD · {b?.burns ?? 0} burns</p>
      {left !== null && <p className="ap-mono ap-num text-[13px] font-extrabold text-[#F59E0B]">Next burn in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>}
    </div></Enter>
    {(b?.items ?? []).slice(0, 20).map((x, i) => <Enter key={x.id} delay={Math.min(i, 8) * 0.04}><div className="ap-raised flex items-center rounded-[20px] p-3.5"><div className="flex-1"><p className="text-[14.5px] font-extrabold">{tokens(x.tokensBurned)} $OBJECTPAD</p><p className="ap-mono text-[11px] font-bold text-[#6A6E78]">{eth(x.ethIn)} ETH · {Fmt.ago(x.at)}</p></div>{x.hash && <a href={txUrl(x.hash)} target="_blank" rel="noreferrer" aria-label="Receipt" className="flex size-[26px] items-center justify-center rounded-full bg-ink text-white"><ArrowUpRight size={14} strokeWidth={3}/></a>}</div></Enter>)}
  </div></PushScreen>;
}
function useNowSec(): number { const [n, setN] = useState<number>(Date.now() / 1000); useEffect(() => { const t = setInterval(() => setN(Date.now() / 1000), 1000); return () => clearInterval(t); }, []); return n; }

/** Post & earn: get paid in ETH for verified X posts that include the $OBJECTPAD address. */
export function EarnView() {
  const app = useApp(); const [url, setUrl] = useState<string>(''); const [busy, setBusy] = useState<boolean>(false); const [message, setMessage] = useState<string | null>(null);
  const market = useQuery({ queryKey: ['objectpad', 'earn', 'market'], queryFn: () => api<EarnMarket>('/earn/market'), refetchInterval: 30_000 });
  const board = useQuery({ queryKey: ['objectpad', 'earn', 'leaderboard'], queryFn: () => api<Leaderboard>('/earn/leaderboard'), refetchInterval: 20_000 });
  const me = useQuery({ queryKey: ['objectpad', 'app', 'earn-me', app.signedIn], enabled: app.signedIn, queryFn: async () => api<EarnMe>('/earn/me', { token: await app.accountToken() }) });
  const text = `Scanning real objects into coins on @ObjectPadFun 🦆\n\n$OBJECTPAD ${OBJECTPAD_CA.toLowerCase()}\n\nobjectpad.fun`;
  const submit = async () => {
    setBusy(true); setMessage(null);
    try { const r = await api<{ submission?: { state: string; reasons?: { message: string }[] } }>('/earn/submissions', { token: await app.accountToken(), method: 'POST', body: { url: url.trim() }, timeout: 45_000 }); const st = r.submission?.state ?? ''; setMessage(st === 'approved' ? 'Approved. Your reward is credited.' : r.submission?.reasons?.[0]?.message ?? 'Submitted. We’ll verify it shortly.'); if (st === 'approved') Feedback.success('coins'); else Feedback.tap(); setUrl(''); void me.refetch(); void board.refetch(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Couldn’t submit.'); Feedback.error(); }
    setBusy(false);
  };
  const m = market.data; const b = me.data?.balances;
  return <PushScreen title="Post & earn"><div className="flex flex-col gap-3.5 px-4 pb-28">
    <Enter><div className="ap-smoke flex flex-col gap-3 rounded-[28px] p-[18px]">
      <Lab className="!text-white/60">Post & earn</Lab><Display size={30} className="!text-white">{'Post about ObjectPad.\nGet paid in ETH.'}</Display>
      <div className="flex gap-2"><StatTile label="Per post now" value={Fmt.usd(m?.rewardUsd ?? 0)} dark/><StatTile label="Paid out" value={Fmt.money(board.data?.totals.paidUsd ?? 0)} dark/></div>
      {m && <div className="flex flex-col gap-1.5"><p className="text-[12.5px] font-semibold text-white/70">Next reward {Fmt.usd(m.nextRewardUsd)} at {Fmt.usd(m.nextMilestoneUsd)} market cap</p><ProgressBar value={m.progress} color={PAD.gold}/></div>}
    </div></Enter>
    <Enter delay={0.05}><div className="ap-raised flex flex-col gap-3 rounded-[26px] p-4">
      <p className="text-[15px] font-extrabold">1 · Post this on X</p>
      <p className="ap-sunk ap-mono whitespace-pre-line break-all rounded-2xl p-3 text-[12px] font-semibold">{text}</p>
      <div className="flex gap-2"><PadButton title="Copy" icon={Copy} kind="ghost" height={46} onClick={() => { void navigator.clipboard.writeText(text); app.show('Copied'); }}/><PadButton title="Open X" icon={ArrowUpRight} height={46} onClick={() => window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, '_blank')}/></div>
      <p className="mt-1 text-[15px] font-extrabold">2 · Paste your post link</p>
      {app.signedIn ? <>
        <PadField label="" placeholder="https://x.com/you/status/…" mono inputMode="url" value={url} onChange={setUrl}/>
        <PadButton title="Verify my post" icon={BadgeCheck} kind="sky" busy={busy} enabled={url.includes('/status/')} onClick={() => void submit()}/>
        {message && <p className="text-[13px] font-bold text-ink/80">{message}</p>}
        {b && <div className="flex gap-2"><StatTile label="Available" value={Fmt.usd(b.availableUsd)}/><StatTile label="Pending" value={Fmt.usd(b.pendingVerificationUsd + b.pendingPayoutUsd)}/></div>}
      </> : <PadButton title="Sign in with X to earn" icon={CircleUserRound} onClick={() => app.setSignIn(true)}/>}
    </div></Enter>
    <Enter delay={0.1}><div className="ap-raised flex flex-col gap-2.5 rounded-[26px] p-4">
      <SectionHeader lab="Leaderboard" title="Top earners"/>
      {(board.data?.earners ?? []).slice(0, 10).map((e, i) => <div key={e.handle} className="flex items-center gap-2.5"><span className="ap-mono w-[22px] text-[12px] font-extrabold" style={{ color: i < 3 ? PAD.gold : PAD.muted }}>{i + 1}</span><span className="size-[34px] overflow-hidden rounded-full"><RemoteImage src={e.avatar} fallback={e.handle}/></span><span className="flex-1 text-[14px] font-extrabold">@{e.handle}</span><span className="text-[14px] font-extrabold text-[#12A150]">{Fmt.usd(e.paidUsd + e.creditedUsd)}</span></div>)}
      {!board.data?.earners.length && <p className="text-[13.5px] font-semibold text-[#6A6E78]">Be the first on the board.</p>}
    </div></Enter>
  </div></PushScreen>;
}
