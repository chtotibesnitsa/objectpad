import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createWalletClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { api } from './api';
import { useSession } from './session';
import { devWallet } from './devWallet';
import { chain, prepareTx, waitForReceipt, type PreparedTx } from './chain';
import { claimWithDevWallet, claimWithSession, type AccountWallet } from './account';
import { robinhoodChain } from '@/shared/pons';
import { BPS, VAULT_SPLIT } from '@/shared/economy';

/** One verified movement of funds on an account wallet (read back from the chain by the API). */
export interface WalletActivity { hash: string; wallet: string; kind: 'deposit' | 'withdraw' | 'transfer' | 'claim' | 'protocol_share'; valueWei: string; counterparty: string | null; at: number; }

export const ACTIVITY_KEY = ['objectpad', 'account', 'activity'] as const;

/**
 * The creator keeps a third of the 1.5% creator tax (0.5% of volume). The other two thirds (1.0%) belong to
 * buyback-and-burn and holders, and go back to the treasury whenever fees are claimed through ObjectPad.
 */
export function splitFees(wei: bigint): { creator: bigint; protocol: bigint } {
  const creator = wei * BigInt(VAULT_SPLIT.creatorBps) / BigInt(BPS); return { creator, protocol: wei - creator };
}

export function useWalletActivity(enabled: boolean) {
  const session = useSession();
  return useQuery({ queryKey: ACTIVITY_KEY, enabled: enabled && session.authenticated, queryFn: async () => (await api<{ items: WalletActivity[] }>('/account/activity', { token: await session.token() })).items, refetchInterval: 30_000, staleTime: 10_000 });
}

/** Asks the API to read a transaction from Robinhood Chain and add it to the account's history. */
export async function recordActivity(token: string | null, hash: string): Promise<WalletActivity[]> {
  return (await api<{ items: WalletActivity[] }>('/account/activity', { token, method: 'POST', body: { hash }, timeout: 45_000 })).items;
}

/** A wallet this device can sign for: the signed-in wallet, or the dev wallet whose key lives in this browser. */
export interface Signer { address: Address; kind: 'session' | 'device'; send: (tx: PreparedTx) => Promise<Hex>; }

export function useSigner() {
  const session = useSession();
  return useCallback((address: string): Signer | null => {
    const a = address.toLowerCase();
    if (session.wallet && session.wallet.toLowerCase() === a) return { address: session.wallet, kind: 'session', send: session.send };
    const local = devWallet();
    if (local && local.address.toLowerCase() === a) {
      const account = privateKeyToAccount(local.privateKey); const client = createWalletClient({ account, chain: robinhoodChain, transport: http() });
      return { address: account.address, kind: 'device', send: tx => client.sendTransaction({ ...tx, chain: robinhoodChain }) };
    }
    return null;
  }, [session.wallet, session.send]);
}

/** Largest amount that can leave a wallet with the network fee still covered (2x fee margin). */
export async function maxSendable(from: Address, balance: bigint): Promise<bigint> {
  const [gas, price] = await Promise.all([chain.estimateGas({ account: from, to: from, value: 1n }).catch(() => 60_000n), chain.getGasPrice()]);
  const fee = gas * 125n / 100n * price * 2n; return balance > fee ? balance - fee : 0n;
}

/** Sends ETH from a wallet this device controls and waits until it is final on-chain. */
export async function sendEth(signer: Signer, to: Address, value: bigint): Promise<Hex> {
  const hash = await signer.send(await prepareTx(signer.address, { to, data: '0x', value })); await waitForReceipt(hash); return hash;
}

export type ClaimStep = 'idle' | 'claiming' | 'sharing' | 'done';

/**
 * Claims a wallet's creator fees, then returns the protocol's two thirds (burn + holders) to the treasury, so the
 * creator ends up with exactly their 0.5% share. Both transactions are recorded in the wallet history.
 */
export async function claimCreatorShare(token: string | null, wallet: AccountWallet, signer: Signer, treasury: Address, onStep: (s: ClaimStep) => void): Promise<{ claim: Hex; share: Hex | null }> {
  const claimable = BigInt(wallet.claimableWei); if (claimable === 0n) throw new Error('No creator fees to claim yet.');
  onStep('claiming');
  const local = devWallet();
  const claim = signer.kind === 'device' && local ? await claimWithDevWallet(token, local) : await claimWithSession(token, signer.address, signer.send);
  await recordActivity(token, claim).catch(() => undefined);
  onStep('sharing');
  const { protocol } = splitFees(claimable); let share: Hex | null = null;
  if (protocol > 0n) { share = await sendEth(signer, treasury, protocol); await recordActivity(token, share).catch(() => undefined); }
  onStep('done'); return { claim, share };
}

/** Eases a number toward its target so balances roll instead of jumping. */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState<number>(target); const from = useRef<number>(0);
  useEffect(() => {
    const start = performance.now(); const origin = from.current; let frame = 0;
    const tick = (now: number) => { const t = Math.min(1, (now - start) / duration); const eased = 1 - Math.pow(1 - t, 4); const v = origin + (target - origin) * eased; setValue(v); from.current = v; if (t < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
