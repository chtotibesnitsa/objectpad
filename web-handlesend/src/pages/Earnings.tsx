import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { encodeFunctionData, type Address } from 'viem';
import { ArrowUpRight, Coins, KeyRound, ScanLine, Wallet, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, Loading, OperatorNotice } from '@/components/Feedback';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useCurve } from '@/lib/objects';
import { useMarket } from '@/lib/market';
import { chain, formatEth, prepareTx, waitForReceipt } from '@/lib/chain';
import { eth, shortAddress, tinyUsd, usd } from '@/lib/format';
import { ESCROW_ABI, PONS_FEE_ESCROW } from '@/shared/economy';
import { explorerTx } from '@/shared/pons';
import type { ObjectRecord, Profile } from '@/shared/domain';

function CoinRow({ record, ethUsd }: { record: ObjectRecord; ethUsd: number | null }) {
  const curve = useCurve(record.curveAddress as Address); const state = curve.data;
  return <Link to={`/objects/${record.objectId}`} className="flex items-center gap-4 rounded-2xl p-3 transition-colors hover:bg-white/70">
    <img src={record.model.thumbnailUrl} alt="" className="size-14 rounded-xl bg-white object-contain"/>
    <div className="min-w-0 flex-1"><p className="truncate font-bold">{record.verifiedName}</p><p className="font-mono text-xs text-muted">${record.symbol}{record.checkin ? ' · Object Key ✓' : ''}</p></div>
    <div className="text-right"><p className="text-sm font-bold tnum">{state ? (ethUsd ? usd(state.marketCapEth * ethUsd) : eth(state.marketCapEth, 2)) : '—'}</p><p className="font-mono text-[11.5px] text-muted">{state ? (ethUsd ? tinyUsd(state.priceEth * ethUsd) : '') : curve.isError ? 'Unavailable' : '…'}</p></div>
    <ArrowUpRight size={16} className="shrink-0 text-muted"/>
  </Link>;
}

