import { createPublicClient, decodeAbiParameters, encodeFunctionData, formatEther, formatUnits, http, parseAbi, parseAbiItem, toEventSelector, type Address, type Hex } from 'viem';
import { CURVE_ABI, ERC20_ABI, robinhoodChain } from '@/shared/pons';
import { DEAD_ADDRESS, type EconomyConfig } from '@/shared/economy';
import { validAddress } from '@/shared/security';

/** Read-only chain client for the browser. Every value shown in the UI comes from here or the ObjectPad API. */
export const chain = createPublicClient({ chain: robinhoodChain, transport: http(undefined, { batch: true, retryCount: 1, timeout: 12_000 }) });

/** Static env reads only: a dynamic import.meta.env[key] would inline every public variable into the bundle. */
const env = (raw: string | undefined): Address | null => { const value = raw?.trim(); return validAddress(value) ? value as Address : null; };
/** Contract addresses are configured at build time. Missing addresses keep the matching feature operator-blocked. */
export const ECONOMY: EconomyConfig = { forge: env(import.meta.env.VITE_OBJECTPAD_FORGE_ADDRESS as string | undefined), burnEngine: env(import.meta.env.VITE_OBJECTPAD_BURN_ENGINE_ADDRESS as string | undefined), objectpadToken: env(import.meta.env.VITE_OBJECTPAD_TOKEN_ADDRESS as string | undefined), vaultFactory: env(import.meta.env.VITE_OBJECTPAD_VAULT_FACTORY_ADDRESS as string | undefined), registry: env(import.meta.env.VITE_OBJECTPAD_REGISTRY_ADDRESS as string | undefined) };

const CURVE_STATE_ABI = parseAbi(['function quoteReserve() view returns (uint256)', 'function tokenReserve() view returns (uint256)', 'function phantomQuote() view returns (uint256)', 'function graduationThreshold() view returns (uint256)', 'function graduated() view returns (bool)', 'function creatorTaxBps() view returns (uint256)']);
export interface CurveState { quoteReserve: bigint; tokenReserve: bigint; phantomQuote: bigint; graduationThreshold: bigint; graduated: boolean; creatorTaxBps: number; priceEth: number; marketCapEth: number; realReserveEth: number; progress: number; }

/**
 * Pons reports quoteReserve with the phantom seed folded in on current curves; older curves report the bare reserve.
 * Adding the phantom twice doubles price, so the virtual reserve is chosen by comparison (same rule the source app fixed).
 */
export function virtualQuote(quoteReserve: bigint, phantomQuote: bigint): bigint { return quoteReserve >= phantomQuote ? quoteReserve : quoteReserve + phantomQuote; }

export async function readCurve(curve: Address): Promise<CurveState> {
  const calls = (['quoteReserve', 'tokenReserve', 'phantomQuote', 'graduationThreshold', 'graduated', 'creatorTaxBps'] as const).map(functionName => ({ address: curve, abi: CURVE_STATE_ABI, functionName }));
  const [quoteReserve, tokenReserve, phantomQuote, graduationThreshold, graduated, creatorTaxBps] = await chain.multicall({ contracts: calls, allowFailure: false }) as [bigint, bigint, bigint, bigint, boolean, bigint];
  const virtual = virtualQuote(quoteReserve, phantomQuote); const real = virtual > phantomQuote ? virtual - phantomQuote : 0n;
  const priceEth = tokenReserve > 0n ? Number(formatEther(virtual)) / Number(formatEther(tokenReserve)) : 0;
  return { quoteReserve, tokenReserve, phantomQuote, graduationThreshold, graduated, creatorTaxBps: Number(creatorTaxBps), priceEth, marketCapEth: priceEth * 1_000_000_000, realReserveEth: Number(formatEther(real)), progress: graduated ? 1 : graduationThreshold > 0n ? Math.min(1, Number(real * 10_000n / graduationThreshold) / 10_000) : 0 };
}

