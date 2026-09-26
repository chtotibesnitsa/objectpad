import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatUnits, parseUnits } from 'viem';
import { AtSign, Check, CloudRain, Gift, Loader2, LogOut, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { amountLabel, socialError, useDeposit, useHoldings, useSendWallets, useSocial, useUserSearch, RAIN_SLOTS, SOCIAL_ME } from '@/lib/social';
import { shortAddress } from '@/lib/format';
import { UserAvatar } from './UserChip';
import { cn } from '@/lib/utils';

/** Glass modal shell with a spring entrance. */
function Sheet({ open, onClose, children, dismissable = true, label }: { open: boolean; onClose: () => void; children: ReactNode; dismissable?: boolean; label: string }) {
  useEffect(() => { if (!open || !dismissable) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, dismissable, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[90] flex items-end justify-center p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
    <button className="sheet-fade absolute inset-0 bg-ink/35 backdrop-blur-[4px]" onClick={dismissable ? onClose : undefined} aria-label="Close" tabIndex={dismissable ? 0 : -1}/>
    <div className="sheet-pop glass-nav relative max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-[30px] p-5 sm:p-6">{dismissable && <button onClick={onClose} className="press absolute right-3 top-3 flex size-10 items-center justify-center rounded-full hover:bg-ink/[0.06]" aria-label="Close"><X size={18}/></button>}{children}</div>
  </div>;
}

type Step = 'idle' | 'linking' | 'sending' | 'confirming' | 'recording' | 'done';
const STEP_LABEL: Record<Step, string> = { idle: '', linking: 'Confirm the wallet link in your wallet…', sending: 'Confirm the transfer in your wallet…', confirming: 'Waiting for Robinhood Chain…', recording: 'Verifying on-chain…', done: 'Done' };

/** Wallet + asset + amount picker shared by Tip and Rain. */
function useFunding() {
  const wallets = useSendWallets(); const [from, setFrom] = useState<string>(''); const [asset, setAsset] = useState<string>('eth'); const [amount, setAmount] = useState<string>('');
  useEffect(() => { if (!from && wallets.list[0]) setFrom(wallets.list[0].address); }, [from, wallets.list]);
  const holdings = useHoldings(from || null);
  const decimals = 18; const holding = holdings.data?.find(h => h.token === asset);
  const balance = asset === 'eth' ? BigInt(wallets.balances[from] ?? '0') : BigInt(holding?.balance ?? '0');
  const symbol = asset === 'eth' ? 'ETH' : holding?.symbol ?? 'COIN';
  let value: bigint | null = null; try { value = amount && /^\d*\.?\d*$/.test(amount) && Number(amount) > 0 ? parseUnits(amount, decimals) : null; } catch { value = null; }
  const tooMuch = value !== null && value > balance;
  const picker = <div className="space-y-3">
    <div><p className="mb-1.5 font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">From wallet</p>
      {wallets.list.length ? <div className="space-y-1.5">{wallets.list.map(w => <button key={w.address} onClick={() => { setFrom(w.address); setAsset('eth'); }} className={cn('press flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors', from === w.address ? 'bg-ink text-white' : 'sunk')}><span className={cn('flex size-8 items-center justify-center rounded-xl text-[11px] font-black', from === w.address ? 'bg-white/15' : 'bg-white')}>{w.kind === 'session' ? '🦊' : '◎'}</span><span className="min-w-0 flex-1"><span className="block text-[13px] font-extrabold">{w.label}</span><span className={cn('block font-mono text-[11px]', from === w.address ? 'text-white/60' : 'text-ink/50')}>{shortAddress(w.address, 6, 4)}</span></span><span className="font-mono text-[12px] font-bold">{amountLabel(wallets.balances[w.address] ?? '0', 18, 'ETH')}</span></button>)}</div>
        : <p className="sunk rounded-2xl p-3 text-[13px] font-bold text-ink/60">No wallet on this device. Connect MetaMask or create an on-site wallet in Settings.</p>}
    </div>
    <div><p className="mb-1.5 font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">Asset</p>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5"><button onClick={() => setAsset('eth')} className={cn('press shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-extrabold', asset === 'eth' ? 'bg-ink text-white' : 'bg-ink/[0.05]')}>ETH</button>{holdings.data?.map(h => <button key={h.token} onClick={() => setAsset(h.token)} className={cn('press shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-extrabold', asset === h.token ? 'bg-ink text-white' : 'bg-ink/[0.05]')}>${h.symbol}<span className="ml-1 font-mono text-[10.5px] opacity-60">{amountLabel(h.balance, 18, '')}</span></button>)}</div>
    </div>
    <div><div className="mb-1.5 flex items-center justify-between"><p className="font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">Amount</p><button onClick={() => setAmount(formatUnits(asset === 'eth' ? (balance * 95n) / 100n : balance, decimals))} className="font-mono text-[11px] font-extrabold text-[#2F7BF2]">Max · {amountLabel(balance, decimals, symbol)}</button></div>
      <label className={cn('sunk flex items-center gap-2 rounded-2xl px-4 py-3', tooMuch && 'shadow-[inset_0_0_0_1.5px_#E5484D]')}><input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.00" className="display w-full bg-transparent text-[28px] outline-none placeholder:text-ink/25" aria-label="Amount"/><span className="font-mono text-[14px] font-black text-ink/60">{symbol}</span></label>
      {asset === 'eth' && <div className="mt-2 flex gap-1.5">{['0.001', '0.005', '0.01', '0.05'].map(v => <button key={v} onClick={() => setAmount(v)} className="press flex-1 rounded-xl bg-ink/[0.05] py-1.5 font-mono text-[11.5px] font-extrabold hover:bg-ink/[0.09]">{v}</button>)}</div>}
      {tooMuch && <p className="mt-1.5 text-[12px] font-bold text-[#E5484D]">More than this wallet holds.</p>}
    </div>
  </div>;
  return { picker, from, asset, value, symbol, tooMuch, signer: from ? wallets.signerFor(from) : null, decimals };
}

/** Tip any user: funds go into escrow and wait until they accept (to a wallet they pick) or decline (refunded). */
export function TipDialog() {
  const social = useSocial(); const session = useSession(); const qc = useQueryClient(); const deposit = useDeposit();
  const open = social.tipTarget !== null; const [to, setTo] = useState<string>(''); const [note, setNote] = useState<string>(''); const [step, setStep] = useState<Step>('idle'); const [error, setError] = useState<string | null>(null);
  const funding = useFunding(); const search = useUserSearch(open && !social.tipTarget && to.length > 0 && step === 'idle' ? to.replace(/^@/, '') : null);
  useEffect(() => { if (open) { setTo(social.tipTarget ?? ''); setNote(''); setStep('idle'); setError(null); } }, [open, social.tipTarget]);
  const close = useCallback(() => { if (step === 'idle' || step === 'done') social.openTip(null); }, [step, social]);
  const valid = /^@?[A-Za-z0-9_]{3,20}$/.test(to) && funding.value !== null && !funding.tooMuch && funding.signer && to.replace(/^@/, '').toLowerCase() !== social.me?.username?.toLowerCase();
  const send = async () => {
    if (!valid || !funding.signer || !social.me || funding.value === null) return; setError(null);
    try {
      await api(`/social/users/${to.replace(/^@/, '')}`, { timeout: 15_000 });
      const hash = await deposit(funding.signer, social.me.escrow, funding.asset, funding.value, s => setStep(s));
      setStep('recording'); await api('/social/tips', { token: await session.token(), method: 'POST', body: { to: to.replace(/^@/, ''), hash, note, public: true }, timeout: 70_000 });
      setStep('done'); social.refresh(); void qc.invalidateQueries({ queryKey: SOCIAL_ME });
    } catch (e) { setStep('idle'); setError(socialError(e)); }
  };
  const busy = step !== 'idle' && step !== 'done';
  return <Sheet open={open} onClose={close} dismissable={!busy} label="Send a tip">
    {step === 'done' ? <div className="flex flex-col items-center py-4 text-center"><span className="tip-burst flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-[#FCE7A2] via-[#F2C94C] to-[#D9A521] text-[#3A2A05] shadow-[0_20px_40px_-14px_rgba(217,165,33,.9)]"><Gift size={34}/></span><h2 className="display mt-5 text-[30px]">Tip sent.</h2><p className="mt-2 max-w-[300px] text-[14px] font-semibold text-ink/60">@{to.replace(/^@/, '')} can accept it into any of their wallets, or decline and it comes straight back to you.</p><button onClick={() => social.openTip(null)} className="btn press mt-6 min-h-12 px-8 text-[14px]">Done</button></div> : <>
      <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FCE7A2] via-[#F2C94C] to-[#D9A521] text-[#3A2A05]"><Gift size={20}/></span><div><h2 className="display text-[26px] leading-none">Send a tip</h2><p className="mt-1 text-[12.5px] font-semibold text-ink/55">Held safely until they accept.</p></div></div>
      <div className="relative mt-5"><p className="mb-1.5 font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">To</p>
        <label className="sunk flex items-center gap-2 rounded-2xl px-3.5 py-3"><AtSign size={16} className="text-ink/45"/><input value={to.replace(/^@/, '')} onChange={e => setTo(e.target.value.replace(/[^A-Za-z0-9_@]/g, '').slice(0, 21))} readOnly={Boolean(social.tipTarget)} placeholder="username" className="w-full bg-transparent text-[15px] font-extrabold outline-none" aria-label="Recipient username"/></label>
        {!social.tipTarget && (search.data?.length ?? 0) > 0 && !search.data?.some(u => u.username.toLowerCase() === to.replace(/^@/, '').toLowerCase()) && <div className="mention-pop absolute inset-x-0 top-full z-10 mt-1 rounded-2xl bg-white p-1 shadow-[0_0_0_1px_rgba(12,13,16,.1),0_20px_40px_-16px_rgba(12,13,16,.45)]">{search.data?.slice(0, 6).map(u => <button key={u.username} onClick={() => setTo(u.username)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left hover:bg-ink/[0.05]"><UserAvatar user={u} size={24}/><span className="text-[13px] font-extrabold">@{u.username}</span></button>)}</div>}
      </div>
      <div className="mt-4">{funding.picker}</div>
      <label className="mt-4 block"><p className="mb-1.5 font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">Note (optional)</p><input value={note} onChange={e => setNote(e.target.value.slice(0, 140))} placeholder="gm, great coin 🔥" className="sunk w-full rounded-2xl px-3.5 py-3 text-[14px] font-semibold outline-none"/></label>
      {error && <p className="mt-3 rounded-xl bg-[#E5484D]/10 px-3 py-2 text-[12.5px] font-bold text-[#C52F35]">{error}</p>}
      <button onClick={() => void send()} disabled={!valid || busy} className="press mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#FCE7A2] via-[#F2C94C] to-[#D9A521] text-[15px] font-black text-[#3A2A05] shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_14px_30px_-14px_rgba(217,165,33,.9)] transition-opacity disabled:opacity-45">{busy ? <><Loader2 size={17} className="animate-spin"/>{STEP_LABEL[step]}</> : <><Gift size={17}/>Tip {funding.value !== null ? amountLabel(funding.value, 18, funding.symbol) : ''}</>}</button>
      <p className="mt-3 text-center text-[11.5px] font-semibold leading-5 text-ink/50">Sent on-chain to the ObjectPad tip escrow. Declined or unclaimed after 7 days means a full refund.</p>
    </>}
  </Sheet>;
}

/** Make it rain: fund a pot, the first N people to tap in split it evenly. */
export function RainDialog() {
  const social = useSocial(); const session = useSession(); const deposit = useDeposit(); const funding = useFunding();
  const [slots, setSlots] = useState<number>(10); const [message, setMessage] = useState<string>(''); const [step, setStep] = useState<Step>('idle'); const [error, setError] = useState<string | null>(null);
  const [treasury, setTreasury] = useState<boolean>(false); const [treasuryAmount, setTreasuryAmount] = useState<string>('0.01');
  useEffect(() => { if (social.rainOpen) { setStep('idle'); setError(null); setMessage(''); } }, [social.rainOpen]);
  const busy = step !== 'idle' && step !== 'done';
  const each = useMemo(() => funding.value !== null ? funding.value / BigInt(slots) : null, [funding.value, slots]);
  const go = async () => {
    setError(null);
    try {
      if (treasury) { setStep('recording'); await api('/social/ops/rain', { token: await session.token(), method: 'POST', body: { amountEth: treasuryAmount, slots, message } }); setStep('done'); social.refresh(); return; }
      if (!funding.signer || funding.value === null || !social.me) return;
      const hash = await deposit(funding.signer, social.me.escrow, funding.asset, funding.value, s => setStep(s));
      setStep('recording'); await api('/social/rains', { token: await session.token(), method: 'POST', body: { hash, slots, message }, timeout: 70_000 });
      setStep('done'); social.refresh();
    } catch (e) { setStep('idle'); setError(socialError(e)); }
  };
  const ok = treasury ? Number(treasuryAmount) > 0 : funding.value !== null && !funding.tooMuch && Boolean(funding.signer);
  return <Sheet open={social.rainOpen} onClose={() => { if (!busy) social.setRainOpen(false); }} dismissable={!busy} label="Make it rain">
    {step === 'done' ? <div className="flex flex-col items-center py-4 text-center"><span className="rain-orb flex size-20 items-center justify-center rounded-full text-white"><CloudRain size={34}/></span><h2 className="display mt-5 text-[30px]">It’s raining.</h2><p className="mt-2 max-w-[300px] text-[14px] font-semibold text-ink/60">Your rain is live in chat. The first {slots} people to tap in share it evenly, paid on-chain.</p><button onClick={() => social.setRainOpen(false)} className="btn press mt-6 min-h-12 px-8 text-[14px]">Watch it fall</button></div> : <>
      <div className="flex items-center gap-3"><span className="rain-orb flex size-11 items-center justify-center rounded-2xl text-white"><CloudRain size={20}/></span><div><h2 className="display text-[26px] leading-none">Make it rain</h2><p className="mt-1 text-[12.5px] font-semibold text-ink/55">First to tap in split it evenly.</p></div></div>
      {social.me?.operator && <div className="sunk mt-4 grid grid-cols-2 rounded-2xl p-1">{[false, true].map(t => <button key={String(t)} onClick={() => setTreasury(t)} className={cn('press min-h-10 rounded-xl text-[12.5px] font-extrabold', treasury === t ? 'raised' : 'text-ink/55')}>{t ? 'From treasury (admin)' : 'From my wallet'}</button>)}</div>}
      <div className="mt-4"><p className="mb-1.5 font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">How many people</p><div className="grid grid-cols-5 gap-1.5">{RAIN_SLOTS.map(n => <button key={n} onClick={() => setSlots(n)} className={cn('press rounded-2xl py-3 text-[15px] font-black transition-colors', slots === n ? 'bg-gradient-to-br from-[#5B9BFF] to-[#1A4FB8] text-white shadow-[0_10px_20px_-10px_rgba(47,123,242,.9)]' : 'sunk')}>{n}</button>)}</div></div>
      <div className="mt-4">{treasury ? <label className="sunk flex items-center gap-2 rounded-2xl px-4 py-3"><input value={treasuryAmount} onChange={e => setTreasuryAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="display w-full bg-transparent text-[28px] outline-none" aria-label="Treasury amount"/><span className="font-mono text-[14px] font-black text-ink/60">ETH</span></label> : funding.picker}</div>
      {!treasury && each !== null && <p className="mt-2 rounded-xl bg-[#2F7BF2]/10 px-3 py-2 font-mono text-[12px] font-extrabold text-[#1A4FB8]">≈ {amountLabel(each, 18, funding.symbol)} per person</p>}
      <label className="mt-4 block"><p className="mb-1.5 font-mono text-[10.5px] font-extrabold uppercase tracking-wider text-ink/55">Message (optional)</p><input value={message} onChange={e => setMessage(e.target.value.slice(0, 120))} placeholder="Thanks for the support ☔" className="sunk w-full rounded-2xl px-3.5 py-3 text-[14px] font-semibold outline-none"/></label>
      {error && <p className="mt-3 rounded-xl bg-[#E5484D]/10 px-3 py-2 text-[12.5px] font-bold text-[#C52F35]">{error}</p>}
      <button onClick={() => void go()} disabled={!ok || busy} className="press mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#5B9BFF] to-[#1A4FB8] text-[15px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_14px_30px_-14px_rgba(47,123,242,.9)] transition-opacity disabled:opacity-45">{busy ? <><Loader2 size={17} className="animate-spin"/>{STEP_LABEL[step]}</> : <><CloudRain size={17}/>Start the rain</>}</button>
      <p className="mt-3 text-center text-[11.5px] font-semibold leading-5 text-ink/50">Open for 10 minutes or until full. If nobody joins, it’s refunded to your wallet.</p>
    </>}
  </Sheet>;
}

/** Shown right after sign-up (or for any account without one): a username is required to use ObjectPad’s social features. */
export function UsernameGate() {
  const social = useSocial(); const session = useSession(); const qc = useQueryClient();
  const [name, setName] = useState<string>(''); const [saving, setSaving] = useState<boolean>(false); const [error, setError] = useState<string | null>(null);
  const suggestion = social.me?.x?.handle ?? '';
  useEffect(() => { if (social.needsUsername && !name && suggestion) setName(suggestion.replace(/[^A-Za-z0-9_]/g, '').slice(0, 20)); }, [social.needsUsername, suggestion, name]);
  const valid = /^[A-Za-z0-9_]{3,20}$/.test(name); const check = useUserSearch(valid ? name : null);
  const taken = valid && check.data?.some(u => u.username.toLowerCase() === name.toLowerCase());
  const save = async () => { if (!valid || taken) return; setSaving(true); setError(null); try { await api('/social/profile', { token: await session.token(), method: 'POST', body: { username: name } }); await qc.invalidateQueries({ queryKey: SOCIAL_ME }); } catch (e) { setError(socialError(e)); } finally { setSaving(false); } };
  return <Sheet open={social.needsUsername} onClose={() => {}} dismissable={false} label="Choose your username">
    <div className="flex flex-col items-center text-center">
      <div className="gate-orb relative flex size-20 items-center justify-center rounded-[26px] bg-ink text-white"><AtSign size={34} strokeWidth={2.6}/><Sparkles size={16} className="absolute -right-1.5 -top-1.5 text-[#F2C94C]"/></div>
      <p className="lab mt-5">Step 1 of 1 · required</p>
      <h2 className="display mt-2 text-[32px] leading-[0.95]">Claim your name.</h2>
      <p className="mt-2 max-w-[320px] text-[14px] font-semibold text-ink/60">Your public name for chat, tips, rains and your profile page. You can change it later in Settings.</p>
    </div>
    <label className={cn('sunk mt-6 flex items-center gap-2 rounded-2xl px-4 py-3.5 transition-shadow', valid && !taken && 'shadow-[inset_0_0_0_1.5px_#12A150]', taken && 'shadow-[inset_0_0_0_1.5px_#E5484D]')}>
      <AtSign size={18} className="text-ink/45"/><input autoFocus value={name} onChange={e => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 20))} onKeyDown={e => { if (e.key === 'Enter') void save(); }} placeholder="yourname" className="w-full bg-transparent text-[20px] font-extrabold outline-none placeholder:text-ink/30" aria-label="Username"/>
      {valid && (taken ? <X size={18} className="text-[#E5484D]"/> : <Check size={18} className="gate-check text-[#12A150]"/>)}
    </label>
    <p className={cn('mt-2 text-[12px] font-bold', taken ? 'text-[#E5484D]' : 'text-ink/50')}>{taken ? 'That one’s taken.' : '3–20 letters, numbers or underscores.'}</p>
    {error && <p className="mt-3 rounded-xl bg-[#E5484D]/10 px-3 py-2 text-[12.5px] font-bold text-[#C52F35]">{error}</p>}
    <button onClick={() => void save()} disabled={!valid || Boolean(taken) || saving} className="press mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-black tracking-[-0.01em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_14px_30px_-14px_rgba(12,13,16,.9)] transition-opacity hover:bg-ink/90 disabled:pointer-events-none disabled:opacity-40">{saving ? <Loader2 size={17} className="animate-spin"/> : null}Continue as @{name || '…'}</button>
    <button onClick={() => session.logout()} className="mx-auto mt-3 flex items-center gap-1.5 text-[12.5px] font-bold text-ink/50 hover:text-ink"><LogOut size={13}/>Sign out instead</button>
  </Sheet>;
}
