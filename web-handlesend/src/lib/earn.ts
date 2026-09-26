import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useSession } from './session';

/** $OBJECTPAD on Robinhood Chain. Every Earn post must contain this exact address. */
export const EARN_CA = '0x520541d03dec790ce51746da2a495dafa62e87f8';
export const EXPLORER_TX = (hash: string): string => `https://robinhoodchain.blockscout.com/tx/${hash}`;

export interface EarnMarket { token: string; source: string; supply: number; pair: string; priceUsd: number; marketCapUsd: number; liquidityUsd: number; ethUsd: number | null; at: number; rewardUsd: number; nextRewardUsd: number; nextMilestoneUsd: number; remainingUsd: number; progress: number; }
export interface EarnRules { holdHours: number; postMaxAgeDays: number; minClaimUsd: number; baselineUsd: number; milestoneUsd: number; minOwnChars: number; dailyMax: number; submissionsOpen: boolean; payoutsOpen: boolean; budgetUsd: number; budgetLeftUsd: number; campaignStart: number; token: string; payout: string; }
export type CheckState = 'pass' | 'fail' | 'pending' | 'skip';
export interface EarnCheck { id: string; label: string; state: CheckState; detail: string; }
export interface EarnReason { code: string; message: string; fix: string; retryable: boolean; }
export interface AuditEvent { event: string; detail: string; at: number; }
export type SubmissionState = 'approved' | 'rejected' | 'pending_review' | 'verification_error';
export interface EarnSubmission { id: string; postId: string; url: string; handle: string; name: string; avatar: string; text: string; media: { type: string; url: string }[]; metrics: Record<string, number> | null; postedAt: number; state: SubmissionState; reasons: EarnReason[]; checks: EarnCheck[]; rewardUsd: number; rewardState: 'none' | 'pending' | 'available' | 'review' | 'reversed'; marketCapUsd: number | null; priceUsd: number | null; submittedAt: number; verifiedAt: number; approvedAt: number | null; maturesAt: number | null; audit?: AuditEvent[]; }
export interface EarnClaim { id: string; amountUsd: number; wallet: string; ethUsd: number; amountWei: string; state: 'queued' | 'submitted' | 'confirmed' | 'failed'; hash: string | null; error: string | null; createdAt: number; updatedAt: number; audit: AuditEvent[]; }
export interface EarnMe { x: { id: string; handle: string; name: string; avatar: string } | null; xError: string | null; blocked: boolean; balances: { availableUsd: number; pendingVerificationUsd: number; pendingPayoutUsd: number; lifetimeUsd: number; claimedUsd: number }; daily: { used: number; max: number; resetsAt: number | null }; wallets: { address: string; kind: 'account' | 'linked' }[]; rules: EarnRules; submissions: EarnSubmission[]; claims: EarnClaim[]; }
export type FeedItem = { kind: 'post'; id: string; handle: string; avatar: string; preview: string; url: string; state: SubmissionState; reason: string | null; rewardUsd: number; rewardState: string; at: number } | { kind: 'payout'; id: string; handle: string; wallet: string; amountUsd: number; amountWei: string; state: 'submitted' | 'confirmed' | 'failed'; hash: string | null; at: number };
export interface EarnFeed { items: FeedItem[]; stats: { approved: number; earners: number; paidUsd: number; payouts: number }; updatedAt: number; }
export type FeedFilter = 'all' | 'approved' | 'paid' | 'pending' | 'rejected';

export const EARN_ME_KEY = ['objectpad', 'earn', 'me'] as const;

/** Flat $1 up to $100K market cap, then +$1 per complete $100K after that ($2 at $200K, $3 at $300K...). Mirrors the server formula for previews only; the server locks the real amount. */
export const rewardFor = (marketCapUsd: number): number => 1 + Math.floor(Math.max(0, marketCapUsd - 100_000) / 100_000);

