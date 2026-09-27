import { useQuery } from '@tanstack/react-query';
import { concatHex, decodeFunctionResult, encodeFunctionData, formatUnits, numberToHex, parseAbi, type Address, type Hex } from 'viem';
import { api } from './api';
import { chain, ensureAllowance, prepareTx, waitForReceipt, withSlippage, type PreparedTx } from './chain';
import { CURVE_ABI, ERC20_ABI } from '@/shared/pons';
import { ETH_PAIR, isEthPair, pairAsset, type PairKind } from '@/shared/pairs';

/** One Pons V2 quote asset with its live on-chain price (from the ObjectPad API, read from Uniswap V3 pools). */
export interface PairQuote { address: string; symbol: string; name: string; kind: PairKind; decimals: number; sector?: string; logo: string; approved: boolean; priceEth: number | null; priceUsd: number | null; change24h: number | null; pool: { address: string; fee: number } | null; coins: number; route: { tokens: string[]; fees: number[] } | null; }
export interface PairBoard { updatedAt: number; ethUsd: number | null; assets: PairQuote[]; router: { swapRouter: string; quoter: string; weth: string; factory: string }; }

export const PAIR_KINDS: { id: 'all' | PairKind | 'popular'; label: string }[] = [
  { id: 'popular', label: 'Popular' }, { id: 'stock', label: 'Stocks' }, { id: 'etf', label: 'ETFs' }, { id: 'commodity', label: 'Commodities' }, { id: 'crypto', label: 'Crypto' }, { id: 'stable', label: 'Stable' }, { id: 'community', label: 'Community' }, { id: 'all', label: 'All' },
];
/** Tickers people reach for first; shown under "Popular" in every picker. */
export const POPULAR = ['ETH', 'NVDA', 'TSLA', 'AAPL', 'SPCX', 'GME', 'COIN', 'MSTR', 'PLTR', 'SPY', 'QQQ', 'GLD', 'AMZN', 'META', 'GOOGL', 'RBLX', 'NFLX', 'USDG', 'cbBTC'];

/** Live pair board: every approved asset, prices refreshed every 30s. */
export function usePairs() {
  return useQuery({ queryKey: ['objectpad', 'pairs'], queryFn: ({ signal }) => api<PairBoard>('/pairs', { signal, timeout: 30_000 }), refetchInterval: 30_000, staleTime: 20_000, retry: 2 });
}
/** The live quote for one pair address (null = ETH or unknown). */
export function usePair(address: string | null | undefined): PairQuote | null {
  const board = usePairs(); if (isEthPair(address)) return board.data?.assets.find(a => a.kind === 'native') ?? null;
  return board.data?.assets.find(a => a.address.toLowerCase() === address?.toLowerCase()) ?? null;
}
export const pairLabel = (address: string | null | undefined): string => isEthPair(address) ? 'ETH' : pairAsset(address)?.symbol ?? 'ETH';
export { ETH_PAIR, isEthPair, pairAsset };

