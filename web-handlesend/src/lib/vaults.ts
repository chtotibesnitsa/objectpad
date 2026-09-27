import { useQuery } from '@tanstack/react-query';
import { decodeEventLog, encodeFunctionData, formatEther, parseAbi, type Address, type Hex } from 'viem';
import { api } from './api';
import { chain, ensureAllowance, prepareTx, quoteBuy, quoteSell, waitForReceipt, withSlippage, type PreparedTx } from './chain';
import { buyPairedWithEth, type PairQuote } from './pairs';
import { CURVE_ABI, ERC20_ABI } from '@/shared/pons';

/**
 * Object Vaults client. Three products, never conflated:
 * - Index: a published price level (tracks only).
 * - Object Basket: one atomic Multicall3 transaction buys every ETH-quoted constituent; coins land in the buyer's wallet.
 * - Backed Vault: contract-held assets + redeemable shares — specified, not deployed (`backed.status`).
 */
export type VaultKind = 'collection' | 'set' | 'theme' | 'creator' | 'partner';
export type Affiliation = 'official' | 'partner' | 'community' | 'unaffiliated';
export type Execution = 'basket' | 'track_only' | 'halted';
export interface CoinMetrics { traders: number; freeFloatEth: number; depthEth: number; depthSource: 'quote' | 'model'; volume7dEth: number; hhi: number; score: number; checks: { proof: boolean; fresh: boolean; depth: boolean; holders: boolean; volume: boolean; concentration: boolean }; eligible: boolean; reason: string | null; }
export interface VaultConstituent { token: string; curve: string; symbol: string; name: string; logo: string; path: string; priceEth: number; marketCapEth: number; change24h: number; volume24hEth: number; holders: number; weight: number; targetWeight: number; pairToken: string | null; quoteAsset: string; kind: string; objectId: string | null; metrics: CoinMetrics; }
export interface WeightRow { token: string; symbol: string; weight: number; }
export interface BasketReceipt { hash: string; vault: string; trader: string; side: 'buy' | 'sell'; volumeEth: number; feeEth: number; legs: number; at: number; points: number; }
export interface Vault {
  id: string; slug: string; name: string; kind: VaultKind; description: string; weighting: 'score' | 'equal'; system: boolean;
  product: 'index'; execution: Execution; executionNote: string; affiliation: Affiliation; partner: { name: string; wallet: string } | null;
  owner: { handle: string | null; mine: boolean }; creatorFee: { bps: number; wallet: string | null };
  createdAt: number; level: number; change24h: number; change7d: number; totalCapEth: number; freeFloatEth: number; liquidityEth: number; volume24hEth: number; basketVolume24hEth: number; basketVolumeEth: number; traders: number; holders: number;
  health: { proof: number; fresh: boolean; eligible: number; total: number }; calculatedAt: number;
  methodology: { version: string; hash: string; cap: number };
  rebalance: { current: { at: number; hash: string }; pending: { effectiveAt: number; announcedAt: number; hash: string; weights: WeightRow[] } | null; history: { at: number; hash: string; level: number; weights: WeightRow[] }[] };
  backed: { status: 'not_deployed' | 'deployed'; factory: string | null };
  stock: { paired: number; halted: boolean; note: string } | null;
  constituents: VaultConstituent[]; excluded: { token: string; symbol: string; logo: string; reason: string }[];
  history: { t: number; v: number }[]; tabs: string[]; rank: number; receipts?: BasketReceipt[];
}
export interface Methodology { version: string; formula: string; weight: string; level: string; eligibility: Record<string, number | boolean>; concentrationCap: number; constituents: number; rebalance: { schedule: string; effectiveDelayHours: number; minWeightDrift: number }; freeFloat: string; depth: string; priceSource: string; }
export interface UniverseCoin { token: string; symbol: string; name: string; logo: string; kind: string; quoteAsset: string; marketCapEth: number; metrics: CoinMetrics; }
export interface Leaderboard { traders: { wallet: string; points: number; volumeEth: number; trades: number }[]; creators: { handle: string | null; vault: string; slug: string; feesEth: number; volumeEth: number; traders: number }[]; totals: { volumeEth: number; feesEth: number; points: number; receipts: number }; }
export interface MyVaultStats { points: number; volumeEth: number; trades: number; creator: { vaults: number; feesEth: number; volumeEth: number; traders: number }; recent: BasketReceipt[]; }

