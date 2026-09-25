import { encodeFunctionData, formatEther, verifyMessage, type Address, type Hex } from 'viem';
import { ApiError, validAddress } from '../shared/security';
import { ESCROW_ABI, PONS_FEE_ESCROW } from '../shared/economy';
import { robinhoodChain } from '../shared/pons';
import { serverClient } from './chain';
import type { Store } from './store';
import type { Runtime } from './types';
import type { SponsorService } from './sponsor';
import type { RecordService } from './record-service';

/** A wallet that receives creator fees for an account, with its live escrow balance. */
export interface AccountWallet { address: string; kind: 'account' | 'linked'; claimableWei: string; claimableEth: number; gasWei: string; }
/** One verified on-chain movement of funds in or out of an account wallet. */
export interface WalletActivity { hash: string; wallet: string; kind: 'deposit' | 'withdraw' | 'transfer' | 'claim' | 'protocol_share'; valueWei: string; counterparty: string | null; at: number; }
/** One coin launched by (or paying fees to) this account. */
export interface AccountLaunch { objectId: string; symbol: string; name: string; thumbnail: string; path: string; feeWallet: string | null; curve: string | null; token: string | null; launchedAt: number | null; }

const LINK_WINDOW_MS = 10 * 60_000;
/** Enough ETH for one escrow claim on Robinhood Chain (~0.00003 ETH at current gas), sent only when the wallet has none. */
const CLAIM_GAS_UNITS = 150_000n;

/** The exact text a creator signs to prove they hold a wallet before it is linked to their ObjectPad account. */
export const linkMessage = (address: string, publicId: string, at: number): string => `ObjectPad: link creator wallet ${address.toLowerCase()} to account ${publicId} at ${at}`;

/**
 * Accounts: every creator-fee wallet an account controls (its sign-in wallet plus any linked dev wallets, each proven by
 * signature), every coin they launched, live claimable fees, gas top-ups for claiming and the operator's house-coin fees.
 */
