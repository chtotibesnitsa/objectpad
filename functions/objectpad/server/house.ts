import { concatHex, decodeEventLog, stringToHex, type Address, type Hex } from 'viem';
import { buildLaunchTx, FACTORY_ABI, launchArguments, MIN_INITIAL_BUY_WEI, PONS_FACTORY, PONS_ROUTER, readLaunchTerms, robinhoodChain, ROUTER_ABI } from '../shared/pons';
import { DEAD_ADDRESS } from '../shared/economy';
import { objectSuffixText, objectTagFrom } from '../shared/domain';
import { sha256 } from '../shared/security';
import { assertPonsPinned, serverClient } from './chain';
import type { SponsorService } from './sponsor';
import type { Runtime } from './types';
import type { Store } from './store';

/** One ObjectPad original: a real 3D scan of a meme-famous object, launched by the treasury as a real Pons coin. */
export interface HouseSpec { id: string; ticker: string; name: string; story: string; catalog?: string; specs?: string; }

/**
 * ObjectPad originals, launched by ObjectPad itself from the treasury so the site has real, tradable markets from day one.
 * The first six launched before on-chain object records existed; the rest carry the object record in their calldata.
 */
export const HOUSE_COINS: HouseSpec[] = [
  { id: 'pepe', ticker: 'PEPE', name: 'Smug Frog', story: 'The frog from the desk, rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'duck', ticker: 'QUACK', name: 'Rubber Duck', story: 'The debugging duck, rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'bull', ticker: 'LASER', name: 'Laser Bull', story: 'Gold bull, laser eyes, rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'fine', ticker: 'FINE', name: 'This Is Fine', story: 'The dog in the burning room, rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'wojak', ticker: 'WOJAK', name: 'Wojak Bust', story: 'He bought the top so you didn’t have to. Rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'shiba', ticker: 'SHIBA', name: 'Shiba Figure', story: 'The dog that started it all, rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'mug', ticker: 'GM', name: 'GM Mug', catalog: 'White Ceramic GM Mug', specs: 'tris=90384;verts=64099;edges=151797;dims=1.00x0.83x0.72;mat=ceramic+glaze;views=6', story: 'Said it every morning. Now it is on-chain. ObjectPad original.' },
  { id: 'rock', ticker: 'ROCK', name: 'Pet Rock', catalog: 'Grey River Stone With Red Scarf', specs: 'tris=93175;verts=154564;edges=215980;dims=0.97x1.00x0.84;mat=stone+wool;views=6', story: 'The original diamond hands. Now wearing a scarf. ObjectPad original.' },
  { id: 'sneaker', ticker: 'KICKS', name: 'Retro Kicks', catalog: 'White Leather High-Top Sneaker', specs: 'tris=92058;verts=94780;edges=178591;dims=1.00x0.60x0.36;mat=leather+suede+rubber;views=6', story: 'Every sneakerhead has one pair they would never sell. ObjectPad original.' },
  { id: 'beanie', ticker: 'HAT', name: 'Pink Beanie', catalog: 'Pink Knitted Wool Beanie', specs: 'tris=73635;verts=102857;edges=218754;dims=1.00x0.92x1.00;mat=wool+knit;views=6', story: 'One pink beanie on one good dog started a cycle. ObjectPad original.' },
  { id: 'frog', ticker: 'FROG', name: 'Vinyl Frog', catalog: 'Green Vinyl Frog Figurine', specs: 'tris=40164;verts=35874;edges=106415;dims=1.00x0.89x0.75;mat=vinyl;views=6', story: 'The internet’s favourite frog, as a real toy. ObjectPad original.' },
  { id: 'console', ticker: 'BOOT', name: 'Handheld 89', catalog: 'Grey Retro Handheld Console', specs: 'tris=109786;verts=87415;edges=191755;dims=0.57x1.00x0.12;mat=plastic+glass;views=6', story: 'A childhood in grey plastic. Press start. ObjectPad original.' },
  { id: 'card', ticker: 'SLAB', name: 'Graded Slab', catalog: 'Holographic Card In Acrylic Slab', specs: 'tris=85865;verts=80654;edges=159464;dims=0.65x1.00x0.08;mat=acrylic+card;views=6', story: 'The collectible that started it all, sealed and scanned. ObjectPad original.' },
  { id: 'squirrel', ticker: 'NUTS', name: 'Peanut Squirrel', catalog: 'Carved Wooden Squirrel Figurine', specs: 'tris=35338;verts=38152;edges=105998;dims=0.46x1.00x0.93;mat=wood+paint;views=6', story: 'A squirrel with a peanut became a movement. ObjectPad original.' },
  { id: 'pizza', ticker: 'PIZZA', name: 'Pizza Day', catalog: 'Pepperoni Pizza In Cardboard Box', specs: 'tris=39139;verts=51111;edges=117410;dims=0.97x0.70x1.00;mat=cardboard+dough;views=6', story: 'Two pizzas once cost 10,000 BTC. This launch cost nothing. ObjectPad original.' },
  { id: 'banana', ticker: 'TAPE', name: 'Taped Banana', catalog: 'Duct-Taped Ripe Banana', specs: 'tris=43190;verts=51922;edges=129559;dims=0.84x1.00x0.32;mat=fruit+tape;views=6', story: 'Taped to the blockchain instead of a wall. ObjectPad original.' },
  { id: 'hippo', ticker: 'HIPPO', name: 'Baby Hippo', catalog: 'Pygmy Hippo Resin Figurine', specs: 'tris=47861;verts=42580;edges=127185;dims=0.56x0.62x1.00;mat=resin;views=6', story: 'The zoo’s most famous baby hippo, desk size. ObjectPad original.' },
  { id: 'penguin', ticker: 'PLUSH', name: 'Plush Penguin', catalog: 'Plush Blue Penguin Toy', specs: 'tris=39652;verts=37680;edges=118945;dims=1.00x0.96x0.66;mat=plush+felt;views=6', story: 'Chubby penguins took over the timeline. ObjectPad original.' },
];

