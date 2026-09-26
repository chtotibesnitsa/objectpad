import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, RequestError } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { BountyWinner } from '@/shared/bounties';

/** Paid Rewards v2 client: board, detail, photo proofs, escrow funding, payouts. All state lives on the ObjectPad API. */
export type RewardStatus = 'draft' | 'open' | 'won' | 'paying' | 'paid' | 'refunding' | 'cancelled' | 'removed';
export type ProofState = 'submitted' | 'winner' | 'rejected' | 'paid';
export type RewardCategory = 'find' | 'scan' | 'promo' | 'meme' | 'art' | 'other';
export interface RewardProof { id: string; rewardId: string; photo: string; recordId: string | null; token: string | null; coinName: string; coinSymbol: string; coinImage: string; note: string; state: ProofState; reviewNote: string; payoutTx: string | null; handle: string; name: string; avatar: string; wallet: string; mine: boolean; createdAt: number; }
export interface RewardAudit { event: string; detail: string; tx: string | null; at: number; }
export interface RewardPoster { handle: string; name: string; avatar: string; wallet: string; }
export interface Reward {
  id: string; kind: 'platform' | 'community'; title: string; object: string; tagline: string; rules: string[]; category: RewardCategory; adult?: boolean;
  rewardUsd: number; rewardEth?: number; rewardWei?: string; image: string; coverState?: 'none' | 'generating' | 'ready' | 'failed' | 'upload'; promoUrl?: string; xUrl?: string;
  status: RewardStatus; deadline?: number | null; poster: RewardPoster; fundTx?: string | null; refundTx?: string | null; payoutTx?: string | null; winnerSub?: string | null;
  escrow: string | null; mine: boolean; postedAt: string; createdAt: number; submissions: RewardProof[]; audit: RewardAudit[]; winner?: BountyWinner;
}
export interface RewardStats { openUsd: number; paidUsd: number; open: number; paid: number; hunters: number; proofs: number; escrowEth: number; }
export interface RewardBoard { bounties: Reward[]; stats: RewardStats; escrow: string; operator: boolean; updatedAt: number; }

export const REWARDS_KEY = ['objectpad', 'rewards'] as const;
export const EXPLORER = 'https://robinhoodchain.blockscout.com';
export const txUrl = (hash: string): string => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (a: string): string => `${EXPLORER}/address/${a}`;
export const rewardUrl = (id: string): string => `https://objectpad.fun/rewards/${id}`;
export const CATEGORY_LABEL: Record<RewardCategory, string> = { find: 'Find it', scan: 'Scan it', promo: 'Promote', meme: 'Meme IRL', art: 'Art', other: 'Other' };
export const isLive = (r: Reward): boolean => r.status === 'open';

async function authed(session: ReturnType<typeof useSession>): Promise<string | null> { return session.authenticated ? session.token() : null; }

export function useRewardBoard() {
  const session = useSession();
  return useQuery({ queryKey: [...REWARDS_KEY, 'board', session.authenticated], queryFn: async () => api<RewardBoard>('/rewards', { token: await authed(session) }), refetchInterval: 15_000 });
}
export function useReward(id: string | undefined) {
  const session = useSession();
  return useQuery({ queryKey: [...REWARDS_KEY, 'one', id, session.authenticated], enabled: Boolean(id), queryFn: async () => api<Reward>(`/rewards/${id}`, { token: await authed(session) }), refetchInterval: q => (q.state.data?.status === 'paying' || q.state.data?.status === 'refunding' || q.state.data?.coverState === 'generating' ? 4_000 : 15_000) });
}

function useRewardMutation<I, O>(fn: (token: string | null, input: I) => Promise<O>) {
  const session = useSession(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (input: I) => fn(await session.token(), input), onSettled: () => { void qc.invalidateQueries({ queryKey: REWARDS_KEY }); } });
}
export interface CreateRewardInput { object: string; title: string; brief: string; rules: string[]; category: RewardCategory; adult: boolean; rewardUsd: number; promoUrl: string; days: number; cover: string; }
export const useCreateReward = () => useRewardMutation<CreateRewardInput, Reward>((token, body) => api<Reward>('/rewards', { token, method: 'POST', body, timeout: 30_000 }));
export const useFundReward = () => useRewardMutation<{ id: string; hash: string }, Reward>((token, { id, hash }) => api<Reward>(`/rewards/${id}/fund`, { token, method: 'POST', body: { hash }, timeout: 45_000 }));
export const useCancelReward = () => useRewardMutation<{ id: string; reason: string }, Reward>((token, { id, reason }) => api<Reward>(`/rewards/${id}/cancel`, { token, method: 'POST', body: { reason }, timeout: 60_000 }));
export const useSubmitProof = () => useRewardMutation<{ id: string; photo: string; coin: string; note: string }, RewardProof>((token, { id, ...body }) => api<RewardProof>(`/rewards/${id}/submissions`, { token, method: 'POST', body }));
export const usePayout = () => useRewardMutation<{ subId: string }, Reward>((token, { subId }) => api<Reward>(`/rewards/submissions/${subId}/payout`, { token, method: 'POST', body: {}, timeout: 60_000 }));
export const useReviewProof = () => useRewardMutation<{ subId: string; state: ProofState; note: string; tx: string }, Reward>((token, { subId, ...body }) => api<Reward>(`/rewards/submissions/${subId}/review`, { token, method: 'POST', body }));

