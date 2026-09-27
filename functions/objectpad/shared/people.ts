/**
 * ObjectPad People: pure, deterministic rules shared by the server and the web app.
 * Nothing here touches storage, network or keys, so every rule is unit-testable.
 */

/** Basis-point denominator. Every split is expressed over the collected creator-fee pool, never trading volume. */
export const BPS = 10_000;
export const PEOPLE_CHAIN_ID = 4663;
/** ObjectPad's share of the collected creator-fee pool. Fixed; shown everywhere a split is shown. */
export const PLATFORM_BPS = 1_000;
/** Most a collaborator who prepared an assisted launch can receive. The subject decides, up to this cap. */
export const MAX_LAUNCHER_BPS = 2_000;
export const CHALLENGE_TTL_MS = 10 * 60_000;
export const INVITATION_TTL_MS = 7 * 86_400_000;

export type Relationship = 'self' | 'assisted';
export type ConsentKind = 'adult' | 'verification_processing' | 'public_likeness';
/** Consent text versions. Bump when wording changes; older grants then no longer satisfy a check. */
export const CONSENT_VERSIONS: Record<ConsentKind, string> = { adult: 'adult-v1', verification_processing: 'verification-v1', public_likeness: 'likeness-v1' };
export const CONSENT_TEXT: Record<ConsentKind, string> = {
  adult: 'I am 18 or older and I am the person this profile is about.',
  verification_processing: 'ObjectPad may send my liveness check to its verification provider to confirm a live person completed it. This is separate from publishing anything.',
  public_likeness: 'After I review and approve it, ObjectPad may publish my 3D likeness and profile. A public likeness identifies me, and copies other people download cannot be reliably recalled.',
};
export type CaptureMode = 'photo_relief' | 'stylized_head' | 'multi_view_head' | 'clothed_body';
export const CAPTURE_MODES: { id: CaptureMode; label: string; fidelity: string }[] = [
  { id: 'photo_relief', label: 'Photo relief', fidelity: 'One front photo. Depth and hidden sides are AI-inferred, not measured.' },
  { id: 'stylized_head', label: 'Stylized head', fidelity: 'One photo, deliberately stylized. Resemblance is loose by design.' },
  { id: 'multi_view_head', label: 'Multi-view head', fidelity: 'Front, left, right and back photos. Better shape, still an AI reconstruction.' },
  { id: 'clothed_body', label: 'Clothed full body', fidelity: 'Guided full-body photos while clothed. AI reconstruction; fine detail varies.' },
];

export interface FeeSplit { subjectBps: number; launcherBps: number; platformBps: number; }
export interface Allocation { subject: bigint; launcher: bigint; platform: bigint; /** Base units the subject received from floor rounding of the other shares. */ dust: bigint; }

/** Integer basis points that sum to exactly 10,000 with ObjectPad's share fixed and the launcher capped. */
export function validSplit(split: FeeSplit): boolean {
  const parts = [split.subjectBps, split.launcherBps, split.platformBps];
  return parts.every(n => Number.isSafeInteger(n) && n >= 0) && parts.reduce((a, b) => a + b, 0) === BPS && split.platformBps === PLATFORM_BPS && split.launcherBps <= MAX_LAUNCHER_BPS;
}
/** Default split: 70/20/10 for an assisted launch, 90/0/10 when the subject launches themselves. */
export function defaultSplit(relationship: Relationship): FeeSplit { return relationship === 'self' ? { subjectBps: 9_000, launcherBps: 0, platformBps: PLATFORM_BPS } : { subjectBps: 7_000, launcherBps: 2_000, platformBps: PLATFORM_BPS }; }
export function splitFor(relationship: Relationship, launcherBps: number): FeeSplit {
  const launcher = relationship === 'self' ? 0 : launcherBps;
  return { subjectBps: BPS - PLATFORM_BPS - launcher, launcherBps: launcher, platformBps: PLATFORM_BPS };
}
/**
 * Allocates an amount of actually received fees (integer base units of the fee asset) by a split.
 * Launcher and platform shares round down; the subject receives the remainder, so nothing is lost or created.
 */
