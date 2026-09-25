import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { formatEther, type Address } from 'viem';
import { ArrowDownLeft, ArrowUpRight, Check, Coins, Copy, ExternalLink, Flame, LoaderCircle, Plus, Repeat, ShieldCheck, Sparkles, Wallet as WalletIcon, X } from 'lucide-react';
import { ErrorState, Loading, OperatorNotice } from '@/components/Feedback';
import { GlassIcon } from '@/components/GlassIcon';
import { useSession } from '@/lib/session';
import { useMarket } from '@/lib/market';
import { ACCOUNT_KEY, useAccount, type AccountWallet } from '@/lib/account';
import { ACTIVITY_KEY, claimCreatorShare, maxSendable, recordActivity, sendEth, splitFees, useCountUp, useSigner, useWalletActivity, type ClaimStep, type WalletActivity } from '@/lib/wallet';
import { parseAmount } from '@/lib/chain';
import { copyText, shortAddress, timeAgo, usd } from '@/lib/format';
import { explorerTx } from '@/shared/pons';
import { validAddress } from '@/shared/security';
import { cn } from '@/lib/utils';

type Sheet = 'deposit' | 'withdraw' | 'claim' | null;
const toEth = (wei: bigint | string): number => Number(formatEther(typeof wei === 'string' ? BigInt(wei) : wei));
const ethText = (v: number, d = 6): string => v === 0 ? '0' : v < 10 ** -d ? `<${10 ** -d}` : v.toLocaleString('en', { maximumFractionDigits: d });
const errText = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong.').split('\n')[0].replace(/^.*User rejected.*$/i, 'You cancelled the request.').slice(0, 160);

/** Big rolling balance with a USD line underneath. */
function Rolling({ value, ethUsd, className }: { value: number; ethUsd: number | null; className?: string }) {
  const v = useCountUp(value);
  return <div className={className}><p className="display tnum text-[46px] leading-none sm:text-[64px]">{ethText(v, 5)}<span className="ml-2 text-[20px] opacity-55">ETH</span></p><p className="mt-2 font-mono text-[13px] font-bold opacity-60">{ethUsd ? `≈ ${usd(v * ethUsd)}` : 'Robinhood Chain · 4663'}</p></div>;
}

/** Slide-up glass sheet for deposit, withdraw and claim flows. */
function SheetFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
    <button className="absolute inset-0 bg-ink/30 backdrop-blur-[4px] [animation:page-fade_.3s_ease_both]" onClick={onClose} aria-label="Close"/>
    <div className="glass-nav relative w-full max-w-[460px] rounded-t-[32px] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] [animation:card-pop_.5s_cubic-bezier(.2,1.2,.35,1)_both] sm:rounded-[32px]">
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15 sm:hidden"/>
      <div className="flex items-center justify-between"><h2 className="display text-[26px]">{title}</h2><button onClick={onClose} className="press raised flex size-10 items-center justify-center rounded-2xl" aria-label="Close"><X size={16}/></button></div>
      <div className="mt-4">{children}</div>
    </div>
  </div>;
}

