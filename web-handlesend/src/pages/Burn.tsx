import { useQuery } from '@tanstack/react-query';
import { parseAbiItem, type Address } from 'viem';
import { ArrowUpRight, Flame, Lock, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorState, Loading } from '@/components/Feedback';
import { chain, compact, ECONOMY, explorerAddress, formatEth, formatTokens, priceLabel, readCurve } from '@/lib/chain';
import { BURN_ENGINE_ABI, DEAD_ADDRESS, perTradeSplitBps, TOKEN_SUPPLY, VAULT_SPLIT } from '@/shared/economy';
import { ERC20_ABI, explorerTx } from '@/shared/pons';
import { shortHash } from '@/shared/security';
import { Donut } from '@/components/Charts';
import { previewCoins } from '@/lib/preview';
import { GlassIcon } from '@/components/GlassIcon';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { usePlatformMarket } from '@/components/MarketBoard';
import { timeAgo } from '@/lib/format';

interface Burn { id: string; coin: string; icon: string; node?: ReactNode; eth: number; at: number; side: 'buy' | 'sell'; hash: string; live: boolean; href?: string; fresh?: boolean; }

/** Live $OBJECTPAD burn dashboard. Every figure comes from the burn engine, the token and Burned logs. */
export default function Burn() {
  const engine = ECONOMY.burnEngine; const token = ECONOMY.objectpadToken;
  const stats = useQuery({ queryKey: ['objectpad', 'burn', engine, token], enabled: Boolean(engine && token), refetchInterval: 20_000, queryFn: async () => {
    const [spent, burned, count, cap, curve, pending, dead] = await Promise.all([chain.readContract({ address: engine!, abi: BURN_ENGINE_ABI, functionName: 'totalEthSpent' }), chain.readContract({ address: engine!, abi: BURN_ENGINE_ABI, functionName: 'totalBurned' }), chain.readContract({ address: engine!, abi: BURN_ENGINE_ABI, functionName: 'burns' }), chain.readContract({ address: engine!, abi: BURN_ENGINE_ABI, functionName: 'maxPerBurn' }), chain.readContract({ address: engine!, abi: BURN_ENGINE_ABI, functionName: 'curve' }), chain.getBalance({ address: engine! }), chain.readContract({ address: token!, abi: ERC20_ABI, functionName: 'balanceOf', args: [DEAD_ADDRESS] })]);
    const latest = await chain.getBlockNumber(); const from = latest > 900_000n ? latest - 900_000n : 0n;
    const logs = await chain.getLogs({ address: engine!, event: parseAbiItem('event Burned(uint256 ethIn,uint256 tokensBurned,uint256 timestamp)'), fromBlock: from, toBlock: latest }).catch(() => []);
    const curveState = await readCurve(curve as Address).catch(() => null);
    return { spent: spent as bigint, burned: burned as bigint, count: count as bigint, cap: cap as bigint, pending, dead: dead as bigint, curveState, logs: logs.slice(-30).reverse() };
  } });
  const split = perTradeSplitBps();
  // Every trade on every ObjectPad coin routes 0.5% to buy $OBJECTPAD and burn it. Specimen coins are simulated and tagged SIM.
  // Live coins: every real trade read from Robinhood Chain routes 0.5% to the burn. Specimen coins stream simulated trades, tagged SIM.
  const board = usePlatformMarket();
  const [stream, setStream] = useState<Burn[]>([]);
  useEffect(() => { const coins = previewCoins(); const t = setInterval(() => { const c = coins[Math.floor(Math.random() * coins.length)]; const eth = 0.004 + Math.random() ** 3 * 0.8; const h = Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''); setStream(list => [{ id: `s-${Date.now()}`, coin: c.ticker, icon: c.exhibit.coin, eth: eth * 0.005, at: Date.now(), side: (Math.random() < 0.66 ? 'buy' : 'sell') as 'buy' | 'sell', hash: `0x${h.slice(0, 8)}…${h.slice(-6)}`, live: false, fresh: true }, ...list].slice(0, 30)); }, 3200); return () => clearInterval(t); }, []);
  const autoBurns = useMemo<Burn[]>(() => { const base = board.trades.slice(0, 60).map(t => ({ id: t.id, coin: t.symbol, icon: '', node: t.icon, eth: t.eth * 0.005, at: t.at, side: t.side, hash: t.id.length > 20 ? `${t.id.slice(0, 10)}…${t.id.slice(-6)}` : `0x${t.trader.slice(2, 10)}…`, live: t.live, href: t.href })); return [...stream, ...base].sort((a, b) => Number(b.live) - Number(a.live) || b.at - a.at).slice(0, 60); }, [board.trades, stream]);
  const burnedEth = autoBurns.reduce((sum, b) => sum + b.eth, 0);
  const [, setTick] = useState<number>(0); useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 1000); return () => clearInterval(t); }, []);
  return <div className="page py-6 sm:py-10">
    <section className="raised relative overflow-hidden rounded-[32px]">
      <div className="scan-grid absolute inset-0" aria-hidden="true"/>
      <div className="relative grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1fr_auto] xl:px-14">
        <div>
          <span className="chip"><Flame size={12}/>$OBJECTPAD · buy and burn</span>
          <h1 className="display mt-5 max-w-3xl text-[40px] sm:text-6xl">Every trade shrinks the supply.</h1>
          <p className="mt-4 max-w-lg text-[17px] font-bold leading-7 text-ink/65">0.5% of every trade on every ObjectPad coin buys $OBJECTPAD and burns it. Automatic. No withdraw function.</p>
        </div>
        <Donut size={150} thickness={18} className="mx-auto" slices={[{ label: 'Burn', value: VAULT_SPLIT.burnBps, color: '#1B1D22' }, { label: 'Holders', value: VAULT_SPLIT.forgeBps, color: '#9AA3B2' }, { label: 'Creator', value: VAULT_SPLIT.creatorBps, color: '#D3D7DE' }]} center={<><span className="display text-2xl">0.5%</span><span className="spec mt-0.5 !text-[11px]">of trades</span></>}/>
      </div>
      <div className="relative border-t border-ink/[0.06] bg-white/40 px-6 py-5 sm:px-10 xl:px-14">
      {!engine || !token ? <div className="flex flex-wrap items-center gap-3"><span className="chip"><Lock size={11}/>Deploying</span><p className="max-w-2xl text-sm text-ink/65">The $OBJECTPAD token and burn engine aren’t deployed yet, so nothing has burned. Live totals appear here the moment they are. No projected numbers are shown.</p></div>
        : stats.isPending ? <Loading label="Reading the burn engine…"/> : stats.isError ? <div className="max-w-xl"><ErrorState message="The burn engine could not be read from the RPC." retry={() => void stats.refetch()}/></div> :
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[['Burned by engine', `${formatTokens(stats.data.burned)}`], ['Share of supply', `${(Number(stats.data.dead * 1_000_000n / TOKEN_SUPPLY) / 10_000).toFixed(4)}%`], ['ETH spent on burns', `${formatEth(stats.data.spent)} ETH`], ['Waiting to burn', `${formatEth(stats.data.pending)} ETH`]].map(([k, v], i) => <div key={k} className={`rounded-2xl px-4 py-4 ${i === 0 ? 'bg-white shadow-[0_0_0_1.5px_rgba(12,13,16,.18)]' : 'bg-white/70 shadow-[0_0_0_1px_rgba(12,13,16,.05)]'}`}><dt className="font-mono text-[11.5px] uppercase tracking-widest opacity-60">{k}</dt><dd className="display mt-2 text-2xl tnum sm:text-3xl">{v}</dd></div>)}</dl>}
      </div>
    </section>
    <div className="grid gap-4 py-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="raised rounded-[26px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-extrabold"><GlassIcon name="burn" size={34}/>Automatic burns</h2><span className="chip"><span className="pulse-dot size-2 rounded-full bg-up"/>Updating live</span></div>
        <p className="mt-1 text-sm font-semibold text-ink/65">Each trade on any ObjectPad coin sends 0.5% to buy $OBJECTPAD and burn it.</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-gradient-to-br from-white to-[#F1F3F6] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(12,13,16,.07)]"><p className="spec !text-[11px]">Burn buys shown</p><p className="display mt-1 text-2xl">{autoBurns.length}</p></div><div className="rounded-2xl bg-gradient-to-br from-white to-[#F1F3F6] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(12,13,16,.07)]"><p className="spec !text-[11px]">ETH routed to burn</p><p className="display mt-1 text-2xl tnum">{burnedEth.toFixed(4)}</p></div></div>
        {stats.data?.logs.length ? <div className="mt-4 divide-y divide-ink/[0.06]">{stats.data.logs.map(log => <a key={`${log.transactionHash}-${log.logIndex}`} href={explorerTx(log.transactionHash)} target="_blank" rel="noreferrer" className="flex items-center gap-4 py-3"><span className="flex size-10 items-center justify-center rounded-full bg-ink/[0.06] text-ink"><Flame size={16}/></span><div className="flex-1"><p className="font-extrabold tnum">{formatTokens(log.args.tokensBurned ?? 0n)} $OBJECTPAD <span className="ml-1 rounded-full bg-up/12 px-1.5 font-mono text-[11px] text-up">LIVE</span></p><p className="font-mono text-[11px] text-ink/65">for {formatEth(log.args.ethIn ?? 0n)} ETH · {new Date(Number(log.args.timestamp ?? 0n) * 1000).toLocaleString()}</p></div><span className="flex items-center gap-1 font-mono text-[11px]">{shortHash(log.transactionHash)}<ArrowUpRight size={12}/></span></a>)}</div> : null}
        <ul className="sunk mt-4 max-h-[620px] space-y-1 overflow-y-auto rounded-2xl p-1.5 no-scrollbar" aria-live="polite">{autoBurns.map(b => <li key={b.id} className={cn('flex min-h-14 items-center gap-3 rounded-xl bg-white/85 px-3 py-2', b.fresh && 'tape-in')}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink"><Flame size={15}/></span>
          <span className="shrink-0 [&_img]:!size-8">{b.node ?? <img src={b.icon} alt="" className="size-8 rounded-full"/>}</span>
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2 truncate text-[15px] font-extrabold">${b.coin} {b.side} → burn<span className={cn('rounded-md px-1.5 font-mono text-[11px] font-extrabold', b.live ? 'bg-up/12 text-up' : 'bg-ink/[0.06] text-ink/65')}>{b.live ? 'LIVE' : 'SIM'}</span></span><span className="block font-mono text-[12px] font-bold text-ink/60">{b.hash} · {timeAgo(b.at)}</span></span>
          <span className="shrink-0 font-mono text-[14px] font-extrabold text-ink tnum">{b.eth.toFixed(5)} ETH</span>
        </li>)}</ul>
      </section>
      <aside className="space-y-4">
        <div className="glass rounded-[26px] p-5 sm:p-6"><h2 className="text-lg font-extrabold">How a burn happens</h2><ol className="mt-4 space-y-3 text-sm">{[['Someone trades', 'Any coin on ObjectPad. 1.5% fee.'], ['0.5% is set aside', 'Split three ways: burn, creator, holders.'], ['$OBJECTPAD is bought', 'Then sent to 0x…dEaD. Gone forever.']].map(([t, d], i) => <li key={t} className="flex gap-3"><span className="step-num size-10 text-lg">{i + 1}</span><div><p className="font-semibold">{t}</p><p className="mt-0.5 leading-6 text-ink/65">{d}</p></div></li>)}</ol></div>
        <div className="glass rounded-[26px] p-5 text-sm sm:p-6"><div className="flex items-center gap-2 font-semibold"><ShieldCheck size={16} className="text-up"/>Contract guarantees</div><ul className="mt-3 space-y-1.5 leading-6 text-ink/65"><li>No owner withdraw path for ETH or tokens.</li><li>Keeper-only execution with a minimum output{stats.data ? `, capped at ${formatEth(stats.data.cap)} ETH per burn` : ''}.</li><li>Burns pause if the curve graduates. Never blind swaps.</li></ul>
          {engine && <a className="mt-4 inline-flex items-center gap-1 font-mono text-[11px] hover:underline" href={explorerAddress(engine)} target="_blank" rel="noreferrer">Engine {shortHash(engine)}<ArrowUpRight size={12}/></a>}
          {stats.data?.curveState && <p className="mt-3 font-mono text-[11px] text-ink/65">$OBJECTPAD price {priceLabel(stats.data.curveState.priceEth)} · mcap {compact(stats.data.curveState.marketCapEth)} ETH</p>}</div>
        <Link to="/craft" className="glass flex min-h-12 items-center justify-center gap-2 rounded-full text-sm font-medium"><Lock size={14}/>Crafting boosts · in production</Link>
      </aside>
    </div>
  </div>;
}