/** Same deterministic hash the site uses for an original's tag and object id, so the page and the calldata always agree. */
function seedHash(seed: string, length = 40): string {
  let h = 2166136261; let out = '';
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  for (let i = 0; out.length < length; i++) { h ^= (h >>> 13) + i + 0x9e37; h = Math.imul(h, 16777619) >>> 0; out += h.toString(16).padStart(8, '0'); }
  return out.slice(0, length);
}
/** The on-chain object record appended to an original's launch calldata (only for originals that carry one). */
export function houseRecord(coin: HouseSpec): { tag: string; objectId: string; suffix: string } | null {
  if (!coin.catalog || !coin.specs) return null;
  const tag = objectTagFrom(seedHash(`${coin.catalog}|demo`, 16)); const objectId = seedHash(`${coin.id}-object`, 64);
  return { tag, objectId, suffix: objectSuffixText(tag, coin.catalog, objectId, coin.specs) };
}

export interface HouseCoin { id: string; ticker: string; name: string; story: string; catalog: string | null; tag: string | null; state: 'waiting' | 'submitted' | 'live' | 'failed'; hash: string | null; token: string | null; curve: string | null; launchedAt: number | null; }
interface Row { id: string; state: string; tx_hash: string | null; token: string | null; curve: string | null; attempts: number; updated_at: number; }

/**
 * Sends each original's launch once from the treasury (fee + minimum first buy to the dead address; creator fees back to
 * the treasury), then records the real token and curve from the confirmed receipt. Waits quietly while the treasury is low.
 */
