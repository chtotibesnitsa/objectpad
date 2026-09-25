import { decodeEventLog, type Address, type Hex } from 'viem';
import { buildLaunchTx, FACTORY_ABI, launchArguments, MIN_INITIAL_BUY_WEI, PONS_FACTORY, PONS_ROUTER, readLaunchTerms, robinhoodChain, ROUTER_ABI } from '../shared/pons';
import { DEAD_ADDRESS } from '../shared/economy';
import { sha256 } from '../shared/security';
import { assertPonsPinned, serverClient } from './chain';
import type { SponsorService } from './sponsor';
import type { Runtime } from './types';
import type { Store } from './store';

/** Showcase meme coins ObjectPad launches itself from the treasury, so the front page has real, tradable markets. */
export const HOUSE_COINS: { id: string; ticker: string; name: string; story: string }[] = [
  { id: 'pepe', ticker: 'PEPE', name: 'Smug Frog', story: 'The frog from the desk, rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'duck', ticker: 'QUACK', name: 'Rubber Duck', story: 'The debugging duck, rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'bull', ticker: 'LASER', name: 'Laser Bull', story: 'Gold bull, laser eyes, rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'fine', ticker: 'FINE', name: 'This Is Fine', story: 'The dog in the burning room, rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'wojak', ticker: 'WOJAK', name: 'Wojak Bust', story: 'He bought the top so you didn’t have to. Rebuilt in full 3D. ObjectPad showcase coin.' },
  { id: 'shiba', ticker: 'SHIBA', name: 'Shiba Figure', story: 'The dog that started it all, rebuilt in full 3D. ObjectPad showcase coin.' },
];

export interface HouseCoin { id: string; ticker: string; name: string; state: 'waiting' | 'submitted' | 'live' | 'failed'; hash: string | null; token: string | null; curve: string | null; launchedAt: number | null; }
interface Row { id: string; state: string; tx_hash: string | null; token: string | null; curve: string | null; attempts: number; updated_at: number; }

/**
 * Sends each showcase launch once from the treasury (fee + minimum first buy to the dead address; creator fees back to
 * the treasury), then records the real token and curve from the confirmed receipt. Waits quietly while the treasury is empty.
 */
export class HouseService {
  private lastRun = 0;
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly sponsor: SponsorService) {
    store.run('CREATE TABLE IF NOT EXISTS op_house (id TEXT PRIMARY KEY, state TEXT NOT NULL, tx_hash TEXT, token TEXT, curve TEXT, attempts INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)');
  }
  private enabled(): boolean { return this.runtime.env.OBJECTPAD_HOUSE_LAUNCHES !== 'false'; }
  list(): HouseCoin[] {
    const rows = new Map(this.store.all<Row>('SELECT * FROM op_house').map(r => [r.id, r]));
    return HOUSE_COINS.map(c => { const r = rows.get(c.id); const state = (r?.state === 'live' || r?.state === 'submitted' || r?.state === 'failed' ? r.state : 'waiting') as HouseCoin['state']; return { id: c.id, ticker: c.ticker, name: c.name, state, hash: r?.tx_hash ?? null, token: r?.token ?? null, curve: r?.curve ?? null, launchedAt: state === 'live' ? r?.updated_at ?? null : null }; });
  }
  pending(): boolean { return this.enabled() && this.list().some(c => c.state === 'waiting' || c.state === 'submitted'); }
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
    const status = await this.sponsor.status(true).catch(() => null); if (!status || BigInt(status.balanceWei) < BigInt(status.launchCostWei) * 2n) return;
    await assertPonsPinned(this.runtime.env);
    const terms = await readLaunchTerms(client); if (!terms.enabled) return;
    const origin = this.runtime.origin; const sponsor = this.sponsor.address as Address;
    const input = { name: next.name, symbol: next.ticker, logo: `${origin}/assets/objects/coin-${next.id}.webp`, description: `${next.story} ${origin}/coin/${next.ticker}`, website: `${origin}/coin/${next.ticker}`, twitter: '', telegram: '', creator: sponsor, recipient: DEAD_ADDRESS, feeRecipient: sponsor, creatorTaxBps: 150, quoteIn: MIN_INITIAL_BUY_WEI, minTokensOut: 0n, salt: `0x${await sha256(`objectpad:house:${next.id}`)}` as Hex };
    const simulation = await client.simulateContract({ address: PONS_ROUTER, abi: ROUTER_ABI, functionName: 'launchAndBuy', args: launchArguments(input, terms.expectedEconomics), account: sponsor, value: terms.launchFee + MIN_INITIAL_BUY_WEI }).catch((error: unknown) => { console.warn('objectpad.house.simulation', next.id, error instanceof Error ? error.message.slice(0, 160) : ''); return null; });
    if (!simulation) { this.store.run('INSERT INTO op_house(id,state,attempts,updated_at) VALUES (?,?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1,state=CASE WHEN attempts>=3 THEN \'failed\' ELSE \'waiting\' END,updated_at=excluded.updated_at', next.id, 'waiting', Date.now()); return; }
    const tx = buildLaunchTx({ ...input, minTokensOut: simulation.result[2] * 9700n / 10000n }, terms);
    const gas = (await client.estimateGas({ account: sponsor, ...tx })) * 120n / 100n;
    const wallet = this.sponsor.wallet(); const hash = await wallet.sendTransaction({ account: wallet.account, chain: robinhoodChain, to: tx.to, data: tx.data, value: tx.value, gas });
    this.store.run('INSERT INTO op_house(id,state,tx_hash,attempts,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,tx_hash=excluded.tx_hash,attempts=attempts+1,updated_at=excluded.updated_at', next.id, 'submitted', hash, Date.now());
    this.sponsor.invalidate(); this.store.metric('house_launch_submitted');
  }
}
