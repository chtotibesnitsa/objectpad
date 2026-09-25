import { keccak256, type Address } from 'viem';
import { ApiError } from '../shared/security';
import { chainClient, PONS_FACTORY, PONS_ROUTER } from '../shared/pons';
import type { Env } from './types';

/** keccak256 of the deployed Pons V2 runtime code, read from Robinhood Chain on 2026-09-23. Operators may override via env. */
export const PONS_FACTORY_CODE_HASH = '0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84';
export const PONS_ROUTER_CODE_HASH = '0xed9065184519eaa24a22c2556403d5d8bbb230ff94dbc5c414cf5028e20e52e7';

/** Project RPC (ObjectPad-specific first, then the shared Robinhood Chain RPC), falling back to the public endpoint. */
export function rpcUrl(env: Env): string | undefined { return env.OBJECTPAD_RPC_URL?.trim() || env.ROBINHOOD_RPC_URL?.trim() || undefined; }
export function serverClient(env: Env) { return chainClient(rpcUrl(env)); }

let pinned: { at: number } | null = null;
/** Refuses to build launch transactions unless chain id and the Pons factory/router bytecode match the pinned versions. */
export async function assertPonsPinned(env: Env): Promise<void> {
  if (pinned && Date.now() - pinned.at < 300_000) return;
  const client = serverClient(env);
  if (await client.getChainId() !== 4663) throw new ApiError('CHAIN_MISMATCH', 503);
  const pins: [Address, string][] = [[PONS_FACTORY, env.OBJECTPAD_PONS_FACTORY_CODE_HASH || PONS_FACTORY_CODE_HASH], [PONS_ROUTER, env.OBJECTPAD_PONS_ROUTER_CODE_HASH || PONS_ROUTER_CODE_HASH]];
  for (const [address, expected] of pins) { const code = await client.getCode({ address }); if (!code || keccak256(code).toLowerCase() !== expected.toLowerCase()) throw new ApiError('DEPLOYMENT_CODE_MISMATCH', 503); }
  pinned = { at: Date.now() };
}