export class HouseService {
  private lastRun = 0;
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly sponsor: SponsorService) {
    store.run('CREATE TABLE IF NOT EXISTS op_house (id TEXT PRIMARY KEY, state TEXT NOT NULL, tx_hash TEXT, token TEXT, curve TEXT, attempts INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)');
  }
  private enabled(): boolean { return this.runtime.env.OBJECTPAD_HOUSE_LAUNCHES !== 'false'; }
  list(): HouseCoin[] {
    const rows = new Map(this.store.all<Row>('SELECT * FROM op_house').map(r => [r.id, r]));
    return HOUSE_COINS.map(c => { const r = rows.get(c.id); const state = (r?.state === 'live' || r?.state === 'submitted' || r?.state === 'failed' ? r.state : 'waiting') as HouseCoin['state']; return { id: c.id, ticker: c.ticker, name: c.name, story: c.story, catalog: c.catalog ?? null, tag: houseRecord(c)?.tag ?? null, state, hash: r?.tx_hash ?? null, token: r?.token ?? null, curve: r?.curve ?? null, launchedAt: state === 'live' ? r?.updated_at ?? null : null }; });
  }
  pending(): boolean { return this.enabled() && this.list().some(c => c.state === 'waiting' || c.state === 'submitted'); }
  private failed(id: string): void { this.store.run("INSERT INTO op_house(id,state,attempts,updated_at) VALUES (?,'waiting',1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1,state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'waiting' END,tx_hash=NULL,updated_at=excluded.updated_at", id, Date.now()); }
  /** One step per call: confirm submitted launches, then send at most one new launch if the treasury can pay. */
  async run(): Promise<void> {
    if (!this.enabled() || Date.now() - this.lastRun < 8_000) return; this.lastRun = Date.now();
    const client = serverClient(this.runtime.env);
    for (const row of this.store.all<Row>("SELECT * FROM op_house WHERE state='submitted' AND tx_hash IS NOT NULL")) {
      const receipt = await client.getTransactionReceipt({ hash: row.tx_hash as Hex }).catch(() => null);
      if (!receipt) { if (Date.now() - row.updated_at > 10 * 60_000) this.store.run("UPDATE op_house SET state='waiting',tx_hash=NULL,updated_at=? WHERE id=?", Date.now(), row.id); continue; }
      if (receipt.status !== 'success') { this.store.run("UPDATE op_house SET state=?,tx_hash=NULL,updated_at=? WHERE id=?", row.attempts >= 3 ? 'failed' : 'waiting', Date.now(), row.id); continue; }
      const event = receipt.logs.map(log => { if (log.address.toLowerCase() !== PONS_FACTORY.toLowerCase()) return null; try { const d = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics }); return d.eventName === 'TokenLaunched' ? d.args : null; } catch { return null; } }).find(Boolean);
      if (event) { this.store.run("UPDATE op_house SET state='live',token=?,curve=?,updated_at=? WHERE id=?", event.token.toLowerCase(), event.curve.toLowerCase(), Date.now(), row.id); this.store.metric('house_launch_live'); }
    }
    const next = HOUSE_COINS.find(c => { const r = this.store.one<Row>('SELECT * FROM op_house WHERE id=?', c.id); return !r || r.state === 'waiting'; });
    if (!next || this.store.one("SELECT id FROM op_house WHERE state='submitted' LIMIT 1")) return;
    // Creators always come first: no original launches while a creator's launch is still in flight.
    if (this.store.one("SELECT id FROM op_transactions WHERE kind='launch' AND tx_hash IS NOT NULL AND state IN ('submitted','confirming','unknown') LIMIT 1")) return;
    const status = await this.sponsor.status(true).catch(() => null); if (!status || BigInt(status.balanceWei) < BigInt(status.launchCostWei) * 3n) return;
    await assertPonsPinned(this.runtime.env);
    const terms = await readLaunchTerms(client); if (!terms.enabled) return;
    const origin = this.runtime.origin; const sponsor = this.sponsor.address as Address; const record = houseRecord(next);
    const description = record ? `${next.catalog} [${record.tag}]: a real 3D-scanned object, tokenized on ObjectPad. ${next.story} ${origin}/coin/${next.ticker.toLowerCase()}` : `${next.story} ${origin}/coin/${next.ticker}`;
    const input = { name: next.name, symbol: next.ticker, logo: `${origin}/assets/objects/coin-${next.id}.webp`, description, website: `${origin}/coin/${next.ticker.toLowerCase()}`, twitter: 'https://x.com/ObjectPadFun', telegram: '', creator: sponsor, recipient: DEAD_ADDRESS, feeRecipient: sponsor, creatorTaxBps: 150, quoteIn: MIN_INITIAL_BUY_WEI, minTokensOut: 0n, salt: `0x${await sha256(`objectpad:house:${next.id}`)}` as Hex };
    const simulation = await client.simulateContract({ address: PONS_ROUTER, abi: ROUTER_ABI, functionName: 'launchAndBuy', args: launchArguments(input, terms.expectedEconomics), account: sponsor, value: terms.launchFee + MIN_INITIAL_BUY_WEI }).catch((error: unknown) => { console.warn('objectpad.house.simulation', next.id, error instanceof Error ? error.message.slice(0, 160) : ''); return null; });
    if (!simulation) { this.failed(next.id); return; }
    const built = buildLaunchTx({ ...input, minTokensOut: simulation.result[2] * 9700n / 10000n }, terms);
    const tx = record ? { ...built, data: concatHex([built.data, stringToHex(record.suffix)]) } : built;
    try {
      const gas = (await client.estimateGas({ account: sponsor, ...tx })) * 120n / 100n; const nonce = await this.sponsor.nextNonce();
      const wallet = this.sponsor.wallet(); const hash = await wallet.sendTransaction({ account: wallet.account, chain: robinhoodChain, to: tx.to, data: tx.data, value: tx.value, gas, nonce });
      this.sponsor.markNonce(nonce);
      this.store.run('INSERT INTO op_house(id,state,tx_hash,attempts,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,tx_hash=excluded.tx_hash,attempts=attempts+1,updated_at=excluded.updated_at', next.id, 'submitted', hash, Date.now());
      this.sponsor.invalidate(); this.store.metric('house_launch_submitted');
    } catch (error) { this.failed(next.id); this.sponsor.invalidate(); throw error; }
  }
}
