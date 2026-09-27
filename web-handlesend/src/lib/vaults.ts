import { useQuery } from '@tanstack/react-query';
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { api } from './api';
import { chain, ensureAllowance, prepareTx, quoteBuy, quoteSell, waitForReceipt, withSlippage, type PreparedTx } from './chain';
import { buyPairedWithEth, type PairQuote } from './pairs';
import { CURVE_ABI, ERC20_ABI } from '@/shared/pons';

export type VaultKind = 'collection' | 'set' | 'theme' | 'creator';
export interface VaultConstituent { token: string; curve: string; symbol: string; name: string; logo: string; path: string; priceEth: number; marketCapEth: number; change24h: number; volume24hEth: number; holders: number; weight: number; pairToken: string | null; kind: string; objectId: string | null; }
export interface Vault { id: string; slug: string; name: string; kind: VaultKind; description: string; weighting: 'cap' | 'equal'; system: boolean; owner: { handle: string | null; mine: boolean }; createdAt: number; level: number; change24h: number; change7d: number; totalCapEth: number; avgCapEth: number; volume24hEth: number; holders: number; constituents: VaultConstituent[]; history: { t: number; v: number }[]; }

export const VAULT_KINDS: { id: VaultKind; label: string; note: string }[] = [
  { id: 'collection', label: 'Collection', note: 'Your curated shelf of objects' },
  { id: 'set', label: 'Set', note: 'Objects that belong together' },
  { id: 'theme', label: 'Theme', note: 'Sneakers, desk setup, toys…' },
  { id: 'creator', label: 'Creator', note: 'One creator’s objects' },
];

/** Every vault with its live index level (list view carries a 7-day, 6-hourly sparkline). */
export function useVaults(token?: string | null) {
  return useQuery({ queryKey: ['objectpad', 'vaults', Boolean(token)], queryFn: ({ signal }) => api<{ items: Vault[] }>('/vaults', { signal, token, timeout: 45_000 }), refetchInterval: 30_000, retry: 1 });
}
export function useVault(slug: string, token?: string | null) {
  return useQuery({ queryKey: ['objectpad', 'vault', slug, Boolean(token)], queryFn: ({ signal }) => api<Vault>(`/vaults/${slug}`, { signal, token, timeout: 45_000 }), refetchInterval: 20_000, retry: 1 });
}

type Send = (tx: PreparedTx) => Promise<Hex>;
export interface BasketStep { symbol: string; state: 'waiting' | 'active' | 'done' | 'skipped' | 'failed'; hash?: Hex; note?: string; }

/**
 * Buys the index: `ethIn` split by the index weights, one wallet-signed buy per coin on its own bonding curve. Stock-paired coins
 * route ETH into their pair asset first. Legs below a dust floor are skipped. Non-custodial: every leg lands in the buyer's wallet.
 */
export async function buyBasket(opts: { wallet: Address; vault: Vault; ethIn: bigint; slippageBps: number; send: Send; pairs: PairQuote[]; router?: string; quoter?: string; onStep: (i: number, step: BasketStep) => void }): Promise<number> {
  const { wallet, vault, ethIn, slippageBps, send, onStep } = opts; let done = 0; const dust = 10n ** 12n;
  for (const [i, c] of vault.constituents.entries()) {
    const leg = ethIn * BigInt(Math.round(c.weight * 1_000_000)) / 1_000_000n;
    if (leg < dust) { onStep(i, { symbol: c.symbol, state: 'skipped', note: 'Below dust' }); continue; }
    onStep(i, { symbol: c.symbol, state: 'active' });
    try {
      let hash: Hex;
      if (c.pairToken) {
        const pair = opts.pairs.find(p => p.address.toLowerCase() === c.pairToken); if (!pair) throw new Error('Pair route unavailable');
        hash = await buyPairedWithEth({ wallet, pair, curve: c.curve as Address, ethIn: leg, slippageBps, send, router: opts.router, quoter: opts.quoter });
      } else {
        const out = await quoteBuy(c.curve as Address, leg); const min = withSlippage(out, slippageBps);
        hash = await send(await prepareTx(wallet, { to: c.curve as Address, data: encodeFunctionData({ abi: CURVE_ABI, functionName: 'buy', args: [leg, min, wallet] }), value: leg })); await waitForReceipt(hash);
      }
      done++; onStep(i, { symbol: c.symbol, state: 'done', hash });
    } catch (error) { onStep(i, { symbol: c.symbol, state: 'failed', note: error instanceof Error ? error.message.split('\n')[0].slice(0, 80) : 'Failed' }); }
  }
  return done;
}
/** Sells `percent` % of the wallet's balance of every constituent back into its curve. */
export async function sellBasket(opts: { wallet: Address; vault: Vault; percent: number; slippageBps: number; send: Send; onStep: (i: number, step: BasketStep) => void }): Promise<number> {
  const { wallet, vault, percent, slippageBps, send, onStep } = opts; let done = 0;
  for (const [i, c] of vault.constituents.entries()) {
    const balance = await chain.readContract({ address: c.token as Address, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet] }).catch(() => 0n);
    const amount = balance * BigInt(percent) / 100n; if (amount <= 0n) { onStep(i, { symbol: c.symbol, state: 'skipped', note: 'No balance' }); continue; }
    onStep(i, { symbol: c.symbol, state: 'active' });
    try {
      const out = await quoteSell(c.curve as Address, wallet, amount); const min = withSlippage(out, slippageBps); if (min <= 0n) throw new Error('Nothing to receive');
      await ensureAllowance(wallet, c.token as Address, c.curve as Address, amount, send);
      const hash = await send(await prepareTx(wallet, { to: c.curve as Address, data: encodeFunctionData({ abi: CURVE_ABI, functionName: 'sell', args: [amount, min, wallet] }) })); await waitForReceipt(hash);
      done++; onStep(i, { symbol: c.symbol, state: 'done', hash });
    } catch (error) { onStep(i, { symbol: c.symbol, state: 'failed', note: error instanceof Error ? error.message.split('\n')[0].slice(0, 80) : 'Failed' }); }
  }
  return done;
}