export const VAULT_KINDS: { id: VaultKind; label: string; note: string }[] = [
  { id: 'collection', label: 'Collection', note: 'Your curated shelf of objects' },
  { id: 'set', label: 'Set', note: 'Objects that belong together' },
  { id: 'theme', label: 'Theme', note: 'Desk setup, street finds, toys…' },
  { id: 'creator', label: 'Creator room', note: 'One creator and their community' },
  { id: 'partner', label: 'Partner objects', note: 'A project’s mascot & merch' },
];
export const VAULT_CONCEPTS: { name: string; kind: VaultKind; pitch: string }[] = [
  { name: 'Internet Objects', kind: 'theme', pitch: 'Recognisable objects from internet culture.' },
  { name: 'Creator Room', kind: 'creator', pitch: 'Objects scanned by one creator and their community.' },
  { name: 'Desk Setup', kind: 'set', pitch: 'Keyboard, mug, monitor, figurine and mouse.' },
  { name: 'Street Finds', kind: 'theme', pitch: 'Objects discovered and verified in public.' },
  { name: 'Convention Drop', kind: 'collection', pitch: 'Limited scans created during a live event.' },
  { name: 'Vehicle Vault', kind: 'theme', pitch: 'Verified vehicle-related objects.' },
  { name: 'Partner Objects', kind: 'partner', pitch: 'A meme project’s physical mascot and merch — signed by its official wallet.' },
];
export const TABS = [
  { id: 'trending', label: 'Trending' }, { id: 'official', label: 'Official' }, { id: 'community', label: 'Community' },
  { id: 'creators', label: 'Creators' }, { id: 'stock-paired', label: 'Stock-paired' }, { id: 'newest', label: 'Newest' },
] as const;
export type TabId = typeof TABS[number]['id'];
export const AFFILIATION_LABEL: Record<Affiliation, string> = { official: 'Official ObjectPad index', partner: 'Official partner vault', community: 'Community vault', unaffiliated: 'Unaffiliated' };
export const partnerMessage = (name: string, partner: string, wallet: string): string => `ObjectPad partner vault v1\nvault: ${name.trim()}\npartner: ${partner.trim()}\npartner wallet: ${wallet.toLowerCase()}\nI authorise this vault to be labelled as an official partner vault.`;

/** Filters + ranks the list for a discovery tab. */
export function forTab(items: Vault[], tab: TabId): Vault[] {
  if (tab === 'newest') return [...items].sort((a, b) => b.createdAt - a.createdAt);
  const list = tab === 'trending' ? items : items.filter(v => v.tabs.includes(tab));
  return [...list].sort((a, b) => b.rank - a.rank || b.volume24hEth - a.volume24hEth);
}

export function useVaults(token?: string | null) {
  return useQuery({ queryKey: ['objectpad', 'vaults', Boolean(token)], queryFn: ({ signal }) => api<{ items: Vault[]; methodology: Methodology; methodologyHash: string; updatedAt: number }>('/vaults', { signal, token, timeout: 45_000 }), refetchInterval: 30_000, retry: 1 });
}
export function useVault(slug: string, token?: string | null) {
  return useQuery({ queryKey: ['objectpad', 'vault', slug, Boolean(token)], queryFn: ({ signal }) => api<Vault>(`/vaults/${slug}`, { signal, token, timeout: 45_000 }), refetchInterval: 20_000, retry: 1 });
}
export function useUniverse(enabled: boolean) {
  return useQuery({ queryKey: ['objectpad', 'vault-universe'], enabled, queryFn: ({ signal }) => api<{ items: UniverseCoin[] }>('/vaults/universe', { signal, timeout: 45_000 }), staleTime: 60_000 });
}
export function useLeaderboard() {
  return useQuery({ queryKey: ['objectpad', 'vault-leaderboard'], queryFn: ({ signal }) => api<Leaderboard>('/vaults/leaderboard', { signal, timeout: 30_000 }), refetchInterval: 60_000 });
}
export function useMyVaultStats(token: string | null, wallet: string | null) {
  return useQuery({ queryKey: ['objectpad', 'vault-me', wallet], enabled: Boolean(token), queryFn: ({ signal }) => api<MyVaultStats>(`/vaults/me${wallet ? `?wallet=${wallet}` : ''}`, { signal, token, timeout: 30_000 }) });
}

