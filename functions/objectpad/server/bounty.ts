/**
 * Paid Rewards: cash bounties for the first real scan of a named object. Creators submit a coin they launched on
 * ObjectPad; an operator reviews the actual 3D scan and marks it winner / rejected / paid (with the payout tx hash).
 * Every decision is appended to an audit log. Only coins that are live on ObjectPad and owned by the submitter qualify.
 */
import { ApiError } from '../shared/security';
import { BOUNTIES, bountyById } from '../shared/bounties';
import type { Store } from './store';
import type { RecordService } from './record-service';

interface Row { id: string; bounty_id: string; owner: string; record_id: string; token: string; name: string; symbol: string; image: string; wallet: string; note: string; state: string; review_note: string; payout_tx: string | null; created_at: number; updated_at: number; }
const STATES = ['submitted', 'winner', 'rejected', 'paid'] as const;

export class BountyService {
  constructor(private readonly store: Store, private readonly records: RecordService) {
    store.run('CREATE TABLE IF NOT EXISTS op_bounty_subs (id TEXT PRIMARY KEY, bounty_id TEXT NOT NULL, owner TEXT NOT NULL, record_id TEXT NOT NULL, token TEXT NOT NULL, name TEXT NOT NULL, symbol TEXT NOT NULL, image TEXT NOT NULL, wallet TEXT NOT NULL, note TEXT NOT NULL, state TEXT NOT NULL, review_note TEXT NOT NULL DEFAULT \'\', payout_tx TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(bounty_id, record_id))');
    store.run('CREATE INDEX IF NOT EXISTS op_bounty_subs_b ON op_bounty_subs(bounty_id, created_at)');
    store.run('CREATE TABLE IF NOT EXISTS op_bounty_audit (id TEXT PRIMARY KEY, sub_id TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL, at INTEGER NOT NULL)');
    store.run("CREATE TRIGGER IF NOT EXISTS op_bounty_audit_no_update BEFORE UPDATE ON op_bounty_audit BEGIN SELECT RAISE(ABORT, 'append-only'); END");
    store.run("CREATE TRIGGER IF NOT EXISTS op_bounty_audit_no_delete BEFORE DELETE ON op_bounty_audit BEGIN SELECT RAISE(ABORT, 'append-only'); END");
  }
  private audit(sub: string, event: string, detail: string): void { this.store.run('INSERT INTO op_bounty_audit(id,sub_id,event,detail,at) VALUES (?,?,?,?,?)', crypto.randomUUID(), sub, event, detail.slice(0, 500), Date.now()); }

  /** Accepts a token address, an objectpad.fun object/short link, or a raw 64-hex object id. Returns the record id. */
  private resolve(input: string): string {
    const raw = input.trim();
    const token = raw.match(/0x[a-fA-F0-9]{40}/)?.[0];
    if (token) { const row = this.store.one<{ record_id: string }>('SELECT record_id FROM op_launches WHERE token=?', token.toLowerCase()); if (row) return row.record_id; }
    const full = raw.match(/[a-f0-9]{64}/)?.[0]; if (full) return full;
    const short = raw.match(/\/o\/([a-f0-9]{12})/)?.[1];
    if (short) { const rows = this.store.all<{ id: string }>('SELECT id FROM op_records WHERE id LIKE ? LIMIT 2', `${short}%`); if (rows.length === 1) return rows[0].id; }
    throw new ApiError('BOUNTY_COIN_NOT_FOUND', 404);
  }

  private view(r: Row, full = false): Record<string, unknown> {
    return { id: r.id, bountyId: r.bounty_id, recordId: r.record_id, token: r.token, name: r.name, symbol: r.symbol, image: r.image, note: r.note, state: r.state, reviewNote: r.review_note, payoutTx: r.payout_tx, createdAt: r.created_at, updatedAt: r.updated_at,
      wallet: full ? r.wallet : `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}`,
      ...(full ? { owner: r.owner, audit: this.store.all('SELECT event,detail,at FROM op_bounty_audit WHERE sub_id=? ORDER BY at', r.id) } : {}) };
  }

