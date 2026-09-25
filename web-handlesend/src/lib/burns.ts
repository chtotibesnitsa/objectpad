import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** One real $OBJECTPAD buyback & burn sent by the ObjectPad treasury. */
export interface BurnEntry { id: string; at: number; ethIn: string; tokensBurned: string; hash: string | null; state: 'submitted' | 'confirmed' | 'failed'; coins: { symbol: string; name: string; share: number }[]; }
export interface BurnFeed { live: boolean; token: string | null; intervalSec: number; nextAt: number | null; totalEth: string; totalTokens: string; burns: number; pendingEth: string; items: BurnEntry[]; }

/** Live burn feed from the backend: every entry is a real transaction on Robinhood Chain. */
export function useBurnFeed() {
  return useQuery({ queryKey: ['objectpad', 'burns'], queryFn: () => api<BurnFeed>('/burns'), refetchInterval: 30_000, staleTime: 20_000 });
}
