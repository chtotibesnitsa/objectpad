import type { Address } from 'viem';
import { validAddress } from '../shared/security';
import type { Runtime } from './types';

interface LinkedAccount { type?: string; address?: string; chain_type?: string; wallet_client_type?: string; connector_type?: string; }

/**
 * Reads the verified account's own Ethereum wallet from Privy (server-to-server, app secret never leaves the Worker).
 * Prefers the Privy embedded wallet created at sign-in, so creators never have to connect or sign anything.
 */
export async function privyWallet(runtime: Runtime, did: string): Promise<Address | null> {
  const secret = (runtime.env.OBJECTPAD_PRIVY_APP_SECRET || runtime.env.PRIVY_APP_SECRET || '').trim();
  if (!secret || !runtime.privyAppId || !did.startsWith('did:privy:')) return null;
  try {
    const response = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(did)}`, { headers: { Authorization: `Basic ${btoa(`${runtime.privyAppId}:${secret}`)}`, 'privy-app-id': runtime.privyAppId }, signal: AbortSignal.timeout(8000), redirect: 'manual' });
    if (!response.ok) { console.warn('objectpad.privy.user', response.status); return null; }
    const user = await response.json() as { linked_accounts?: LinkedAccount[] };
    const wallets = (user.linked_accounts ?? []).filter(account => account.type === 'wallet' && account.chain_type === 'ethereum' && validAddress(account.address));
    const pick = wallets.find(w => w.wallet_client_type === 'privy' || w.connector_type === 'embedded') ?? wallets[0];
    return pick?.address ? pick.address.toLowerCase() as Address : null;
  } catch { return null; }
}
