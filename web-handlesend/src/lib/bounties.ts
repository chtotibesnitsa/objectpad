import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Bounty } from '@/shared/bounties';

export type BountyState = 'submitted' | 'winner' | 'rejected' | 'paid';
/** One coin submitted for a bounty. `wallet` is truncated on the public board and full for operators. */
export interface BountySubmission { id: string; bountyId: string; recordId: string; token: string; name: string; symbol: string; image: string; note: string; state: BountyState; reviewNote: string; payoutTx: string | null; createdAt: number; updatedAt: number; wallet: string; mine?: boolean; owner?: string; audit?: { event: string; detail: string; at: number }[]; }
export interface LiveBounty extends Bounty { status: 'open' | 'won' | 'paid'; submissions: BountySubmission[]; }

const KEY = ['objectpad', 'bounties'] as const;
const OPS_KEY = ['objectpad', 'ops-bounties'] as const;

/** Public board. Signed-in visitors also see which submissions are theirs. */
export function useBounties() {
  const session = useSession();
  return useQuery({ queryKey: [...KEY, session.authenticated], queryFn: async () => session.authenticated ? api<{ bounties: LiveBounty[] }>('/bounties/mine', { token: await session.token() }) : api<{ bounties: LiveBounty[] }>('/bounties'), refetchInterval: 20_000 });
}
export function useSubmitBounty() {
  const session = useSession(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: { bountyId: string; coin: string; note: string }) => api<BountySubmission>('/bounties/submissions', { token: await session.token(), method: 'POST', body: input }), onSettled: () => { void qc.invalidateQueries({ queryKey: KEY }); void qc.invalidateQueries({ queryKey: OPS_KEY }); } });
}
/** Operator queue: only resolves for accounts on the server-side operator allowlist. */
export function useBountyQueue(enabled: boolean) {
  const session = useSession();
  return useQuery({ queryKey: OPS_KEY, enabled: enabled && session.authenticated, queryFn: async () => api<{ submissions: BountySubmission[] }>('/ops/bounties', { token: await session.token() }), retry: false, refetchInterval: 20_000 });
}
export function useDecideBounty() {
  const session = useSession(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: { id: string; state: BountyState; note: string; tx: string }) => api<BountySubmission>('/ops/bounties/decide', { token: await session.token(), method: 'POST', body: input }), onSettled: () => { void qc.invalidateQueries({ queryKey: KEY }); void qc.invalidateQueries({ queryKey: OPS_KEY }); } });
}
export const BOUNTY_ERRORS: Record<string, string> = {
  BOUNTY_COIN_NOT_FOUND: 'We couldn’t find that coin on ObjectPad. Paste its contract address (0x…) or its objectpad.fun link.',
  BOUNTY_NOT_YOUR_COIN: 'That coin was launched by a different account. Sign in with the account that scanned it.',
  BOUNTY_COIN_NOT_LIVE: 'That coin isn’t live yet. Submit it once its launch is confirmed.',
  BOUNTY_CLOSED: 'This reward already has a winner.',
  BOUNTY_ALREADY_SUBMITTED: 'This coin is already submitted for this reward.',
  BOUNTY_ALREADY_WON: 'Another submission is already marked as the winner.',
  PAYOUT_TX_REQUIRED: 'Paste the payout transaction hash (0x… 64 hex) to mark it paid.',
  SIGN_IN_REQUIRED: 'Sign in with the account that launched the coin.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
  NOT_FOUND: 'That reward or coin wasn’t found.',
};