// ---------------- Basket router ----------------
export const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL_ABI = parseAbi(['struct Call3Value { address target; bool allowFailure; uint256 value; bytes callData; }', 'function aggregate3Value(Call3Value[] calls) payable returns ((bool success, bytes returnData)[] returnData)']);
/** Quotes older than this are rejected at signing time and re-quoted. */
export const QUOTE_TTL_MS = 30_000;
const DUST = 10n ** 12n; const PROBE = 10n ** 12n;
type Send = (tx: PreparedTx) => Promise<Hex>;

export interface LegQuote { token: string; curve: string; symbol: string; logo: string; weight: number; ethIn: bigint; tokensOut: bigint; minOut: bigint; impact: number; route: 'atomic' | 'paired' | 'skipped'; note?: string; }
export interface BasketQuote { vault: string; at: number; ethIn: bigint; feeWei: bigint; feeWallet: Address | null; legs: LegQuote[]; impact: number; ceiling: number; ok: boolean; problem: string | null; atomicWei: bigint; }

/** Quotes every leg at its real size and at a dust probe to isolate price impact (curve fees cancel out of the ratio). */
export async function quoteBasket(vault: Vault, ethIn: bigint, ceilingBps: number): Promise<BasketQuote> {
  const fee = vault.creatorFee.wallet && vault.creatorFee.bps > 0 ? ethIn * BigInt(vault.creatorFee.bps) / 10_000n : 0n;
  const net = ethIn - fee; const ceiling = ceilingBps / 10_000;
  const legs = await Promise.all(vault.constituents.map(async (c): Promise<LegQuote> => {
    const leg = net * BigInt(Math.round(c.weight * 1_000_000)) / 1_000_000n; const base = { token: c.token, curve: c.curve, symbol: c.symbol, logo: c.logo, weight: c.weight, ethIn: leg, tokensOut: 0n, minOut: 0n, impact: 0 };
    if (leg < DUST) return { ...base, route: 'skipped', note: 'Below dust' };
    if (c.pairToken) return { ...base, route: 'paired', note: `${c.quoteAsset}-quoted: routes separately` };
    const [out, probe] = await Promise.all([quoteBuy(c.curve as Address, leg), quoteBuy(c.curve as Address, PROBE)]);
    if (out <= 0n || probe <= 0n) throw new Error(`No live quote for $${c.symbol}.`);
    const impact = Math.max(0, 1 - (Number(out) / Number(leg)) / (Number(probe) / Number(PROBE)));
    return { ...base, tokensOut: out, minOut: withSlippage(out, ceilingBps), impact, route: 'atomic' };
  })).catch((error: unknown) => { throw new Error(error instanceof Error ? `Route unavailable — ${error.message.split('\n')[0]}` : 'Route unavailable.'); });
  const atomic = legs.filter(l => l.route === 'atomic'); const atomicWei = atomic.reduce((s, l) => s + l.ethIn, 0n);
  const impact = atomicWei > 0n ? atomic.reduce((s, l) => s + l.impact * Number(l.ethIn), 0) / Number(atomicWei) : 0;
  const problem = vault.execution !== 'basket' ? vault.executionNote : !atomic.length ? 'No ETH-quoted legs to route atomically.' : impact > ceiling ? `Aggregate price impact ${(impact * 100).toFixed(2)}% is above your ${(ceiling * 100).toFixed(1)}% ceiling. Lower the size or raise the ceiling.` : null;
  return { vault: vault.slug, at: Date.now(), ethIn, feeWei: fee, feeWallet: fee > 0n ? vault.creatorFee.wallet as Address : null, legs, impact, ceiling, ok: !problem, problem, atomicWei };
}

