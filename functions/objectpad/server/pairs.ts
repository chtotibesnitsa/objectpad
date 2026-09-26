import { parseAbi, type Address } from 'viem';
import { ETH_PAIR, PAIR_ASSETS, pairAsset, type PairAsset } from '../shared/pairs';
import { PONS_FACTORY } from '../shared/pons';
import { ApiError } from '../shared/security';
import { serverClient } from './chain';
import type { Runtime } from './types';
import type { Store } from './store';

/** Uniswap V3 on Robinhood Chain (verified on-chain: router.factory() and router.WETH9() match). */
export const UNI_V3_FACTORY: Address = '0x1f7d7550b1b028f7571e69a784071f0205fd2efa';
export const SWAP_ROUTER02: Address = '0xcaf681a66d020601342297493863e78c959e5cb2';
export const QUOTER_V2: Address = '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7';
export const WETH: Address = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const FEES = [100, 500, 3000, 10000] as const;
const V3_FACTORY_ABI = parseAbi(['function getPool(address,address,uint24) view returns(address)']);
const POOL_ABI = parseAbi(['function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)', 'function liquidity() view returns(uint128)', 'function token0() view returns(address)']);
const APPROVAL_ABI = parseAbi(['function approvedPairTokens(address) view returns(bool)']);
const TOKEN_LOGO_ABI = parseAbi(['function logo() view returns(string)']);
const ZERO = '0x0000000000000000000000000000000000000000';
const USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168';

export interface PairQuote extends PairAsset { logo: string; approved: boolean; priceEth: number | null; priceUsd: number | null; change24h: number | null; pool: { address: string; fee: number } | null; coins: number; /** Uniswap V3 path to buy this asset with ETH (WETH first). Used for ETH auto-swap buys. */ route: { tokens: string[]; fees: number[] } | null; }
export interface PairBoard { updatedAt: number; ethUsd: number | null; assets: PairQuote[]; router: { swapRouter: string; quoter: string; weth: string; factory: string }; }

