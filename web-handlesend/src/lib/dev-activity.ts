import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Mirrors functions/objectpad/server/dev-activity.ts — read-only developer buyback/burn ledger, straight from Robinhood Chain receipts. */
export type ExecutionMode = 'manual' | 'automatic';
export type ActivityKind = 'cycle' | 'buy_only' | 'removal_only';
export type BurnClassification = 'SUPPLY_BURN' | 'CIRCULATING_SUPPLY_REMOVAL' | null;
export interface DevActivityItem {
  cycleId: string; kind: ActivityKind; executionMode: ExecutionMode;
  buyTxHash: string | null; burnTxHash: string | null;
  quoteAsset: 'ETH'; quoteAmount: string; tokenAmountBought: string; tokenAmountRemoved: string; tokenAmountBurned: string;
  burnClassification: BurnClassification; gasUsed: string; gasCostEth: string;
  blockNumber: number; timestamp: number; confirmations: number; status: 'pending' | 'confirmed';
  ethUsdAtIndex: number | null; priceCapturedAt: 'execution' | 'indexing';
  explorerUrls: { buy: string | null; burn: string | null };
}
export interface DevActivitySummary {
  developerWallet: string; tokenAddress: string | null; executionMode: ExecutionMode; automationStatus: string;
  tokenSupportsBurn: boolean;
  totals: { cycles: number; ethSpent: number; usdSpent: number; tokensBought: number; tokensBurned: number; tokensRemovedFromCirculation: number };
  latestCycle: DevActivityItem | null; activities: DevActivityItem[]; nextCursor: number | null; total: number;
  lastIndexedBlock: number; backfillComplete: boolean; updatedAt: number;
}

/** Developer buyback/burn ledger for the treasury page. Public, unauthenticated, paginated by cursor. */
export function useDevActivity(cursor = 0, limit = 5) {
  return useQuery({
    queryKey: ['objectpad', 'treasury', 'developer-activity', cursor, limit],
    queryFn: () => api<DevActivitySummary>(`/treasury/developer-activity?cursor=${cursor}&limit=${limit}`),
    refetchInterval: 30_000, staleTime: 15_000, placeholderData: prev => prev,
  });
}