  /** Public board: every bounty with its live submissions and whether it has been won. */
  list(owner: string | null): Record<string, unknown> {
    const subs = this.store.all<Row>('SELECT * FROM op_bounty_subs ORDER BY created_at DESC LIMIT 500');
    return { bounties: BOUNTIES.map(b => { const mine = subs.filter(s => s.bounty_id === b.id); const winner = mine.find(s => s.state === 'winner' || s.state === 'paid');
      return { ...b, status: winner ? (winner.state === 'paid' ? 'paid' : 'won') : 'open', submissions: mine.map(s => ({ ...this.view(s), mine: owner === s.owner })) }; }), updatedAt: Date.now() };
  }

  submit(owner: string, bountyId: string, coin: string, note: string): Record<string, unknown> {
    const bounty = bountyById(bountyId); if (!bounty) throw new ApiError('NOT_FOUND', 404);
    const recordId = this.resolve(coin);
    const { row } = this.records.load(recordId);
    if (row.owner !== owner) throw new ApiError('BOUNTY_NOT_YOUR_COIN', 403);
    let rec: ReturnType<RecordService['publicRecord']>;
    try { rec = this.records.publicRecord(recordId); } catch { throw new ApiError('BOUNTY_COIN_NOT_LIVE', 409); }
    const won = this.store.one("SELECT id FROM op_bounty_subs WHERE bounty_id=? AND state IN ('winner','paid')", bountyId); if (won) throw new ApiError('BOUNTY_CLOSED', 409);
    if (this.store.one('SELECT id FROM op_bounty_subs WHERE bounty_id=? AND record_id=?', bountyId, recordId)) throw new ApiError('BOUNTY_ALREADY_SUBMITTED', 409);
    const id = crypto.randomUUID(); const now = Date.now();
    this.store.run('INSERT INTO op_bounty_subs(id,bounty_id,owner,record_id,token,name,symbol,image,wallet,note,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, bountyId, owner, recordId, rec.tokenAddress.toLowerCase(), rec.publicName.slice(0, 80), rec.symbol.slice(0, 16), (rec as { iconUrl?: string }).iconUrl ?? rec.model.thumbnailUrl, rec.creatorWallet.toLowerCase(), note.trim().slice(0, 280), 'submitted', now, now);
    this.audit(id, 'submitted', `Coin ${rec.symbol} (${rec.tokenAddress}) submitted for ${bounty.title}.`);
    this.store.metric('bounty_submitted');
    return this.view(this.store.one<Row>('SELECT * FROM op_bounty_subs WHERE id=?', id)!);
  }

  /** Operator queue: everything, full detail. */
  queue(): Record<string, unknown> { return { bounties: BOUNTIES, submissions: this.store.all<Row>('SELECT * FROM op_bounty_subs ORDER BY created_at DESC LIMIT 500').map(r => this.view(r, true)) }; }

  decide(id: string, state: string, note: string, tx: string): Record<string, unknown> {
    const row = this.store.one<Row>('SELECT * FROM op_bounty_subs WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404);
    if (!(STATES as readonly string[]).includes(state)) throw new ApiError('INVALID_INPUT');
    const hash = tx.trim(); if (state === 'paid' && !/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new ApiError('PAYOUT_TX_REQUIRED');
    if (state === 'winner' || state === 'paid') { const other = this.store.one<{ id: string }>("SELECT id FROM op_bounty_subs WHERE bounty_id=? AND state IN ('winner','paid') AND id<>?", row.bounty_id, id); if (other) throw new ApiError('BOUNTY_ALREADY_WON', 409); }
    this.store.run('UPDATE op_bounty_subs SET state=?,review_note=?,payout_tx=?,updated_at=? WHERE id=?', state, note.trim().slice(0, 280), state === 'paid' ? hash.toLowerCase() : row.payout_tx, Date.now(), id);
    this.audit(id, state, note.trim() || state);
    return this.view(this.store.one<Row>('SELECT * FROM op_bounty_subs WHERE id=?', id)!, true);
  }
}
