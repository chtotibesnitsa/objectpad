import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { encodeFunctionData, formatEther, type Address, type Hex } from 'viem';
import { ArrowDown, ArrowUpRight, Wallet } from 'lucide-react';
import { useSession } from '@/lib/session';
import { chain, ensureAllowance, formatEth, formatTokens, parseAmount, prepareTx, quoteBuy, quoteSell, waitForReceipt, withSlippage, type CurveState } from '@/lib/chain';
import { usePreferences } from '@/hooks/use-preferences';
import { CURVE_ABI, ERC20_ABI, explorerTx } from '@/shared/pons';
import { cn } from '@/lib/utils';
import { buyPairedWithEth, isEthPair, quotePairedBuy, usePair, usePairs } from '@/lib/pairs';
import { PairLogo } from './PairBadge';
import { formatUnits } from 'viem';

const SLIPPAGES = [100, 300, 500] as const;
const PERCENTS = [25, 50, 75, 100] as const;
const GAS_RESERVE = 3n * 10n ** 15n;

/** Buy/Sell switch with solid, high-contrast states (green buy, red sell). */
export function SideSwitch({ side, onChange }: { side: 'buy' | 'sell'; onChange: (side: 'buy' | 'sell') => void }) {
  return <div className="grid grid-cols-2 gap-1 rounded-[18px] bg-ink/[0.07] p-1" role="tablist" aria-label="Trade direction">{(['buy', 'sell'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={side === value} onClick={() => onChange(value)} className={cn('min-h-12 rounded-[14px] text-[15px] font-extrabold capitalize transition-all', side === value ? (value === 'buy' ? 'bg-up text-white shadow-[0_6px_16px_-8px_rgba(18,161,80,.8)]' : 'bg-down text-white shadow-[0_6px_16px_-8px_rgba(229,72,77,.8)]') : 'text-ink/60 hover:text-ink')}>{value}</button>)}</div>;
}

/** 25 / 50 / 75 / Max of the wallet balance, like any exchange. */
export function PercentRow({ onPick, disabled, active }: { onPick: (percent: number) => void; disabled?: boolean; active?: number | null }) {
  return <div className="mt-2.5 grid grid-cols-4 gap-1.5">{PERCENTS.map(p => <button key={p} type="button" disabled={disabled} onClick={() => onPick(p)} className={cn('min-h-10 rounded-xl text-[13.5px] font-extrabold transition-colors disabled:opacity-40', active === p ? 'bg-ink text-white' : 'bg-ink/[0.07] text-ink hover:bg-ink/[0.12]')}>{p === 100 ? 'Max' : `${p}%`}</button>)}</div>;
}

/** Wallet-signed buys and sells directly against the object's bonding curve. ObjectPad never holds funds. */
export function TradePanel({ token, curve, symbol, state, pairToken }: { token: Address; curve: Address; symbol: string; state: CurveState | undefined; pairToken?: string | null }) {
  if (!isEthPair(pairToken)) return <PairedTradePanel token={token} curve={curve} symbol={symbol} state={state} pairToken={pairToken as string}/>;
  return <EthTradePanel token={token} curve={curve} symbol={symbol} state={state}/>;
}

/**
 * Buy a stock-paired coin with ETH: ETH → pair asset on Uniswap V3 (Robinhood Chain), then the curve buy. Every leg is quoted
 * on-chain first. Selling returns the pair asset (e.g. NVDA) to the wallet.
 */
function PairedTradePanel({ token, curve, symbol, state, pairToken }: { token: Address; curve: Address; symbol: string; state: CurveState | undefined; pairToken: string }) {
  const auth = useSession(); const qc = useQueryClient(); const { play } = usePreferences(); const pair = usePair(pairToken); const board = usePairs();
  const [side, setSide] = useState<'buy' | 'sell'>('buy'); const [amount, setAmount] = useState<string>(''); const [slippage, setSlippage] = useState<number>(300); const [lastHash, setLastHash] = useState<Hex | null>(null); const [step, setStep] = useState<number>(0);
  const units = parseAmount(amount); const sym = pair?.symbol ?? 'asset'; const dec = pair?.decimals ?? 18;
  const balances = useQuery({ queryKey: ['objectpad', 'balances', token, auth.wallet, pairToken], enabled: Boolean(auth.wallet), queryFn: async () => { const owner = auth.wallet!; const [eth, tokens, asset] = await Promise.all([chain.getBalance({ address: owner }), chain.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] }), chain.readContract({ address: pairToken as Address, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] })]); return { eth, tokens, asset }; }, refetchInterval: 20_000 });
  const quote = useQuery({ queryKey: ['objectpad', 'pquote', curve, side, units?.toString(), auth.wallet], enabled: Boolean(units && pair && !state?.graduated && (side === 'buy' || auth.wallet)), queryFn: async () => side === 'buy' ? (await quotePairedBuy(pair!, curve, units!, board.data?.router.quoter)).tokensOut : quoteSell(curve, auth.wallet!, units!), retry: false, staleTime: 8_000 });
  const trade = useMutation({ mutationFn: async () => {
    if (!auth.wallet || !units || !pair) throw new Error('Connect a wallet and enter an amount.');
    if (side === 'buy') return buyPairedWithEth({ wallet: auth.wallet, pair, curve, ethIn: units, slippageBps: slippage, send: auth.send, router: board.data?.router.swapRouter, quoter: board.data?.router.quoter, onStep: (s, h) => { setStep(s); if (h) setLastHash(h); } });
    const expected = await quoteSell(curve, auth.wallet, units); const minimum = withSlippage(expected, slippage); if (minimum <= 0n) throw new Error('The curve would return nothing for this amount.');
    await ensureAllowance(auth.wallet, token, curve, units, auth.send);
    const hash = await auth.send(await prepareTx(auth.wallet, { to: curve, data: encodeFunctionData({ abi: CURVE_ABI, functionName: 'sell', args: [units, minimum, auth.wallet] }) })); setLastHash(hash); await waitForReceipt(hash); return hash;
  }, onSettled: () => setStep(0), onSuccess: () => { play('launch'); setAmount(''); void qc.invalidateQueries({ queryKey: ['objectpad', 'balances', token] }); void qc.invalidateQueries({ queryKey: ['objectpad', 'curve', curve] }); void qc.invalidateQueries({ queryKey: ['objectpad', 'trades', curve] }); } });
  const balance = side === 'buy' ? balances.data?.eth : balances.data?.tokens; const insufficient = Boolean(units && balance !== undefined && units > balance);
  const received = !units ? '—' : quote.isFetching ? 'Quoting…' : quote.isError ? 'No route right now' : quote.data !== undefined ? (side === 'buy' ? `${formatTokens(quote.data)} $${symbol}` : `${Number(formatUnits(quote.data, dec)).toLocaleString('en', { maximumFractionDigits: 6 })} ${sym}`) : '—';
  const steps = [`Swap ETH → ${sym}`, `Approve ${sym}`, `Buy $${symbol}`];
  return <div>
    <div className="mb-3 flex items-center gap-2 rounded-2xl bg-[#FFF8E6] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(217,165,33,.45)]"><PairLogo src={pair?.logo} symbol={sym} size={26}/><span className="min-w-0 flex-1 text-[13px] font-extrabold">Paired with {sym}<span className="block text-[11.5px] font-semibold text-ink/60">Pay with ETH · routed on-chain into {sym}</span></span>{balances.data && <span className="font-mono text-[11px] font-bold text-ink/60">{Number(formatUnits(balances.data.asset, dec)).toLocaleString('en', { maximumFractionDigits: 4 })} {sym}</span>}</div>
    <SideSwitch side={side} onChange={v => { setSide(v); setAmount(''); }}/>
    {state?.graduated ? <p className="mt-4 rounded-2xl bg-ink/[0.06] p-4 text-[15px] font-bold text-ink/75">This coin graduated off its curve. Curve trades are closed.</p> : <>
      <div className="mt-4 rounded-[18px] border-2 border-ink/10 bg-white p-4 focus-within:border-ink">
        <div className="flex items-center justify-between text-[13px] font-extrabold text-ink/70"><span>{side === 'buy' ? 'You pay' : 'You sell'}</span><span className="flex items-center gap-1"><Wallet size={13}/>{balance === undefined ? '—' : side === 'buy' ? `${formatEth(balance)} ETH` : `${formatTokens(balance)} $${symbol}`}</span></div>
        <div className="mt-1 flex items-center gap-2"><input inputMode="decimal" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0" className="min-w-0 flex-1 bg-transparent text-[28px] font-extrabold text-ink outline-none tnum placeholder:text-ink/25" aria-label="Amount"/><span className="rounded-full bg-ink px-3 py-1.5 text-[14px] font-extrabold text-white">{side === 'buy' ? 'ETH' : `$${symbol}`}</span></div>
      </div>
      <div className="-my-1 flex justify-center"><span className="relative z-10 mt-2.5 flex size-9 items-center justify-center rounded-full bg-ink text-white"><ArrowDown size={16}/></span></div>
      <div className="rounded-[18px] bg-ink/[0.06] p-4"><p className="text-[13px] font-extrabold text-ink/70">You receive</p><p className="mt-1 text-[22px] font-extrabold text-ink tnum">{received}</p></div>
      <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[13px] font-extrabold text-ink/70">Slippage</span><div className="flex gap-1">{SLIPPAGES.map(value => <button key={value} type="button" onClick={() => setSlippage(value)} aria-pressed={slippage === value} className={cn('min-h-9 rounded-lg px-3 text-[13px] font-extrabold', slippage === value ? 'bg-ink text-white' : 'bg-ink/[0.07] text-ink')}>{value / 100}%</button>)}</div></div>
      {trade.isPending && side === 'buy' && <ol className="mt-3 grid grid-cols-3 gap-1">{steps.map((s, i) => <li key={s} className={cn('rounded-xl px-2 py-2 text-center text-[11.5px] font-extrabold', step > i + 1 ? 'bg-up/15 text-up' : step === i + 1 ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink/55')}>{s}</li>)}</ol>}
      {!auth.configured ? <p className="mt-4 rounded-2xl bg-ink/[0.06] p-4 text-[14px] font-bold text-ink/70">Trading sign-in isn’t switched on yet.</p>
        : !auth.authenticated ? <button type="button" className="press mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-ink text-[16px] font-extrabold text-white" onClick={() => auth.login()}><Wallet size={18}/>Connect to trade</button>
        : <button type="button" className={cn('press mt-4 flex min-h-14 w-full items-center justify-center rounded-[18px] text-[16px] font-extrabold text-white disabled:opacity-40', side === 'buy' ? 'bg-up' : 'bg-down')} disabled={!units || insufficient || trade.isPending || quote.isError || !pair} onClick={() => trade.mutate()}>{trade.isPending ? 'Confirm in wallet…' : insufficient ? 'Not enough balance' : side === 'buy' ? `Buy $${symbol} with ETH` : `Sell $${symbol} for ${sym}`}</button>}
      <p className="mt-3 text-[12.5px] font-semibold leading-5 text-ink/60">Buys take up to 3 wallet confirmations: swap, approve, buy. Sells pay out in {sym}.</p>
    </>}
    {trade.isError && <p role="alert" className="mt-3 text-[14px] font-bold text-down">{trade.error.message.split('\n')[0]}</p>}
    {lastHash && <a href={explorerTx(lastHash)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 text-[13px] font-extrabold text-ink underline">{trade.isSuccess ? 'Confirmed' : 'Submitted'} · view receipt<ArrowUpRight size={13}/></a>}
  </div>;
}

function EthTradePanel({ token, curve, symbol, state }: { token: Address; curve: Address; symbol: string; state: CurveState | undefined }) {
  const auth = useSession(); const qc = useQueryClient(); const { play } = usePreferences();
  const [side, setSide] = useState<'buy' | 'sell'>('buy'); const [amount, setAmount] = useState<string>(''); const [slippage, setSlippage] = useState<number>(300); const [lastHash, setLastHash] = useState<Hex | null>(null); const [picked, setPicked] = useState<number | null>(null);
  const units = parseAmount(amount);
  const balances = useQuery({ queryKey: ['objectpad', 'balances', token, auth.wallet], enabled: Boolean(auth.wallet), queryFn: async () => { const owner = auth.wallet!; const [eth, tokens] = await Promise.all([chain.getBalance({ address: owner }), chain.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner] })]); return { eth, tokens }; }, refetchInterval: 20_000 });
  const quote = useQuery({ queryKey: ['objectpad', 'quote', curve, side, units?.toString(), auth.wallet], enabled: Boolean(units && !state?.graduated && (side === 'buy' || auth.wallet)), queryFn: () => side === 'buy' ? quoteBuy(curve, units!) : quoteSell(curve, auth.wallet!, units!), retry: false, staleTime: 8_000 });
  const trade = useMutation({ mutationFn: async () => {
    if (!auth.wallet || !units) throw new Error('Connect a wallet and enter an amount.');
    const expected = side === 'buy' ? await quoteBuy(curve, units) : await quoteSell(curve, auth.wallet, units); const minimum = withSlippage(expected, slippage);
    if (minimum <= 0n) throw new Error('The curve would return nothing for this amount.');
    if (side === 'sell') await ensureAllowance(auth.wallet, token, curve, units, auth.send);
    const data = encodeFunctionData({ abi: CURVE_ABI, functionName: side, args: [units, minimum, auth.wallet] });
    const hash = await auth.send(await prepareTx(auth.wallet, { to: curve, data, value: side === 'buy' ? units : 0n }));
    setLastHash(hash); await waitForReceipt(hash); return hash;
  }, onSuccess: () => { play('launch'); setAmount(''); setPicked(null); void qc.invalidateQueries({ queryKey: ['objectpad', 'balances', token] }); void qc.invalidateQueries({ queryKey: ['objectpad', 'curve', curve] }); void qc.invalidateQueries({ queryKey: ['objectpad', 'trades', curve] }); } });
  const balance = side === 'buy' ? balances.data?.eth : balances.data?.tokens;
  const spendable = balance === undefined ? undefined : side === 'buy' ? (balance > GAS_RESERVE ? balance - GAS_RESERVE : 0n) : balance;
  const insufficient = Boolean(units && balance !== undefined && units > balance);
  const pick = (p: number) => { if (spendable === undefined) return; setPicked(p); setAmount(formatEther((spendable * BigInt(p)) / 100n)); };
  const received = !units ? '—' : quote.isFetching ? 'Quoting…' : quote.isError ? 'Unavailable' : quote.data !== undefined ? (side === 'buy' ? `${formatTokens(quote.data)} $${symbol}` : `${formatEth(quote.data)} ETH`) : side === 'sell' && !auth.wallet ? 'Connect to quote' : '—';
  return <div>
    <SideSwitch side={side} onChange={v => { setSide(v); setAmount(''); setPicked(null); }}/>
    {state?.graduated ? <p className="mt-4 rounded-2xl bg-ink/[0.06] p-4 text-[15px] font-bold text-ink/75">This coin graduated off its curve. Curve trades are closed.</p> : <>
      <div className="mt-4 rounded-[18px] border-2 border-ink/10 bg-white p-4 focus-within:border-ink">
        <div className="flex items-center justify-between text-[13px] font-extrabold text-ink/70"><span>{side === 'buy' ? 'You pay' : 'You sell'}</span><span className="flex items-center gap-1"><Wallet size={13}/>{balance === undefined ? '—' : side === 'buy' ? `${formatEth(balance)} ETH` : `${formatTokens(balance)} $${symbol}`}</span></div>
        <div className="mt-1 flex items-center gap-2"><input inputMode="decimal" autoComplete="off" value={amount} onChange={event => { setAmount(event.target.value); setPicked(null); }} placeholder="0.0" className="min-w-0 flex-1 bg-transparent text-[28px] font-extrabold text-ink outline-none tnum placeholder:text-ink/25" aria-invalid={insufficient} aria-label="Amount"/><span className="rounded-full bg-ink px-3 py-1.5 text-[14px] font-extrabold text-white">{side === 'buy' ? 'ETH' : `$${symbol}`}</span></div>
      </div>
      <PercentRow onPick={pick} disabled={spendable === undefined} active={picked}/>
      <div className="-my-1 flex justify-center"><span className="relative z-10 mt-2.5 flex size-9 items-center justify-center rounded-full bg-ink text-white"><ArrowDown size={16}/></span></div>
      <div className="rounded-[18px] bg-ink/[0.06] p-4"><p className="text-[13px] font-extrabold text-ink/70">You receive</p><p className="mt-1 text-[22px] font-extrabold text-ink tnum">{received}</p>{quote.data !== undefined && <p className="mt-1 text-[13px] font-bold text-ink/60">Min. after {slippage / 100}% slippage: {side === 'buy' ? formatTokens(withSlippage(quote.data, slippage)) : formatEth(withSlippage(quote.data, slippage))}</p>}</div>
      <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[13px] font-extrabold text-ink/70">Slippage</span><div className="flex gap-1">{SLIPPAGES.map(value => <button key={value} type="button" onClick={() => setSlippage(value)} aria-pressed={slippage === value} className={cn('min-h-9 rounded-lg px-3 text-[13px] font-extrabold', slippage === value ? 'bg-ink text-white' : 'bg-ink/[0.07] text-ink')}>{value / 100}%</button>)}</div></div>
      {!auth.configured ? <p className="mt-4 rounded-2xl bg-ink/[0.06] p-4 text-[14px] font-bold text-ink/70">Trading sign-in isn’t switched on yet.</p>
        : !auth.authenticated ? <button type="button" className="press mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-ink text-[16px] font-extrabold text-white" onClick={() => auth.login()}><Wallet size={18}/>Connect to trade</button>
        : !auth.wallet ? <p className="mt-4 text-[14px] font-bold text-ink/70">Connect a wallet in your account to trade.</p>
        : <button type="button" className={cn('press mt-4 flex min-h-14 w-full items-center justify-center rounded-[18px] text-[16px] font-extrabold text-white disabled:opacity-40', side === 'buy' ? 'bg-up' : 'bg-down')} disabled={!units || insufficient || trade.isPending || quote.isError} onClick={() => trade.mutate()}>{trade.isPending ? 'Confirm in wallet…' : insufficient ? 'Not enough balance' : side === 'buy' ? `Buy $${symbol}` : `Sell $${symbol}`}</button>}
      <p className="mt-3 text-[12.5px] font-semibold leading-5 text-ink/60">Each trade: 0.5% burns $OBJECTPAD · 0.5% creator · 0.5% long-term holders.</p>
    </>}
    {trade.isError && <p role="alert" className="mt-3 text-[14px] font-bold text-down">{trade.error.message.split('\n')[0]}</p>}
    {lastHash && <a href={explorerTx(lastHash)} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 text-[13px] font-extrabold text-ink underline">{trade.isSuccess ? 'Confirmed' : 'Submitted'} · view receipt<ArrowUpRight size={13}/></a>}
  </div>;
}
