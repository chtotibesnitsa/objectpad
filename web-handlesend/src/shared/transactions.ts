import { ApiError } from './security';
export type TxState = 'prepared' | 'awaiting_wallet' | 'submitted' | 'confirming' | 'confirmed' | 'reverted' | 'reorg_review' | 'unknown';
export function reconcileReceipt(input: { savedBlockHash?: string; currentBlockHash?: string; receiptBlockHash?: string; receiptBlock?: bigint; head: bigint; status?: 'success' | 'reverted'; requiredDepth: bigint }): TxState {
  if (!input.receiptBlockHash || input.receiptBlock === undefined || !input.currentBlockHash) return input.savedBlockHash ? 'reorg_review' : 'unknown';
  if (input.receiptBlockHash !== input.currentBlockHash || (input.savedBlockHash && input.savedBlockHash !== input.receiptBlockHash)) return 'reorg_review';
  if (input.status === 'reverted') return 'reverted';
  return input.head - input.receiptBlock >= input.requiredDepth ? 'confirmed' : 'confirming';
}
/** Submission uncertainty never releases an operation for a fresh transaction. */
export function canSubmit(state: TxState, hasHash: boolean): boolean { return state === 'prepared' && !hasHash; }
export function assertLaunchPrerequisites(input: { authenticated: boolean; profile: boolean; coverage: boolean; validated: boolean; approved: boolean; rights: boolean; metadata: boolean; provenanceConfirmed: boolean; deploymentVerified: boolean; enabled: boolean }): void {
  if (Object.values(input).some(value => !value)) throw new ApiError('LAUNCH_PREREQUISITES', 409);
}