const QUOTE_ACCOUNT: Address = '0x1111111111111111111111111111111111111111';
/** Exact buy output from the curve itself, simulated with a funded throwaway account (no user funds implied). */
export async function quoteBuy(curve: Address, quoteIn: bigint): Promise<bigint> {
  const result = await chain.call({ to: curve, account: QUOTE_ACCOUNT, value: quoteIn, data: encodeFunctionData({ abi: CURVE_ABI, functionName: 'buy', args: [quoteIn, 0n, QUOTE_ACCOUNT] }), stateOverride: [{ address: QUOTE_ACCOUNT, balance: quoteIn * 2n + 10n ** 18n }] });
  if (!result.data) throw new Error('The curve returned no quote.');
  return decodeAbiParameters([{ type: 'uint256' }], result.data)[0];
}
/**
 * Exact sell output from the seller's own balance. A first sell has no allowance yet, so a bare eth_call reverts;
 * in that case the approve + sell pair is simulated together (eth_simulateV1), exactly as the wallet will send it.
 */
export async function quoteSell(curve: Address, seller: Address, tokensIn: bigint, token?: Address): Promise<bigint> {
  const sell = encodeFunctionData({ abi: CURVE_ABI, functionName: 'sell', args: [tokensIn, 0n, seller] });
  try {
    const result = await chain.call({ to: curve, account: seller, data: sell });
    if (result.data) return decodeAbiParameters([{ type: 'uint256' }], result.data)[0];
  } catch (error) { if (!token) throw error; }
  const coin = token ?? await chain.readContract({ address: curve, abi: CURVE_TOKEN_ABI, functionName: 'token' });
  const sim = await chain.simulateCalls({ account: seller, calls: [{ to: coin, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [curve, tokensIn] }) }, { to: curve, data: sell }] });
  const out = sim.results[1];
  if (out?.status !== 'success' || !out.data || out.data === '0x') throw new Error('The curve returned no quote.');
  return decodeAbiParameters([{ type: 'uint256' }], out.data)[0];
}
const CURVE_TOKEN_ABI = parseAbi(['function token() view returns (address)']);
export const withSlippage = (amount: bigint, bps: number): bigint => amount * BigInt(10_000 - bps) / 10_000n;

export interface PreparedTx { to: Address; data: Hex; value: bigint; gas: bigint; }
/** Estimates gas against the real account; a failing estimate means the transaction would revert and is never sent. */
export async function prepareTx(account: Address, tx: { to: Address; data: Hex; value?: bigint }): Promise<PreparedTx> {
  const value = tx.value ?? 0n; const gas = await chain.estimateGas({ account, to: tx.to, data: tx.data, value });
  return { to: tx.to, data: tx.data, value, gas: gas * 125n / 100n };
}
export async function waitForReceipt(hash: Hex) { const receipt = await chain.waitForTransactionReceipt({ hash, timeout: 90_000 }); if (receipt.status !== 'success') throw new Error('The transaction reverted on-chain. No state changed.'); return receipt; }
export async function ensureAllowance(owner: Address, token: Address, spender: Address, amount: bigint, send: (tx: PreparedTx) => Promise<Hex>): Promise<void> {
  const allowance = await chain.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [owner, spender] });
  if (allowance >= amount) return;
  const hash = await send(await prepareTx(owner, { to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [spender, amount] }) }));
  await waitForReceipt(hash);
}