/** Validated live $OBJECTPAD price, market cap and reward tier. */
export function useEarnMarket() { return useQuery({ queryKey: ['objectpad', 'earn', 'market'], queryFn: () => api<EarnMarket>('/earn/market'), refetchInterval: 30_000, staleTime: 15_000, retry: 1 }); }
export function useEarnRules() { return useQuery({ queryKey: ['objectpad', 'earn', 'rules'], queryFn: () => api<EarnRules>('/earn/rules'), staleTime: 60_000 }); }
/** Public proof feed. Polls every 8s so new approvals and payouts appear live. */
export function useEarnFeed(filter: FeedFilter) { return useQuery({ queryKey: ['objectpad', 'earn', 'feed', filter], queryFn: () => api<EarnFeed>(`/earn/feed?filter=${filter}`), refetchInterval: 8_000, staleTime: 4_000, placeholderData: prev => prev }); }
/** The signed-in person's X identity, balances, allowance, submissions and claims (all server-resolved). */
export function useEarnMe() {
  const session = useSession();
  return useQuery({ queryKey: EARN_ME_KEY, enabled: session.authenticated, queryFn: async () => api<EarnMe>('/earn/me', { token: await session.token(), timeout: 30_000 }), refetchInterval: q => (q.state.data?.claims.some(c => c.state === 'submitted' || c.state === 'queued') ? 5_000 : 20_000), staleTime: 5_000, retry: 1 });
}
export function useSubmitPost() {
  const session = useSession(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (url: string) => api<{ submission: EarnSubmission; already: boolean }>('/earn/submissions', { token: await session.token(), method: 'POST', body: { url }, timeout: 45_000 }), onSettled: () => { void qc.invalidateQueries({ queryKey: EARN_ME_KEY }); void qc.invalidateQueries({ queryKey: ['objectpad', 'earn', 'feed'] }); } });
}
export function useClaimReward() {
  const session = useSession(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: { amountCents: number; wallet: string; idempotencyKey: string }) => api<EarnClaim>('/earn/claims', { token: await session.token(), method: 'POST', body: input, timeout: 60_000 }), onSettled: () => { void qc.invalidateQueries({ queryKey: EARN_ME_KEY }); void qc.invalidateQueries({ queryKey: ['objectpad', 'earn', 'feed'] }); } });
}
/** Privacy-conscious funnel counter (event name only, nothing personal). */
export function track(name: 'earn_page_viewed' | 'auth_started' | 'auth_completed' | 'post_draft_copied' | 'post_link_pasted' | 'proof_shared'): void { void api('/earn/event', { method: 'POST', body: { name } }).catch(() => undefined); }

/** Client-side pre-check of a pasted link (the server extracts the canonical post id again). */
export function postIdFrom(raw: string): string | null {
  try { const u = new URL(raw.trim()); const host = u.hostname.toLowerCase().replace(/^(www\.|mobile\.|m\.)/, ''); if (!['x.com', 'twitter.com'].includes(host)) return null; return u.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}\/status(?:es)?|i\/web\/status|i\/status)\/(\d{5,25})/)?.[1] ?? null; } catch { return null; }
}
/** Live checklist for the composer: the same four requirements the server checks. */
export function draftChecks(text: string): { id: string; label: string; ok: boolean }[] {
  const t = text.toLowerCase();
  return [
    { id: 'cashtag', label: '$ObjectPad', ok: /\$objectpad\b/i.test(text) },
    { id: 'contract', label: 'Contract address', ok: t.includes(EARN_CA) },
    { id: 'website', label: 'objectpad.fun', ok: /(^|[^a-z0-9.-])(www\.)?objectpad\.fun\b/i.test(text) },
  ];
}
export const EARN_ERRORS: Record<string, string> = {
  X_NOT_LINKED: 'Connect your X account first so we can confirm you wrote the post.',
  X_LINKED_ELSEWHERE: 'That X account is already connected to a different ObjectPad account.',
  X_ACCOUNT_LOCKED: 'This ObjectPad account is already tied to a different X account.',
  URL_INVALID: 'That doesn’t look like an X post link. Copy the link from the post’s Share menu.',
  POST_TAKEN: 'This post was already submitted by another account.',
  SUBMISSIONS_PAUSED: 'Submissions are paused right now. Your drafts are safe; try again soon.',
  PAYOUTS_PAUSED: 'Payouts are paused right now. Your balance is safe.',
  ACCOUNT_REVIEW: 'Your account is under review. Contact support if you think this is a mistake.',
  WALLET_NOT_LINKED: 'Link this wallet to your account first (My wallet → Link).',
  INSUFFICIENT_BALANCE: 'Your available balance is lower than that amount.',
  CLAIM_AMOUNT_INVALID: 'Claims start at $1.00.',
  TREASURY_LOW: 'The reward treasury is being topped up. Your balance is safe; try again soon.',
  ETH_PRICE_UNAVAILABLE: 'Live ETH price is unavailable, so we can’t price the payout yet. Try again in a minute.',
  MARKET_UNAVAILABLE: 'Live market data could not be confirmed. Nothing was lost; try again in a minute.',
  AUTH_UNAVAILABLE: 'Sign-in service didn’t answer. Try again in a moment.',
  RATE_LIMITED: 'Too many attempts. Wait a few minutes and try again.',
  SIGN_IN_REQUIRED: 'Sign in to submit posts and claim rewards.',
};