/** Creator dashboard: the claimable creator-fee balance in the Pons fee escrow plus every coin this creator launched. */
export default function Earnings() {
  const auth = useSession(); const qc = useQueryClient(); const market = useMarket(); const ethUsd = market.data?.ethUsd ?? null;
  const profile = useQuery({ queryKey: ['objectpad', 'profile'], enabled: auth.authenticated, queryFn: async () => api<Profile | null>('/profile', { token: await auth.token() }) });
  const mine = useQuery({ queryKey: ['objectpad', 'creator', profile.data?.publicId], enabled: Boolean(profile.data?.publicId), queryFn: () => api<{ objects: ObjectRecord[] }>(`/creators/${profile.data!.publicId}`), retry: false });
  const wallet = (profile.data?.wallet ?? null) as Address | null;
  const balance = useQuery({ queryKey: ['objectpad', 'escrow', wallet], enabled: Boolean(wallet), queryFn: () => chain.readContract({ address: PONS_FEE_ESCROW, abi: ESCROW_ABI, functionName: 'balanceOf', args: [wallet!] }), refetchInterval: 30_000, retry: 1 });
  const canClaim = Boolean(wallet && auth.wallet?.toLowerCase() === wallet.toLowerCase());
  const claim = useMutation({ mutationFn: async () => { if (!auth.wallet) throw new Error('Sign in first.'); const hash = await auth.send(await prepareTx(auth.wallet, { to: PONS_FEE_ESCROW, data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'claim' }) })); await waitForReceipt(hash); return hash; }, onSuccess: () => void qc.invalidateQueries({ queryKey: ['objectpad', 'escrow', wallet] }) });
  const objects = mine.data?.objects ?? [];
  return <div className="page py-8 sm:py-12">
    <p className="spec">Creator earnings</p><h1 className="display mt-3 text-5xl sm:text-7xl">Your objects,<br/>paying out.</h1>
    <p className="mt-4 max-w-xl text-base leading-7 text-muted">Every trade on a coin you launched pays a 1.5% creator fee. It collects in an on-chain fee escrow under your wallet, and you claim it whenever you like.</p>
    {!auth.configured ? <div className="mt-8"><OperatorNotice/></div> : !auth.authenticated ? <Button className="mt-8" size="lg" onClick={() => auth.login()}><Wallet/>Sign in to see earnings</Button> : profile.isPending ? <Loading/> : profile.isError ? <div className="mt-8"><ErrorState message={profile.error.message} retry={() => void profile.refetch()}/></div> : <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <section className="relative overflow-hidden rounded-[32px] bg-ink/[0.04] p-6 sm:p-8">
        <div className="relative"><div className="flex items-center justify-between"><span className="eyebrow font-bold">Claimable now</span><Coins size={18}/></div>
          <p className="display mt-5 text-5xl tnum">{!wallet ? '—' : balance.data !== undefined ? formatEth(balance.data) : balance.isError ? '—' : '…'}<span className="ml-2 text-xl text-ink/60">ETH</span></p>
          {ethUsd && balance.data !== undefined && <p className="mt-1 font-mono text-sm text-ink/60">≈ {usd(Number(formatEth(balance.data, 8).replace(/[<,]/g, '')) * ethUsd)}</p>}
          <p className="mt-4 text-xs leading-5 text-ink/65">{wallet ? <>Creator wallet <a className="font-mono underline-offset-2 hover:underline" href={`https://robinhoodchain.blockscout.com/address/${wallet}`} target="_blank" rel="noreferrer">{shortAddress(wallet)}</a></> : 'Your creator wallet is set up when you launch your first coin, or in Settings.'}</p>
          {canClaim ? <Button size="lg" className="press mt-6 w-full" disabled={claim.isPending || !balance.data} onClick={() => claim.mutate()}>{claim.isPending ? 'Claiming…' : 'Claim to my wallet'}</Button> : wallet ? <p className="mt-6 rounded-2xl bg-white p-4 text-xs leading-5">Claiming sends a transaction from your creator wallet. Sign in with the account that owns it to claim.</p> : <Button asChild className="mt-6 w-full bg-ink text-white"><Link to="/settings">Set up creator wallet</Link></Button>}
          {claim.isError && <p role="alert" className="mt-3 text-xs font-bold text-down">{claim.error.message.split('\n')[0]}</p>}
          {claim.data && <a href={explorerTx(claim.data)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 font-mono text-[11px] font-bold text-up">Claimed · view receipt<ArrowUpRight size={12}/></a>}
        </div>
      </section>
      <section className="rounded-[32px] p-4 glass sm:p-5">
        <div className="flex items-center justify-between px-2"><h2 className="font-bold">Your coins</h2><span className="font-mono text-[11.5px] uppercase text-muted">{objects.length} launched</span></div>
        {mine.isPending && profile.data ? <Loading/> : mine.isError ? <div className="mt-4"><ErrorState message="Your coins could not be loaded." retry={() => void mine.refetch()}/></div> : objects.length ? <div className="mt-2">{objects.map(record => <CoinRow key={record.objectId} record={record} ethUsd={ethUsd}/>)}</div> : <div className="flex flex-col items-center px-4 py-12 text-center"><ScanLine size={32} className="text-volt"/><p className="mt-4 text-lg font-bold">No coins yet.</p><p className="mt-1 max-w-xs text-sm text-muted">Scan an object and it launches for free. Its fees show up here.</p><Button asChild variant="lime" className="press mt-5"><Link to="/capture">Scan an object</Link></Button></div>}
      </section>
    </div>}
    <div className="mt-8 grid gap-4 sm:grid-cols-3">{[{ icon: Zap, title: 'Free to launch', text: 'The ObjectPad treasury pays the launch. You never need ETH to start earning.' }, { icon: Coins, title: 'Set at launch', text: 'Your wallet is set as the creator-fee recipient at launch. ObjectPad can’t redirect it later.' }, { icon: KeyRound, title: 'Prove you still have it', text: 'Check in with a new photo on your coin page to show the real object is still with you.' }].map(item => <div key={item.title} className="rounded-[24px] p-5 glass"><item.icon size={17} className="text-volt"/><p className="mt-3 font-bold">{item.title}</p><p className="mt-1 text-sm leading-6 text-muted">{item.text}</p></div>)}</div>
  </div>;
}
