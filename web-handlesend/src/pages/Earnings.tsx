import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ArrowUpRight, Check, Coins, Copy, Flame, KeyRound, LinkIcon, LoaderCircle, Rocket, ScanLine, Users, Wallet } from 'lucide-react';
import { ErrorState, Loading, OperatorNotice } from '@/components/Feedback';
import { GlassIcon } from '@/components/GlassIcon';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useMarket } from '@/lib/market';
import { useCoins } from '@/lib/coins';
import { devWallet, type DevWallet } from '@/lib/devWallet';
import { ACCOUNT_KEY, claimWithDevWallet, claimWithSession, linkDevWallet, linkSessionWallet, useAccount, type AccountWallet } from '@/lib/account';
import { copyText, eth, shortAddress, usd } from '@/lib/format';
import { explorerTx } from '@/shared/pons';
import { cn } from '@/lib/utils';

const DEV_KEY = 'objectpad.devwallet.v1';
const ethLabel = (v: number): string => v === 0 ? '0' : v < 0.000001 ? '<0.000001' : v.toFixed(6);

/** The 1.5% creator tax, split in three equal parts. */
function FeeSplit() {
  const parts = [{ icon: Coins, label: 'Creator', pct: '0.5%', note: 'Claim to your wallet' }, { icon: Flame, label: 'Buyback & burn', pct: '0.5%', note: 'Buys $OBJECTPAD, burns it' }, { icon: Users, label: 'Holders', pct: '0.5%', note: 'Community forge pool' }];
  return <div className="raised rounded-[26px] p-5">
    <div className="flex items-center justify-between"><p className="lab">Fee distribution · 1.5% of every trade</p></div>
    <div className="mt-3 flex h-2.5 overflow-hidden rounded-full"><span className="w-1/3 bg-ink"/><span className="w-1/3 bg-down"/><span className="w-1/3 bg-up"/></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">{parts.map((p, i) => <div key={p.label} className="sunk rounded-2xl p-3.5"><div className="flex items-center gap-2"><span className={cn('size-2 rounded-full', i === 0 ? 'bg-ink' : i === 1 ? 'bg-down' : 'bg-up')}/><p className="text-[13px] font-extrabold">{p.label}</p><span className="ml-auto font-mono text-[13px] font-extrabold">{p.pct}</span></div><p className="mt-1 text-[12px] font-semibold text-ink/60">{p.note}</p></div>)}</div>
  </div>;
}

