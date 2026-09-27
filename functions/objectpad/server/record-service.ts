import { concatHex, decodeEventLog, decodeFunctionData, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem';
import { CANONICAL_VIEWS, normalizeObjectName, objectNameSeed, objectSpecsText, objectSuffixText, objectTagFrom, readObjectSuffix, type ObjectCommitment, type ObjectRecord } from '../shared/domain';
import { ApiError, canonicalJson, publicName, requireOwner, safeXUrl, sha256, validAddress } from '../shared/security';
import { buildLaunchTx, buildPairedLaunchTx, ERC20_ABI, FACTORY_ABI, FACTORY_LAUNCH_ABI, launchArguments, MIN_INITIAL_BUY_WEI, pairedLaunchArguments, PONS_FACTORY, PONS_ROUTER, readLaunchTerms, robinhoodChain, ROUTER_ABI } from '../shared/pons';
import { isEthPair, pairAsset } from '../shared/pairs';
import { DEAD_ADDRESS } from '../shared/economy';
import { reconcileReceipt } from '../shared/transactions';
import type { DraftInput, RecordPayload, RecordRow, Runtime } from './types';
import { Store } from './store';
import { CaptureService, coinUrlFor } from './capture-service';
import { SponsorService } from './sponsor';
import { assertPonsPinned, serverClient } from './chain';
import { privyWallet } from './privy-wallet';

export { PONS_FACTORY_CODE_HASH, PONS_ROUTER_CODE_HASH } from './chain';
interface TxRow { id: string; record_id: string; kind: string; state: string; tx_hash: Hex | null; block_hash: Hex | null; request: string; updated_at: number; }
const hashHex = (hash: string): Hex => `0x${hash}`;
/** Last launch send attempt (no keys, no owner): shown at /api/engine so a failed broadcast is never a mystery. */
export let lastLaunchEvent: { at: number; stage: string; detail: string; balanceWei?: string; needWei?: string } | null = null;
const noteLaunch = (stage: string, detail: string, extra: { balanceWei?: bigint; needWei?: bigint } = {}): void => { lastLaunchEvent = { at: Date.now(), stage, detail: detail.replace(/0x[a-fA-F0-9]{64,}/g, '0x…').slice(0, 240), ...(extra.balanceWei !== undefined ? { balanceWei: extra.balanceWei.toString() } : {}), ...(extra.needWei !== undefined ? { needWei: extra.needWei.toString() } : {}) }; };
/**
 * Gas-limit and fee-cap headroom, tried from roomiest to tightest ([gas %, base-fee %]). The node only accepts a transaction
 * when balance ≥ gasLimit × maxFeePerGas + value, but the chain charges the real gas used at the real base fee, so a tight
 * plan costs the same as a roomy one. The treasury picks the roomiest plan its balance can back.
 */
const FEE_PLANS: [bigint, bigint][] = [[125n, 150n], [118n, 130n], [112n, 118n], [108n, 110n], [105n, 105n], [103n, 102n]];
/** Required confirmations (~3 seconds on Robinhood Chain) before a launch is treated as final. */
const DEPTH = 30n;

/** The coin description written on-chain: the physical object's AI catalogue name, its ObjectPad tag, artifact hashes and link. */
export function launchDescription(objectName: string, tag: string, modelHash: string, manifestHash: string, url: string): string {
  return `${objectName} [${tag}]: a real physical object scanned in 3D and tokenized on ObjectPad. 3D model sha256:${modelHash} capture sha256:${manifestHash} proof: ${url}`;
}
/** Object name and tag for commitments made before the naming methodology existed. */
async function naming(c: ObjectCommitment): Promise<{ objectName: string; objectTag: string }> {
  const objectName = c.objectName || normalizeObjectName(c.category || c.publicName) || 'Physical Object';
  return { objectName, objectTag: c.objectTag || objectTagFrom(await sha256(objectNameSeed(objectName, c.originalModelHash, c.captureManifestHash))) };
}

/**
 * Object Records and free, sponsored Pons V2 launches. The ObjectPad sponsor wallet sends launchAndBuy, pays the Pons
 * launch fee and the protocol-minimum first buy (delivered to the dead address), and sets the creator's own wallet as
 * the 1.5% creator-fee recipient. The creator never signs or pays. Every launch is simulated, code-pinned, broadcast
 * from a pre-computed hash (so retries are idempotent) and reconciled from the decoded receipt before publication.
 */
/** Handle (lowercase, no @) of an https://x.com/<handle> link, or null. */
export const xHandleOf = (url: string | undefined): string | null => { const m = (url ?? '').match(/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/); return m ? m[1].toLowerCase() : null; };
export interface VerifiedX { id: string; handle: string; avatar?: string; name?: string; }
export class RecordService {
  /** Resolves the verified X account (Privy X OAuth) of an owner; set after the Earn service exists. */
  identity: ((owner: string) => Promise<VerifiedX | null>) | null = null;
  /** Uniqueness v2 summary lookup (set by the worker). */
  uq2: ((sessionId: string) => unknown) | null = null;
  /** Stored verified X identity (no network): used on every public read. */
  storedX(owner: string): VerifiedX | null { try { const r = this.store.one<{ x_user_id: string; handle: string; avatar: string; name: string }>('SELECT x_user_id,handle,avatar,name FROM op_x_identities WHERE owner=?', owner); return r ? { id: r.x_user_id, handle: r.handle, avatar: r.avatar, name: r.name } : null; } catch { return null; } }
  /**
   * Anti-impersonation: an X link may only be attached to a coin when it is the creator's own X account, proven by X OAuth
   * (not typed text). Throws X_LINK_UNVERIFIED (no verified X on this account) or X_LINK_NOT_YOURS (a different account).
   */
  async assertXLink(owner: string, xUrl: string | undefined): Promise<void> {
    const handle = xHandleOf(xUrl); if (!xUrl || !handle) return;
    const x = owner.startsWith('guest:') ? null : await (this.identity?.(owner).catch(() => this.storedX(owner)) ?? Promise.resolve(this.storedX(owner)));
    if (!x) throw new ApiError('X_LINK_UNVERIFIED', 403);
    if (x.handle.toLowerCase() !== handle) throw new ApiError('X_LINK_NOT_YOURS', 403);
  }
  /** Public identity panel of a coin: fee wallet, verified X account and whether the coin's X link is really theirs. */
  creatorIdentity(row: RecordRow, c: ObjectCommitment): { wallet: string; guest: boolean; x: VerifiedX | null; linkHandle: string | null; linkStatus: 'verified' | 'mismatch' | 'unverified' | 'none'; boundAt: number | null } {
    const x = row.owner.startsWith('guest:') ? null : this.storedX(row.owner); const linkHandle = xHandleOf(c.xUrl);
    const linkStatus = !linkHandle ? 'none' : !x ? 'unverified' : x.handle.toLowerCase() === linkHandle ? 'verified' : 'mismatch';
    return { wallet: c.creatorWallet, guest: row.owner.startsWith('guest:'), x, linkHandle, linkStatus, boundAt: c.creatorX?.boundAt ?? null };
  }
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly captures: CaptureService, private readonly sponsor: SponsorService) {
    store.run('CREATE TABLE IF NOT EXISTS op_launch_events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, stage TEXT NOT NULL, detail TEXT NOT NULL)');
  }
  /** Launch diagnostics that survive restarts: the last 30 send attempts (no keys, owners or ids). */
  private note(stage: string, detail: string, extra: { balanceWei?: bigint; needWei?: bigint } = {}): void {
    noteLaunch(stage, detail, extra);
    try { this.store.run('INSERT INTO op_launch_events(at,stage,detail) VALUES (?,?,?)', Date.now(), stage, (lastLaunchEvent?.detail ?? '').slice(0, 240)); this.store.run('DELETE FROM op_launch_events WHERE id <= (SELECT MAX(id) - 30 FROM op_launch_events)'); } catch { /* diagnostics never block a launch */ }
  }
  launchEvents(): { at: number; stage: string; detail: string }[] { return this.store.all<{ at: number; stage: string; detail: string }>('SELECT at,stage,detail FROM op_launch_events ORDER BY id DESC LIMIT 12'); }
  private client() { return serverClient(this.runtime.env); }
  load(id: string, owner?: string): { row: RecordRow; payload: RecordPayload } { const row = this.store.one<RecordRow>('SELECT * FROM op_records WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404); if (owner) requireOwner(owner, row.owner); return { row, payload: JSON.parse(row.payload) as RecordPayload }; }
  /** The creator-fee wallet: the account's Privy wallet (embedded or linked), resolved server-side. No signature needed. */
  async creatorWallet(owner: string): Promise<Address> {
    const profile = this.store.one<{ wallet: string | null }>('SELECT wallet FROM op_profiles WHERE owner=?', owner);
    if (profile?.wallet && validAddress(profile.wallet)) return profile.wallet as Address;
    const wallet = await privyWallet(this.runtime, owner); if (!wallet) throw new ApiError('WALLET_REQUIRED', 409);
    this.store.run('UPDATE op_profiles SET wallet=? WHERE owner=?', wallet, owner); return wallet;
  }
  /** Who receives the 1.5% creator fee: a wallet the creator pasted, their signed-in wallet, or the free-launch pool. */
  async feeRecipient(owner: string, requested?: string): Promise<{ wallet: Address; kind: 'creator' | 'launch_pool' }> {
    if (requested) { if (!validAddress(requested)) throw new ApiError('WALLET_INVALID'); return { wallet: requested.toLowerCase() as Address, kind: 'creator' }; }
    if (!owner.startsWith('guest:')) { try { return { wallet: await this.creatorWallet(owner), kind: 'creator' }; } catch { /* falls through to the launch pool */ } }
    return { wallet: this.sponsor.address.toLowerCase() as Address, kind: 'launch_pool' };
  }
  async create(owner: string, input: DraftInput): Promise<RecordPayload> {
    const old = this.store.one<RecordRow>('SELECT * FROM op_records WHERE session_id=?', input.sessionId); if (old) { requireOwner(owner, old.owner); return JSON.parse(old.payload) as RecordPayload; }
    const { session } = this.captures.load(input.sessionId, owner);
    if (!['model_review', 'approved'].includes(session.state) || !session.model?.validated || !session.manifestHash) throw new ApiError('MODEL_NOT_READY', 409);
    if (session.moderation !== 'approved' || session.approvedManifestHash !== session.manifestHash) throw new ApiError('MODERATION_REVIEW_REQUIRED', 409);
    if (!input.rights) throw new ApiError('RIGHTS_REQUIRED');
    const name = publicName(input.publicName); const story = input.story.normalize('NFC').trim();
    if (name.length > 32 || !/^[A-Z0-9]{2,10}$/.test(input.symbol) || story.length < 10 || story.length > 280) throw new ApiError('METADATA_INVALID');
    if (input.xUrl && !safeXUrl(input.xUrl)) throw new ApiError('LINK_INVALID');
    // Backstop for drafts saved before X verification existed: an unproven X link is dropped instead of sealed on-chain.
    let xUrl = input.xUrl; try { await this.assertXLink(owner, xUrl); } catch { xUrl = ''; this.store.metric('x_link_dropped_unverified'); }
    const verifiedX = owner.startsWith('guest:') ? null : this.storedX(owner);
    const fp = this.uq2?.(session.id) as { geometryHash?: string; surfaceHash?: string } | null | undefined;
    const { wallet, kind } = await this.feeRecipient(owner, input.feeWallet);
    const pair = isEthPair(input.pairToken) ? null : pairAsset(input.pairToken); if (input.pairToken && !isEthPair(input.pairToken) && !pair) throw new ApiError('PAIR_NOT_SUPPORTED');
    const profile = this.store.one<{ public_id: string }>('SELECT public_id FROM op_profiles WHERE owner=?', owner); if (!profile) throw new ApiError('PROFILE_REQUIRED', 409);
    const objectId = await sha256(`objectpad:v1:${session.id}`); const canonicalUrl = coinUrlFor(this.runtime.origin, objectId);
    // Naming methodology: a neutral AI catalogue name, made unique across ObjectPad with a serial, plus a tag hashed from it and the artifacts.
    const baseName = normalizeObjectName(session.suggestion?.catalog || session.suggestion?.object || name) || 'Physical Object';
    const taken = Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_records WHERE session_id<>? AND (json_extract(commitment,'$.objectName')=? OR json_extract(commitment,'$.objectName') LIKE ?)", session.id, baseName, `${baseName} #%`)?.n ?? 0);
    const objectName = taken ? `${baseName} #${taken + 1}` : baseName;
    const objectTag = objectTagFrom(await sha256(objectNameSeed(objectName, session.model.originalHash, session.manifestHash)));
    const job = this.store.one<{ provider_id: string }>('SELECT provider_id FROM op_reconstruction_jobs WHERE session_id=? AND state=?', session.id, 'complete'); if (!job) throw new ApiError('MODEL_NOT_READY', 409);
    this.assertUniqueArtifacts(session.id, session.model.originalHash, session.manifestHash);
    const commitment: ObjectCommitment = { version: 1, objectId, publicName: name, slug: objectId, creatorDid: `did:objectpad:${profile.public_id}`, creatorWallet: wallet, captureSessionId: session.id, captureManifestHash: session.manifestHash, acceptedViewCount: session.views.length, reconstructionProvider: 'Meshy', reconstructionModel: session.model.providerModel, reconstructionTaskReference: await sha256(job.provider_id), canonicalViewIds: [...CANONICAL_VIEWS], originalModelHash: session.model.originalHash, optimizedModelHash: session.model.optimizedHash, thumbnailHash: session.model.thumbnailHash, thesisHash: await sha256(story), story, thesis: story, category: input.category.slice(0, 40), externalWebsite: canonicalUrl, xUrl, ...(verifiedX ? { creatorX: { id: verifiedX.id, handle: verifiedX.handle, boundAt: Date.now() } } : {}), ...(fp?.geometryHash && fp.surfaceHash ? { fingerprintV2: { geometry: fp.geometryHash, surface: fp.surfaceHash } } : {}), telegram: input.telegram ?? '', downloadAllowed: false, chainId: 4663, createdAt: Date.now(), objectName, objectTag, objectSpecs: objectSpecsText({ triangles: session.model.triangles, bounds: session.model.bounds, textures: session.model.textures, materials: session.suggestion?.materials, colors: session.suggestion?.colors, views: session.views.length }) + (fp?.geometryHash ? `;fp2=${(await sha256(`${fp.geometryHash}${fp.surfaceHash}`)).slice(0, 16)}` : '') };
    const bytes = canonicalJson(commitment); const metadataHash = await sha256(bytes); const metadataUri = `${this.runtime.apiOrigin}/api/artifacts/${metadataHash}`;
    const key = `objectpad/v1/artifacts/${metadataHash}`; await this.runtime.artifactBucket.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
    const payload: RecordPayload = { ...(session.icon ? { iconHash: session.icon.hash } : {}), commitment, symbol: input.symbol, metadataHash, metadataUri, canonicalUrl, feeVault: wallet, feeRecipientKind: kind, launchMode: 'sponsored', ...(pair ? { pairToken: pair.address.toLowerCase() } : {}), uniqueness: session.suggestion ? { checkedAt: Date.now(), compared: session.suggestion.compared, model: this.runtime.env.OBJECTPAD_UNIQUENESS_MODEL?.trim() || 'google/gemini-3.8-flash' } : undefined };
    session.approved = true; session.state = 'approved'; session.recordId = objectId;
    this.store.atomic(() => { this.store.run('INSERT OR IGNORE INTO op_artifacts(hash,storage_key,kind,bytes,public,session_id) VALUES (?,?,?,?,?,?)', metadataHash, key, 'metadata', new TextEncoder().encode(bytes).length, 1, session.id); this.store.run('INSERT INTO op_records(id,owner,session_id,state,commitment,metadata_hash,metadata_uri,payload) VALUES (?,?,?,?,?,?,?,?)', objectId, owner, session.id, 'prepared', bytes, metadataHash, metadataUri, JSON.stringify(payload)); this.captures.save(session); });
    this.store.metric('record_created'); return payload;
  }
  /** No two records may share a model or capture manifest. */
  assertUniqueArtifacts(sessionId: string, modelHash: string, manifestHash: string): void {
    const clash = this.store.one<{ id: string }>("SELECT id FROM op_records WHERE session_id<>? AND (json_extract(commitment,'$.originalModelHash')=? OR json_extract(commitment,'$.captureManifestHash')=? OR json_extract(commitment,'$.optimizedModelHash')=?)", sessionId, modelHash, manifestHash, modelHash);
    if (clash) throw new ApiError('DUPLICATE_ARTIFACT', 409);
  }
  private tx(id: string): TxRow | undefined { return this.store.one<TxRow>("SELECT * FROM op_transactions WHERE record_id=? AND kind='launch'", id); }
  /** Sends (or resumes) the sponsored launch for a record. Safe to call repeatedly. */
  async launch(id: string, owner: string): Promise<{ state: string; hash?: string }> {
    const { row, payload } = this.load(id, owner);
    if (row.moderation_state === 'hidden' || ['hidden', 'reorg_review'].includes(row.state)) throw new ApiError('RECORD_LOCKED', 409);
    if (row.state === 'confirmed') return { state: 'confirmed', hash: payload.launchHash };
    const client = this.client(); const existing = this.tx(id);
    if (existing?.tx_hash) {
      const state = await this.reconcile(existing); if (state !== 'unknown' && state !== 'reverted') return { state, hash: existing.tx_hash };
      const seen = state === 'unknown' ? await client.getTransaction({ hash: existing.tx_hash }).then(() => true, () => false) : false;
      if (seen || (state === 'unknown' && Date.now() - existing.updated_at < 180_000)) return { state: 'submitted', hash: existing.tx_hash };
      this.store.run('DELETE FROM op_transactions WHERE id=?', existing.id); this.store.metric('launch_resubmitted');
    } else if (existing) this.store.run('DELETE FROM op_transactions WHERE id=?', existing.id);
    await assertPonsPinned(this.runtime.env);
    // Limits are checked here but only counted once the launch is actually broadcast: a failed try never uses one up.
    this.store.peek(`launch:${owner}`, 100_000); this.store.peekBudget('launches', this.sponsor.dailyLimit(), 'LAUNCH_BUDGET_REACHED');
    const pairToken = (isEthPair(payload.pairToken) ? zeroAddress : payload.pairToken) as Address; const paired = pairToken !== zeroAddress;
    const terms = await readLaunchTerms(client, pairToken); if (!terms.enabled) throw new ApiError('PONS_LAUNCH_PAUSED', 503); if (!terms.approved) throw new ApiError('PAIR_NOT_APPROVED', 409);
    const c = payload.commitment; const sponsor = this.sponsor.address; const { objectName, objectTag } = await naming(c);
    // The coin logo is whatever the creator has right now (3D snapshot or own image); it's fixed once the launch is sent.
    const icon = this.captures.load(row.session_id).session.icon; if (icon?.hash) payload.iconHash = icon.hash; else delete payload.iconHash;
    const description = launchDescription(objectName, objectTag, c.originalModelHash, c.captureManifestHash, payload.canonicalUrl);
    // The object's name, tag and ID are appended to the launch calldata as UTF-8, so the launch transaction itself carries them.
    const suffix = objectSuffixText(objectTag, objectName, c.objectId, c.objectSpecs);
    const input = { name: c.publicName, symbol: payload.symbol, logo: `${this.runtime.apiOrigin}/api/artifacts/${payload.iconHash ?? c.thumbnailHash}`, description, website: payload.canonicalUrl, twitter: c.xUrl, telegram: c.telegram ?? '', creator: sponsor, recipient: DEAD_ADDRESS, feeRecipient: c.creatorWallet as Address, creatorTaxBps: 150, quoteIn: MIN_INITIAL_BUY_WEI, minTokensOut: 0n, salt: hashHex(await sha256(`objectpad:launch:${id}`)) };
    const simFail = (error: unknown): never => { const detail = error instanceof Error ? error.message : ''; this.note('simulate', detail); if (/insufficient funds/i.test(detail)) throw new ApiError('SPONSOR_EMPTY', 503); throw new ApiError('LAUNCH_SIMULATION_FAILED', 409); };
    let built: { to: Address; data: Hex; value: bigint };
    if (paired) {
      // Asset-paired: the curve collects the stock token, so there is no ETH opening buy. Launched straight from the factory.
      await client.simulateContract({ address: PONS_FACTORY, abi: FACTORY_LAUNCH_ABI, functionName: 'launchToken', args: pairedLaunchArguments(input, terms.expectedEconomics, pairToken), account: sponsor, value: terms.launchFee }).catch(simFail);
      built = buildPairedLaunchTx(input, terms, pairToken);
    } else {
      const simulation = await client.simulateContract({ address: PONS_ROUTER, abi: ROUTER_ABI, functionName: 'launchAndBuy', args: launchArguments(input, terms.expectedEconomics), account: sponsor, value: terms.launchFee + MIN_INITIAL_BUY_WEI }).catch(simFail);
      const minTokensOut = simulation.result[2] * 9700n / 10000n; if (minTokensOut <= 0n) throw new ApiError('SIMULATION_EMPTY_OUTPUT', 409);
      built = buildLaunchTx({ ...input, minTokensOut }, terms);
    } const tx = { ...built, data: concatHex([built.data, stringToHex(suffix)]) };
    const [estimate, block, balance] = await Promise.all([client.estimateGas({ account: sponsor, ...tx }).catch((error: unknown) => { this.note('estimate', error instanceof Error ? error.message : ''); throw new ApiError('LAUNCH_SIMULATION_FAILED', 409); }), client.getBlock(), client.getBalance({ address: sponsor })]);
    const baseFee = block.baseFeePerGas ?? await client.getGasPrice();
    const plan = FEE_PLANS.map(([g, f]) => ({ gas: estimate * g / 100n, maxFeePerGas: baseFee * f / 100n })).find(p => p.gas * p.maxFeePerGas + tx.value <= balance);
    if (!plan) { const need = estimate * baseFee * 103n / 100n + tx.value; this.note('funds', 'treasury below launch cost', { balanceWei: balance, needWei: need }); this.sponsor.invalidate(); throw new ApiError('SPONSOR_EMPTY', 503); }
    const gas = plan.gas;
    const wallet = this.sponsor.wallet(); const account = wallet.account;
    payload.sponsor = sponsor.toLowerCase(); payload.launchDescription = description; payload.launchDataSuffix = suffix; payload.feeVault = c.creatorWallet; payload.launchMode = 'sponsored';
    const requestJson = JSON.stringify({ to: tx.to, data: tx.data, value: tx.value.toString(), gas: gas.toString(), launchFeeWei: terms.launchFee.toString(), initialBuyWei: paired ? '0' : MIN_INITIAL_BUY_WEI.toString(), pairToken });
    // The treasury also sends showcase launches, so the nonce is managed explicitly and a collision is retried, not fatal.
    let nonce = await this.sponsor.nextNonce(); let maxFeePerGas = plan.maxFeePerGas; let hash: Hex | null = null;
    for (let attempt = 0; attempt < 4 && !hash; attempt++) {
      const request = await wallet.prepareTransactionRequest({ account, chain: robinhoodChain, to: tx.to, data: tx.data, value: tx.value, gas, nonce, maxFeePerGas, maxPriorityFeePerGas: 0n });
      const serialized = await wallet.signTransaction(request); const candidate = keccak256(serialized);
      this.store.atomic(() => { this.store.run("DELETE FROM op_transactions WHERE record_id=? AND kind='launch'", id); this.store.run('INSERT INTO op_transactions(id,record_id,kind,state,tx_hash,request,updated_at) VALUES (?,?,?,?,?,?,?)', crypto.randomUUID(), id, 'launch', 'submitted', candidate, requestJson, Date.now()); this.store.run('UPDATE op_records SET payload=? WHERE id=?', JSON.stringify(payload), id); });
      try { await client.sendRawTransaction({ serializedTransaction: serialized }); hash = candidate; break; }
      catch (error) {
        if (await client.getTransaction({ hash: candidate }).then(() => true, () => false)) { hash = candidate; break; }
        const detail = error instanceof Error ? ((error as { details?: string }).details || error.message) : '';
        this.store.run("DELETE FROM op_transactions WHERE record_id=? AND kind='launch' AND tx_hash=?", id, candidate); console.warn('objectpad.launch.broadcast_failed', detail.slice(0, 160)); this.note('broadcast', `nonce ${nonce} · ${detail}`, { balanceWei: balance, needWei: gas * maxFeePerGas + tx.value }); this.sponsor.invalidate();
        // Short on funds means the coin stays sealed and goes out by itself once the treasury is topped up.
        if (/insufficient funds|exceeds balance|balance too low/i.test(detail)) throw new ApiError('SPONSOR_EMPTY', 503);
        if (/nonce|already known|known transaction|replacement|underpriced/i.test(detail)) { nonce = Math.max(await this.sponsor.nextNonce(true), nonce + 1); continue; }
        if (/fee cap|max fee|base fee|basefee|fee too low/i.test(detail)) { const fresh = (await client.getBlock()).baseFeePerGas ?? await client.getGasPrice(); const bumped = fresh * 2n; if (gas * bumped + tx.value <= balance) { maxFeePerGas = bumped; continue; } throw new ApiError('SPONSOR_EMPTY', 503); }
        throw new ApiError('LAUNCH_BROADCAST_FAILED', 503);
      }
    }
    if (!hash) throw new ApiError('LAUNCH_BROADCAST_FAILED', 503);
    this.sponsor.markNonce(nonce);
    this.store.bump(`launch:${owner}`, 86_400_000); this.store.bumpBudget('launches');
    this.note('sent', `launch broadcast · nonce ${nonce} · gas ${gas} · maxFee ${maxFeePerGas}`, { balanceWei: balance, needWei: gas * maxFeePerGas + tx.value });
    this.sponsor.invalidate(); this.store.metric('launch_submitted'); return { state: 'submitted', hash };
  }
  hasPending(): boolean { return Boolean(this.store.one("SELECT id FROM op_transactions WHERE tx_hash IS NOT NULL AND state IN ('submitted','confirming','unknown') LIMIT 1")); }
  async reconcile(tx: TxRow): Promise<string> {
    if (!tx.tx_hash) return 'unknown'; const client = this.client(); const { row, payload } = this.load(tx.record_id); const expected = JSON.parse(tx.request) as { to: string; data: string; value: string };
    try {
      const receipt = await client.getTransactionReceipt({ hash: tx.tx_hash }); const [block, head, transaction] = await Promise.all([client.getBlock({ blockNumber: receipt.blockNumber }), client.getBlockNumber(), client.getTransaction({ hash: tx.tx_hash })]);
      let state: string = reconcileReceipt({ savedBlockHash: tx.block_hash ?? undefined, currentBlockHash: block.hash ?? undefined, receiptBlockHash: receipt.blockHash, receiptBlock: receipt.blockNumber, head, status: receipt.status, requiredDepth: DEPTH });
      if (transaction.from.toLowerCase() !== payload.sponsor?.toLowerCase() || transaction.to?.toLowerCase() !== expected.to.toLowerCase() || transaction.input.toLowerCase() !== expected.data.toLowerCase() || transaction.value !== BigInt(expected.value)) state = 'reorg_review';
      if (state === 'confirmed') {
        const expectedPair = isEthPair(payload.pairToken) ? zeroAddress : (payload.pairToken as string).toLowerCase();
        const viaFactory = transaction.to?.toLowerCase() === PONS_FACTORY.toLowerCase();
        const decoded = viaFactory ? decodeFunctionData({ abi: FACTORY_LAUNCH_ABI, data: transaction.input }) : decodeFunctionData({ abi: ROUTER_ABI, data: transaction.input });
        if (decoded.functionName !== (viaFactory ? 'launchToken' : 'launchAndBuy')) throw new ApiError('LAUNCH_METHOD_MISMATCH');
        const event = receipt.logs.find(log => log.address.toLowerCase() === PONS_FACTORY.toLowerCase() && (() => { try { return decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics }).eventName === 'TokenLaunched'; } catch { return false; } })()); if (!event) throw new ApiError('LAUNCH_EVENT_MISSING');
        const args = decodeEventLog({ abi: FACTORY_ABI, eventName: 'TokenLaunched', data: event.data, topics: event.topics }).args;
        if (args.launcher.toLowerCase() !== payload.sponsor?.toLowerCase() || args.pairToken.toLowerCase() !== expectedPair) throw new ApiError('LAUNCH_EVENT_MISMATCH');
        const [name, curve] = await Promise.all([client.readContract({ address: args.token, abi: ERC20_ABI, functionName: 'name', blockNumber: receipt.blockNumber }), client.readContract({ address: args.token, abi: ERC20_ABI, functionName: 'curve', blockNumber: receipt.blockNumber })]);
        const params = decoded.args[0]; const record = readObjectSuffix(transaction.input);
        if (payload.launchDataSuffix && record?.text !== payload.launchDataSuffix) throw new ApiError('OBJECT_RECORD_MISMATCH');
        if (name !== payload.commitment.publicName || curve.toLowerCase() !== args.curve.toLowerCase() || params.creatorFeeRecipient.toLowerCase() !== payload.commitment.creatorWallet.toLowerCase() || params.creatorTaxBps !== 150 || params.description !== payload.launchDescription || params.name !== payload.commitment.publicName) throw new ApiError('TOKEN_IDENTITY_MISMATCH');
        payload.token = args.token.toLowerCase(); payload.curve = args.curve.toLowerCase(); payload.launchHash = tx.tx_hash; payload.launchBlockHash = receipt.blockHash; payload.verifiedName = name; payload.confirmedAt = Number(block.timestamp) * 1000;
        this.store.run('INSERT OR IGNORE INTO op_launches(record_id,token,tx_hash,block_hash,confirmed_at) VALUES (?,?,?,?,?)', row.id, args.token.toLowerCase(), tx.tx_hash, receipt.blockHash, Date.now());
      }
      this.store.atomic(() => { this.store.run('UPDATE op_transactions SET state=?,block_hash=?,updated_at=? WHERE id=?', state, receipt.blockHash, Date.now(), tx.id); this.store.run('UPDATE op_records SET payload=? WHERE id=?', JSON.stringify(payload), row.id); this.refreshPublication(row.id); });
      if (state !== tx.state) this.store.metric(`tx_launch_${state}`); return state;
    } catch (error) {
      const state = error instanceof ApiError || tx.block_hash ? 'reorg_review' : 'unknown';
      if (state === 'reorg_review') console.warn('objectpad.launch.review', error instanceof ApiError ? error.code : 'reorg');
      this.store.atomic(() => { this.store.run('UPDATE op_transactions SET state=? WHERE id=?', state, tx.id); this.refreshPublication(row.id); }); return state;
    }
  }
  refreshPublication(id: string): void {
    const { row } = this.load(id); const tx = this.tx(id);
    const next = row.moderation_state === 'hidden' ? 'hidden' : row.state === 'reorg_review' || tx?.state === 'reorg_review' ? 'reorg_review' : tx?.state === 'confirmed' && tx.block_hash ? 'confirmed' : 'prepared';
    this.store.run('UPDATE op_records SET state=? WHERE id=?', next, id);
    this.store.run("UPDATE op_artifacts SET public=? WHERE session_id=? AND kind<>'metadata'", next === 'confirmed' ? 1 : 0, row.session_id);
  }
  async poll(): Promise<void> { for (const tx of this.store.all<TxRow>("SELECT * FROM op_transactions WHERE tx_hash IS NOT NULL AND state IN ('submitted','confirming','unknown') ORDER BY updated_at ASC LIMIT 5")) await this.reconcile(tx); }
  /** Owner view of a record including its launch progress. */
  ownerRecord(id: string, owner: string): Record<string, unknown> { const { row, payload } = this.load(id, owner); const tx = this.tx(id); return { ...payload, id, state: row.state, launch: tx ? { state: tx.state, hash: tx.tx_hash } : null }; }
  /** Proof of custody: matched Object Key check-ins (the creator re-photographed the real object) over 30/90 days. */
  custody(id: string): NonNullable<ObjectRecord['custody']> {
    const now = Date.now(); const r = this.store.one<{ last: number | null; m30: number; m90: number; total: number }>('SELECT MAX(CASE WHEN matched=1 THEN created_at END) AS last, SUM(CASE WHEN matched=1 AND created_at>? THEN 1 ELSE 0 END) AS m30, SUM(CASE WHEN matched=1 AND created_at>? THEN 1 ELSE 0 END) AS m90, COUNT(*) AS total FROM op_checkins WHERE record_id=?', now - 30 * 86_400_000, now - 90 * 86_400_000, id);
    const last = r?.last ? Number(r.last) : null;
    return { last, matched30d: Number(r?.m30 ?? 0), matched90d: Number(r?.m90 ?? 0), total: Number(r?.total ?? 0), status: !last ? 'never' : now - last <= 30 * 86_400_000 ? 'active' : 'lapsed' };
  }
  publicRecord(id: string): ObjectRecord {
    const { row, payload: p } = this.load(id);
    if (row.moderation_state === 'hidden' || row.state !== 'confirmed' || !p.token || !p.launchHash || !p.verifiedName || !p.launchBlockHash || !p.curve) throw new ApiError('NOT_FOUND', 404);
    const { session } = this.captures.load(row.session_id); if (!session.model) throw new ApiError('NOT_FOUND', 404);
    return { ...p.commitment, metadataHash: p.metadataHash, metadataUri: p.metadataUri, canonicalUrl: p.canonicalUrl, tokenAddress: p.token, curveAddress: p.curve, symbol: p.symbol, launchTransactionHash: p.launchHash, launchBlockHash: p.launchBlockHash, verifiedName: p.verifiedName, status: 'confirmed', model: session.model, feeVault: p.feeVault, launchMode: 'sponsored', sponsor: p.sponsor, launchDescription: p.launchDescription, launchDataSuffix: p.launchDataSuffix, uniqueness: p.uniqueness, confirmedAt: p.confirmedAt, checkin: p.checkin, creatorIdentity: this.creatorIdentity(row, p.commitment), uniquenessV2: (this.uq2?.(row.session_id) ?? null) as ObjectRecord['uniquenessV2'], custody: this.custody(id), iconUrl: p.iconHash ? `${this.runtime.apiOrigin}/api/artifacts/${p.iconHash}` : session.model.thumbnailUrl, ...(p.pairToken ? { pairToken: p.pairToken } : {}) };
  }
}
