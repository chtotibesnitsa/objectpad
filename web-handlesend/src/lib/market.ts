import { useQuery } from '@tanstack/react-query';
import type { MarketSnapshot, Readiness } from '@/shared/domain';
import { api, fetchReadiness } from './api';

/** Live Pons V2 market on Robinhood Chain (every curve, ObjectPad coins tagged), refreshed every 15 seconds. */
export function useMarket() {
  return useQuery({ queryKey: ['objectpad', 'market'], queryFn: ({ signal }) => api<MarketSnapshot>('/market', { signal, timeout: 30_000 }), refetchInterval: 15_000, staleTime: 10_000, retry: 1 });
}

/** Deployment readiness, including the live free-launch sponsor balance. */
export function useReadiness() {
  return useQuery<Readiness>({ queryKey: ['objectpad', 'status'], queryFn: fetchReadiness, retry: false, refetchInterval: 30_000, staleTime: 15_000 });
}

export interface CurveTrade { id: string; side: 'buy' | 'sell'; eth: number; tokens: number; price: number; trader: string; hash: string; block: number; at: number; }
/** Up to ~3 days of decoded curve trades for one coin, served by the ObjectPad API from chain logs. */
export function useCurveTrades(curve: string | undefined) {
  return useQuery({ queryKey: ['objectpad', 'curve-trades', curve], enabled: Boolean(curve), queryFn: ({ signal }) => api<{ trades: CurveTrade[]; fromBlock: number; toBlock: number }>(`/curves/${curve}/trades`, { signal, timeout: 40_000 }), refetchInterval: 8_000, retry: 1 });
}

/** A showcase coin ObjectPad launches from its treasury. `live` rows carry the real token and curve from the receipt. */
export interface HouseCoin { id: string; ticker: string; name: string; state: 'waiting' | 'submitted' | 'live' | 'failed'; hash: string | null; token: string | null; curve: string | null; launchedAt: number | null; }
/** Launch status of the showcase coins, refreshed every 15 seconds. */
export function useHouseCoins() {
  return useQuery({ queryKey: ['objectpad', 'house'], queryFn: ({ signal }) => api<{ coins: HouseCoin[] }>('/house', { signal }), refetchInterval: 15_000, staleTime: 10_000, retry: 1 });
}