function DepositSheet({ wallet, onClose }: { wallet: AccountWallet; onClose: () => void }) {
  const session = useSession(); const qc = useQueryClient(); const [copied, setCopied] = useState<boolean>(false); const [hash, setHash] = useState<string>('');
  const log = useMutation({ mutationFn: async () => recordActivity(await session.token(), hash.trim()), onSuccess: () => { setHash(''); void qc.invalidateQueries({ queryKey: ACTIVITY_KEY }); void qc.invalidateQueries({ queryKey: ACCOUNT_KEY }); } });
  return <SheetFrame title="Deposit ETH" onClose={onClose}>
    <div className="flex flex-col items-center"><div className="raised rounded-[26px] p-4"><QRCodeSVG value={wallet.address} size={176} level="M" marginSize={0} fgColor="#0C0D10" title="Wallet address"/></div>
      <p className="mt-3 text-center text-[13px] font-bold text-ink/60">Send <b className="text-ink">ETH on Robinhood Chain (4663)</b> only. Other networks or tokens sent here can be lost.</p></div>
    <button onClick={() => void copyText(wallet.address).then(ok => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800); } })} className="sunk press mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"><span className="min-w-0 flex-1 break-all font-mono text-[12.5px] font-bold">{wallet.address}</span>{copied ? <Check size={16} className="text-up"/> : <Copy size={16}/>}</button>
    <div className="mt-4 border-t border-ink/[0.08] pt-4"><p className="text-[13px] font-extrabold">Already sent it?</p><p className="text-[12px] font-semibold text-ink/55">Paste the transaction hash and it’s added to your history once we confirm it on-chain. Your balance updates on its own either way.</p>
      <div className="mt-2 flex gap-2"><input value={hash} onChange={e => setHash(e.target.value)} placeholder="0x… transaction hash" spellCheck={false} className="min-w-0 flex-1 font-mono text-[12px]" aria-label="Transaction hash"/><button onClick={() => log.mutate()} disabled={!/^0x[a-fA-F0-9]{64}$/.test(hash.trim()) || log.isPending} className="btn press min-h-11 shrink-0 px-4 text-[13px] disabled:opacity-40">{log.isPending ? <LoaderCircle size={14} className="animate-spin"/> : 'Add'}</button></div>
      {log.isError && <p role="alert" className="mt-2 text-xs font-bold text-down">{errText(log.error)}</p>}{log.isSuccess && <p className="mt-2 text-xs font-bold text-up">Deposit confirmed and added.</p>}</div>
  </SheetFrame>;
}