/** Parses a typed decimal amount without floating point drift. */
export function parseAmount(raw: string, decimals = 18): bigint | null {
  const cleaned = raw.replace(/,/g, '').trim(); if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const [whole = '0', fraction = ''] = cleaned.split('.'); if (fraction.length > decimals) return null;
  const value = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
  return value > 0n ? value : null;
}
export function compact(value: number, digits = 2): string { if (!Number.isFinite(value)) return '—'; return new Intl.NumberFormat('en', { notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: digits }).format(value); }
export function formatEth(wei: bigint, digits = 5): string { const n = Number(formatEther(wei)); return n === 0 ? '0' : n < 10 ** -digits ? `<${10 ** -digits}` : n.toLocaleString('en', { maximumFractionDigits: digits }); }
export function formatTokens(units: bigint): string { return compact(Number(formatUnits(units, 18))); }
export function priceLabel(eth: number): string { if (!eth) return '—'; if (eth >= 0.0001) return `${eth.toPrecision(3)} ETH`; const exponent = Math.floor(Math.log10(eth)); return `${(eth / 10 ** exponent).toFixed(2)}e${exponent} ETH`; }

const BUY_TOPIC = toEventSelector('CurveBuy(address,address,uint256,uint256,uint256,uint256)');
const SELL_TOPIC = toEventSelector('CurveSell(address,address,uint256,uint256,uint256,uint256)');
export interface Trade { id: string; hash: Hex; block: bigint; side: 'buy' | 'sell'; trader: Address; tokens: number; eth: number; creatorFeeEth: number; price: number; }
const WINDOW = 45_000n;
/**
 * Recent curve trades straight from CurveBuy/CurveSell logs. Bounded to a recent block range; the chart states its
 * range instead of implying complete history.
 */
export async function readTrades(curve: Address, fromBlock?: bigint, maxWindows = 24): Promise<{ trades: Trade[]; fromBlock: bigint; toBlock: bigint; complete: boolean }> {
  const latest = await chain.getBlockNumber(); const floor = latest > WINDOW * BigInt(maxWindows) ? latest - WINDOW * BigInt(maxWindows) : 0n;
  const start = fromBlock !== undefined && fromBlock > floor ? fromBlock : floor;
  const ranges: [bigint, bigint][] = []; for (let from = start; from <= latest; from += WINDOW + 1n) ranges.push([from, from + WINDOW > latest ? latest : from + WINDOW]);
  const logs = (await Promise.all(ranges.map(([from, to]) => chain.getLogs({ address: curve, fromBlock: from, toBlock: to, events: [parseAbiItem('event CurveBuy(address indexed sender,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 protocolFee,uint256 creatorFee)'), parseAbiItem('event CurveSell(address indexed sender,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 protocolFee,uint256 creatorFee)')] })))).flat();
  const trades = logs.map(log => {
    const buy = log.topics[0] === BUY_TOPIC; if (!buy && log.topics[0] !== SELL_TOPIC) return null;
    const args = log.args as { recipient?: Address; sender?: Address; quoteIn?: bigint; tokensOut?: bigint; tokensIn?: bigint; quoteOut?: bigint; creatorFee?: bigint };
    const tokens = Number(formatEther((buy ? args.tokensOut : args.tokensIn) ?? 0n)); const eth = Number(formatEther((buy ? args.quoteIn : args.quoteOut) ?? 0n));
    return { id: `${log.transactionHash}-${log.logIndex}`, hash: log.transactionHash as Hex, block: log.blockNumber ?? 0n, side: buy ? 'buy' : 'sell', trader: ((buy ? args.recipient : args.sender) ?? DEAD_ADDRESS) as Address, tokens, eth, creatorFeeEth: Number(formatEther(args.creatorFee ?? 0n)), price: tokens > 0 ? eth / tokens : 0 } satisfies Trade;
  }).filter((trade): trade is Trade => trade !== null).sort((a, b) => (a.block === b.block ? 0 : a.block < b.block ? -1 : 1));
  return { trades, fromBlock: start, toBlock: latest, complete: fromBlock !== undefined && fromBlock >= floor };
}
export const explorerAddress = (address: string) => `https://robinhoodchain.blockscout.com/address/${address}`;
export const explorerToken = (address: string) => `https://robinhoodchain.blockscout.com/token/${address}`;