export function allocate(amount: bigint, split: FeeSplit): Allocation {
  if (amount < 0n || !validSplit(split)) throw new Error('INVALID_ALLOCATION');
  const launcher = amount * BigInt(split.launcherBps) / BigInt(BPS);
  const platform = amount * BigInt(split.platformBps) / BigInt(BPS);
  const subject = amount - launcher - platform;
  return { subject, launcher, platform, dust: subject - amount * BigInt(split.subjectBps) / BigInt(BPS) };
}
export const pct = (bps: number): string => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;

/** 32 random bytes from the platform CSPRNG, hex encoded. Used for challenge nonces and invitation tokens. */
export function secureNonce(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }

export interface WalletChallenge { domain: string; uri: string; address: string; draftId: string; nonce: string; issuedAt: number; expiresAt: number; }
/** EIP-4361 (Sign-In with Ethereum) message binding a wallet to one People draft, domain, chain and single-use nonce. */
export function walletMessage(c: WalletChallenge): string {
  return `${c.domain} wants you to sign in with your Ethereum account:\n${c.address}\n\nObjectPad People: I control this wallet and want it bound to my People profile draft. This does not move funds or approve spending.\n\nURI: ${c.uri}\nVersion: 1\nChain ID: ${PEOPLE_CHAIN_ID}\nNonce: ${c.nonce}\nIssued At: ${new Date(c.issuedAt).toISOString()}\nExpiration Time: ${new Date(c.expiresAt).toISOString()}\nResources:\n- urn:objectpad:people-draft:${c.draftId}`;
}
export interface FeeChallenge { domain: string; draftId: string; relationship: Relationship; split: FeeSplit; subjectWallet: string; launcherWallet: string | null; version: number; nonce: string; expiresAt: number; }
/** The exact fee policy the subject signs before any launch. The denominator is stated in the signed text. */
export function feeMessage(c: FeeChallenge): string {
  return [
    `${c.domain} ObjectPad People fee policy`,
    `Draft: ${c.draftId}`,
    `Policy version: ${c.version}`,
    `Launch type: ${c.relationship === 'self' ? 'self-launch' : 'assisted launch'}`,
    'Denominator: creator fees actually collected for this token (not trading volume, not all transaction fees)',
    `Subject: ${c.split.subjectBps} bps (${pct(c.split.subjectBps)}) to ${c.subjectWallet}`,
    `Collaborator: ${c.split.launcherBps} bps (${pct(c.split.launcherBps)})${c.launcherWallet ? ` to ${c.launcherWallet}` : ''}`,
    `ObjectPad: ${c.split.platformBps} bps (${pct(c.split.platformBps)})`,
    `Chain ID: ${PEOPLE_CHAIN_ID}`,
    `Nonce: ${c.nonce}`,
    `Expiration Time: ${new Date(c.expiresAt).toISOString()}`,
  ].join('\n');
}

export type FeatureState = 'planned' | 'pilot' | 'live';
export interface PeopleFeature { id: string; group: 'foundation' | 'utility'; label: string; state: FeatureState; detail: string; blocker: string | null; }
export interface PeopleStatus { phase: 'preview' | 'pilot' | 'live'; features: PeopleFeature[]; providers: { id: string; label: string; configured: boolean; note: string }[]; publishedProfiles: number; genesis: null | { slots: number; remaining: number; awardDisplay: string; termsUrl: string }; updatedAt: number; }

export type CheckId = 'adult' | 'verificationConsent' | 'likenessConsent' | 'subjectAccepted' | 'account' | 'wallet' | 'liveness' | 'model' | 'feePolicy';
export const CHECK_LABELS: Record<CheckId, string> = { adult: 'Adult eligibility confirmed', verificationConsent: 'Verification processing consent', likenessConsent: 'Public likeness consent', subjectAccepted: 'Subject accepted and controls the draft', account: 'X account bound (immutable user ID)', wallet: 'Wallet control proven (signed, single-use)', liveness: 'Liveness check passed (provider)', model: '3D likeness approved by subject', feePolicy: 'Fee split signed by subject' };
