import { formatEther, parseAbi, parseAbiItem, type Address } from 'viem';
import type { MarketCoin, MarketSnapshot, MarketTrade } from '../shared/domain';
import { ApiError, boundedBody } from '../shared/security';
import { serverClient } from './chain';
import type { Runtime } from './types';
import { Store } from './store';

const BUY = parseAbiItem('event CurveBuy(address indexed sender,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 protocolFee,uint256 creatorFee)');
const SELL = parseAbiItem('event CurveSell(address indexed sender,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 protocolFee,uint256 creatorFee)');
const CURVE_TOKEN = parseAbi(['function token() view returns (address)']);
const TOKEN_META = parseAbi(['function symbol() view returns (string)', 'function name() view returns (string)', 'function curve() view returns (address)', 'function logo() view returns (string)']);
const TOKEN_LOGO = parseAbi(['function logo() view returns (string)']);
interface TokenInfo { curve: string; token: string; symbol: string; name: string; valid: boolean; logo: string; logoChecked: boolean; }
const IPFS_GATEWAYS = ['https://gateway.pinata.cloud/ipfs/', 'https://w3s.link/ipfs/', 'https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/'];
const MAX_LOGO_BYTES = 1_500_000;
/** Keeps only logo references we know how to resolve: IPFS CIDs/URIs and public https URLs. */
function logoValue(value: unknown): string { const text = typeof value === 'string' ? value.replace(/[^\x21-\x7e]/g, '').slice(0, 300) : ''; return /^(ipfs:\/\/|https:\/\/|Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})/.test(text) ? text : ''; }
function logoSources(value: string): string[] {
  let path: string | null = null;
  const ipfs = value.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/i); const gateway = value.match(/^https:\/\/[^/]+\/ipfs\/(.+)$/i);
  if (ipfs) path = ipfs[1]; else if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/[\w.\-/]*)?$/.test(value)) path = value; else if (gateway) path = gateway[1];
  if (path) return /^[\w.\-/]+$/.test(path) ? IPFS_GATEWAYS.map(base => base + path) : [];
  try { const url = new URL(value); return url.protocol === 'https:' && !/^(localhost|\d+\.\d+\.\d+\.\d+|\[)/i.test(url.hostname) ? [url.toString()] : []; } catch { return []; }
}
/** Raster formats only (no SVG), identified by magic bytes rather than the gateway's content type. */
function sniffImage(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}
/** Blocks per log query (~2.5 minutes on Robinhood Chain, well under the RPC's 10,000-log cap). */
const SPAN = 1_500n;
const printable = (value: unknown, max: number): string => typeof value === 'string' ? value.replace(/[^\x20-\x7e]/g, '').trim().slice(0, max) : '';
let ethUsd: { at: number; value: number | null } | null = null;
export async function ethPrice(): Promise<number | null> {
  if (ethUsd && Date.now() - ethUsd.at < 300_000) return ethUsd.value;
  try { const response = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', { signal: AbortSignal.timeout(5000) }); const data = await response.json() as { data?: { amount?: string } }; const value = Number(data.data?.amount); ethUsd = { at: Date.now(), value: Number.isFinite(value) && value > 0 ? value : null }; }
  catch { ethUsd = { at: Date.now(), value: ethUsd?.value ?? null }; }
  return ethUsd.value;
}

/**
 * Live Pons V2 market on Robinhood Chain, read straight from CurveBuy/CurveSell logs of every curve over the last
 * ~5 minutes. A curve is listed only when its token reports that same curve back (token.curve() == curve).
 * ObjectPad coins are tagged with their object id. Cached for 20 seconds; nothing is estimated or back-filled.
 */
/** One decoded curve trade for charts; `at` is interpolated from block numbers between two real block timestamps. */
export interface CurveTrade { id: string; side: 'buy' | 'sell'; eth: number; tokens: number; price: number; trader: string; hash: string; block: number; at: number; }
const HISTORY_SPAN = 300_000n;
const HISTORY_WINDOWS = 9;

export class MarketService {
  private flight: Promise<MarketSnapshot> | null = null;
  private logoMisses = new Map<string, number>();
  private logoFlights = new Map<string, Promise<{ bytes: Uint8Array; type: string } | null>>();
  private logoUrl(token: string): string { return `${this.runtime.apiOrigin}/api/logos/${token}`; }
  /**
   * Serves a Pons coin's own on-chain logo (read from token.logo()), fetched once from IPFS or https, checked as a raster
   * image by magic bytes and cached in durable storage. Unknown tokens and unresolvable logos return 404.
   */
  async logo(token: string): Promise<Response> {
    const row = this.store.one<{ logo: string }>("SELECT logo FROM op_market_tokens WHERE token=? AND valid=1 AND logo<>'' LIMIT 1", token); if (!row) throw new ApiError('NOT_FOUND', 404);
    const key = `logo/${token}`; let object = await this.runtime.artifactBucket.get(key);
    if (!object) {
      const miss = this.logoMisses.get(token); if (miss && Date.now() - miss < 3_600_000) throw new ApiError('NOT_FOUND', 404);
      let flight = this.logoFlights.get(token); if (!flight) { flight = this.fetchLogo(row.logo).finally(() => this.logoFlights.delete(token)); this.logoFlights.set(token, flight); }
      const fetched = await flight; if (!fetched) { this.logoMisses.set(token, Date.now()); throw new ApiError('NOT_FOUND', 404); }
      await this.runtime.artifactBucket.put(key, fetched.bytes, { httpMetadata: { contentType: fetched.type } }); object = await this.runtime.artifactBucket.get(key);
      if (!object) throw new ApiError('NOT_FOUND', 404);
    }
    return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'image/png', 'Content-Length': String(object.size), 'Cache-Control': 'public,max-age=604800', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'cross-origin' } });
  }
  private async fetchLogo(value: string): Promise<{ bytes: Uint8Array; type: string } | null> {
    for (const source of logoSources(value)) {
      try {
        const response = await fetch(source, { signal: AbortSignal.timeout(8000), redirect: 'follow' }); if (!response.ok) continue;
        const bytes = await boundedBody(response, MAX_LOGO_BYTES); const type = sniffImage(bytes); if (type && bytes.length > 64) return { bytes, type };
      } catch { /* Try the next gateway; a slow or oversized source is skipped. */ }
    }
    return null;
  }
  private history = new Map<string, { at: number; data: Promise<{ trades: CurveTrade[]; fromBlock: number; toBlock: number }> }>();
  /**
   * Trade history for one ObjectPad coin's curve (up to ~3 days), read from CurveBuy/CurveSell logs in bounded windows.
   * Only curves of confirmed ObjectPad launches or verified Pons curves are served. Cached for 15 seconds.
   */
  curveTrades(curve: string): Promise<{ trades: CurveTrade[]; fromBlock: number; toBlock: number }> {
    const key = curve.toLowerCase();
    const known = this.store.one("SELECT id FROM op_records WHERE state='confirmed' AND json_extract(payload,'$.curve')=?", key) ?? this.store.one('SELECT curve FROM op_market_tokens WHERE curve=? AND valid=1', key);
    if (!known) throw new ApiError('NOT_FOUND', 404);
    const cached = this.history.get(key); if (cached && Date.now() - cached.at < 15_000) return cached.data;
    const data = this.readHistory(key as Address); this.history.set(key, { at: Date.now(), data }); data.catch(() => this.history.delete(key));
    if (this.history.size > 200) this.history.delete(this.history.keys().next().value as string);
    return data;
  }
  private async readHistory(curve: Address): Promise<{ trades: CurveTrade[]; fromBlock: number; toBlock: number }> {
    const client = serverClient(this.runtime.env); const head = await client.getBlockNumber();
    const ranges: [bigint, bigint][] = []; for (let i = 0; i < HISTORY_WINDOWS; i++) { const to = head - HISTORY_SPAN * BigInt(i); const from = to - HISTORY_SPAN + 1n; if (to <= 0n) break; ranges.push([from > 0n ? from : 0n, to]); }
    const logs: Awaited<ReturnType<typeof client.getLogs<undefined, [typeof BUY, typeof SELL]>>> = [];
    for (let i = 0; i < ranges.length; i += 3) { const batch = await Promise.all(ranges.slice(i, i + 3).map(([fromBlock, toBlock]) => client.getLogs({ address: curve, events: [BUY, SELL], fromBlock, toBlock }))); logs.push(...batch.flat()); }
    const start = ranges[ranges.length - 1][0]; const [headBlock, startBlock] = await Promise.all([client.getBlock({ blockNumber: head }), client.getBlock({ blockNumber: start })]);
    const perBlock = Number(headBlock.timestamp - startBlock.timestamp) / Math.max(1, Number(head - start));
    const trades = logs.map(log => {
      const buy = log.eventName === 'CurveBuy'; const args = log.args as { sender?: Address; recipient?: Address; quoteIn?: bigint; tokensOut?: bigint; tokensIn?: bigint; quoteOut?: bigint };
      const eth = Number(formatEther((buy ? args.quoteIn : args.quoteOut) ?? 0n)); const tokens = Number(formatEther((buy ? args.tokensOut : args.tokensIn) ?? 0n)); const block = Number(log.blockNumber ?? 0n);
      return { id: `${log.transactionHash}-${log.logIndex}`, side: buy ? 'buy' : 'sell', eth, tokens, price: tokens > 0 ? eth / tokens : 0, trader: ((buy ? args.recipient : args.sender) ?? '').toLowerCase(), hash: log.transactionHash ?? '', block, at: Math.round((Number(headBlock.timestamp) - (Number(head) - block) * perBlock) * 1000) } satisfies CurveTrade;
    }).filter(trade => trade.eth > 0 && trade.tokens > 0).sort((a, b) => a.block - b.block);
    return { trades: trades.slice(-2000), fromBlock: Number(start), toBlock: Number(head) };
  }
  constructor(private readonly store: Store, private readonly runtime: Runtime) {}
  async snapshot(): Promise<MarketSnapshot> {
    const cached = this.store.one<{ payload: string; updated_at: number }>('SELECT payload,updated_at FROM op_market_cache WHERE id=1');
    if (cached && Date.now() - cached.updated_at < 20_000) return JSON.parse(cached.payload) as MarketSnapshot;
    if (!this.flight) this.flight = this.build().finally(() => { this.flight = null; });
    try { return await this.flight; }
    catch (error) { console.warn('objectpad.market.failed', error instanceof Error ? error.message.slice(0, 160) : ''); if (cached) return JSON.parse(cached.payload) as MarketSnapshot; throw new ApiError('MARKET_UNAVAILABLE', 503); }
  }
  private async tokens(curves: Address[]): Promise<Map<string, TokenInfo>> {
    const client = serverClient(this.runtime.env); const known = new Map<string, TokenInfo>();
    for (const row of this.store.all<{ curve: string; token: string; symbol: string; name: string; valid: number; logo: string | null; logo_checked: number }>('SELECT curve,token,symbol,name,valid,logo,logo_checked FROM op_market_tokens')) known.set(row.curve, { curve: row.curve, token: row.token, symbol: row.symbol, name: row.name, valid: Boolean(row.valid), logo: row.logo ?? '', logoChecked: Boolean(row.logo_checked) });
    const unchecked = curves.map(curve => known.get(curve.toLowerCase())).filter((entry): entry is TokenInfo => Boolean(entry?.valid && !entry.logoChecked)).slice(0, 80);
    if (unchecked.length) {
      const logos = await client.multicall({ contracts: unchecked.map(entry => ({ address: entry.token as Address, abi: TOKEN_LOGO, functionName: 'logo' as const })), allowFailure: true }).catch(() => null);
      if (logos) unchecked.forEach((entry, i) => { const logo = logos[i]?.status === 'success' ? logoValue(logos[i].result) : ''; entry.logo = logo; entry.logoChecked = true; this.store.run('UPDATE op_market_tokens SET logo=?,logo_checked=1 WHERE curve=?', logo, entry.curve); });
    }
    const missing = curves.filter(curve => !known.has(curve.toLowerCase())).slice(0, 60);
    if (missing.length) {
      const tokenCalls = await client.multicall({ contracts: missing.map(address => ({ address, abi: CURVE_TOKEN, functionName: 'token' as const })), allowFailure: true });
      const pairs = missing.map((curve, i) => ({ curve, token: tokenCalls[i].status === 'success' ? tokenCalls[i].result as Address : null }));
      const withToken = pairs.filter((pair): pair is { curve: Address; token: Address } => Boolean(pair.token));
      const meta = withToken.length ? await client.multicall({ contracts: withToken.flatMap(pair => (['symbol', 'name', 'curve', 'logo'] as const).map(functionName => ({ address: pair.token, abi: TOKEN_META, functionName }))), allowFailure: true }) : [];
      const now = Date.now();
      pairs.forEach(pair => {
        const index = withToken.findIndex(item => item.curve === pair.curve); const read = (offset: number) => index >= 0 && meta[index * 4 + offset]?.status === 'success' ? meta[index * 4 + offset].result : undefined;
        const symbol = printable(read(0), 16); const name = printable(read(1), 48); const back = read(2); const logo = logoValue(read(3));
        const valid = Boolean(pair.token && symbol && typeof back === 'string' && back.toLowerCase() === pair.curve.toLowerCase());
        const entry: TokenInfo = { curve: pair.curve.toLowerCase(), token: (pair.token ?? '').toLowerCase(), symbol, name, valid, logo, logoChecked: true }; known.set(entry.curve, entry);
        this.store.run('INSERT OR REPLACE INTO op_market_tokens(curve,token,symbol,name,valid,checked_at,logo,logo_checked) VALUES (?,?,?,?,?,?,?,1)', entry.curve, entry.token, symbol, name, valid ? 1 : 0, now, logo);
      });
    }
    return known;
  }
  private async build(): Promise<MarketSnapshot> {
    const client = serverClient(this.runtime.env); const head = await client.getBlockNumber(); const start = head - SPAN * 2n + 1n;
    const [older, newer, headBlock, startBlock, usd] = await Promise.all([client.getLogs({ events: [BUY, SELL], fromBlock: start, toBlock: head - SPAN }), client.getLogs({ events: [BUY, SELL], fromBlock: head - SPAN + 1n, toBlock: head }), client.getBlock({ blockNumber: head }), client.getBlock({ blockNumber: start }), ethPrice()]);
    const logs = [...older, ...newer].sort((a, b) => Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) || (a.logIndex ?? 0) - (b.logIndex ?? 0));
    const meta = await this.tokens([...new Set(logs.map(log => log.address.toLowerCase() as Address))]);
    const objects = new Map(this.store.all<{ token: string; record_id: string }>('SELECT token,record_id FROM op_launches').map(row => [row.token.toLowerCase(), row.record_id]));
    const secondsPerBlock = Number(headBlock.timestamp - startBlock.timestamp) / Math.max(1, Number(head - start));
    const coins = new Map<string, MarketCoin & { first: number }>(); const trades: MarketTrade[] = []; let volume = 0; let buys = 0; let sells = 0; let creatorFees = 0; let protocolFees = 0;
    for (const log of logs) {
      const info = meta.get(log.address.toLowerCase()); if (!info?.valid) continue;
      const buy = log.eventName === 'CurveBuy'; const args = log.args as { sender?: Address; recipient?: Address; quoteIn?: bigint; tokensOut?: bigint; tokensIn?: bigint; quoteOut?: bigint; protocolFee?: bigint; creatorFee?: bigint };
      const eth = Number(formatEther((buy ? args.quoteIn : args.quoteOut) ?? 0n)); const amount = Number(formatEther((buy ? args.tokensOut : args.tokensIn) ?? 0n)); if (!(eth > 0) || !(amount > 0)) continue;
      creatorFees += Number(formatEther(args.creatorFee ?? 0n)); protocolFees += Number(formatEther(args.protocolFee ?? 0n));
      const price = eth / amount; const objectId = objects.get(info.token); const logo = info.logo ? this.logoUrl(info.token) : undefined;
      let coin = coins.get(info.token); if (!coin) { coin = { token: info.token, curve: log.address.toLowerCase(), symbol: info.symbol, name: info.name, priceEth: price, changePct: 0, volumeEth: 0, trades: 0, buys: 0, sells: 0, first: price, ...(objectId ? { objectId } : {}), ...(logo ? { logo } : {}) }; coins.set(info.token, coin); }
      coin.priceEth = price; coin.volumeEth += eth; coin.trades++; if (buy) { coin.buys++; buys++; } else { coin.sells++; sells++; } volume += eth;
      const block = Number(log.blockNumber ?? 0n);
      trades.push({ id: `${log.transactionHash}-${log.logIndex}`, token: info.token, symbol: info.symbol, side: buy ? 'buy' : 'sell', eth, tokens: amount, trader: ((buy ? args.recipient : args.sender) ?? '').toLowerCase(), hash: log.transactionHash ?? '', block, at: Math.round((Number(headBlock.timestamp) - (Number(head) - block) * secondsPerBlock) * 1000), ...(objectId ? { objectId } : {}), ...(logo ? { logo } : {}) });
    }
    const list = [...coins.values()].map(({ first, ...coin }) => ({ ...coin, changePct: first > 0 ? Math.round(((coin.priceEth - first) / first) * 10_000) / 100 : 0 }));
    list.sort((a, b) => Number(Boolean(b.objectId)) - Number(Boolean(a.objectId)) || b.volumeEth - a.volumeEth);
    const snapshot: MarketSnapshot = { updatedAt: Date.now(), windowSeconds: Math.round(Number(headBlock.timestamp - startBlock.timestamp)), ethUsd: usd, coins: list.slice(0, 48), trades: trades.slice(-60).reverse(), totals: { trades: buys + sells, volumeEth: volume, coins: list.length, buys, sells, creatorFeesEth: creatorFees, protocolFeesEth: protocolFees }, objectpad: { launched: objects.size, scanned: Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_capture_sessions WHERE json_extract(payload,'$.model.validated')=1")?.n ?? 0) } };
    this.store.run('INSERT OR REPLACE INTO op_market_cache(id,payload,updated_at) VALUES (1,?,?)', JSON.stringify(snapshot), snapshot.updatedAt);
    return snapshot;
  }
}
