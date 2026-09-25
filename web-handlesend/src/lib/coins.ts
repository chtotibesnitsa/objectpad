import { useQuery } from '@tanstack/react-query';
import type { ObjectCoin } from '@/shared/domain';
import { api } from './api';
import { exhibitById, MEMES, type MemeExhibit } from './memes';

export interface CoinTrade { id: string; curve: string; side: 'buy' | 'sell'; eth: number; tokens: number; price: number; trader: string; hash: string; block: number; at: number; }
export interface CoinsFeed { items: ObjectCoin[]; recent: CoinTrade[]; updatedAt: number; }
export interface CoinHolder { address: string; balance: number; share: number; since: number; label?: string; }

/**
 * Every ObjectPad coin with exact stats indexed from Robinhood Chain: real creators' coins first (trending, newest),
 * then ObjectPad originals. Refreshed every 10 seconds.
 */
export function useCoins() {
  return useQuery({ queryKey: ['objectpad', 'coins'], queryFn: ({ signal }) => api<CoinsFeed>('/coins', { signal, timeout: 45_000 }), refetchInterval: 10_000, staleTime: 6_000, retry: 2 });
}

/** Exact holders of one coin, from every Transfer since launch. */
export function useHolders(curve: string | undefined) {
  return useQuery({ queryKey: ['objectpad', 'holders', curve], enabled: Boolean(curve), queryFn: ({ signal }) => api<{ count: number; holders: CoinHolder[] }>(`/curves/${curve}/holders`, { signal, timeout: 40_000 }), refetchInterval: 20_000, retry: 1 });
}

/** The 3D exhibit behind an ObjectPad original (model, spin sprite, coin art). */
export const exhibitForTicker = (ticker: string): MemeExhibit | undefined => MEMES.find(m => m.ticker.toLowerCase() === ticker.toLowerCase()) ?? (ticker.toLowerCase() === 'shiba' ? exhibitById('shiba') : undefined);
