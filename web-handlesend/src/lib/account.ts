import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createWalletClient, encodeFunctionData, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { api } from './api';
import { useSession } from './session';
import { devWallet, type DevWallet } from './devWallet';
import { guestToken } from './creator';
import { robinhoodChain } from '@/shared/pons';
import { ESCROW_ABI, PONS_FEE_ESCROW } from '@/shared/economy';
import { chain, prepareTx, waitForReceipt } from './chain';

/** A creator-fee wallet on the account, with its live escrow balance. */
export interface AccountWallet { address: string; kind: 'account' | 'linked'; claimableWei: string; claimableEth: number; gasWei: string; }
/** One coin the account launched (or that pays fees to one of its wallets). */
export interface AccountLaunch { objectId: string; symbol: string; name: string; thumbnail: string; path: string; feeWallet: string | null; curve: string | null; token: string | null; launchedAt: number | null; }
export interface Account { did: string; publicId: string; alias: string; wallets: AccountWallet[]; launches: AccountLaunch[]; totalClaimableEth: number; operator: boolean; }

export const ACCOUNT_KEY = ['objectpad', 'account', 'me'] as const;

/** The signed-in creator's account: wallets, claimable fees and launch history. Refreshed every 20 seconds. */
export function useAccount() {
  const session = useSession();
  return useQuery({ queryKey: ACCOUNT_KEY, enabled: session.authenticated, queryFn: async () => api<Account>('/account/me', { token: await session.token(), timeout: 30_000 }), refetchInterval: 20_000, staleTime: 8_000, retry: 1 });
}

const linkMessage = (address: string, publicId: string, at: number): string => `ObjectPad: link creator wallet ${address.toLowerCase()} to account ${publicId} at ${at}`;

/** Proves this browser holds a dev wallet (signs locally, the key never leaves) and links it to the account. */
export async function linkDevWallet(token: string | null, wallet: DevWallet, publicId: string): Promise<void> {
  const at = Date.now(); const signature = await privateKeyToAccount(wallet.privateKey).signMessage({ message: linkMessage(wallet.address, publicId, at) });
  await api('/account/wallets', { token, method: 'POST', body: { address: wallet.address, at, signature } });
}

/** Links the signed-in wallet (MetaMask, Coinbase…) to the account with one signature. */
export async function linkSessionWallet(token: string | null, address: string, publicId: string, sign: (m: string) => Promise<Hex>): Promise<void> {
  const at = Date.now(); const signature = await sign(linkMessage(address, publicId, at));
  await api('/account/wallets', { token, method: 'POST', body: { address, at, signature } });
}

/** Claims every fee in the escrow for a dev wallet held in this browser. The treasury tops up gas when the wallet has none. */
export async function claimWithDevWallet(token: string | null, wallet: DevWallet): Promise<Hex> {
  await api('/account/claim-gas', { token, method: 'POST', body: { address: wallet.address }, timeout: 60_000 });
  const account = privateKeyToAccount(wallet.privateKey); const client = createWalletClient({ account, chain: robinhoodChain, transport: http() });
  const tx = await prepareTx(account.address, { to: PONS_FEE_ESCROW, data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'claim' }) });
  const hash = await client.sendTransaction({ ...tx, chain: robinhoodChain }); await waitForReceipt(hash); return hash;
}

/** Claims from the signed-in wallet. Embedded wallets with no ETH get their gas from the treasury first. */
export async function claimWithSession(token: string | null, address: Address, send: (i: { to: Address; data: Hex; value: bigint; gas: bigint }) => Promise<Hex>): Promise<Hex> {
  const gas = await chain.getBalance({ address }).catch(() => 0n); if (gas === 0n) await api('/account/claim-gas', { token, method: 'POST', body: { address }, timeout: 60_000 }).catch(() => undefined);
  const hash = await send(await prepareTx(address, { to: PONS_FEE_ESCROW, data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'claim' }) })); await waitForReceipt(hash); return hash;
}

/**
 * Runs once per sign-in: moves this browser's guest scans and launches into the account and links its dev wallet,
 * so creators who launched without an account see and claim their coins' fees straight away.
 */
export function useAccountSync(): void {
  const session = useSession(); const qc = useQueryClient(); const done = useRef<string>('');
  const { authenticated, token } = session;
  useEffect(() => {
    if (!authenticated) { done.current = ''; return; }
    let cancelled = false;
    void (async () => {
      const bearer = await token(); if (!bearer || cancelled || done.current === bearer.slice(-16)) return; done.current = bearer.slice(-16);
      try {
        const guest = guestToken(); await api('/account/adopt', { token: bearer, method: 'POST', body: guest ? { guestToken: guest } : {} });
        const me = await api<Account>('/account/me', { token: bearer, timeout: 30_000 }); const local = devWallet();
        if (local && !me.wallets.some(w => w.address === local.address.toLowerCase())) await linkDevWallet(bearer, local, me.publicId);
        void qc.invalidateQueries({ queryKey: ACCOUNT_KEY });
      } catch (error) { console.warn('objectpad.account.sync', error instanceof Error ? error.message.slice(0, 80) : ''); }
    })();
    return () => { cancelled = true; };
  }, [authenticated, token, qc]);
}