const COINGECKO: Record<string, string> = {
  ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  cbBTC: 'https://assets.coingecko.com/coins/images/40143/large/cbbtc.webp',
  USDG: 'https://assets.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png',
  TAO: 'https://assets.coingecko.com/coins/images/28452/large/ARUsPeNQ_400x400.jpeg',
};
const ipfs = (value: string): string => value.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${value.slice(7)}` : value;

/**
 * Pons V2 quote assets ("pairs"): tokenized stocks, ETFs, commodities, USDG, cbBTC and community coins a launch may be
 * priced in. Prices are read from the deepest Uniswap V3 WETH pool on Robinhood Chain; 24h change is computed from our own
 * stored snapshots of those on-chain prices. Nothing is estimated or pulled from an off-chain quote feed.
 */
export class PairService {
  private board: { at: number; value: PairBoard } | null = null; private flight: Promise<PairBoard> | null = null;
  private pools: Map<string, { address: Address; fee: number; base: string }[]> | null = null; private poolsAt = 0;
  private approvals: { at: number; set: Set<string> } | null = null;
  constructor(private readonly store: Store, private readonly runtime: Runtime) {
    store.run('CREATE TABLE IF NOT EXISTS op_pair_prices (token TEXT NOT NULL, at INTEGER NOT NULL, price_eth REAL NOT NULL, PRIMARY KEY(token, at))');
  }
  logoUrl(asset: PairAsset): string { return `${this.runtime.apiOrigin}/api/pairs/logo/${asset.address.toLowerCase()}`; }
  /** Which catalog assets the Pons factory approves right now (cached 10 minutes). */
  async approved(): Promise<Set<string>> {
    if (this.approvals && Date.now() - this.approvals.at < 600_000) return this.approvals.set;
    const erc = PAIR_ASSETS.filter(a => a.kind !== 'native');
    const results = await serverClient(this.runtime.env).multicall({ contracts: erc.map(a => ({ address: PONS_FACTORY, abi: APPROVAL_ABI, functionName: 'approvedPairTokens' as const, args: [a.address as Address] })), allowFailure: true });
    const set = new Set<string>([ZERO]); erc.forEach((a, i) => { if (results[i]?.status === 'success' && results[i].result === true) set.add(a.address.toLowerCase()); });
    this.approvals = { at: Date.now(), set }; return set;
  }
  /** Throws unless `address` is a catalog asset the factory currently approves. Returns the asset. */
  async require(address: string | undefined | null): Promise<PairAsset> {
    const asset = pairAsset(address); if (!asset) throw new ApiError('PAIR_NOT_SUPPORTED');
    if (asset.kind !== 'native' && !(await this.approved()).has(asset.address.toLowerCase())) throw new ApiError('PAIR_NOT_APPROVED', 409);
    return asset;
  }
  /** WETH pools for every asset, plus USDG pools as a second price route (some stocks only trade against USDG). */
  private async discoverPools(): Promise<Map<string, { address: Address; fee: number; base: string }[]>> {
    if (this.pools && Date.now() - this.poolsAt < 6 * 3_600_000) return this.pools;
    const erc = PAIR_ASSETS.filter(a => a.kind !== 'native'); const bases = [WETH.toLowerCase(), USDG];
    const combos = erc.flatMap(a => bases.filter(b => b !== a.address.toLowerCase()).flatMap(base => FEES.map(fee => ({ token: a.address.toLowerCase(), base, fee }))));
    const results = await serverClient(this.runtime.env).multicall({ contracts: combos.map(c => ({ address: UNI_V3_FACTORY, abi: V3_FACTORY_ABI, functionName: 'getPool' as const, args: [c.base as Address, c.token as Address, c.fee] as const })), allowFailure: true });
    const map = new Map<string, { address: Address; fee: number; base: string }[]>();
    combos.forEach((c, i) => { const r = results[i]; if (r?.status !== 'success' || !r.result || r.result === ZERO) return; const list = map.get(c.token) ?? []; list.push({ address: (r.result as string).toLowerCase() as Address, fee: c.fee, base: c.base }); map.set(c.token, list); });
    this.pools = map; this.poolsAt = Date.now(); return map;
  }
  /** Live pair board (cached 30s, single flight). */
  list(coinCounts: Map<string, number> = new Map()): Promise<PairBoard> {
    if (this.board && Date.now() - this.board.at < 30_000) return Promise.resolve(this.withCounts(this.board.value, coinCounts));
    if (!this.flight) this.flight = this.build().then(value => { this.board = { at: Date.now(), value }; return value; }).finally(() => { this.flight = null; });
    return this.flight.then(value => this.withCounts(value, coinCounts));
  }
  private withCounts(board: PairBoard, counts: Map<string, number>): PairBoard { return { ...board, assets: board.assets.map(a => ({ ...a, coins: counts.get(a.address.toLowerCase()) ?? 0 })) }; }
  /** ETH price of one whole unit of each asset, for converting quote-denominated curve prices. */
  async ethPrices(): Promise<Map<string, number>> { const board = await this.list(); return new Map(board.assets.filter(a => a.priceEth !== null).map(a => [a.address.toLowerCase(), a.priceEth as number])); }
  private async build(): Promise<PairBoard> {
    const [pools, approved, ethUsd] = await Promise.all([this.discoverPools(), this.approved(), fetchEthUsd()]);
    const flat = [...pools.entries()].flatMap(([token, list]) => list.map(p => ({ token, ...p })));
    const reads = flat.length ? await serverClient(this.runtime.env).multicall({ contracts: flat.flatMap(p => [{ address: p.address, abi: POOL_ABI, functionName: 'slot0' as const }, { address: p.address, abi: POOL_ABI, functionName: 'liquidity' as const }]), allowFailure: true }) : [];
    // Deepest pool per (asset, base). WETH route is preferred; USDG route is used only when no live WETH pool exists.
    const best = new Map<string, { address: string; fee: number; liquidity: bigint; sqrt: bigint; base: string }>();
    flat.forEach((p, i) => {
      const s = reads[i * 2]; const l = reads[i * 2 + 1]; if (s?.status !== 'success' || l?.status !== 'success') return;
      const liquidity = l.result as bigint; const sqrt = (s.result as readonly [bigint, ...unknown[]])[0]; if (liquidity <= 0n || sqrt <= 0n) return;
      const k = `${p.token}|${p.base}`; const prev = best.get(k); if (!prev || liquidity > prev.liquidity) best.set(k, { address: p.address, fee: p.fee, liquidity, sqrt, base: p.base });
    });
    const decimalsOf = (addr: string): number => pairAsset(addr)?.decimals ?? 18;
    /** Price of one whole `token` in units of one whole `base`, from a pool's sqrtPriceX96. */
    const priceIn = (token: string, pool: { sqrt: bigint; base: string }): number => {
      const raw = (Number(pool.sqrt) / 2 ** 96) ** 2; const tokenIs0 = token < pool.base;
      const dt = decimalsOf(token); const db = pool.base === WETH.toLowerCase() ? 18 : decimalsOf(pool.base);
      return tokenIs0 ? raw * 10 ** (dt - db) : (1 / raw) * 10 ** (dt - db);
    };
    const usdgWeth = best.get(`${USDG}|${WETH.toLowerCase()}`); const usdgEth = usdgWeth ? priceIn(USDG, usdgWeth) : null;
    const now = Date.now(); const bucket = Math.floor(now / 600_000) * 600_000; const dayAgo = now - 86_400_000;
    const assets: PairQuote[] = PAIR_ASSETS.map(asset => {
      const key = asset.address.toLowerCase(); const logo = this.logoUrl(asset);
      if (asset.kind === 'native') return { ...asset, logo, approved: true, priceEth: 1, priceUsd: ethUsd, change24h: null, pool: null, coins: 0, route: null };
      const wethPool = best.get(`${key}|${WETH.toLowerCase()}`); const usdgPool = best.get(`${key}|${USDG}`);
      const pool = wethPool ?? (usdgEth ? usdgPool : undefined); let priceEth: number | null = null;
      if (wethPool) priceEth = priceIn(key, wethPool);
      else if (usdgPool && usdgEth) priceEth = priceIn(key, usdgPool) * usdgEth;
      if (priceEth !== null && !(Number.isFinite(priceEth) && priceEth > 0)) priceEth = null;
      let change24h: number | null = null;
      if (priceEth) {
        this.store.run('INSERT OR REPLACE INTO op_pair_prices(token,at,price_eth) VALUES (?,?,?)', key, bucket, priceEth);
        const then = this.store.one<{ price_eth: number }>('SELECT price_eth FROM op_pair_prices WHERE token=? AND at<=? ORDER BY at DESC LIMIT 1', key, dayAgo)
          ?? this.store.one<{ price_eth: number; at: number }>('SELECT price_eth, at FROM op_pair_prices WHERE token=? AND at<=? ORDER BY at ASC LIMIT 1', key, now - 3_600_000);
        if (then?.price_eth) change24h = ((priceEth - then.price_eth) / then.price_eth) * 100;
      }
      const route = wethPool ? { tokens: [WETH.toLowerCase(), key], fees: [wethPool.fee] } : usdgPool && usdgWeth ? { tokens: [WETH.toLowerCase(), USDG, key], fees: [usdgWeth.fee, usdgPool.fee] } : null;
      return { ...asset, logo, approved: approved.has(key), priceEth, priceUsd: priceEth && ethUsd ? priceEth * ethUsd : null, change24h, pool: pool ? { address: pool.address, fee: pool.fee } : null, coins: 0, route };
    });
    this.store.run('DELETE FROM op_pair_prices WHERE at<?', now - 8 * 86_400_000);
    return { updatedAt: now, ethUsd, assets, router: { swapRouter: SWAP_ROUTER02, quoter: QUOTER_V2, weth: WETH, factory: UNI_V3_FACTORY } };
  }
  /** Proxied, cached logo for one pair asset: company logos for stocks/ETFs, token logos for crypto, on-chain logo for community coins. */
  async logo(address: string): Promise<Response> {
    const asset = pairAsset(address); if (!asset) throw new ApiError('NOT_FOUND', 404);
    const key = `pair-logo/v1/${asset.address.toLowerCase()}`; let object = await this.runtime.artifactBucket.get(key);
    if (!object) {
      const sources: string[] = [];
      if (COINGECKO[asset.symbol]) sources.push(COINGECKO[asset.symbol]);
      if (['stock', 'etf', 'commodity'].includes(asset.kind)) sources.push(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(asset.symbol)}.png`);
      if (asset.kind === 'community' || asset.kind === 'crypto') { const onchain = await serverClient(this.runtime.env).readContract({ address: asset.address as Address, abi: TOKEN_LOGO_ABI, functionName: 'logo' }).catch(() => ''); if (onchain && /^(ipfs:\/\/|https:\/\/)/.test(onchain)) sources.push(ipfs(onchain)); }
      for (const url of sources) {
        try { const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'image/*' } }); const type = res.headers.get('content-type') ?? ''; if (!res.ok || !type.startsWith('image/')) continue; const bytes = new Uint8Array(await res.arrayBuffer()); if (bytes.length < 200 || bytes.length > 1_500_000) continue; await this.runtime.artifactBucket.put(key, bytes, { httpMetadata: { contentType: type } }); break; } catch { /* try next source */ }
      }
      object = await this.runtime.artifactBucket.get(key); if (!object) throw new ApiError('NOT_FOUND', 404);
    }
    return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'image/png', 'Content-Length': String(object.size), 'Cache-Control': 'public,max-age=604800', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'cross-origin' } });
  }
}

let ethUsdCache: { at: number; value: number | null } | null = null;
async function fetchEthUsd(): Promise<number | null> {
  if (ethUsdCache && Date.now() - ethUsdCache.at < 300_000) return ethUsdCache.value;
  try { const res = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', { signal: AbortSignal.timeout(5000) }); const data = await res.json() as { data?: { amount?: string } }; const value = Number(data.data?.amount); ethUsdCache = { at: Date.now(), value: Number.isFinite(value) && value > 0 ? value : null }; }
  catch { ethUsdCache = { at: Date.now(), value: ethUsdCache?.value ?? null }; }
  return ethUsdCache.value;
}

/** Compact catalog text for the AI pairing prompt: "NVDA NVIDIA (Semiconductors); TSLA Tesla (Automotive); …". */
export const PAIR_PROMPT_LIST = PAIR_ASSETS.filter(a => a.kind !== 'native' && a.kind !== 'community').map(a => `${a.symbol} ${a.name} (${a.sector ?? a.kind})`).join('; ');
export { ETH_PAIR };