const ROUTER_ABI = parseAbi([
  'function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)',
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) payable',
]);
const QUOTER_ABI = parseAbi(['function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)']);
const CURVE_FEES_ABI = parseAbi(['function feeBps() view returns (uint256)', 'function creatorTaxBps() view returns (uint256)', 'function quoteReserve() view returns (uint256)', 'function tokenReserve() view returns (uint256)', 'function phantomQuote() view returns (uint256)']);
const ROUTER_FALLBACK = { swapRouter: '0xcaf681a66d020601342297493863e78c959e5cb2', quoter: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7', weth: '0x0bd7d308f8e1639fab988df18a8011f41eacad73' };

/** Uniswap V3 path bytes: token(20) | fee(3) | token(20) | … */
export function encodePath(tokens: string[], fees: number[]): Hex {
  const parts: Hex[] = []; tokens.forEach((t, i) => { parts.push(t.toLowerCase() as Hex); if (i < fees.length) parts.push(numberToHex(fees[i], { size: 3 })); });
  return concatHex(parts);
}
/** Exact Uniswap V3 output for a path (simulated through QuoterV2, nothing is estimated off-chain). */
export async function quotePath(tokens: string[], fees: number[], amountIn: bigint, quoter = ROUTER_FALLBACK.quoter): Promise<bigint> {
  const data = encodeFunctionData({ abi: QUOTER_ABI, functionName: 'quoteExactInput', args: [encodePath(tokens, fees), amountIn] });
  const result = await chain.call({ to: quoter as Address, data }); if (!result.data) throw new Error('No swap quote available.');
  return decodeFunctionResult({ abi: QUOTER_ABI, functionName: 'quoteExactInput', data: result.data })[0];
}
/** Coin tokens a curve returns for `quoteIn` of its quote asset (Pons V2 constant-product math, after fee and creator tax). */
export async function quoteCurveBuy(curve: Address, quoteIn: bigint): Promise<bigint> {
  const [feeBps, taxBps, qr, tr, phantom] = await chain.multicall({ allowFailure: false, contracts: (['feeBps', 'creatorTaxBps', 'quoteReserve', 'tokenReserve', 'phantomQuote'] as const).map(functionName => ({ address: curve, abi: CURVE_FEES_ABI, functionName })) }) as [bigint, bigint, bigint, bigint, bigint];
  const virtual = qr >= phantom ? qr : qr + phantom; const net = quoteIn - (quoteIn * feeBps) / 10_000n - (quoteIn * taxBps) / 10_000n;
  return net > 0n ? (net * tr) / (virtual + net) : 0n;
}

export interface PairedBuyQuote { stockOut: bigint; tokensOut: bigint; }
/** ETH → stock (Uniswap V3) → coin (Pons curve) quote for a stock-paired coin. */
export async function quotePairedBuy(pair: PairQuote, curve: Address, ethIn: bigint, quoter?: string): Promise<PairedBuyQuote> {
  if (!pair.route) throw new Error(`No on-chain ETH route to ${pair.symbol} right now.`);
  const stockOut = await quotePath(pair.route.tokens, pair.route.fees, ethIn, quoter);
  return { stockOut, tokensOut: await quoteCurveBuy(curve, stockOut) };
}

type Send = (tx: PreparedTx) => Promise<Hex>;
/**
 * Pay with ETH for a stock-paired coin, in three wallet steps: (1) swap ETH to the pair asset on Uniswap V3 straight into the
 * buyer's wallet, (2) approve the curve for exactly what arrived, (3) buy on the curve. Every step is simulated before sending.
 */
export async function buyPairedWithEth(opts: { wallet: Address; pair: PairQuote; curve: Address; ethIn: bigint; slippageBps: number; send: Send; router?: string; onStep?: (step: 1 | 2 | 3, hash?: Hex) => void; quoter?: string }): Promise<Hex> {
  const { wallet, pair, curve, ethIn, slippageBps, send, onStep } = opts; const router = (opts.router ?? ROUTER_FALLBACK.swapRouter) as Address;
  if (!pair.route) throw new Error(`No on-chain ETH route to ${pair.symbol} right now.`);
  const stock = pair.address as Address; const quoted = await quotePath(pair.route.tokens, pair.route.fees, ethIn, opts.quoter);
  const before = await chain.readContract({ address: stock, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet] });
  const swap = encodeFunctionData({ abi: ROUTER_ABI, functionName: 'exactInput', args: [{ path: encodePath(pair.route.tokens, pair.route.fees), recipient: wallet, amountIn: ethIn, amountOutMinimum: withSlippage(quoted, slippageBps) }] });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  onStep?.(1); const swapHash = await send(await prepareTx(wallet, { to: router, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'multicall', args: [deadline, [swap]] }), value: ethIn })); await waitForReceipt(swapHash); onStep?.(1, swapHash);
  const after = await chain.readContract({ address: stock, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet] }); const received = after - before;
  if (received <= 0n) throw new Error(`The swap to ${pair.symbol} returned nothing.`);
  try { return await buyPairedWithAsset({ wallet, pair, curve, amount: received, slippageBps, send, onStep }); }
  catch (error) {
    const why = (error instanceof Error ? error.message : '').split('\n')[0];
    throw new Error(`Your ETH was swapped into ${formatUnits(received, pair.decimals).slice(0, 10)} ${pair.symbol}, which is safe in your wallet. The coin buy didn’t finish${why ? ` (${why.slice(0, 80)})` : ''}. Use “Finish buy” or “Swap back to ETH” above.`);
  }
}

