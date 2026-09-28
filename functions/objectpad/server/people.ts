import { ApiError, canonicalJson, safeHttpUrl, sha256, validAddress } from '../shared/security';
import {
  CAPTURE_MODES, CHALLENGE_TTL_MS, CHECK_LABELS, CONSENT_TEXT, CONSENT_VERSIONS, INVITATION_TTL_MS, MAX_LAUNCHER_BPS,
  feeMessage, secureNonce, splitFor, validSplit, walletMessage,
  type CaptureMode, type CheckId, type ConsentKind, type FeeSplit, type PeopleFeature, type PeopleStatus, type Relationship,
} from '../shared/people';
import type { Store } from './store';
import type { Runtime } from './types';

/**
 * Liveness is delegated to a commercial provider with presentation-attack detection. None is contracted yet, so the
 * adapter below refuses every session: no liveness result can be produced, and no badge or payout depends on a fake one.
 */
export interface LivenessProvider { readonly id: string; readonly configured: boolean; createSession(draftId: string): Promise<{ ref: string; url: string }>; result(ref: string): Promise<'pending' | 'passed' | 'failed' | 'review'>; }
class UnconfiguredLiveness implements LivenessProvider {
  readonly id = 'none'; readonly configured = false;
  async createSession(): Promise<{ ref: string; url: string }> { throw new ApiError('LIVENESS_NOT_CONFIGURED', 503); }
  async result(): Promise<'pending'> { throw new ApiError('LIVENESS_NOT_CONFIGURED', 503); }
}
export function livenessProvider(): LivenessProvider { return new UnconfiguredLiveness(); }

/** External capabilities the People service needs; injected so the rules can be tested without the network. */
export interface PeopleDeps {
  /** The signed-in account's X identity from the auth provider. `id` is X's immutable numeric user ID. */
  xIdentity(owner: string): Promise<{ id: string; handle: string } | null>;
  /** Wallet a launcher's collaborator share would go to (their proven account wallet), if any. */
  walletOf(owner: string): Promise<string | null>;
  /** Server-side signature check. Supports EOA and contract-wallet (ERC-1271/6492) signatures. */
  verify(address: string, message: string, signature: string): Promise<boolean>;
  operatorName?: string;
  /** Capture + 3D preview pipeline; optional so the rules can be tested without storage or the 3D engine. */
  models?: { purge(id: string): Promise<void>; hasPublicModel(profileId: string): boolean };
}

interface DraftRow { id: string; creator: string; subject: string | null; relationship: Relationship; state: 'draft' | 'awaiting_subject' | 'published' | 'withdrawn' | 'deleted'; display_name: string; narrative: string; capture_mode: CaptureMode; launcher_bps: number; version: number; profile_id: string | null; created_at: number; updated_at: number; }
interface ChallengeRow { nonce_hash: string; kind: 'wallet' | 'fee'; draft_id: string; owner: string; address: string; domain: string; message: string; payload: string; expires: number; used_at: number | null; }
export interface CheckView { id: CheckId; label: string; passed: boolean; at: number | null; }

const ROLES = ['creator', 'streamer', 'ugc', 'kol', '3d_artist', 'community', 'engineering'] as const;
const LOCATIONS = ['remote', 'san_francisco', 'other'] as const;
const PLATFORMS = ['x', 'instagram', 'tiktok', 'youtube', 'twitch', 'other'] as const;
const HANDLE = /^@?[A-Za-z0-9._]{1,30}$/;
const EMAIL = /^[^\s@<>]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const text = (value: unknown, min: number, max: number, code = 'INVALID_INPUT'): string => { if (typeof value !== 'string') throw new ApiError(code); const v = value.normalize('NFC').trim(); if (v.length < min || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/u.test(v)) throw new ApiError(code); return v; };
const optional = (value: unknown, max: number): string => value === undefined || value === null || value === '' ? '' : text(value, 0, max);
const guest = (owner: string): boolean => owner.startsWith('guest:');

/**
 * ObjectPad People foundations: private drafts, separate consents, invitations for assisted launches, X account and
 * wallet binding, subject-signed fee policies, nominations, creator applications, reports, withdrawal and deletion.
 * Every state rule is enforced here, server-side. Every change appends to the hash-chained audit log.
 */