export interface ReceiptLeg { symbol: string; logo: string; ethIn: number; tokensOut: number; protocolFee: number; creatorFee: number; }
export interface CombinedReceipt { hash: Hex; side: 'buy' | 'sell'; legs: ReceiptLeg[]; totalEth: number; vaultFeeEth: number; gasEth: number; block: bigint; extra: Hex[]; }

/**
 * Executes the atomic basket: ONE wallet confirmation. Multicall3.aggregate3Value calls each curve's buy(quoteIn, minOut, buyer)
 * with allowFailure=false, so either every leg fills at or above its minimum or the whole transaction reverts. The creator fee is a
 * plain ETH call to the creator's wallet inside the same transaction. Stock-quoted legs follow as separate transactions.
 */
export async function executeBasketBuy(opts: { wallet: Address; vault: Vault; quote: BasketQuote; send: Send; pairs: PairQuote[]; router?: string; quoter?: string; ceilingBps: number; onPhase?: (phase: string) => void }): Promise<CombinedReceipt> {
  const { wallet, vault, send, onPhase } = opts; let quote = opts.quote;
  if (Date.now() - quote.at > QUOTE_TTL_MS) { onPhase?.('Quote expired — re-quoting every leg…'); quote = await quoteBasket(vault, quote.ethIn, opts.ceilingBps); }
  if (!quote.ok) throw new Error(quote.problem ?? 'Route rejected.');
  const atomic = quote.legs.filter(l => l.route === 'atomic');
  const calls = atomic.map(l => ({ target: l.curve as Address, allowFailure: false, value: l.ethIn, callData: encodeFunctionData({ abi: CURVE_ABI, functionName: 'buy', args: [l.ethIn, l.minOut, wallet] }) }));
  if (quote.feeWei > 0n && quote.feeWallet) calls.push({ target: quote.feeWallet, allowFailure: false, value: quote.feeWei * quote.atomicWei / (quote.ethIn - quote.feeWei || 1n), callData: '0x' });
  const value = calls.reduce((s, c) => s + c.value, 0n);
  onPhase?.(`Confirm 1 transaction · ${atomic.length} coins`);
  const hash = await send(await prepareTx(wallet, { to: MULTICALL3, data: encodeFunctionData({ abi: MULTICALL_ABI, functionName: 'aggregate3Value', args: [calls] }), value }));
  onPhase?.('Settling on Robinhood Chain…');
  const receipt = await waitForReceipt(hash);
  const byCurve = new Map(atomic.map(l => [l.curve.toLowerCase(), l]));
  const legs: ReceiptLeg[] = [];
  for (const log of receipt.logs) { const l = byCurve.get(log.address.toLowerCase()); if (!l) continue; try { const ev = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics }); if (ev.eventName === 'CurveBuy') legs.push({ symbol: l.symbol, logo: l.logo, ethIn: Number(formatEther(ev.args.quoteIn)), tokensOut: Number(formatEther(ev.args.tokensOut)), protocolFee: Number(formatEther(ev.args.protocolFee)), creatorFee: Number(formatEther(ev.args.creatorFee)) }); } catch { /* other event */ } }
  const extra: Hex[] = [];
  for (const l of quote.legs.filter(x => x.route === 'paired')) {
    const c = vault.constituents.find(x => x.token === l.token); const pair = opts.pairs.find(p => p.address.toLowerCase() === c?.pairToken); if (!c || !pair) continue;
    onPhase?.(`Routing $${l.symbol} via ${c.quoteAsset}…`);
    try { extra.push(await buyPairedWithEth({ wallet, pair, curve: c.curve as Address, ethIn: l.ethIn, slippageBps: opts.ceilingBps, send, router: opts.router, quoter: opts.quoter })); } catch { /* optional leg; disclosed */ }
  }
  return { hash, side: 'buy', legs, totalEth: legs.reduce((s, l) => s + l.ethIn, 0), vaultFeeEth: Number(formatEther(calls.find(c => c.callData === '0x')?.value ?? 0n)), gasEth: Number(formatEther(receipt.gasUsed * receipt.effectiveGasPrice)), block: receipt.blockNumber, extra };
}