/** Pair-asset (e.g. AAPL) → ETH on Uniswap V3 using the reverse of the buy route; ETH is unwrapped straight to the wallet. */
export async function quoteAssetToEth(pair: PairQuote, amount: bigint, quoter?: string): Promise<bigint> {
  if (!pair.route) throw new Error(`No on-chain route from ${pair.symbol} right now.`);
  return quotePath([...pair.route.tokens].reverse(), [...pair.route.fees].reverse(), amount, quoter);
}
export async function sellAssetForEth(opts: { wallet: Address; pair: PairQuote; amount: bigint; slippageBps: number; send: Send; router?: string; quoter?: string }): Promise<Hex> {
  const { wallet, pair, amount, slippageBps, send } = opts; const router = (opts.router ?? ROUTER_FALLBACK.swapRouter) as Address;
  if (!pair.route) throw new Error(`No on-chain route from ${pair.symbol} right now.`);
  const tokens = [...pair.route.tokens].reverse(); const fees = [...pair.route.fees].reverse();
  const quoted = await quotePath(tokens, fees, amount, opts.quoter); const minimum = withSlippage(quoted, slippageBps); if (minimum <= 0n) throw new Error('The pool would return nothing for this amount.');
  await ensureAllowance(wallet, pair.address as Address, router, amount, send);
  const swap = encodeFunctionData({ abi: ROUTER_ABI, functionName: 'exactInput', args: [{ path: encodePath(tokens, fees), recipient: ROUTER_SELF, amountIn: amount, amountOutMinimum: minimum }] });
  const unwrap = encodeFunctionData({ abi: ROUTER_ABI, functionName: 'unwrapWETH9', args: [minimum, wallet] });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
  const hash = await send(await prepareTx(wallet, { to: router, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'multicall', args: [deadline, [swap, unwrap]] }) }));
  await waitForReceipt(hash); return hash;
}
/** SwapRouter02 sentinel: recipient 2 = keep output in the router so unwrapWETH9 can pay out native ETH. */
const ROUTER_SELF: Address = '0x0000000000000000000000000000000000000002';
/** Buy a stock-paired coin with the pair asset the buyer already holds (approve exactly, then curve.buy). */
export async function buyPairedWithAsset(opts: { wallet: Address; pair: PairQuote; curve: Address; amount: bigint; slippageBps: number; send: Send; onStep?: (step: 1 | 2 | 3, hash?: Hex) => void }): Promise<Hex> {
  const { wallet, pair, curve, amount, slippageBps, send, onStep } = opts; const stock = pair.address as Address;
  onStep?.(2); await ensureAllowance(wallet, stock, curve, amount, send);
  const expected = await quoteCurveBuy(curve, amount); const minimum = withSlippage(expected, slippageBps); if (minimum <= 0n) throw new Error('The curve would return nothing for this amount.');
  onStep?.(3); const hash = await send(await prepareTx(wallet, { to: curve, data: encodeFunctionData({ abi: CURVE_ABI, functionName: 'buy', args: [amount, minimum, wallet] }) }));
  await waitForReceipt(hash); onStep?.(3, hash); return hash;
}