export class PeopleService {
  readonly liveness: LivenessProvider = livenessProvider();
  constructor(private readonly store: Store, private readonly runtime: Runtime, private readonly deps: PeopleDeps) {
    const s = (q: string) => store.run(q);
    s("CREATE TABLE IF NOT EXISTS op_people_drafts (id TEXT PRIMARY KEY, creator TEXT NOT NULL, subject TEXT, relationship TEXT NOT NULL, state TEXT NOT NULL, display_name TEXT NOT NULL, narrative TEXT NOT NULL DEFAULT '', capture_mode TEXT NOT NULL DEFAULT 'multi_view_head', launcher_bps INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, profile_id TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
    s('CREATE INDEX IF NOT EXISTS op_people_drafts_creator ON op_people_drafts(creator)');
    s('CREATE INDEX IF NOT EXISTS op_people_drafts_subject ON op_people_drafts(subject)');
    s('CREATE TABLE IF NOT EXISTS op_people_consents (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, subject TEXT NOT NULL, kind TEXT NOT NULL, version TEXT NOT NULL, text_hash TEXT NOT NULL, granted_at INTEGER NOT NULL, withdrawn_at INTEGER)');
    s('CREATE INDEX IF NOT EXISTS op_people_consents_draft ON op_people_consents(draft_id, kind)');
    // One X account per draft; keyed by X's immutable user ID, never by the (mutable) handle.
    s('CREATE TABLE IF NOT EXISTS op_people_social (draft_id TEXT PRIMARY KEY, subject TEXT NOT NULL, provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, handle_snapshot TEXT NOT NULL, bound_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_people_wallets (draft_id TEXT PRIMARY KEY, subject TEXT NOT NULL, address TEXT NOT NULL, message_hash TEXT NOT NULL, bound_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_people_wallet_history (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, address TEXT NOT NULL, event TEXT NOT NULL, at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_people_challenges (nonce_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, draft_id TEXT NOT NULL, owner TEXT NOT NULL, address TEXT NOT NULL, domain TEXT NOT NULL, message TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL, used_at INTEGER)');
    s('CREATE TABLE IF NOT EXISTS op_people_invitations (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, state TEXT NOT NULL, expires INTEGER NOT NULL, accepted_by TEXT, accepted_at INTEGER, created_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_people_fee_policies (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, version INTEGER NOT NULL, relationship TEXT NOT NULL, subject_bps INTEGER NOT NULL, launcher_bps INTEGER NOT NULL, platform_bps INTEGER NOT NULL, subject_wallet TEXT NOT NULL, launcher_wallet TEXT, message TEXT NOT NULL, signature TEXT NOT NULL, signed_at INTEGER NOT NULL, UNIQUE(draft_id, version))');
    s('CREATE TABLE IF NOT EXISTS op_people_verifications (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, provider TEXT NOT NULL, provider_ref TEXT UNIQUE, state TEXT NOT NULL, created_at INTEGER NOT NULL, decided_at INTEGER)');
    s('CREATE TABLE IF NOT EXISTS op_people_models (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL, approved_at INTEGER, created_at INTEGER NOT NULL)');
    // Canonical claimed profile per verified subject. The unique keys make a double claim impossible, even under races.
    s('CREATE TABLE IF NOT EXISTS op_people_canonical (subject_key TEXT PRIMARY KEY, draft_id TEXT NOT NULL UNIQUE, wallet TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_people_attestations (id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, manifest TEXT NOT NULL, digest TEXT NOT NULL, issued_at INTEGER NOT NULL, revoked_at INTEGER)');
    s('CREATE TABLE IF NOT EXISTS op_people_nominations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, platform TEXT NOT NULL, handle TEXT NOT NULL, url TEXT NOT NULL, display_name TEXT NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(owner, platform, handle))');
    s('CREATE TABLE IF NOT EXISTS op_people_applications (id TEXT PRIMARY KEY, owner TEXT, email_hash TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL)');
    s('CREATE INDEX IF NOT EXISTS op_people_applications_email ON op_people_applications(email_hash, created_at)');
    s('CREATE TABLE IF NOT EXISTS op_people_cases (id TEXT PRIMARY KEY, reporter TEXT, draft_id TEXT, kind TEXT NOT NULL, reason TEXT NOT NULL, state TEXT NOT NULL, resolution TEXT, created_at INTEGER NOT NULL, decided_at INTEGER)');
  }

  private async audit(actor: string, draftId: string, event: string, detail = ''): Promise<void> { await this.store.audit(await sha256(`people:${actor}`), `people:${draftId}`, event, detail.slice(0, 900)); }
  private signedIn(owner: string): void { if (guest(owner)) throw new ApiError('SIGN_IN_REQUIRED', 401); }
  private draft(id: string): DraftRow { if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError('NOT_FOUND', 404); const row = this.store.one<DraftRow>('SELECT * FROM op_people_drafts WHERE id=?', id); if (!row || row.state === 'deleted') throw new ApiError('NOT_FOUND', 404); return row; }
  /** Loads a draft the caller may see. Anyone else gets a 404, so draft existence never leaks. */
  private access(id: string, owner: string): { draft: DraftRow; isCreator: boolean; isSubject: boolean } {
    const draft = this.draft(id); const isCreator = draft.creator === owner; const isSubject = draft.subject === owner;
    if (!isCreator && !isSubject) throw new ApiError('NOT_FOUND', 404);
    return { draft, isCreator, isSubject };
  }
  private asSubject(id: string, owner: string): DraftRow { const { draft, isSubject } = this.access(id, owner); if (!isSubject) throw new ApiError('SUBJECT_ONLY', 403); if (draft.state === 'withdrawn') throw new ApiError('DRAFT_WITHDRAWN', 409); return draft; }
  private touch(id: string, bump: boolean): void { this.store.run(`UPDATE op_people_drafts SET updated_at=?${bump ? ',version=version+1' : ''} WHERE id=?`, Date.now(), id); }

  /** Server-configured status registry. States reflect code and configuration actually present, never aspirations. */
  status(): PeopleStatus {
    const env = this.runtime.env; const xReady = Boolean(this.runtime.privyAppId && (env.OBJECTPAD_PRIVY_APP_SECRET || env.PRIVY_APP_SECRET)); const livenessReady = this.liveness.configured;
    const noLiveness = 'No commercial liveness provider is contracted yet, so nothing can be published.'; const meshyReady = Boolean(this.runtime.toolkitKey);
    const f = (id: string, group: PeopleFeature['group'], label: string, state: PeopleFeature['state'], detail: string, blocker: string | null = null): PeopleFeature => ({ id, group, label, state, detail, blocker });
    const features: PeopleFeature[] = [
      f('self_launch', 'foundation', 'Self-launch drafts', xReady ? 'pilot' : 'planned', 'Private draft, separate consents, X account binding and signed wallet proof.', livenessReady ? null : noLiveness),
      f('assisted', 'foundation', 'Authorized assisted launch', 'pilot', 'A collaborator prepares a private draft. The subject accepts an expiring invitation and takes control before anything goes public.', livenessReady ? null : noLiveness),
      f('nominations', 'foundation', 'Nominate a public creator', 'live', 'Private nomination of a public account. Never shown publicly, never tradable, no likeness generated.'),
      f('capture', 'foundation', 'Face and body capture', meshyReady ? 'pilot' : 'planned', 'Guided selfie, multi-angle and full-body photos with light, sharpness and one-person checks. Private to you.', meshyReady ? 'Pilot: face quality is being benchmarked with the first consenting adults.' : '3D engine not configured.'),
      f('model_jobs', 'foundation', '3D likeness generation', meshyReady ? 'pilot' : 'planned', 'Your private 3D preview with real progress, a retry budget and your approval before anything is used.', meshyReady ? 'Private previews only until liveness verification is live.' : '3D engine not configured.'),
      f('proofs', 'foundation', 'Separate proofs and scoped badges', 'pilot', 'Account, wallet, consent and liveness are recorded and shown as separate checks.', livenessReady ? null : 'The liveness check is unavailable until a provider is contracted.'),
      f('canonical', 'foundation', 'One canonical profile per subject', 'pilot', 'Enforced with unique keys on X user ID and wallet when a profile is published. Duplicates go to review.'),
      f('fee_split', 'foundation', 'Subject-approved fee split', 'planned', 'The subject can sign an exact split of collected creator fees today. It is recorded, not yet enforced on-chain.', 'Robinhood Chain launches pay creator fees to one wallet. No reviewed splitter contract is deployed.'),
      f('public_profile', 'foundation', 'Public profile and proof drawer', 'planned', '3D or static profile with a proof drawer.', noLiveness),
      f('moderation', 'foundation', 'Reports, withdrawal and deletion', 'pilot', 'Impersonation reports, consent withdrawal and deletion requests with an append-only audit log.'),
      f('timeline', 'utility', 'Official social timeline', 'planned', 'Permitted embeds with source timestamps.', 'Needs published profiles.'),
      f('live', 'utility', 'Live appearances', 'planned', 'Links to the creator’s own stream first; native broadcast later.', 'Needs published profiles.'),
      f('missions', 'utility', 'Paid missions', 'planned', 'Escrow is locked before a mission goes live; completion is reviewed; payouts are traceable.', 'No escrow contract is reviewed or deployed.'),
      f('sponsorships', 'utility', 'Sponsorship proposals', 'planned', 'Disclosure labels and visible recipients.', 'Needs published profiles.'),
      f('applications', 'utility', 'Creator applications', 'live', 'Remote and San Francisco interest intake. Applications stay private. Selected creators can apply for paid roles.'),
      f('milestones', 'utility', 'Milestone funding', 'planned', 'Public commitments, kept separate from trading liquidity.', 'No escrow contract is reviewed or deployed.'),
      f('votes', 'utility', 'Community proposals', 'planned', 'Votes only over options the creator pre-approves.', 'Needs published profiles.'),
      f('collectibles', 'utility', 'Approved avatar licensing', 'planned', 'Explicit rights, duration and revocation terms.', 'Needs published profiles and license terms.'),
      f('checkins', 'utility', 'Proof-of-presence check-ins', 'planned', 'Voluntary, timestamped, with expiry. Not a health or safety claim.', noLiveness),
      f('collectives', 'utility', 'Creator collectives', 'planned', 'Built on Object Vaults once its trading prerequisites pass.', 'Vault trading prerequisites have not passed for People.'),
    ];
    const phaseEnv = (env as { OBJECTPAD_PEOPLE_PHASE?: string }).OBJECTPAD_PEOPLE_PHASE;
    const published = Number(this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_people_drafts WHERE state='published'")?.n ?? 0);
    return {
      phase: phaseEnv === 'pilot' ? 'pilot' : 'preview', features,
      providers: [
        { id: 'x', label: 'X sign-in (OAuth via auth provider)', configured: xReady, note: 'Binds the immutable X user ID, not the handle.' },
        { id: 'wallet', label: 'Wallet signatures (EIP-4361)', configured: true, note: 'Verified server-side; contract wallets supported.' },
        { id: 'liveness', label: 'Liveness provider', configured: livenessReady, note: livenessReady ? 'Configured.' : 'Not contracted. Verification and anything depending on it stay off.' },
        { id: 'meshy', label: '3D reconstruction (Meshy)', configured: Boolean(this.runtime.toolkitKey), note: meshyReady ? 'Private People previews in pilot. Face quality is being benchmarked.' : 'Not configured.' },
        { id: 'splitter', label: 'Fee splitter contract', configured: false, note: 'Not deployed or reviewed.' },
      ],
      publishedProfiles: published, genesis: null, updatedAt: Date.now(),
    };
  }

  private consents(draftId: string, subject: string | null): Record<ConsentKind, number | null> {
    const out: Record<ConsentKind, number | null> = { adult: null, verification_processing: null, public_likeness: null };
    if (!subject) return out;
    for (const kind of Object.keys(out) as ConsentKind[]) { const row = this.store.one<{ granted_at: number }>('SELECT granted_at FROM op_people_consents WHERE draft_id=? AND subject=? AND kind=? AND version=? AND withdrawn_at IS NULL ORDER BY granted_at DESC LIMIT 1', draftId, subject, kind, CONSENT_VERSIONS[kind]); out[kind] = row?.granted_at ?? null; }
    return out;
  }
  private split(draft: DraftRow): FeeSplit { return splitFor(draft.relationship, draft.launcher_bps); }
  private policy(draft: DraftRow) { return this.store.one<{ version: number; subject_bps: number; launcher_bps: number; platform_bps: number; subject_wallet: string; launcher_wallet: string | null; signed_at: number }>('SELECT version,subject_bps,launcher_bps,platform_bps,subject_wallet,launcher_wallet,signed_at FROM op_people_fee_policies WHERE draft_id=? ORDER BY version DESC LIMIT 1', draft.id); }
  /** Every check, evaluated fresh from stored evidence. A check passes only when its own evidence exists and is current. */
  checks(draft: DraftRow): CheckView[] {
    const c = this.consents(draft.id, draft.subject);
    const social = draft.subject ? this.store.one<{ bound_at: number }>('SELECT bound_at FROM op_people_social WHERE draft_id=? AND subject=?', draft.id, draft.subject) : undefined;
    const wallet = draft.subject ? this.store.one<{ address: string; bound_at: number }>('SELECT address,bound_at FROM op_people_wallets WHERE draft_id=? AND subject=?', draft.id, draft.subject) : undefined;
    const live = this.liveness.configured ? this.store.one<{ decided_at: number }>("SELECT decided_at FROM op_people_verifications WHERE draft_id=? AND state='passed' AND provider=? ORDER BY decided_at DESC LIMIT 1", draft.id, this.liveness.id) : undefined;
    const model = this.store.one<{ approved_at: number }>("SELECT approved_at FROM op_people_models WHERE draft_id=? AND state='approved' ORDER BY approved_at DESC LIMIT 1", draft.id);
    const p = this.policy(draft); const s = this.split(draft);
    const policyOk = Boolean(p && wallet && p.subject_wallet === wallet.address && p.subject_bps === s.subjectBps && p.launcher_bps === s.launcherBps && p.platform_bps === s.platformBps);
    const v = (id: CheckId, at: number | null | undefined): CheckView => ({ id, label: CHECK_LABELS[id], passed: Boolean(at), at: at ?? null });
    return [v('adult', c.adult), v('verificationConsent', c.verification_processing), v('likenessConsent', c.public_likeness), v('subjectAccepted', draft.subject ? draft.updated_at : null), v('account', social?.bound_at), v('wallet', wallet?.bound_at), v('liveness', live?.decided_at), v('model', model?.approved_at), v('feePolicy', policyOk ? p!.signed_at : null)];
  }
  view(draft: DraftRow, owner: string) {
    const isCreator = draft.creator === owner; const isSubject = draft.subject === owner;
    const social = this.store.one<{ provider_user_id: string; handle_snapshot: string; bound_at: number }>('SELECT provider_user_id,handle_snapshot,bound_at FROM op_people_social WHERE draft_id=?', draft.id);
    const wallet = this.store.one<{ address: string; bound_at: number }>('SELECT address,bound_at FROM op_people_wallets WHERE draft_id=?', draft.id);
    const invitation = isCreator ? this.store.one<{ state: string; expires: number; created_at: number }>('SELECT state,expires,created_at FROM op_people_invitations WHERE draft_id=? ORDER BY created_at DESC LIMIT 1', draft.id) : undefined;
    const p = this.policy(draft);
    return {
      id: draft.id, relationship: draft.relationship, role: isCreator && isSubject ? 'both' : isSubject ? 'subject' : 'creator', state: draft.state,
      displayName: draft.display_name, narrative: draft.narrative, captureMode: draft.capture_mode, version: draft.version, split: this.split(draft), maxLauncherBps: MAX_LAUNCHER_BPS,
      subjectAccepted: Boolean(draft.subject), canEdit: draft.subject ? isSubject : isCreator,
      checks: this.checks(draft),
      account: social ? { provider: 'x', handle: social.handle_snapshot, boundAt: social.bound_at } : null,
      wallet: wallet ? { address: wallet.address, boundAt: wallet.bound_at } : null,
      invitation: invitation ? { state: invitation.state === 'pending' && invitation.expires < Date.now() ? 'expired' : invitation.state, expiresAt: invitation.expires, createdAt: invitation.created_at } : null,
      feePolicy: p ? { version: p.version, subjectBps: p.subject_bps, launcherBps: p.launcher_bps, platformBps: p.platform_bps, subjectWallet: p.subject_wallet, launcherWallet: p.launcher_wallet, signedAt: p.signed_at } : null,
      liveness: { providerConfigured: this.liveness.configured, state: this.store.one<{ state: string }>('SELECT state FROM op_people_verifications WHERE draft_id=? ORDER BY created_at DESC LIMIT 1', draft.id)?.state ?? 'not_started' },
      profileId: draft.state === 'published' ? draft.profile_id : null, createdAt: draft.created_at, updatedAt: draft.updated_at,
    };
  }

  list(owner: string) { this.signedIn(owner); return this.store.all<DraftRow>("SELECT * FROM op_people_drafts WHERE (creator=? OR subject=?) AND state<>'deleted' ORDER BY updated_at DESC LIMIT 20", owner, owner).map(d => this.view(d, owner)); }
  get(id: string, owner: string) { this.signedIn(owner); return this.view(this.access(id, owner).draft, owner); }

  async create(owner: string, data: Record<string, unknown>) {
    this.signedIn(owner); this.store.rate(`people-draft:${owner}`, 10, 86_400_000);
    const relationship: Relationship = data.relationship === 'assisted' ? 'assisted' : data.relationship === 'self' ? 'self' : (() => { throw new ApiError('RELATIONSHIP_REQUIRED'); })();
    if (relationship === 'self' && this.store.one("SELECT id FROM op_people_drafts WHERE subject=? AND relationship='self' AND state IN ('draft','published')", owner)) throw new ApiError('SELF_DRAFT_EXISTS', 409);
    const name = text(data.displayName, 2, 60, 'DISPLAY_NAME_INVALID'); const id = crypto.randomUUID(); const now = Date.now();
    this.store.run('INSERT INTO op_people_drafts(id,creator,subject,relationship,state,display_name,launcher_bps,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', id, owner, relationship === 'self' ? owner : null, relationship, relationship === 'self' ? 'draft' : 'awaiting_subject', name, relationship === 'self' ? 0 : MAX_LAUNCHER_BPS, now, now);
    this.store.metric(`people_draft_${relationship}`); await this.audit(owner, id, 'draft_created', relationship);
    return this.get(id, owner);
  }
  async update(id: string, owner: string, data: Record<string, unknown>) {
    this.signedIn(owner); const { draft, isCreator, isSubject } = this.access(id, owner);
    if (draft.state === 'published' || draft.state === 'withdrawn') throw new ApiError('DRAFT_LOCKED', 409);
    if (draft.subject ? !isSubject : !isCreator) throw new ApiError(draft.subject ? 'SUBJECT_ONLY' : 'FORBIDDEN', 403);
    const name = data.displayName === undefined ? draft.display_name : text(data.displayName, 2, 60, 'DISPLAY_NAME_INVALID');
    const narrative = data.narrative === undefined ? draft.narrative : optional(data.narrative, 600);
    const mode = data.captureMode === undefined ? draft.capture_mode : CAPTURE_MODES.find(m => m.id === data.captureMode)?.id ?? (() => { throw new ApiError('CAPTURE_MODE_INVALID'); })();
    let bps = draft.launcher_bps;
    if (data.launcherBps !== undefined) { if (draft.relationship === 'self') throw new ApiError('SELF_LAUNCH_HAS_NO_COLLABORATOR'); const n = Number(data.launcherBps); if (!Number.isSafeInteger(n) || n < 0 || n > MAX_LAUNCHER_BPS || !validSplit(splitFor('assisted', n))) throw new ApiError('SPLIT_INVALID'); bps = n; }
    this.store.run('UPDATE op_people_drafts SET display_name=?,narrative=?,capture_mode=?,launcher_bps=? WHERE id=?', name, narrative, mode, bps, id);
    this.touch(id, true); await this.audit(owner, id, 'draft_updated', bps !== draft.launcher_bps ? `launcher_bps:${bps}` : '');
    return this.get(id, owner);
  }
  async consent(id: string, owner: string, data: Record<string, unknown>) {
    this.signedIn(owner); const draft = this.asSubject(id, owner);
    const kind = (['adult', 'verification_processing', 'public_likeness'] as ConsentKind[]).find(k => k === data.kind); if (!kind) throw new ApiError('CONSENT_KIND_INVALID');
    const now = Date.now();
    if (data.granted === true) {
      if (!this.consents(id, owner)[kind]) this.store.run('INSERT INTO op_people_consents(id,draft_id,subject,kind,version,text_hash,granted_at) VALUES (?,?,?,?,?,?,?)', crypto.randomUUID(), id, owner, kind, CONSENT_VERSIONS[kind], await sha256(CONSENT_TEXT[kind]), now);
      await this.audit(owner, id, 'consent_granted', `${kind}:${CONSENT_VERSIONS[kind]}`);
    } else {
      this.store.run('UPDATE op_people_consents SET withdrawn_at=? WHERE draft_id=? AND subject=? AND kind=? AND withdrawn_at IS NULL', now, id, owner, kind);
      // Withdrawing likeness consent takes a published profile down immediately.
      if (kind === 'public_likeness' && draft.state === 'published') this.store.run("UPDATE op_people_drafts SET state='withdrawn' WHERE id=?", id);
      await this.audit(owner, id, 'consent_withdrawn', kind);
    }
    this.touch(id, false); return this.get(id, owner);
  }
  /** Binds the subject's X account by its immutable user ID, read server-side from the auth provider. */
  async bindAccount(id: string, owner: string) {
    this.signedIn(owner); const draft = this.asSubject(id, owner); if (draft.state === 'published') throw new ApiError('DRAFT_LOCKED', 409);
    const x = await this.deps.xIdentity(owner); if (!x || !/^\d{1,30}$/.test(x.id)) throw new ApiError('X_ACCOUNT_REQUIRED', 409);
    const claimed = this.store.one<{ draft_id: string }>("SELECT c.draft_id FROM op_people_canonical c WHERE c.subject_key=?", `x:${x.id}`);
    if (claimed && claimed.draft_id !== id) throw new ApiError('SUBJECT_ALREADY_CLAIMED', 409);
    this.store.run('INSERT INTO op_people_social(draft_id,subject,provider,provider_user_id,handle_snapshot,bound_at) VALUES (?,?,?,?,?,?) ON CONFLICT(draft_id) DO UPDATE SET subject=excluded.subject,provider_user_id=excluded.provider_user_id,handle_snapshot=excluded.handle_snapshot,bound_at=excluded.bound_at', id, owner, 'x', x.id, x.handle.slice(0, 30), Date.now());
    this.touch(id, true); await this.audit(owner, id, 'account_bound', 'x'); return this.get(id, owner);
  }
  private domainOf(origin: string | null): { domain: string; uri: string } { try { const u = new URL(origin ?? ''); if (u.protocol !== 'https:') throw new Error(); return { domain: u.host, uri: u.origin }; } catch { throw new ApiError('ORIGIN_REJECTED', 403); } }
  private async issue(kind: ChallengeRow['kind'], draftId: string, owner: string, address: string, domain: string, message: string, payload: unknown, nonce: string, expires: number): Promise<void> {
    this.store.rate(`people-challenge:${owner}`, 30, 3_600_000);
    this.store.run('INSERT INTO op_people_challenges(nonce_hash,kind,draft_id,owner,address,domain,message,payload,expires) VALUES (?,?,?,?,?,?,?,?,?)', await sha256(nonce), kind, draftId, owner, address, domain, message, JSON.stringify(payload), expires);
  }
  /** Consumes a challenge exactly once. It is marked used before the signature check, so a replay can never pass. */
  private async consume(kind: ChallengeRow['kind'], draftId: string, owner: string, nonce: unknown, origin: string | null): Promise<ChallengeRow> {
    if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) throw new ApiError('CHALLENGE_INVALID');
    const hash = await sha256(nonce); const { domain } = this.domainOf(origin);
    return this.store.atomic(() => {
      const row = this.store.one<ChallengeRow>('SELECT * FROM op_people_challenges WHERE nonce_hash=?', hash);
      if (!row || row.kind !== kind || row.draft_id !== draftId || row.owner !== owner || row.domain !== domain) throw new ApiError('CHALLENGE_INVALID');
      if (row.used_at) throw new ApiError('CHALLENGE_REPLAYED', 409);
      if (row.expires < Date.now()) throw new ApiError('CHALLENGE_EXPIRED', 409);
      this.store.run('UPDATE op_people_challenges SET used_at=? WHERE nonce_hash=?', Date.now(), hash); return row;
    });
  }
  private signature(value: unknown): string { if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{130,8000}$/.test(value)) throw new ApiError('SIGNATURE_INVALID'); return value; }
  async walletChallenge(id: string, owner: string, data: Record<string, unknown>, origin: string | null) {
    this.signedIn(owner); const draft = this.asSubject(id, owner);
    if (draft.state === 'published') throw new ApiError('RECIPIENT_CHANGE_REQUIRES_REVIEW', 409);
    if (!validAddress(data.address)) throw new ApiError('WALLET_INVALID');
    const address = (data.address as string).toLowerCase(); const { domain, uri } = this.domainOf(origin); const nonce = secureNonce(); const now = Date.now(); const expires = now + CHALLENGE_TTL_MS;
    const message = walletMessage({ domain, uri, address, draftId: id, nonce, issuedAt: now, expiresAt: expires });
    await this.issue('wallet', id, owner, address, domain, message, {}, nonce, expires); return { message, nonce, expiresAt: expires };
  }
  async walletVerify(id: string, owner: string, data: Record<string, unknown>, origin: string | null) {
    this.signedIn(owner); this.asSubject(id, owner); const signature = this.signature(data.signature);
    const row = await this.consume('wallet', id, owner, data.nonce, origin);
    if (!await this.deps.verify(row.address, row.message, signature).catch(() => false)) { await this.audit(owner, id, 'wallet_signature_rejected'); throw new ApiError('SIGNATURE_INVALID', 401); }
    const taken = this.store.one<{ draft_id: string }>('SELECT draft_id FROM op_people_canonical WHERE wallet=?', row.address); if (taken && taken.draft_id !== id) throw new ApiError('WALLET_BOUND_ELSEWHERE', 409);
    const now = Date.now();
    this.store.atomic(() => { this.store.run('INSERT INTO op_people_wallets(draft_id,subject,address,message_hash,bound_at) VALUES (?,?,?,?,?) ON CONFLICT(draft_id) DO UPDATE SET subject=excluded.subject,address=excluded.address,message_hash=excluded.message_hash,bound_at=excluded.bound_at', id, owner, row.address, row.nonce_hash, now); this.store.run('INSERT INTO op_people_wallet_history(id,draft_id,address,event,at) VALUES (?,?,?,?,?)', crypto.randomUUID(), id, row.address, 'bound', now); });
    this.touch(id, true); await this.audit(owner, id, 'wallet_bound', row.address); return this.get(id, owner);
  }
  async feeChallenge(id: string, owner: string, origin: string | null) {
    this.signedIn(owner); const draft = this.asSubject(id, owner); if (draft.state === 'published') throw new ApiError('DRAFT_LOCKED', 409);
    const wallet = this.store.one<{ address: string }>('SELECT address FROM op_people_wallets WHERE draft_id=? AND subject=?', id, owner); if (!wallet) throw new ApiError('WALLET_PROOF_REQUIRED', 409);
    const split = this.split(draft); if (!validSplit(split)) throw new ApiError('SPLIT_INVALID');
    const launcherWallet = draft.relationship === 'assisted' && split.launcherBps > 0 ? await this.deps.walletOf(draft.creator) : null;
    if (draft.relationship === 'assisted' && split.launcherBps > 0 && !launcherWallet) throw new ApiError('COLLABORATOR_WALLET_REQUIRED', 409);
    const version = (this.policy(draft)?.version ?? 0) + 1; const { domain } = this.domainOf(origin); const nonce = secureNonce(); const expires = Date.now() + CHALLENGE_TTL_MS;
    const message = feeMessage({ domain, draftId: id, relationship: draft.relationship, split, subjectWallet: wallet.address, launcherWallet, version, nonce, expiresAt: expires });
    await this.issue('fee', id, owner, wallet.address, domain, message, { split, launcherWallet, version, draftVersion: draft.version }, nonce, expires);
    return { message, nonce, expiresAt: expires, split, launcherWallet, version };
  }
  async feeVerify(id: string, owner: string, data: Record<string, unknown>, origin: string | null) {
    this.signedIn(owner); const draft = this.asSubject(id, owner); const signature = this.signature(data.signature);
    const row = await this.consume('fee', id, owner, data.nonce, origin);
    const p = JSON.parse(row.payload) as { split: FeeSplit; launcherWallet: string | null; version: number; draftVersion: number };
    const current = this.split(draft); const wallet = this.store.one<{ address: string }>('SELECT address FROM op_people_wallets WHERE draft_id=?', id);
    if (p.split.launcherBps !== current.launcherBps || wallet?.address !== row.address) throw new ApiError('FEE_POLICY_STALE', 409);
    if (!await this.deps.verify(row.address, row.message, signature).catch(() => false)) { await this.audit(owner, id, 'fee_signature_rejected'); throw new ApiError('SIGNATURE_INVALID', 401); }
    try { this.store.run('INSERT INTO op_people_fee_policies(id,draft_id,version,relationship,subject_bps,launcher_bps,platform_bps,subject_wallet,launcher_wallet,message,signature,signed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', crypto.randomUUID(), id, p.version, draft.relationship, p.split.subjectBps, p.split.launcherBps, p.split.platformBps, row.address, p.launcherWallet, row.message, signature, Date.now()); }
    catch { throw new ApiError('FEE_POLICY_STALE', 409); }
    this.touch(id, false); await this.audit(owner, id, 'fee_policy_signed', `v${p.version}:${p.split.subjectBps}/${p.split.launcherBps}/${p.split.platformBps}`); return this.get(id, owner);
  }
  async startLiveness(id: string, owner: string) {
    this.signedIn(owner); const draft = this.asSubject(id, owner);
    if (!this.consents(id, owner).verification_processing) throw new ApiError('VERIFICATION_CONSENT_REQUIRED', 409);
    const session = await this.liveness.createSession(draft.id);
    this.store.run('INSERT INTO op_people_verifications(id,draft_id,provider,provider_ref,state,created_at) VALUES (?,?,?,?,?,?)', crypto.randomUUID(), id, this.liveness.id, session.ref, 'pending', Date.now());
    await this.audit(owner, id, 'liveness_started', this.liveness.id); return { url: session.url };
  }
  async invite(id: string, owner: string, origin: string | null) {
    this.signedIn(owner); const { draft, isCreator } = this.access(id, owner);
    if (!isCreator || draft.relationship !== 'assisted') throw new ApiError('FORBIDDEN', 403);
    if (draft.subject || draft.state !== 'awaiting_subject') throw new ApiError('SUBJECT_ALREADY_ACCEPTED', 409);
    this.store.rate(`people-invite:${owner}`, 10, 86_400_000);
    const token = secureNonce(); const now = Date.now(); const expires = now + INVITATION_TTL_MS;
    this.store.atomic(() => { this.store.run("UPDATE op_people_invitations SET state='revoked' WHERE draft_id=? AND state='pending'", id); this.store.run('INSERT INTO op_people_invitations(id,draft_id,token_hash,created_by,state,expires,created_at) VALUES (?,?,?,?,?,?,?)', crypto.randomUUID(), id, inviteHash(token), owner, 'pending', expires, now); });
    await this.audit(owner, id, 'invitation_created');
    const base = (() => { try { return new URL(origin ?? '').origin; } catch { return 'https://www.objectpad.fun'; } })();
    return { url: `${base}/People/invite/${token}`, expiresAt: expires };
  }
  async revokeInvite(id: string, owner: string) {
    this.signedIn(owner); const { isCreator } = this.access(id, owner); if (!isCreator) throw new ApiError('FORBIDDEN', 403);
    this.store.run("UPDATE op_people_invitations SET state='revoked' WHERE draft_id=? AND state='pending'", id); await this.audit(owner, id, 'invitation_revoked'); return this.get(id, owner);
  }
  private invitation(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError('INVITATION_INVALID', 404);
    const row = this.store.one<{ id: string; draft_id: string; created_by: string; state: string; expires: number }>('SELECT id,draft_id,created_by,state,expires FROM op_people_invitations WHERE token_hash=?', inviteHash(token));
    if (!row) throw new ApiError('INVITATION_INVALID', 404); return row;
  }
  previewInvite(token: string) {
    const inv = this.invitation(token); const draft = this.store.one<DraftRow>('SELECT * FROM op_people_drafts WHERE id=?', inv.draft_id);
    const state = inv.state === 'pending' && inv.expires < Date.now() ? 'expired' : inv.state;
    const alias = this.store.one<{ alias: string }>('SELECT alias FROM op_profiles WHERE owner=?', inv.created_by)?.alias ?? 'An ObjectPad creator';
    return { state, expiresAt: inv.expires, displayName: state === 'pending' ? draft?.display_name ?? '' : '', invitedBy: alias, launcherBps: draft?.launcher_bps ?? 0,
      scope: ['Take control of this private draft', 'Nothing is published or tradable until you complete every check and approve it', 'You can decline, withdraw or delete at any time'] };
  }
  async acceptInvite(token: string, owner: string) {
    this.signedIn(owner); const inv = this.invitation(token);
    const draftId = this.store.atomic(() => {
      const fresh = this.store.one<{ state: string; expires: number }>('SELECT state,expires FROM op_people_invitations WHERE id=?', inv.id)!;
      if (fresh.state === 'revoked') throw new ApiError('INVITATION_REVOKED', 409);
      if (fresh.state !== 'pending') throw new ApiError('INVITATION_USED', 409);
      if (fresh.expires < Date.now()) throw new ApiError('INVITATION_EXPIRED', 409);
      if (inv.created_by === owner) throw new ApiError('CANNOT_ACCEPT_OWN_INVITATION', 403);
      const draft = this.store.one<DraftRow>('SELECT * FROM op_people_drafts WHERE id=?', inv.draft_id);
      if (!draft || draft.subject || draft.state !== 'awaiting_subject') throw new ApiError('SUBJECT_ALREADY_ACCEPTED', 409);
      this.store.run("UPDATE op_people_invitations SET state='accepted',accepted_by=?,accepted_at=? WHERE id=?", owner, Date.now(), inv.id);
      this.store.run("UPDATE op_people_drafts SET subject=?,state='draft',updated_at=?,version=version+1 WHERE id=?", owner, Date.now(), inv.draft_id);
      return inv.draft_id;
    });
    await this.audit(owner, draftId, 'invitation_accepted'); this.store.metric('people_invite_accepted'); return this.get(draftId, owner);
  }
  async decline(token: string, owner: string) {
    this.signedIn(owner); const inv = this.invitation(token); if (inv.state !== 'pending') throw new ApiError('INVITATION_USED', 409);
    this.store.run("UPDATE op_people_invitations SET state='declined' WHERE id=?", inv.id); await this.audit(owner, inv.draft_id, 'invitation_declined'); return { state: 'declined' };
  }
  /**
   * Publishes only after every check passes, then claims the canonical subject slot. The X user ID is re-read at publish
   * time, so switching the signed-in X account after binding cannot carry someone else's claim.
   */
  async publish(id: string, owner: string) {
    this.signedIn(owner); const draft = this.asSubject(id, owner); if (draft.state === 'published') return this.get(id, owner);
    const missing = this.checks(draft).filter(c => !c.passed).map(c => c.id);
    if (missing.length) throw new ApiError(`CHECKS_INCOMPLETE:${missing.join(',')}`, 409);
    const social = this.store.one<{ provider_user_id: string }>('SELECT provider_user_id FROM op_people_social WHERE draft_id=?', id)!;
    const x = await this.deps.xIdentity(owner); if (!x || x.id !== social.provider_user_id) throw new ApiError('ACCOUNT_CHANGED', 409);
    const wallet = this.store.one<{ address: string }>('SELECT address FROM op_people_wallets WHERE draft_id=?', id)!;
    const model = this.store.one<{ digest: string }>("SELECT digest FROM op_people_models WHERE draft_id=? AND state='approved' ORDER BY approved_at DESC LIMIT 1", id)!;
    const now = Date.now(); const profileId = secureNonce().slice(0, 20);
    const manifest = { v: 'objectpad-people-attestation-v1', subjectRef: secureNonce(), issuer: 'https://objectpad.fun', approvalVersion: draft.version, approvedModelDigest: model.digest, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 365 * 86_400_000).toISOString(), revocation: `https://objectpad.fun/api/people/profiles/${profileId}` };
    const digest = await sha256(canonicalJson(manifest));
    try {
      this.store.atomic(() => {
        this.store.run('INSERT INTO op_people_canonical(subject_key,draft_id,wallet,created_at) VALUES (?,?,?,?)', `x:${social.provider_user_id}`, id, wallet.address, now);
        this.store.run("UPDATE op_people_drafts SET state='published',profile_id=?,updated_at=? WHERE id=?", profileId, now, id);
        this.store.run('INSERT INTO op_people_attestations(id,draft_id,manifest,digest,issued_at) VALUES (?,?,?,?,?)', crypto.randomUUID(), id, canonicalJson(manifest), digest, now);
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      this.store.run('INSERT INTO op_people_cases(id,reporter,draft_id,kind,reason,state,created_at) VALUES (?,?,?,?,?,?,?)', crypto.randomUUID(), null, id, 'duplicate_subject', 'Publish blocked: subject or wallet already has a canonical profile.', 'open', now);
      throw new ApiError('DUPLICATE_SUBJECT_REVIEW', 409);
    }
    await this.audit(owner, id, 'published', digest); return this.get(id, owner);
  }
  async withdraw(id: string, owner: string) {
    this.signedIn(owner); const { draft, isCreator, isSubject } = this.access(id, owner);
    if (!isSubject && !(isCreator && !draft.subject)) throw new ApiError('FORBIDDEN', 403);
    this.store.atomic(() => { this.store.run("UPDATE op_people_drafts SET state='withdrawn',updated_at=? WHERE id=?", Date.now(), id); this.store.run("UPDATE op_people_invitations SET state='revoked' WHERE draft_id=? AND state='pending'", id); });
    await this.audit(owner, id, 'withdrawn'); return this.get(id, owner);
  }
  /** Deletes everything hosted about the draft except the append-only audit trail. On-chain history and others' downloads can't be erased. */
  async remove(id: string, owner: string) {
    this.signedIn(owner); const { draft, isCreator, isSubject } = this.access(id, owner);
    if (!isSubject && !(isCreator && !draft.subject)) throw new ApiError('FORBIDDEN', 403);
    this.store.atomic(() => {
      for (const t of ['op_people_social', 'op_people_wallets', 'op_people_challenges', 'op_people_invitations', 'op_people_models', 'op_people_canonical']) this.store.run(`DELETE FROM ${t} WHERE draft_id=?`, id);
      this.store.run("UPDATE op_people_attestations SET revoked_at=? WHERE draft_id=? AND revoked_at IS NULL", Date.now(), id);
      this.store.run("UPDATE op_people_consents SET withdrawn_at=COALESCE(withdrawn_at,?) WHERE draft_id=?", Date.now(), id);
      this.store.run("UPDATE op_people_drafts SET state='deleted',display_name='',narrative='',profile_id=NULL,updated_at=? WHERE id=?", Date.now(), id);
    });
    await this.deps.models?.purge(id).catch(() => undefined);
    await this.audit(owner, id, 'deleted'); return { state: 'deleted', note: 'Hosted draft data is deleted. The audit log keeps only event names and times.' };
  }
  /** Public view of a published profile. Verification evidence, account mappings and private media never appear here. */
  profile(profileId: string) {
    if (!/^[a-f0-9]{20}$/.test(profileId)) throw new ApiError('NOT_FOUND', 404);
    const draft = this.store.one<DraftRow>("SELECT * FROM op_people_drafts WHERE profile_id=? AND state='published'", profileId); if (!draft) throw new ApiError('NOT_FOUND', 404);
    const social = this.store.one<{ handle_snapshot: string }>('SELECT handle_snapshot FROM op_people_social WHERE draft_id=?', draft.id);
    const wallet = this.store.one<{ address: string }>('SELECT address FROM op_people_wallets WHERE draft_id=?', draft.id);
    const att = this.store.one<{ manifest: string; digest: string; revoked_at: number | null }>('SELECT manifest,digest,revoked_at FROM op_people_attestations WHERE draft_id=? ORDER BY issued_at DESC LIMIT 1', draft.id);
    return { profileId, displayName: draft.display_name, narrative: draft.narrative, relationship: draft.relationship, handle: social?.handle_snapshot ?? null, wallet: wallet?.address ?? null, split: this.split(draft), hasModel: this.deps.models?.hasPublicModel(profileId) ?? false, checks: this.checks(draft).map(c => ({ id: c.id, label: c.label, passed: c.passed, at: c.at })), attestation: att ? { manifest: JSON.parse(att.manifest), digest: att.digest, revoked: Boolean(att.revoked_at) } : null };
  }

  async nominate(owner: string, data: Record<string, unknown>) {
    this.signedIn(owner); this.store.rate(`people-nominate:${owner}`, 10, 86_400_000);
    const platform = PLATFORMS.find(p => p === data.platform); if (!platform) throw new ApiError('PLATFORM_INVALID');
    const handle = text(data.handle, 1, 31, 'HANDLE_INVALID'); if (!HANDLE.test(handle)) throw new ApiError('HANDLE_INVALID');
    const url = data.url ? safeHttpUrl(data.url) : ''; if (url === null) throw new ApiError('LINK_INVALID');
    if (data.publicAccount !== true) throw new ApiError('PUBLIC_ACCOUNT_REQUIRED');
    const id = crypto.randomUUID();
    try { this.store.run('INSERT INTO op_people_nominations(id,owner,platform,handle,url,display_name,kind,note,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, owner, platform, handle.replace(/^@/, '').toLowerCase(), url ?? '', text(data.displayName, 2, 60, 'DISPLAY_NAME_INVALID'), data.kind === 'public_figure' ? 'public_figure' : 'creator', optional(data.note, 400), 'unclaimed', Date.now()); }
    catch { throw new ApiError('ALREADY_NOMINATED', 409); }
    await this.audit(owner, id, 'nomination_created', platform); this.store.metric('people_nomination'); return { id, state: 'unclaimed' as const };
  }
  nominations(owner: string) { this.signedIn(owner); return this.store.all('SELECT id,platform,handle,display_name AS displayName,state,created_at AS createdAt FROM op_people_nominations WHERE owner=? ORDER BY created_at DESC LIMIT 50', owner); }
  /** Creator application intake. Sign-in is optional; applications are private to ObjectPad reviewers. */
  async apply(owner: string | null, data: Record<string, unknown>) {
    const name = text(data.name, 2, 80, 'NAME_INVALID'); const email = text(data.email, 5, 254, 'EMAIL_INVALID').toLowerCase(); if (!EMAIL.test(email)) throw new ApiError('EMAIL_INVALID');
    const location = LOCATIONS.find(l => l === data.location); if (!location) throw new ApiError('LOCATION_INVALID');
    const roles = Array.isArray(data.roles) ? [...new Set(data.roles.filter((r): r is typeof ROLES[number] => ROLES.includes(r as typeof ROLES[number])))] : []; if (!roles.length) throw new ApiError('ROLES_REQUIRED');
    const handlesIn = (data.handles && typeof data.handles === 'object' ? data.handles : {}) as Record<string, unknown>; const handles: Record<string, string> = {};
    for (const key of ['x', 'tiktok', 'instagram', 'youtube']) { const v = handlesIn[key]; if (typeof v === 'string' && v.trim()) { if (!HANDLE.test(v.trim())) throw new ApiError('HANDLE_INVALID'); handles[key] = v.trim().replace(/^@/, ''); } }
    const portfolio = (Array.isArray(data.portfolio) ? data.portfolio : []).slice(0, 3).map(u => { const safe = typeof u === 'string' && u.trim() ? safeHttpUrl(u.trim()) : ''; if (safe === null) throw new ApiError('LINK_INVALID'); return safe; }).filter(Boolean);
    if (data.contactConsent !== true) throw new ApiError('CONTACT_CONSENT_REQUIRED');
    const emailHash = await sha256(`people-app:${email}`);
    if (this.store.one('SELECT id FROM op_people_applications WHERE email_hash=? AND created_at>?', emailHash, Date.now() - 7 * 86_400_000)) throw new ApiError('APPLICATION_RECENT', 409);
    const id = crypto.randomUUID();
    this.store.run('INSERT INTO op_people_applications(id,owner,email_hash,payload,state,created_at) VALUES (?,?,?,?,?,?)', id, owner, emailHash, JSON.stringify({ name, email, location, roles, handles, handlesVerified: false, portfolio, note: optional(data.note, 600) }), 'received', Date.now());
    await this.audit(owner ?? 'anonymous', id, 'application_received'); this.store.metric('people_application'); return { id, state: 'received' as const };
  }
  async report(owner: string, data: Record<string, unknown>) {
    this.signedIn(owner); this.store.rate(`people-report:${owner}`, 8, 86_400_000);
    const kind = ['impersonation', 'unauthorized_likeness', 'harassment', 'appeal', 'other'].find(k => k === data.kind); if (!kind) throw new ApiError('REPORT_KIND_INVALID');
    const draftId = typeof data.profileId === 'string' && /^[a-f0-9]{20}$/.test(data.profileId) ? this.store.one<{ id: string }>('SELECT id FROM op_people_drafts WHERE profile_id=?', data.profileId)?.id ?? null : null;
    const id = crypto.randomUUID(); this.store.run('INSERT INTO op_people_cases(id,reporter,draft_id,kind,reason,state,created_at) VALUES (?,?,?,?,?,?,?)', id, owner, draftId, kind, text(data.reason, 10, 1500, 'REPORT_REASON_REQUIRED'), 'open', Date.now());
    await this.audit(owner, id, 'report_received', kind); return { id, state: 'open' as const };
  }
  /** Operator queue. Applications include contact details, so this is operator-only. */
  overview() {
    return {
      drafts: this.store.all("SELECT state,relationship,COUNT(*) AS n FROM op_people_drafts GROUP BY state,relationship"),
      applications: this.store.all<{ id: string; payload: string; state: string; created_at: number }>('SELECT id,payload,state,created_at FROM op_people_applications ORDER BY created_at DESC LIMIT 100').map(r => ({ id: r.id, state: r.state, createdAt: r.created_at, ...JSON.parse(r.payload) })),
      nominations: this.store.all('SELECT platform,handle,display_name AS displayName,kind,COUNT(*) AS n,MIN(created_at) AS firstAt FROM op_people_nominations GROUP BY platform,handle ORDER BY n DESC LIMIT 100'),
      cases: this.store.all("SELECT id,draft_id AS draftId,kind,reason,state,created_at AS createdAt FROM op_people_cases WHERE state='open' ORDER BY created_at LIMIT 100"),
    };
  }
  async decide(operator: string, data: Record<string, unknown>) {
    const id = text(data.id, 36, 36); const resolution = text(data.resolution, 10, 800); const action = ['dismiss', 'unpublish', 'uphold'].find(a => a === data.action); if (!action) throw new ApiError('DECISION_INVALID');
    const row = this.store.one<{ draft_id: string | null }>('SELECT draft_id FROM op_people_cases WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404);
    this.store.atomic(() => { this.store.run("UPDATE op_people_cases SET state='closed',resolution=?,decided_at=? WHERE id=?", `${action}: ${resolution}`, Date.now(), id); if (action === 'unpublish' && row.draft_id) this.store.run("UPDATE op_people_drafts SET state='withdrawn' WHERE id=? AND state='published'", row.draft_id); });
    await this.audit(operator, row.draft_id ?? id, `case_${action}`, resolution); return { ok: true };
  }
}

/** Token hashes use a synchronous SHA-256 so single-use checks can run inside one SQLite transaction. */
function inviteHash(token: string): string { return syncSha256(`people-invite:${token}`); }
/** Minimal synchronous SHA-256 (FIPS 180-4) for short ASCII inputs. */
export function syncSha256(input: string): string {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const bytes = new TextEncoder().encode(input); const bitLen = bytes.length * 8; const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6); padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer); view.setUint32(padded.length - 4, bitLen >>> 0); view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]; const W = new Uint32Array(64); const r = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) W[i] = (W[i - 16] + (r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3)) + W[i - 7] + (r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10))) >>> 0;
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) { const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0; const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map(n => n.toString(16).padStart(8, '0')).join('');
}
