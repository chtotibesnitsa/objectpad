import { useCallback, useEffect, useMemo, useState } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { ArrowDownToLine, BadgeCheck, ChevronRight, CircleUserRound, Copy, Download, Hourglass, KeyRound, Link2, PlusCircle, UserRoundPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { chain, waitForReceipt } from '@/lib/chain';
import { ESCROW_ABI, PONS_FEE_ESCROW } from '@/shared/economy';
import type { CaptureSession } from '@/shared/domain';
import { useApp } from '../store';
import { Feedback } from '../feedback';
import { Fmt } from '../format';
import { PushScreen, RootScreen, Sheet } from '../chrome';
import { CircleIconButton, CoinAvatar, ConfettiBurst, Display, Enter, GlassIcon, img, Lab, PadButton, PAD, Rolling, SectionHeader, Spinner, VoxelField } from '../ui';

const txUrl = (h: string) => `https://robinhoodchain.blockscout.com/tx/${h}`;
const addressUrl = (a: string) => `https://robinhoodchain.blockscout.com/address/${a}`;
const CREATOR_SHARE_BPS = 3_334n;
const launchedOf = (s: CaptureSession) => s.launch?.recordState === 'confirmed' || Boolean(s.launch?.hash);

export function LaunchRow({ session }: { session: CaptureSession }) {
  const app = useApp(); const coin = session.launch?.token ? app.coin(session.launch.token) : undefined;
  return <button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.push(coin ? `/app/coin/${coin.id}` : `/app/studio/${session.id}`)} className="ap-press ap-raised flex w-full items-center gap-3 rounded-[20px] p-3 text-left">
    <CoinAvatar url={session.icon ? `https://objectpad-backend.rork.app/api/artifacts/${session.icon.hash}` : session.model?.thumbnailUrl ?? coin?.logo} symbol={session.launchDraft?.symbol ?? ''} size={46}/>
    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-extrabold">{session.launchDraft?.publicName ?? coin?.name ?? 'Object'}</span><span className="ap-mono block text-[11px] font-bold text-[#6A6E78]">${session.launchDraft?.symbol ?? coin?.symbol ?? ''} · {session.launch?.recordState === 'confirmed' ? 'live' : session.launch?.state ?? ''}</span></span>
    {coin && <span className="text-right"><span className="block text-[14px] font-extrabold">{Fmt.value(coin.marketCapEth, app.ethUsd)}</span><span className="ap-mono block text-[10.5px] font-extrabold" style={{ color: coin.change24h >= 0 ? PAD.up : PAD.down }}>{Fmt.pct(coin.change24h)}</span></span>}
  </button>;
}

/** Wallets this phone controls, creator rewards waiting in the Pons fee escrow, and every coin launched from here. */
export default function WalletView() {
  const app = useApp();
  const [claimable, setClaimable] = useState<Record<string, bigint>>({}); const [gas, setGas] = useState<Record<string, bigint>>({}); const [scans, setScans] = useState<CaptureSession[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null); const [step, setStep] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [claimed, setClaimed] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<boolean>(false); const [importing, setImporting] = useState<boolean>(false);
  const wallets = useMemo(() => { const out: { address: Address; label: string }[] = []; if (app.accountWallet) out.push({ address: app.accountWallet, label: 'Account wallet · same as objectpad.fun' }); if (app.localWallet && app.localWallet.toLowerCase() !== app.accountWallet?.toLowerCase()) out.push({ address: app.localWallet, label: 'This phone’s wallet · key on this device' }); return out; }, [app.accountWallet, app.localWallet]);
  const total = Object.values(claimable).reduce((a, b) => a + b, 0n); const launched = scans.filter(launchedOf);
  const refresh = useCallback(async () => {
    if (!app.localWallet && !app.signedIn) app.ensureLocalWallet();
    const c: Record<string, bigint> = {}, g: Record<string, bigint> = {};
    await Promise.all(wallets.map(async w => { c[w.address] = await chain.readContract({ address: PONS_FEE_ESCROW, abi: ESCROW_ABI, functionName: 'balanceOf', args: [w.address] }).catch(() => 0n); g[w.address] = await chain.getBalance({ address: w.address }).catch(() => 0n); }));
    setClaimable(c); setGas(g); app.myScans().then(setScans).catch(() => undefined); app.refreshHoldings(); app.refetchMe();
  }, [wallets, app]);
  useEffect(() => { void refresh(); }, [app.accountWallet, app.localWallet]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Claims from the escrow, then returns the protocol's two thirds (burn + holders) to the treasury, exactly like objectpad.fun. */
  const claim = async (address: Address, amount: bigint) => {
    setClaiming(address); setError(null); setClaimed(null);
    try {
      const signer = app.signer(address); const [balance, price] = await Promise.all([chain.getBalance({ address }).catch(() => 0n), chain.getGasPrice().catch(() => 0n)]);
      if (balance < price * 260_000n) {
        if (!app.signedIn) throw new Error(`This wallet needs a little ETH on Robinhood Chain for gas. Sign in and ObjectPad tops it up for free, or send a few cents of ETH to ${Fmt.short(address)}.`);
        setStep('Linking wallet…'); if (signer.kind === 'device') await app.linkLocalWallet(); setStep('Getting free gas…'); await app.claimGas(address);
      }
      setStep('Claiming…'); const hash = await signer.send({ to: PONS_FEE_ESCROW, data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'claim' }) }); setStep('Confirming…'); await waitForReceipt(hash);
      const share = amount - (amount * CREATOR_SHARE_BPS) / 10_000n; const treasury = app.me?.treasury ?? app.status?.sponsor?.address ?? '';
      if (share > 0n && /^0x[a-fA-F0-9]{40}$/.test(treasury)) { setStep('Sharing with burn & holders…'); const h2 = await signer.send({ to: treasury as Address, value: share }); await waitForReceipt(h2); }
      const t = await app.accountToken(); if (t) void api('/account/activity', { token: t, method: 'POST', body: { hash }, timeout: 45_000 }).catch(() => undefined);
      setClaimed(hash); Feedback.success('coins'); await refresh();
    } catch (e) { setError((e instanceof Error ? e.message : 'The claim didn’t go through.').split('\n')[0]); Feedback.error(); }
    setClaiming(null); setStep(null);
  };
  const held = app.coins.filter(c => app.balances[c.token.toLowerCase()]); const open = scans.find(s => !s.launch && !['blocked', 'cancelled', 'expired'].includes(s.state));
  const linked = app.me?.wallets.some(w => w.address.toLowerCase() === app.localWallet?.toLowerCase());
  return <RootScreen><div className="flex flex-col gap-4">
    <Enter className="flex items-center pt-2"><div className="flex flex-1 flex-col gap-1"><Lab>{app.signedIn ? app.displayName : 'Guest · no account needed'}</Lab><Display size={42}>Wallet</Display></div><CircleIconButton icon={app.signedIn ? CircleUserRound : UserRoundPlus} size={50} label="Account" onClick={() => (app.signedIn ? app.setAccount(true) : app.setSignIn(true))}/></Enter>
    <Enter delay={0.05}><div className="relative overflow-hidden rounded-[30px] p-[18px] text-white shadow-[0_14px_22px_rgba(12,13,16,.35)]">
      <div className="ap-night absolute inset-0"/><div className="absolute inset-0 opacity-50"><VoxelField count={14} seed={21} color={PAD.gold}/></div>
      <div className="relative flex flex-col gap-3.5">
        <div className="flex items-start"><div className="flex flex-1 flex-col gap-1.5"><Lab className="!text-white/60">Creator rewards to claim</Lab><Rolling text={`${Fmt.units(total, 6)} ETH`} className="ap-display" style={{ fontSize: 36 }}/><p className="ap-mono text-[13px] font-bold text-white/60">{app.ethUsd ? Fmt.usd(Fmt.toNum(total) * app.ethUsd) : ' '}</p></div><img src={img('gold_coins_vault_box')} alt="" className="ap-bob -mt-2 w-[104px]"/></div>
        <p className="text-[13px] font-semibold text-white/70">You keep 0.5% of every trade on coins you launched. Claim it straight from the on-chain fee escrow whenever you like.</p>
        {error && <p className="text-[12.5px] font-bold text-[#FF8A8E]">{error}</p>}
        {claimed && <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-3"><BadgeCheck size={17} fill={PAD.up} stroke="#fff"/><span className="flex-1 text-[14px] font-extrabold">Claimed</span><a href={txUrl(claimed)} target="_blank" rel="noreferrer" className="text-[13px] font-extrabold">Receipt ↗</a></div>}
        {wallets.map(w => { const amount = claimable[w.address] ?? 0n; return amount > 0n && <PadButton key={w.address} title={claiming === w.address ? step ?? 'Claiming…' : `Claim ${Fmt.units(amount, 5)} ETH · ${Fmt.short(w.address)}`} icon={ArrowDownToLine} kind="pearl" busy={claiming === w.address} enabled={claiming === null} onClick={() => void claim(w.address, amount)}/>; })}
        {total === 0n && <p className="text-[12.5px] font-bold text-white/55">{launched.length ? 'Nothing waiting right now. Fees arrive with every trade.' : 'Launch a coin and its trading fees start landing here.'}</p>}
      </div>
      {claimed && <ConfettiBurst/>}
    </div></Enter>
    <Enter delay={0.1} className="flex flex-col gap-2.5">
      <SectionHeader lab="Robinhood Chain" title="Your wallets"/>
      {!wallets.length && <PadButton title="Create this phone’s wallet" icon={PlusCircle} onClick={() => { app.ensureLocalWallet(); Feedback.success(); }}/>}
      {wallets.map(w => <div key={w.address} className="ap-raised flex flex-col gap-2.5 rounded-[22px] p-3.5">
        <div className="flex items-center gap-2.5"><GlassIcon name={w.label.startsWith('Account') ? 'glass_shield' : 'glass_wallet'} size={38}/><div className="min-w-0 flex-1"><p className="text-[13px] font-bold text-[#6A6E78]">{w.label}</p><p className="ap-mono text-[14px] font-extrabold">{Fmt.short(w.address, 8, 6)}</p></div><button type="button" aria-label="Copy address" onClick={() => { void navigator.clipboard.writeText(w.address); app.show('Address copied'); }} className="ap-press p-2"><Copy size={17}/></button></div>
        <div className="flex items-center"><span className="flex-1 text-[15px] font-extrabold">{Fmt.units(gas[w.address] ?? 0n, 5)} ETH</span><a href={addressUrl(w.address)} target="_blank" rel="noreferrer" className="text-[12.5px] font-bold text-[#6A6E78]">Blockscout ↗</a></div>
      </div>)}
      {app.localWallet && <div className="flex gap-2.5"><PadButton title="Back up key" icon={KeyRound} kind="ghost" height={46} onClick={() => setShowKey(true)}/><PadButton title="Import" icon={Download} kind="ghost" height={46} onClick={() => setImporting(true)}/></div>}
      {app.signedIn && app.localWallet && !linked && <PadButton title="Link this phone’s wallet to my account" icon={Link2} kind="pearl" onClick={() => void app.linkLocalWallet().then(() => { Feedback.success(); app.show('Wallet linked'); }).catch(e => setError(e instanceof Error ? e.message : 'Couldn’t link.'))}/>}
    </Enter>
    <Enter delay={0.15} className="flex flex-col gap-2.5">
      <SectionHeader lab="Portfolio" title="Coins you hold"/>
      {!held.length && <p className="text-[13.5px] font-semibold text-[#6A6E78]">Buy any object coin and it shows up here.</p>}
      {held.map(c => { const bal = app.balances[c.token.toLowerCase()] ?? 0n; return <button key={c.id} type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.push(`/app/coin/${c.id}`)} className="ap-press ap-raised flex items-center gap-3 rounded-[20px] p-3 text-left"><CoinAvatar url={c.logo} symbol={c.symbol} size={44}/><span className="flex-1"><span className="block text-[15px] font-extrabold">${c.symbol}</span><span className="ap-mono block text-[11px] font-bold text-[#6A6E78]">{Fmt.compact(Fmt.toNum(bal))} tokens</span></span><span className="text-[15px] font-extrabold">{Fmt.value(Fmt.toNum(bal) * c.priceEth, app.ethUsd)}</span></button>; })}
    </Enter>
    <Enter delay={0.2} className="flex flex-col gap-2.5">
      <SectionHeader lab="Launched from this phone" title="Your coins" action={launched.length ? 'All' : undefined} onAction={() => app.push('/app/launches')}/>
      {!launched.length && !scans.length && <button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.startScan()} className="ap-press ap-raised flex items-center gap-3.5 rounded-[22px] p-3.5 text-left"><img src={img('rocket_launch_voxel')} alt="" className="w-16"/><span className="flex-1"><span className="block text-[15px] font-extrabold">Launch your first coin</span><span className="block text-[12.5px] font-semibold text-[#6A6E78]">Scan any object. It’s free.</span></span><ChevronRight size={18} className="text-[#6A6E78]"/></button>}
      {launched.slice(0, 4).map(s => <LaunchRow key={s.id} session={s}/>)}
      {open && <button type="button" onPointerDown={() => Feedback.tap()} onClick={() => app.push(`/app/studio/${open.id}`)} className="ap-press ap-raised flex items-center gap-2 rounded-[20px] p-3.5 text-left"><Hourglass size={17} className="text-[#2F7BF2]"/><span className="flex-1 text-[14px] font-extrabold">{['awaiting_mobile', 'capturing'].includes(open.state) || open.views.length < 6 ? `Unfinished scan · ${open.views.length}/6 angles` : 'Scan ready to launch'}</span><ChevronRight size={18} className="text-[#6A6E78]"/></button>}
    </Enter>
    <KeySheet open={showKey} onClose={() => setShowKey(false)}/>
    <ImportSheet open={importing} onClose={() => setImporting(false)} onDone={() => void refresh()}/>
  </div></RootScreen>;
}

function KeySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp(); const [revealed, setRevealed] = useState<boolean>(false); const [copied, setCopied] = useState<boolean>(false);
  useEffect(() => { if (!open) { setRevealed(false); setCopied(false); } }, [open]);
  return <Sheet open={open} onClose={onClose} height="auto"><div className="flex flex-col gap-3.5 px-5 pb-4 pt-2">
    <Display size={28}>Your wallet key</Display>
    <p className="text-[13.5px] font-semibold text-[#E5484D]">Anyone with this key controls the wallet and its creator rewards. Store it somewhere safe. Never share it.</p>
    <button type="button" onClick={() => setRevealed(true)} className="ap-sunk ap-mono relative break-all rounded-2xl p-3.5 text-left text-[13px] font-bold" style={{ filter: revealed ? undefined : 'blur(6px)' }}>{app.localKey ?? 'No key on this phone'}</button>
    {!revealed ? <PadButton title="Show key" icon={KeyRound} onClick={() => setRevealed(true)}/> : <PadButton title={copied ? 'Copied' : 'Copy key'} icon={Copy} onClick={() => { void navigator.clipboard.writeText(app.localKey ?? ''); setCopied(true); Feedback.success(); }}/>}
  </div></Sheet>;
}
function ImportSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const app = useApp(); const [text, setText] = useState<string>(''); const [error, setError] = useState<string | null>(null);
  return <Sheet open={open} onClose={onClose} height="auto"><div className="flex flex-col gap-3.5 px-5 pb-4 pt-2">
    <Display size={28}>Import a wallet</Display><p className="text-[13.5px] font-semibold text-[#6A6E78]">It replaces this phone’s wallet. Back up the current key first.</p>
    <input type="password" value={text} onChange={e => setText(e.target.value)} placeholder="64-character private key" autoCapitalize="none" className="ap-field ap-mono !text-[14px]"/>
    {error && <p className="text-[13px] font-bold text-[#E5484D]">{error}</p>}
    <PadButton title="Import" icon={Download} enabled={text.length >= 64} onClick={() => { try { app.importLocalWallet(text); setText(''); Feedback.success(); onDone(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Invalid key.'); Feedback.error(); } }}/>
  </div></Sheet>;
}

export function LaunchesView() {
  const app = useApp(); const [scans, setScans] = useState<CaptureSession[] | null>(null);
  useEffect(() => { app.myScans().then(setScans).catch(() => setScans([])); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const list = (scans ?? []).filter(s => s.launch);
  return <PushScreen title="Your coins"><div className="flex flex-col gap-2.5 p-4 pb-28">
    {!scans ? <div className="flex justify-center pt-16"><Spinner/></div> : !list.length ? <p className="pt-10 text-center text-[14px] font-semibold text-[#6A6E78]">No launches from this identity yet.</p> : list.map(s => <LaunchRow key={s.id} session={s}/>)}
  </div></PushScreen>;
}
export type { Hex };