function WithdrawSheet({ wallet, onClose }: { wallet: AccountWallet; onClose: () => void }) {
  const session = useSession(); const qc = useQueryClient(); const signerFor = useSigner(); const signer = signerFor(wallet.address);
  const [to, setTo] = useState<string>(''); const [amount, setAmount] = useState<string>(''); const [max, setMax] = useState<bigint | null>(null);
  useEffect(() => { if (!signer) return; let live = true; void maxSendable(signer.address, BigInt(wallet.gasWei)).then(v => { if (live) setMax(v); }); return () => { live = false; }; }, [signer?.address, wallet.gasWei]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = parseAmount(amount); const toOk = validAddress(to.trim()) && to.trim().toLowerCase() !== wallet.address;
  const tooMuch = value !== null && max !== null && value > max;
  const send = useMutation({ mutationFn: async () => { if (!signer || !value) throw new Error('Nothing to send.'); const hash = await sendEth(signer, to.trim() as Address, value); await recordActivity(await session.token(), hash).catch(() => undefined); return hash; }, onSuccess: () => { void qc.invalidateQueries({ queryKey: ACCOUNT_KEY }); void qc.invalidateQueries({ queryKey: ACTIVITY_KEY }); } });
  return <SheetFrame title="Withdraw" onClose={onClose}>
    {!signer ? <p className="sunk rounded-2xl p-4 text-[13px] font-bold text-ink/65">This wallet’s key isn’t on this device. Sign in with it, or open ObjectPad on the device that launched your coin, to withdraw.</p>
      : send.data ? <div className="flex flex-col items-center py-4 text-center"><span className="flex size-16 items-center justify-center rounded-full bg-ink text-white [animation:slot-pop_.5s_ease_both]"><Check size={28}/></span><p className="mt-4 text-[18px] font-extrabold">Sent {amount} ETH</p><a href={explorerTx(send.data)} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 font-mono text-[12px] font-bold underline">View on explorer<ExternalLink size={12}/></a><button onClick={onClose} className="btn press mt-5 min-h-12 w-full">Done</button></div>
      : <>
        <div className="sunk flex items-center justify-between rounded-2xl px-4 py-3"><span className="stat-label !text-[11px]">Available to withdraw</span><span className="font-mono text-[14px] font-extrabold tnum">{max === null ? '…' : `${ethText(toEth(max))} ETH`}</span></div>
        <label className="mt-3 block"><span className="stat-label !text-[11px]">To address</span><input value={to} onChange={e => setTo(e.target.value)} placeholder="0x…" spellCheck={false} className="mt-1 w-full font-mono text-[13px]"/></label>
        <label className="mt-3 block"><span className="stat-label !text-[11px]">Amount (ETH)</span><div className="mt-1 flex gap-2"><input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="min-w-0 flex-1 font-mono text-[18px] font-extrabold"/><button onClick={() => max !== null && setAmount(formatEther(max))} disabled={!max} className="btn-ghost press min-h-11 px-4 text-[13px] disabled:opacity-40">Max</button></div></label>
        {tooMuch && <p className="mt-2 text-xs font-bold text-down">That’s more than you can withdraw after the network fee.</p>}
        {send.isError && <p role="alert" className="mt-2 text-xs font-bold text-down">{errText(send.error)}</p>}
        <button onClick={() => send.mutate()} disabled={!toOk || !value || tooMuch || send.isPending} className="btn press mt-4 min-h-[56px] w-full text-[15px] disabled:opacity-40">{send.isPending ? <><LoaderCircle size={16} className="animate-spin"/>Sending…</> : <><ArrowUpRight size={17}/>Withdraw{value ? ` ${amount} ETH` : ''}</>}</button>
        <p className="mt-2 text-center font-mono text-[11px] font-bold text-ink/45">Signed on this device · final on Robinhood Chain</p>
      </>}
  </SheetFrame>;
}

function ClaimSheet({ wallet, treasury, ethUsd, onClose }: { wallet: AccountWallet; treasury: string | undefined; ethUsd: number | null; onClose: () => void }) {
  const session = useSession(); const qc = useQueryClient(); const signerFor = useSigner(); const signer = signerFor(wallet.address);
  const [step, setStep] = useState<ClaimStep>('idle'); const total = BigInt(wallet.claimableWei); const { creator, protocol } = splitFees(total);
  const claim = useMutation({ mutationFn: async () => { if (!signer) throw new Error('This wallet’s key isn’t on this device.'); if (!treasury || !validAddress(treasury)) throw new Error('Treasury address unavailable. Try again shortly.'); return claimCreatorShare(await session.token(), wallet, signer, treasury as Address, setStep); }, onSettled: () => { void qc.invalidateQueries({ queryKey: ACCOUNT_KEY }); void qc.invalidateQueries({ queryKey: ACTIVITY_KEY }); }, onError: () => setStep('idle') });
  const steps: { id: ClaimStep; label: string }[] = [{ id: 'claiming', label: 'Claim fees from escrow' }, { id: 'sharing', label: 'Send 1.0% to burn + holders' }, { id: 'done', label: 'Your 0.5% lands in your wallet' }];
  const at = steps.findIndex(s => s.id === step);
  return <SheetFrame title="Claim your 0.5%" onClose={onClose}>
    <div className="smoke rounded-[24px] p-5 text-white"><p className="font-mono text-[11px] font-extrabold uppercase tracking-wider text-white/55">Your share to wallet</p><p className="display mt-1 text-[40px] leading-none tnum">{ethText(toEth(creator))}<span className="ml-1.5 text-[16px] text-white/55">ETH</span></p>{ethUsd && <p className="mt-1 font-mono text-[12px] text-white/55">≈ {usd(toEth(creator) * ethUsd)}</p>}
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10"><span className="w-1/3 origin-left bg-white [animation:bar-grow_.8s_ease_both]"/><span className="w-2/3 bg-white/25"/></div>
      <div className="mt-2 flex justify-between font-mono text-[11px] font-bold text-white/60"><span>You · 0.5%</span><span>Burn + holders · 1.0% · {ethText(toEth(protocol))} ETH</span></div></div>
    <ol className="mt-4 space-y-2">{steps.map((s, i) => <li key={s.id} className={cn('flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors', i <= at ? 'raised' : 'sunk')}><span className={cn('flex size-7 items-center justify-center rounded-full text-[12px] font-extrabold transition-all', i < at || step === 'done' ? 'bg-ink text-white' : i === at ? 'bg-white text-ink' : 'bg-ink/10 text-ink/50')}>{i < at || step === 'done' ? <Check size={14}/> : i === at ? <LoaderCircle size={14} className="animate-spin"/> : i + 1}</span><span className="text-[13.5px] font-bold">{s.label}</span></li>)}</ol>
    {claim.isError && <p role="alert" className="mt-3 text-xs font-bold text-down">{errText(claim.error)}</p>}
    {claim.data ? <><a href={explorerTx(claim.data.claim)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 font-mono text-[12px] font-bold underline">View claim transaction<ExternalLink size={12}/></a><button onClick={onClose} className="btn press mt-4 min-h-[56px] w-full">Done</button></>
      : <button onClick={() => claim.mutate()} disabled={!signer || total === 0n || claim.isPending} className="btn press mt-4 min-h-[56px] w-full text-[15px] disabled:opacity-40">{claim.isPending ? <><LoaderCircle size={16} className="animate-spin"/>Working…</> : <><Coins size={17}/>{total === 0n ? 'Nothing to claim yet' : 'Claim my 0.5%'}</>}</button>}
    {!signer && total > 0n && <p className="mt-2 text-center text-[12px] font-semibold text-ink/55">Open ObjectPad on the device holding this wallet to claim.</p>}
    <p className="mt-3 flex items-start gap-2 text-[11.5px] font-semibold leading-4 text-ink/50"><ShieldCheck size={14} className="mt-px shrink-0"/>Every trade on your coins pays 1.5%. You keep 0.5%. The other 1.0% funds $OBJECTPAD buyback-and-burn and holders, sent to the public treasury in the same flow.</p>
  </SheetFrame>;
}

const KIND: Record<WalletActivity['kind'], { label: string; icon: typeof ArrowDownLeft; sign: string }> = {
  deposit: { label: 'Deposit', icon: ArrowDownLeft, sign: '+' }, withdraw: { label: 'Withdrawal', icon: ArrowUpRight, sign: '−' }, transfer: { label: 'Moved between wallets', icon: Repeat, sign: '' },
  claim: { label: 'Creator fees claimed', icon: Coins, sign: '+' }, protocol_share: { label: 'Burn + holders share', icon: Flame, sign: '−' },
};

/** On-site wallet: balances across every account wallet, deposit, withdraw, the creator's 0.5% claim and history. */
export default function Wallet() {
  const session = useSession(); const account = useAccount(); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null; const me = account.data;
  const activity = useWalletActivity(Boolean(me)); const signerFor = useSigner();
  const [selected, setSelected] = useState<string>(''); const [sheet, setSheet] = useState<Sheet>(null);
  const wallet = useMemo(() => me?.wallets.find(w => w.address === selected) ?? me?.wallets[0] ?? null, [me, selected]);
  const totals = useMemo(() => { const ws = me?.wallets ?? []; const bal = ws.reduce((s, w) => s + BigInt(w.gasWei), 0n); const fees = ws.reduce((s, w) => s + BigInt(w.claimableWei), 0n); return { balance: toEth(bal), fees: toEth(fees), share: toEth(splitFees(fees).creator) }; }, [me]);
  const items = (activity.data ?? []).filter(a => !wallet || me?.wallets.length === 1 || a.wallet === wallet.address);

  return <div className="page py-8 sm:py-12">
    <div className="enter flex items-end gap-4"><GlassIcon name="wallet" size={84} float className="hidden sm:block"/><div><p className="lab">My wallet</p><h1 className="display mt-3 text-[44px] sm:text-[64px]">Your money,<br/>in one place.</h1></div></div>
    {!session.configured ? <div className="mt-8"><OperatorNotice/></div>
      : !session.authenticated ? <div className="raised enter mt-8 flex flex-col items-start gap-4 rounded-[28px] p-6 sm:flex-row sm:items-center"><GlassIcon name="wallet" size={56}/><div className="flex-1"><p className="text-[18px] font-extrabold">Sign in to open your wallet</p><p className="mt-1 text-[13px] font-semibold text-ink/60">Deposit, withdraw and claim your creator fees. X, email or any wallet.</p></div><button onClick={() => session.login()} className="btn press min-h-12 px-6 text-[14px]">Sign in / Sign up</button></div>
      : account.isPending ? <Loading label="Opening your wallet…"/>
      : account.isError ? <div className="mt-8"><ErrorState message={account.error.message} retry={() => void account.refetch()}/></div>
      : me && <>
        <section className="smoke card-pop relative mt-8 overflow-hidden rounded-[34px] p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/10 blur-3xl" aria-hidden="true"/>
          <div className="relative flex flex-wrap items-center gap-2"><span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 font-mono text-[11px] font-extrabold uppercase tracking-wider"><span className="pulse-dot size-1.5 rounded-full bg-up"/>Live balance</span><span className="font-mono text-[11px] font-bold text-white/50">{me.wallets.length} wallet{me.wallets.length === 1 ? '' : 's'} · Robinhood Chain</span></div>
          <Rolling value={totals.balance} ethUsd={ethUsd} className="relative mt-5"/>
          <div className="relative mt-6 grid grid-cols-3 gap-2 sm:max-w-[520px]">
            {([['deposit', 'Deposit', ArrowDownLeft], ['withdraw', 'Withdraw', ArrowUpRight], ['claim', 'Claim 0.5%', Coins]] as const).map(([id, label, Icon], i) => <button key={id} onClick={() => setSheet(id)} disabled={!wallet} style={{ ['--delay' as string]: `${150 + i * 70}ms` }} className={cn('card-pop press flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[20px] text-[13px] font-extrabold transition-transform hover:-translate-y-0.5 disabled:opacity-40', i === 2 ? 'btn' : 'border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/15')}><Icon size={19} strokeWidth={2.5}/>{label}</button>)}
          </div>
        </section>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[{ label: 'Creator fees waiting', value: `${ethText(totals.fees)} ETH`, note: '1.5% of every trade on your coins' }, { label: 'Your 0.5% share', value: `${ethText(totals.share)} ETH`, note: ethUsd ? `≈ ${usd(totals.share * ethUsd)} · ready to claim` : 'ready to claim' }, { label: 'Coins launched', value: String(me.launches.length), note: 'each one pays you on every trade' }].map((s, i) => <div key={s.label} style={{ ['--delay' as string]: `${250 + i * 80}ms` }} className="sunk card-pop rounded-[22px] p-4"><p className="stat-label !text-[11px]">{s.label}</p><p className="mt-1 text-[22px] font-extrabold tnum">{s.value}</p><p className="font-mono text-[11.5px] font-bold text-ink/50">{s.note}</p></div>)}
        </div>

        <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-[20px] font-extrabold">Wallets</h2><Link to="/earnings#wallets" className="btn-ghost press min-h-10 px-3.5 text-[12.5px]"><Plus size={14}/>Add wallet</Link></div>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2 no-scrollbar">{me.wallets.map((w, i) => { const on = w.address === wallet?.address; const signer = signerFor(w.address); return <button key={w.address} onClick={() => setSelected(w.address)} style={{ ['--delay' as string]: `${i * 60}ms` }} className={cn('card-pop press min-w-[230px] shrink-0 rounded-[24px] p-4 text-left transition-all duration-300', on ? 'raised -translate-y-0.5 ring-2 ring-ink' : 'sunk hover:-translate-y-0.5')}>
            <div className="flex items-center gap-2"><WalletIcon size={15}/><span className="text-[13px] font-extrabold">{w.kind === 'account' ? 'Account wallet' : 'Dev wallet'}</span>{signer && <span className="ml-auto rounded-full bg-ink px-2 py-0.5 font-mono text-[9.5px] font-extrabold uppercase text-white">This device</span>}</div>
            <p className="mt-1 font-mono text-[11.5px] text-ink/55">{shortAddress(w.address, 6, 4)}</p>
            <p className="mt-3 text-[20px] font-extrabold tnum">{ethText(toEth(w.gasWei), 5)} <span className="text-[12px] text-ink/50">ETH</span></p>
            <p className="font-mono text-[11px] font-bold text-ink/55">+ {ethText(toEth(splitFees(BigInt(w.claimableWei)).creator))} ETH to claim</p>
          </button>; })}
            {!me.wallets.length && <div className="sunk rounded-[24px] p-5 text-[13px] font-bold text-ink/60">No wallet on this account yet. <Link to="/earnings#wallets" className="underline">Link one</Link>.</div>}
          </div>
        </section>

        <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-[20px] font-extrabold">Activity</h2><span className="font-mono text-[11.5px] font-bold uppercase text-ink/50">Verified on-chain</span></div>
          {activity.isPending ? <div className="raised mt-3 space-y-2 rounded-[24px] p-3">{[0, 1, 2].map(i => <div key={i} className="h-14 animate-pulse rounded-2xl bg-ink/[0.05]"/>)}</div>
            : items.length ? <div className="raised mt-3 divide-y divide-ink/[0.06] rounded-[24px] p-2">{items.map((a, i) => { const k = KIND[a.kind]; const v = toEth(a.valueWei); return <a key={`${a.hash}-${a.wallet}`} href={explorerTx(a.hash)} target="_blank" rel="noreferrer" style={{ ['--delay' as string]: `${i * 40}ms` }} className="enter flex items-center gap-3 rounded-2xl p-2.5 hover:bg-white/70">
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', a.kind === 'deposit' || a.kind === 'claim' ? 'bg-ink text-white' : 'sunk')}><k.icon size={18}/></span>
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-extrabold">{k.label}</span><span className="block truncate font-mono text-[11.5px] text-ink/55">{timeAgo(a.at)}{a.counterparty ? ` · ${a.kind === 'deposit' ? 'from' : 'to'} ${shortAddress(a.counterparty, 4, 4)}` : ''}</span></span>
              <span className="text-right"><span className="block font-mono text-[14px] font-extrabold tnum">{k.sign}{ethText(v)} ETH</span>{ethUsd && <span className="block font-mono text-[11px] text-ink/50">{usd(v * ethUsd)}</span>}</span></a>; })}</div>
            : <div className="raised mt-3 flex flex-col items-center rounded-[24px] px-4 py-12 text-center"><Sparkles size={28}/><p className="mt-3 text-[16px] font-extrabold">No activity yet</p><p className="mt-1 max-w-sm text-[13px] font-semibold text-ink/55">Deposits, withdrawals and fee claims show here once they’re confirmed on Robinhood Chain.</p><button onClick={() => setSheet('deposit')} disabled={!wallet} className="btn press mt-5 min-h-11 px-5 text-[13px] disabled:opacity-40"><ArrowDownLeft size={14}/>Make a deposit</button></div>}
        </section>

        {sheet === 'deposit' && wallet && <DepositSheet wallet={wallet} onClose={() => setSheet(null)}/>}
        {sheet === 'withdraw' && wallet && <WithdrawSheet wallet={wallet} onClose={() => setSheet(null)}/>}
        {sheet === 'claim' && wallet && <ClaimSheet wallet={wallet} treasury={me.treasury} ethUsd={ethUsd} onClose={() => setSheet(null)}/>}
      </>}
  </div>;
}