export class AccountService {
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly sponsor: SponsorService, private readonly records: RecordService) {
    store.run('CREATE TABLE IF NOT EXISTS op_linked_wallets (wallet TEXT PRIMARY KEY, owner TEXT NOT NULL, created_at INTEGER NOT NULL)');
    store.run('CREATE INDEX IF NOT EXISTS op_linked_owner ON op_linked_wallets(owner)');
    store.run('CREATE TABLE IF NOT EXISTS op_wallet_activity (hash TEXT NOT NULL, wallet TEXT NOT NULL, owner TEXT NOT NULL, kind TEXT NOT NULL, value_wei TEXT NOT NULL, counterparty TEXT, at INTEGER NOT NULL, PRIMARY KEY(hash, wallet))');
    store.run('CREATE INDEX IF NOT EXISTS op_wallet_activity_owner ON op_wallet_activity(owner, at)');
  }
  /**
   * Adds a transaction to the account's wallet history after reading it back from Robinhood Chain. Nothing the client
   * sends is trusted: sender, recipient, value and time all come from the chain, and only this account's wallets count.
   */
  async recordActivity(owner: string, hash: string): Promise<WalletActivity[]> {
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new ApiError('HASH_INVALID');
    const client = serverClient(this.runtime.env); const own = this.wallets(owner).map(w => w.address); if (!own.length) throw new ApiError('NO_WALLET', 409);
    const [tx, receipt] = await Promise.all([client.getTransaction({ hash: hash as Hex }), client.getTransactionReceipt({ hash: hash as Hex })]).catch(() => { throw new ApiError('TX_NOT_FOUND', 404); });
    if (receipt.status !== 'success') throw new ApiError('TX_REVERTED', 409);
    const block = await client.getBlock({ blockNumber: receipt.blockNumber }); const at = Number(block.timestamp) * 1000;
    const from = tx.from.toLowerCase(); const to = tx.to?.toLowerCase() ?? null; const escrow = PONS_FEE_ESCROW.toLowerCase(); const treasury = this.sponsor.address.toLowerCase();
    const out: WalletActivity[] = [];
    if (own.includes(from)) {
      if (to === escrow) {
        const before = receipt.blockNumber > 0n ? await client.readContract({ address: PONS_FEE_ESCROW, abi: ESCROW_ABI, functionName: 'balanceOf', args: [from as Address], blockNumber: receipt.blockNumber - 1n }).catch(() => 0n) : 0n;
        out.push({ hash, wallet: from, kind: 'claim', valueWei: before.toString(), counterparty: escrow, at });
      } else if (tx.value > 0n) out.push({ hash, wallet: from, kind: to === treasury ? 'protocol_share' : to && own.includes(to) ? 'transfer' : 'withdraw', valueWei: tx.value.toString(), counterparty: to, at });
    }
    if (to && own.includes(to) && tx.value > 0n && !own.includes(from)) out.push({ hash, wallet: to, kind: 'deposit', valueWei: tx.value.toString(), counterparty: from, at });
    if (!out.length) throw new ApiError('TX_NOT_YOURS', 409);
    this.store.atomic(() => { for (const a of out) this.store.run('INSERT OR IGNORE INTO op_wallet_activity(hash,wallet,owner,kind,value_wei,counterparty,at) VALUES (?,?,?,?,?,?,?)', a.hash, a.wallet, owner, a.kind, a.valueWei, a.counterparty, a.at); });
    this.store.metric(`wallet_${out[0].kind}`); return out;
  }
  /** The account's verified wallet history, newest first. */
  activity(owner: string): WalletActivity[] {
    return this.store.all<{ hash: string; wallet: string; kind: WalletActivity['kind']; value_wei: string; counterparty: string | null; at: number }>('SELECT hash,wallet,kind,value_wei,counterparty,at FROM op_wallet_activity WHERE owner=? ORDER BY at DESC LIMIT 60', owner)
      .map(r => ({ hash: r.hash, wallet: r.wallet, kind: r.kind, valueWei: r.value_wei, counterparty: r.counterparty, at: r.at }));
  }
  private publicId(owner: string): string { const row = this.store.one<{ public_id: string }>('SELECT public_id FROM op_profiles WHERE owner=?', owner); if (!row) throw new ApiError('PROFILE_REQUIRED', 409); return row.public_id; }
  wallets(owner: string): { address: string; kind: AccountWallet['kind'] }[] {
    const own = this.store.one<{ wallet: string | null }>('SELECT wallet FROM op_profiles WHERE owner=?', owner)?.wallet;
    const linked = this.store.all<{ wallet: string }>('SELECT wallet FROM op_linked_wallets WHERE owner=? ORDER BY created_at', owner).map(r => r.wallet);
    const out: { address: string; kind: AccountWallet['kind'] }[] = []; if (own && validAddress(own)) out.push({ address: own.toLowerCase(), kind: 'account' });
    for (const w of linked) if (!out.some(o => o.address === w)) out.push({ address: w, kind: 'linked' });
    return out;
  }
  /** Moves every launched coin a guest identity owns (or whose fees go to a wallet now linked) into the account. */
  adoptLaunched(to: string, from?: string, wallet?: string): number {
    const rows = this.store.all<{ id: string; owner: string; session_id: string }>(
      `SELECT id,owner,session_id FROM op_records WHERE owner<>? AND owner LIKE 'guest:%' AND (${from ? 'owner=?' : "lower(json_extract(payload,'$.feeVault'))=?"})`, to, from ?? wallet ?? '');
    this.store.atomic(() => { for (const row of rows) { this.store.run('UPDATE op_records SET owner=? WHERE id=?', to, row.id); this.store.run("UPDATE op_capture_sessions SET owner=?,payload=json_set(payload,'$.owner',?) WHERE id=?", to, to, row.session_id); } });
    if (rows.length) this.store.metric('launches_adopted'); return rows.length;
  }
  /** Links a wallet after checking a fresh signature from it over the account's public id. */
  async link(owner: string, address: string, at: number, signature: string): Promise<{ wallet: string; adopted: number }> {
    if (!validAddress(address) || !/^0x[a-fA-F0-9]{130}$/.test(signature)) throw new ApiError('WALLET_INVALID');
    if (!Number.isFinite(at) || Math.abs(Date.now() - at) > LINK_WINDOW_MS) throw new ApiError('LINK_EXPIRED');
    const ok = await verifyMessage({ address: address as Address, message: linkMessage(address, this.publicId(owner), at), signature: signature as Hex }).catch(() => false);
    if (!ok) throw new ApiError('SIGNATURE_INVALID', 401);
    const wallet = address.toLowerCase(); const taken = this.store.one<{ owner: string }>('SELECT owner FROM op_linked_wallets WHERE wallet=?', wallet);
    if (taken && taken.owner !== owner) throw new ApiError('WALLET_LINKED_ELSEWHERE', 409);
    this.store.run('INSERT OR IGNORE INTO op_linked_wallets(wallet,owner,created_at) VALUES (?,?,?)', wallet, owner, Date.now()); this.store.metric('wallet_linked');
    return { wallet, adopted: this.adoptLaunched(owner, undefined, wallet) };
  }
  unlink(owner: string, address: string): void { this.store.run('DELETE FROM op_linked_wallets WHERE owner=? AND wallet=?', owner, address.toLowerCase()); }
  private async balances(addresses: string[]): Promise<Map<string, { claimable: bigint; gas: bigint }>> {
    const client = serverClient(this.runtime.env); const out = new Map<string, { claimable: bigint; gas: bigint }>();
    await Promise.all(addresses.map(async a => { const [claimable, gas] = await Promise.all([client.readContract({ address: PONS_FEE_ESCROW, abi: ESCROW_ABI, functionName: 'balanceOf', args: [a as Address] }).catch(() => 0n), client.getBalance({ address: a as Address }).catch(() => 0n)]); out.set(a, { claimable, gas }); }));
    return out;
  }
  launches(owner: string, wallets: string[]): AccountLaunch[] {
    const marks = wallets.map(() => '?').join(',');
    const rows = this.store.all<{ id: string; payload: string }>(`SELECT id,payload FROM op_records WHERE state='confirmed' AND (owner=?${wallets.length ? ` OR lower(json_extract(payload,'$.feeVault')) IN (${marks})` : ''}) ORDER BY rowid DESC LIMIT 100`, owner, ...wallets);
    const out: AccountLaunch[] = [];
    for (const row of rows) { try { const r = this.records.publicRecord(row.id); const p = JSON.parse(row.payload) as { feeVault?: string; confirmedAt?: number }; out.push({ objectId: r.objectId, symbol: r.symbol, name: r.verifiedName, thumbnail: r.model.thumbnailUrl, path: `/objects/${r.objectId}`, feeWallet: p.feeVault?.toLowerCase() ?? null, curve: r.curveAddress ?? null, token: r.tokenAddress ?? null, launchedAt: p.confirmedAt ?? null }); } catch { /* hidden or not yet public */ } }
    return out;
  }
  async me(owner: string, operator: boolean): Promise<{ did: string; publicId: string; alias: string; wallets: AccountWallet[]; launches: AccountLaunch[]; totalClaimableEth: number; operator: boolean; treasury: string }> {
    const profile = this.store.one<{ public_id: string; alias: string }>('SELECT public_id,alias FROM op_profiles WHERE owner=?', owner); if (!profile) throw new ApiError('PROFILE_REQUIRED', 409);
    const list = this.wallets(owner); const bal = await this.balances(list.map(w => w.address));
    const wallets = list.map(w => { const b = bal.get(w.address) ?? { claimable: 0n, gas: 0n }; return { ...w, claimableWei: b.claimable.toString(), claimableEth: Number(formatEther(b.claimable)), gasWei: b.gas.toString() }; });
    return { did: owner, publicId: profile.public_id, alias: profile.alias, wallets, launches: this.launches(owner, list.map(w => w.address)), totalClaimableEth: wallets.reduce((s, w) => s + w.claimableEth, 0), operator, treasury: this.sponsor.address.toLowerCase() };
  }
  /** Sends a linked wallet just enough treasury ETH to pay for its claim, when it has fees waiting and no gas. Once a day per wallet. */
  async claimGas(owner: string, address: string): Promise<{ sent: boolean; hash?: string }> {
    const wallet = address.toLowerCase(); if (!this.wallets(owner).some(w => w.address === wallet)) throw new ApiError('FORBIDDEN', 403);
    const client = serverClient(this.runtime.env); const [claimable, gas, gasPrice] = await Promise.all([client.readContract({ address: PONS_FEE_ESCROW, abi: ESCROW_ABI, functionName: 'balanceOf', args: [wallet as Address] }), client.getBalance({ address: wallet as Address }), client.getGasPrice()]);
    const need = CLAIM_GAS_UNITS * gasPrice * 2n; if (gas >= need) return { sent: false };
    if (claimable < need * 4n) throw new ApiError('NOTHING_TO_CLAIM', 409);
    this.store.rate(`claim-gas:${wallet}`, 2, 86_400_000);
    const nonce = await this.sponsor.nextNonce(); const hash = await this.sponsor.wallet().sendTransaction({ to: wallet as Address, value: need - gas, gas: 21_000n, nonce, chain: robinhoodChain }); this.sponsor.markNonce(nonce); this.sponsor.invalidate();
    await client.waitForTransactionReceipt({ hash, timeout: 45_000 }).catch(() => undefined); this.store.metric('claim_gas_sent'); return { sent: true, hash };
  }
  /** Operator: fees from ObjectPad's own house coins, paid to the treasury wallet. */
  async house(): Promise<{ wallet: string; claimableWei: string; claimableEth: number }> {
    const wallet = this.sponsor.address.toLowerCase(); const claimable = await serverClient(this.runtime.env).readContract({ address: PONS_FEE_ESCROW, abi: ESCROW_ABI, functionName: 'balanceOf', args: [wallet as Address] }).catch(() => 0n);
    return { wallet, claimableWei: claimable.toString(), claimableEth: Number(formatEther(claimable)) };
  }
  async claimHouse(): Promise<{ hash: string }> {
    const { claimableWei } = await this.house(); if (BigInt(claimableWei) === 0n) throw new ApiError('NOTHING_TO_CLAIM', 409);
    const nonce = await this.sponsor.nextNonce(); const hash = await this.sponsor.wallet().sendTransaction({ to: PONS_FEE_ESCROW, data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'claim' }), gas: 200_000n, nonce, chain: robinhoodChain }); this.sponsor.markNonce(nonce); this.sponsor.invalidate();
    this.store.metric('house_fees_claimed'); return { hash };
  }
}