/** Sells `percent`% of each constituent from the wallet. Pons curves sell from msg.sender, so each leg is its own transaction. */
export async function executeBasketSell(opts: { wallet: Address; vault: Vault; percent: number; ceilingBps: number; send: Send; onPhase?: (phase: string) => void }): Promise<CombinedReceipt> {
  const { wallet, vault, percent, ceilingBps, send, onPhase } = opts; const legs: ReceiptLeg[] = []; const hashes: Hex[] = []; let gas = 0; let block = 0n; let proceeds = 0n;
  for (const c of vault.constituents.filter(x => !x.pairToken)) {
    const balance = await chain.readContract({ address: c.token as Address, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet] }).catch(() => 0n);
    const amount = balance * BigInt(percent) / 100n; if (amount <= 0n) continue;
    onPhase?.(`Selling $${c.symbol}…`);
    const out = await quoteSell(c.curve as Address, wallet, amount, c.token as Address); const min = withSlippage(out, ceilingBps); if (min <= 0n) continue;
    await ensureAllowance(wallet, c.token as Address, c.curve as Address, amount, send);
    const hash = await send(await prepareTx(wallet, { to: c.curve as Address, data: encodeFunctionData({ abi: CURVE_ABI, functionName: 'sell', args: [amount, min, wallet] }) }));
    const rc = await waitForReceipt(hash); hashes.push(hash); gas += Number(formatEther(rc.gasUsed * rc.effectiveGasPrice)); block = rc.blockNumber;
    for (const log of rc.logs) { if (log.address.toLowerCase() !== c.curve.toLowerCase()) continue; try { const ev = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics }); if (ev.eventName === 'CurveSell') { proceeds += ev.args.quoteOut; legs.push({ symbol: c.symbol, logo: c.logo, ethIn: Number(formatEther(ev.args.quoteOut)), tokensOut: Number(formatEther(ev.args.tokensIn)), protocolFee: Number(formatEther(ev.args.protocolFee)), creatorFee: Number(formatEther(ev.args.creatorFee)) }); } } catch { /* other */ } }
  }
  if (!hashes.length) throw new Error('You hold none of this basket’s ETH-quoted coins.');
  let feeEth = 0;
  if (vault.creatorFee.wallet && vault.creatorFee.bps > 0 && proceeds > 0n) {
    const fee = proceeds * BigInt(vault.creatorFee.bps) / 10_000n;
    if (fee > 0n) { onPhase?.('Settling the vault creator fee…'); try { const h = await send(await prepareTx(wallet, { to: vault.creatorFee.wallet as Address, data: '0x', value: fee })); await waitForReceipt(h); hashes.push(h); feeEth = Number(formatEther(fee)); } catch { /* disclosed as unpaid */ } }
  }
  return { hash: hashes[0], side: 'sell', legs, totalEth: legs.reduce((s, l) => s + l.ethIn, 0), vaultFeeEth: feeEth, gasEth: gas, block, extra: hashes.slice(1) };
}

/** Sends the transaction hashes to the server, which re-reads them from chain before crediting volume, fees and points. */
export async function recordReceipt(slug: string, receipt: CombinedReceipt, token: string | null): Promise<BasketReceipt | null> {
  if (!token) return null;
  try { return await api<BasketReceipt>(`/vaults/${slug}/receipts`, { method: 'POST', token, body: { hashes: [receipt.hash, ...receipt.extra] }, timeout: 45_000 }); } catch { return null; }
}