/** Shrinks a photo in the browser (max 1600px, JPEG) so uploads are fast; the server re-encodes and strips metadata again. */
export async function prepPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Pick a photo (JPG or PNG).');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('That photo couldn’t be read. Try a JPG or PNG.'); });
  const max = 1600; const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(128, Math.round(bitmap.width * scale)); const h = Math.max(128, Math.round(bitmap.height * scale));
  if (Math.max(w, h) > 3 * Math.min(w, h)) throw new Error('That photo is too stretched. Use a normal photo.');
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your browser can’t process photos.');
  ctx.drawImage(bitmap, 0, 0, w, h); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.88));
}
export function useUploadPhoto() {
  const session = useSession();
  return useMutation({ mutationFn: async (file: File) => api<{ hash: string; url: string }>('/rewards/photos', { token: await session.token(), method: 'PUT', binary: await prepPhoto(file), timeout: 60_000 }) });
}

export const REWARD_ERRORS: Record<string, string> = {
  REWARD_OBJECT_INVALID: 'Name the object in 2–60 characters.', REWARD_TITLE_INVALID: 'Give it a title of 4–70 characters.', REWARD_BRIEF_INVALID: 'Describe the ask in 10–280 characters.',
  REWARD_AMOUNT_INVALID: 'Rewards are $5 to $10,000.', REWARD_LINK_INVALID: 'That link isn’t a valid https:// URL.', ETH_PRICE_UNAVAILABLE: 'Live ETH price is unavailable right now. Try again in a minute.',
  REWARD_PHOTO_MISSING: 'Upload the photo again.', REWARD_ALREADY_FUNDED: 'This bounty is already funded.', TX_INVALID: 'Paste a transaction hash: 0x followed by 64 characters.',
  TX_ALREADY_USED: 'That transaction already funded another bounty.', TX_NOT_FOUND: 'That transaction isn’t on Robinhood Chain yet. Wait a few seconds and retry.', TX_FAILED: 'That transaction failed on-chain.',
  TX_WRONG_RECIPIENT: 'That transaction didn’t go to the ObjectPad Rewards escrow address.', TX_AMOUNT_LOW: 'That deposit is less than the reward amount.', TX_WRONG_CHAIN: 'Send on Robinhood Chain (4663).', TX_TOO_OLD: 'That transaction was sent before this bounty was created.',
  REWARD_NOT_OPEN: 'This bounty isn’t open.', SUBMISSION_NOT_PENDING: 'That proof was already decided.', ESCROW_TOO_SMALL: 'The escrow is too small to cover network fees.', PAYOUT_FAILED: 'The payout couldn’t be sent. Nothing moved; try again.', REFUND_FAILED: 'The refund couldn’t be sent. Nothing moved; try again.',
  REWARD_HAS_PENDING: 'Proofs are waiting for your decision. Pick a winner or reject them before cancelling.', REVIEW_REASON_REQUIRED: 'Add a short public reason.', REWARD_OWN_BOUNTY: 'You can’t claim your own bounty.', REWARD_EXPIRED: 'This bounty has ended.',
  REWARD_PROOF_REQUIRED: 'Add a photo of the object, or the coin you launched for it.', REWARD_TOO_MANY: 'You already have 3 proofs waiting on this bounty.', BOUNTY_CLOSED: 'This bounty already has a winner.', BOUNTY_ALREADY_SUBMITTED: 'That proof was already submitted.',
  BOUNTY_COIN_NOT_FOUND: 'We couldn’t find that coin. Paste its 0x address or objectpad.fun link.', BOUNTY_NOT_YOUR_COIN: 'That coin was launched by another account.', BOUNTY_COIN_NOT_LIVE: 'That coin isn’t live yet.', BOUNTY_ALREADY_WON: 'Another proof is already the winner.',
  PAYOUT_TX_REQUIRED: 'Paste the payout transaction hash.', WALLET_REQUIRED: 'Your account needs a wallet to get paid. Open My wallet once, then retry.', SIGN_IN_REQUIRED: 'Sign in first.', UNSUPPORTED_IMAGE: 'Use a JPG or PNG photo.', ICON_INVALID: 'That photo is too small or oddly shaped.', RATE_LIMITED: 'Slow down a little and try again.', FORBIDDEN: 'Only the poster or ObjectPad can do that.', NOT_FOUND: 'That bounty wasn’t found.',
};
export const rewardError = (e: unknown): string => e instanceof RequestError ? (REWARD_ERRORS[e.code] ?? e.message) : e instanceof Error ? e.message : 'Something went wrong. Try again.';
