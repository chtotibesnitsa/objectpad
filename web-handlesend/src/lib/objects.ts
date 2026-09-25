import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import { api } from './api';
import { chain, ECONOMY, readCurve, readTrades, type CurveState } from './chain';
import type { ObjectRecord, PublicFeed } from '@/shared/domain';
import { ERC20_ABI } from '@/shared/pons';
import { ESCROW_ABI, FORGE_ABI, PONS_FEE_ESCROW, VAULT_ABI, VAULT_FACTORY_ABI } from '@/shared/economy';

export type SortKey = 'trending' | 'newest' | 'marketcap' | 'volume';
export interface TrendingEntry { objectId: string; score: number; views: number; interactions: number; saves: number; }
export interface ListedObject { record: ObjectRecord; curve: CurveState | null; trend: TrendingEntry | null; }

/** Confirmed archive records plus live curve state, read in one multicall batch per page. */
export function useArchive(options: { q?: string; category?: string; sort?: SortKey } = {}) {
  const { q = '', category = '', sort = 'trending' } = options;
  return useQuery({ queryKey: ['objectpad', 'archive', q, category, sort], retry: false, staleTime: 20_000, queryFn: async ({ signal }): Promise<{ items: ListedObject[]; partial: boolean }> => {
    const [feed, trending] = await Promise.all([api<PublicFeed>(`/objects?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`, { signal }), api<{ items: TrendingEntry[] }>('/trending', { signal }).catch(() => ({ items: [] as TrendingEntry[] }))]);
    const trend = new Map(trending.items.map(item => [item.objectId, item]));
    const curves = await Promise.all(feed.items.map(item => readCurve(item.curveAddress as Address).catch(() => null)));
    const items = feed.items.map((record, i) => ({ record, curve: curves[i], trend: trend.get(record.objectId) ?? null }));
    if (sort === 'trending') items.sort((a, b) => (b.trend?.score ?? 0) - (a.trend?.score ?? 0));
    if (sort === 'marketcap') items.sort((a, b) => (b.curve?.marketCapEth ?? 0) - (a.curve?.marketCapEth ?? 0));
    if (sort === 'volume') items.sort((a, b) => (b.curve?.realReserveEth ?? 0) - (a.curve?.realReserveEth ?? 0));
    return { items, partial: Boolean(feed.nextCursor) };
  } });
}
export function useCurve(curve: Address | undefined) { return useQuery({ queryKey: ['objectpad', 'curve', curve], enabled: Boolean(curve), queryFn: () => readCurve(curve!), refetchInterval: 15_000, retry: 1 }); }
export function useTrades(curve: Address | undefined) { return useQuery({ queryKey: ['objectpad', 'trades', curve], enabled: Boolean(curve), queryFn: () => readTrades(curve!), refetchInterval: 30_000, retry: 1 }); }

/** Balances of every archive coin for one wallet. Failed reads are surfaced, never shown as zero. */
export function useHoldings(wallet: Address | null, records: ObjectRecord[] | undefined) {
  return useQuery({ queryKey: ['objectpad', 'holdings', wallet, records?.map(r => r.tokenAddress).join()], enabled: Boolean(wallet && records), queryFn: async () => {
    const list = records ?? []; if (!list.length) return [] as { record: ObjectRecord; balance: bigint }[];
    const balances = await Promise.all(list.map(record => chain.readContract({ address: record.tokenAddress as Address, abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet!] })));
    return list.map((record, i) => ({ record, balance: balances[i] }));
  }, refetchInterval: 30_000 });
}

export interface ArtifactView { id: bigint; tokens: Address[]; amounts: bigint[]; shares: bigint[]; craftedAt: number; unlockAt: number; multiplierBps: number; burned: bigint; pending: bigint; }
export function useArtifacts(owner: Address | null) {
  const forge = ECONOMY.forge;
  return useQuery({ queryKey: ['objectpad', 'artifacts', owner, forge], enabled: Boolean(owner && forge), queryFn: async (): Promise<ArtifactView[]> => {
    const ids = await chain.readContract({ address: forge!, abi: FORGE_ABI, functionName: 'itemsOf', args: [owner!] }) as readonly bigint[];
    return Promise.all(ids.map(async id => {
      const [ingredients, item, pending] = await Promise.all([chain.readContract({ address: forge!, abi: FORGE_ABI, functionName: 'ingredientsOf', args: [id] }), chain.readContract({ address: forge!, abi: FORGE_ABI, functionName: 'items', args: [id] }), chain.readContract({ address: forge!, abi: FORGE_ABI, functionName: 'pending', args: [id] })]);
      const [tokens, amounts, shares] = ingredients as readonly [readonly Address[], readonly bigint[], readonly bigint[]]; const [craftedAt, unlockAt, multiplierBps, , burned] = item as readonly [bigint, bigint, number, number, bigint];
      return { id, tokens: [...tokens], amounts: [...amounts], shares: [...shares], craftedAt: Number(craftedAt), unlockAt: Number(unlockAt), multiplierBps: Number(multiplierBps), burned, pending: pending as bigint };
    }));
  }, refetchInterval: 30_000 });
}

/** Fee vault view for one object: accrued in the Pons escrow, lifetime harvested and any creator pull balance. */
export function useVault(objectId: string | undefined) {
  const factory = ECONOMY.vaultFactory;
  return useQuery({ queryKey: ['objectpad', 'vault', objectId, factory], enabled: Boolean(objectId && factory), queryFn: async () => {
    const id = `0x${objectId}` as `0x${string}`;
    const [vault, deployed] = await Promise.all([chain.readContract({ address: factory!, abi: VAULT_FACTORY_ABI, functionName: 'vaultOf', args: [id] }), chain.readContract({ address: factory!, abi: VAULT_FACTORY_ABI, functionName: 'deployed', args: [id] })]) as [Address, Address];
    const live = deployed !== '0x0000000000000000000000000000000000000000';
    const [accrued, held, harvested, owed] = await Promise.all([chain.readContract({ address: PONS_FEE_ESCROW, abi: ESCROW_ABI, functionName: 'balanceOf', args: [vault] }), chain.getBalance({ address: vault }), live ? chain.readContract({ address: vault, abi: VAULT_ABI, functionName: 'totalHarvested' }) : Promise.resolve(0n), live ? chain.readContract({ address: vault, abi: VAULT_ABI, functionName: 'creatorOwed' }) : Promise.resolve(0n)]);
    return { vault, live, accrued: accrued as bigint, held, harvested: harvested as bigint, owed: owed as bigint };
  }, refetchInterval: 30_000 });
}