/** One creator-fee wallet with its live claimable balance and the right claim path for how it is held. */
function WalletCard({ wallet, ethUsd }: { wallet: AccountWallet; ethUsd: number | null }) {
  const session = useSession(); const qc = useQueryClient(); const local = devWallet(); const [copied, setCopied] = useState<boolean>(false);
  const isLocal = local?.address.toLowerCase() === wallet.address; const isSession = session.wallet?.toLowerCase() === wallet.address;
  const claim = useMutation({ mutationFn: async (): Promise<Hex> => { const token = await session.token(); if (isSession && session.wallet) return claimWithSession(token, session.wallet, session.send); if (isLocal && local) return claimWithDevWallet(token, local); throw new Error('This wallet’s key isn’t on this device. Import it below or sign in with it.'); }, onSuccess: () => void qc.invalidateQueries({ queryKey: ACCOUNT_KEY }) });
  const canClaim = (isLocal || isSession) && BigInt(wallet.claimableWei) > 0n;
  return <div className="raised rounded-[24px] p-4 sm:p-5">
    <div className="flex items-center gap-3"><GlassIcon name="wallet" size={44}/><div className="min-w-0 flex-1"><p className="text-[14px] font-extrabold">{wallet.kind === 'account' ? 'Account wallet' : isSession ? 'Connected wallet' : 'Dev wallet'}{isLocal && <span className="ml-2 font-mono text-[11px] font-bold text-up">ON THIS DEVICE</span>}</p><a href={`https://robinhoodchain.blockscout.com/address/${wallet.address}`} target="_blank" rel="noreferrer" className="block truncate font-mono text-[12px] text-ink/60 hover:underline">{shortAddress(wallet.address, 8, 6)}</a></div>
      <button onClick={() => void copyText(wallet.address).then(ok => ok && setCopied(true))} className="flex size-10 items-center justify-center rounded-full hover:bg-ink/5" aria-label="Copy address">{copied ? <Check size={15}/> : <Copy size={15}/>}</button></div>
    <div className="mt-4 flex items-end justify-between gap-3"><div><p className="stat-label !text-[11px]">Claimable now</p><p className="display mt-1 text-[32px] leading-none tnum">{ethLabel(wallet.claimableEth)}<span className="ml-1.5 text-base text-ink/55">ETH</span></p>{ethUsd && wallet.claimableEth > 0 && <p className="mt-1 font-mono text-[12px] text-ink/60">≈ {usd(wallet.claimableEth * ethUsd)}</p>}</div>
      <button onClick={() => claim.mutate()} disabled={!canClaim || claim.isPending} className="btn press min-h-12 shrink-0 px-5 text-[14px] disabled:opacity-40">{claim.isPending ? <><LoaderCircle size={16} className="animate-spin"/>Claiming…</> : 'Claim creator fees'}</button></div>
    {!isLocal && !isSession && BigInt(wallet.claimableWei) > 0n && <p className="mt-3 text-[12px] font-semibold text-ink/60">To claim, open ObjectPad on the device that launched this coin, or import its dev-wallet key below.</p>}
    {claim.isError && <p role="alert" className="mt-3 text-xs font-bold text-down">{claim.error.message.split('\n')[0]}</p>}
    {claim.data && <a href={explorerTx(claim.data)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 font-mono text-[12px] font-bold text-up">Claimed · view transaction<ArrowUpRight size={12}/></a>}
  </div>;
}

/** Link this browser's dev wallet, the connected wallet, or import a dev-wallet key from another device. */
function LinkWallets({ publicId, linked }: { publicId: string; linked: string[] }) {
  const session = useSession(); const qc = useQueryClient(); const [key, setKey] = useState<string>(''); const local = devWallet();
  const link = useMutation({ mutationFn: async (kind: 'local' | 'session' | 'import') => {
    const token = await session.token();
    if (kind === 'session') { if (!session.wallet) throw new Error('Connect a wallet first.'); return linkSessionWallet(token, session.wallet, publicId, session.sign); }
    let wallet: DevWallet | null = local;
    if (kind === 'import') { const pk = key.trim() as `0x${string}`; if (!/^0x[a-fA-F0-9]{64}$/.test(pk)) throw new Error('Paste a 0x… private key (66 characters).'); wallet = { address: privateKeyToAccount(pk).address, privateKey: pk, createdAt: Date.now() }; try { localStorage.setItem(DEV_KEY, JSON.stringify(wallet)); } catch { /* private mode */ } }
    if (!wallet) throw new Error('No dev wallet on this device.'); return linkDevWallet(token, wallet, publicId);
  }, onSuccess: () => { setKey(''); void qc.invalidateQueries({ queryKey: ACCOUNT_KEY }); } });
  const localLinked = local && linked.includes(local.address.toLowerCase()); const sessionLinked = session.wallet && linked.includes(session.wallet.toLowerCase());
  return <div className="raised rounded-[24px] p-5">
    <p className="font-extrabold">Add a wallet</p><p className="mt-1 text-[13px] font-semibold text-ink/60">Launched without an account? Link the dev wallet that receives your coin’s fees. You sign once to prove it’s yours. The key never leaves your device.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      {local && !localLinked && <button onClick={() => link.mutate('local')} disabled={link.isPending} className="btn press min-h-11 px-4 text-[13px]"><LinkIcon size={14}/>Link dev wallet {shortAddress(local.address, 4, 4)}</button>}
      {session.wallet && !sessionLinked && <button onClick={() => link.mutate('session')} disabled={link.isPending} className="btn-ghost press min-h-11 px-4 text-[13px]"><Wallet size={14}/>Link connected wallet</button>}
    </div>
    <div className="mt-4 flex gap-2"><input value={key} onChange={e => setKey(e.target.value)} type="password" autoComplete="off" spellCheck={false} placeholder="Import dev-wallet private key (0x…)" aria-label="Dev wallet private key" className="min-w-0 flex-1 font-mono text-[12px]"/><button onClick={() => link.mutate('import')} disabled={!key || link.isPending} className="btn-ghost press min-h-11 shrink-0 px-4 text-[13px] disabled:opacity-40"><KeyRound size={14}/>Import</button></div>
    {link.isError && <p role="alert" className="mt-3 text-xs font-bold text-down">{link.error.message.split('\n')[0]}</p>}
    {link.isSuccess && <p className="mt-3 text-xs font-bold text-up">Wallet linked. Its coins and fees now show on your account.</p>}
  </div>;
}

/** Operator-only: creator fees from ObjectPad's own house coins, held by the launch treasury. */
function HouseFees({ ethUsd }: { ethUsd: number | null }) {
  const session = useSession(); const qc = useQueryClient();
  const fees = useQuery({ queryKey: ['objectpad', 'house-fees'], queryFn: async () => api<{ wallet: string; claimableEth: number }>('/ops/house/fees', { token: await session.token() }), refetchInterval: 30_000 });
  const claim = useMutation({ mutationFn: async () => api<{ hash: Hex }>('/ops/house/claim', { token: await session.token(), method: 'POST', body: {}, timeout: 60_000 }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['objectpad', 'house-fees'] }) });
  if (!fees.data) return null;
  return <div className="steel rounded-[24px] p-5">
    <p className="lab">Operator · ObjectPad originals</p>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><p className="stat-label !text-[11px]">House-coin fees to claim</p><p className="display mt-1 text-[32px] leading-none tnum">{ethLabel(fees.data.claimableEth)}<span className="ml-1.5 text-base text-ink/55">ETH</span></p>{ethUsd && <p className="mt-1 font-mono text-[12px] text-ink/60">≈ {usd(fees.data.claimableEth * ethUsd)} · to treasury {shortAddress(fees.data.wallet)}</p>}</div>
      <button onClick={() => claim.mutate()} disabled={claim.isPending || fees.data.claimableEth === 0} className="btn press min-h-12 px-5 text-[14px] disabled:opacity-40">{claim.isPending ? 'Claiming…' : 'Claim house fees'}</button></div>
    {claim.isError && <p role="alert" className="mt-3 text-xs font-bold text-down">{claim.error.message}</p>}
    {claim.data && <a href={explorerTx(claim.data.hash)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 font-mono text-[12px] font-bold text-up">Claimed · view transaction<ArrowUpRight size={12}/></a>}
  </div>;
}

/** Creator dashboard: sign in, see every coin you launched, live claimable fees per wallet, claim in one tap. */
export default function Earnings() {
  const session = useSession(); const account = useAccount(); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null; const coins = useCoins();
  const me = account.data; const [didCopied, setDidCopied] = useState<boolean>(false);
  return <div className="page py-8 sm:py-12">
    <div className="flex items-end gap-4"><GlassIcon name="coins" size={84} float className="hidden sm:block"/><div><p className="lab">Creator earnings</p><h1 className="display mt-3 text-[44px] sm:text-[64px]">Your coins,<br/>paying out.</h1></div></div>
    <p className="mt-4 max-w-xl text-[16px] font-bold text-ink/65">Every trade on a coin you launched pays a 1.5% fee. Your share builds up on-chain under your wallet, and you can claim it anytime.</p>
    <div className="mt-6"><FeeSplit/></div>
    {!session.configured ? <div className="mt-8"><OperatorNotice/></div>
      : !session.authenticated ? <div className="raised mt-6 flex flex-col items-start gap-4 rounded-[26px] p-6 sm:flex-row sm:items-center"><GlassIcon name="wallet" size={56}/><div className="flex-1"><p className="text-[18px] font-extrabold">Sign in to claim your fees</p><p className="mt-1 text-[13px] font-semibold text-ink/60">Use X, email or MetaMask. Coins you launched on this device join your account automatically.</p></div><button onClick={() => session.login()} className="btn press min-h-12 px-6 text-[14px]">Sign in / Sign up</button></div>
      : account.isPending ? <Loading label="Loading your coins and fees…"/>
      : account.isError ? <div className="mt-8"><ErrorState message={account.error.message} retry={() => void account.refetch()}/></div>
      : me && <>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="sunk rounded-[22px] p-4"><p className="stat-label !text-[11px]">Total to claim</p><p className="display mt-1 text-[30px] tnum">{ethLabel(me.totalClaimableEth)} <span className="text-base text-ink/55">ETH</span></p>{ethUsd && <p className="font-mono text-[12px] text-ink/60">≈ {usd(me.totalClaimableEth * ethUsd)}</p>}</div>
          <div className="sunk rounded-[22px] p-4"><p className="stat-label !text-[11px]">Coins launched</p><p className="display mt-1 text-[30px] tnum">{me.launches.length}</p></div>
          <div className="sunk rounded-[22px] p-4"><p className="stat-label !text-[11px]">Signed in as</p><p className="mt-1 truncate text-[17px] font-extrabold">{me.alias}</p><button onClick={() => void copyText(me.did).then(ok => ok && setDidCopied(true))} className="mt-1 flex items-center gap-1 font-mono text-[11px] font-bold text-ink/55">{didCopied ? <Check size={11}/> : <Copy size={11}/>}Copy account ID</button></div>
        </div>
        {me.operator && <div className="mt-5"><HouseFees ethUsd={ethUsd}/></div>}
        <section id="wallets" className="mt-8 scroll-mt-28"><h2 className="text-[20px] font-extrabold">Fee wallets</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">{me.wallets.map(w => <WalletCard key={w.address} wallet={w} ethUsd={ethUsd}/>)}<LinkWallets publicId={me.publicId} linked={me.wallets.map(w => w.address)}/></div>
        </section>
        <section id="launches" className="mt-8 scroll-mt-28"><div className="flex items-center justify-between"><h2 className="text-[20px] font-extrabold">My launches</h2><span className="font-mono text-[12px] font-bold uppercase text-ink/55">{me.launches.length} coins</span></div>
          {me.launches.length ? <div className="raised mt-3 divide-y divide-ink/[0.06] rounded-[24px] p-2">{me.launches.map(l => { const live = coins.data?.items.find(c => c.id === l.objectId); return <Link key={l.objectId} to={l.path} className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-white/70">
            <img src={l.thumbnail} alt="" className="size-14 rounded-xl bg-white object-contain"/>
            <div className="min-w-0 flex-1"><p className="truncate font-extrabold">{l.name}</p><p className="font-mono text-[12px] text-ink/60">${l.symbol}{l.launchedAt ? ` · ${new Date(l.launchedAt).toLocaleDateString()}` : ''}{live ? ` · ${live.trades} trades · ${live.holders} holders` : ''}</p></div>
            <div className="text-right"><p className="text-[14px] font-extrabold tnum">{live ? (ethUsd ? usd(live.marketCapEth * ethUsd, 0) : eth(live.marketCapEth, 2)) : '—'}</p>{live && <p className={cn('font-mono text-[12px] font-bold', live.change24h >= 0 ? 'text-up' : 'text-down')}>{live.change24h >= 0 ? '▲' : '▼'} {Math.abs(live.change24h).toFixed(1)}%</p>}</div>
            <ArrowUpRight size={16} className="shrink-0 text-ink/50"/></Link>; })}</div>
            : <div className="raised mt-3 flex flex-col items-center rounded-[24px] px-4 py-12 text-center"><ScanLine size={32}/><p className="mt-4 text-lg font-extrabold">No coins on this account yet.</p><p className="mt-1 max-w-sm text-sm font-semibold text-ink/60">Launched as a guest? Open this page on that device, or import its dev-wallet key above.</p><Link to="/launch" className="btn press mt-5 min-h-11 px-5 text-[13px]"><Rocket size={14}/>Scan & launch free</Link></div>}
        </section>
      </>}
  </div>;
}
