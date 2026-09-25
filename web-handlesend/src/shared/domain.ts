/** Public DTOs deliberately exclude authentication subjects, secrets and capture images. */
export const CHAIN_ID = 4663 as const;
export const SCHEMA_VERSION = 2 as const;
export const CATEGORIES = ['All objects', 'Art & craft', 'Natural world', 'Design', 'Everyday', 'Collectibles', 'Technology', 'Textiles', 'Other'] as const;
export const VIEWS = [
  { id: 'front', label: 'Front', azimuth: 0, elevation: 0 },
  { id: 'right', label: 'Right side', azimuth: 90, elevation: 0 },
  { id: 'back', label: 'Back', azimuth: 180, elevation: 0 },
  { id: 'left', label: 'Left side', azimuth: 270, elevation: 0 },
  { id: 'high-front', label: 'Top front', azimuth: 0, elevation: 35 },
  { id: 'high-back', label: 'Top back', azimuth: 180, elevation: 35 },
] as const;
export type ViewId = typeof VIEWS[number]['id'];
export const CANONICAL_VIEWS: readonly ViewId[] = ['front', 'left', 'back', 'right'];
export type CaptureState = 'awaiting_mobile' | 'capturing' | 'review' | 'screening' | 'reconstructing' | 'validating' | 'model_review' | 'approved' | 'blocked' | 'failed' | 'cancelled' | 'expired';
export interface CaptureView { id: string; view: ViewId; hash: string; width: number; height: number; bytes: number; acceptedAt: number; quality: { blur: number; exposure: number; duplicateDistance: number; centered: boolean; backgroundConsistent: boolean }; }
/** AI description of the scanned object, used for duplicate screening and to prefill the coin name. */
export interface ObjectSuggestion { object: string; name: string; ticker: string; story: string; compared: number; /** Neutral AI catalogue title, e.g. "Pink Knitted Wool Beanie". Written on-chain as the object's name. */ catalog?: string; colors?: string[]; materials?: string[]; }
/** What the creator wants the coin to be called; applied automatically when the 3D model passes validation. */
export interface LaunchDraft { publicName: string; symbol: string; story: string; xUrl: string; /** Optional Telegram link (https://t.me/…). */ telegram?: string; /** Wallet that receives the 1.5% creator fee. Without one, a guest launch's fees go to the free-launch pool. */ feeWallet?: string; }
export interface CaptureSession { id: string; state: CaptureState; createdAt: number; expiresAt: number; views: CaptureView[]; job?: EngineJob; model?: ModelArtifact; failureCode?: string; suggestion?: ObjectSuggestion; recordId?: string; launchDraft?: LaunchDraft; autoLaunch?: boolean; /** Deterministic Object ID (known before launch). */ objectId?: string; /** The coin's permanent ObjectPad link, fixed before launch and written into the launch as its website. */ coinUrl?: string; /** True while a phone holds this capture session. */ deviceConnected?: boolean; regenerations?: number; /** Rebuilds after a provider failure; these never count against `regenerations`. */ failureRetries?: number; guest?: boolean; /** Preview of the object name and tag the launch will write on-chain (after the 3D model exists). */ onchain?: { objectName: string; objectTag: string; specs?: string } | null; /** Launch progress once the coin details are sealed. */ launch?: SessionLaunch | null; /** Photos in flight from the phone, so the desktop can show them arriving. */ incoming?: IncomingShot[]; /** Set when this scan was restarted: the linked new scan both devices move to. */ successor?: string; /** When the current phone paired. */ pairedAt?: number; /** Photos removed from the computer, so the paired phone re-shoots them. */ removed?: { view: string; at: number }[]; /** When the creator tapped launch (sealed); the coin goes live the moment the 3D model is ready. */ launchQueuedAt?: number; /** Coin logo written into the launch. */ icon?: CoinIconInfo; }
/** Public progress for a coin that is sealed and waiting on its 3D model (no photos, owner or ids beyond the coin link). */
/** The coin's logo before launch: an automatic front snapshot of the 3D model, or the creator's own image. */
export interface CoinIconInfo { hash: string; url: string; source: 'snapshot' | 'custom'; modelHash?: string; setAt: number; }
/**
 * Public view of a sealed coin before it's live, for its permanent /o/ link: the 3D model and what the AI and the hashes say
 * about the object. Never includes capture photos, owner, session or wallet details.
 */
export interface CoinPreview { code: string; name: string; symbol: string; story: string; xUrl: string; telegram: string; iconUrl: string | null; modelUrl: string | null; posterUrl: string | null; modelHash: string | null; manifestHash: string | null; objectName: string | null; objectTag: string | null; specs: string | null; triangles: number | null; textures: number | null; bounds: { min: number[]; max: number[] } | null; colors: string[]; materials: string[]; category: string; views: number; stage: 'building' | 'launching' | 'queued'; sealedAt: number; launchHash: string | null; }
export interface BuildingCoin { code: string; name: string; symbol: string; state: 'building' | 'launching'; progress: number; stage: string; queuedAt: number; startedAt?: number; }
/** Live 3D engine telemetry for one build, straight from the engine's task status. */
export interface EngineJob { state: string; progress: number; failureCode?: string; startedAt?: number; submittedAt?: number; finishedAt?: number; polledAt?: number; polls?: number; providerStatus?: string; providerStartedAt?: number; /** Tasks ahead of this one in the engine queue. */ queue?: number; taskRef?: string; model?: string; images?: number; }
/** A photo the phone is sending right now (announced when its upload ticket is issued). */
export interface IncomingShot { view: ViewId; at: number; }
/** Launch progress attached to a capture session view. */
export interface SessionLaunch { recordId: string; recordState: string; state: string; hash: string | null; token: string | null; objectName: string | null; objectTag: string | null; suffix: string | null; feeWallet: string | null; feeRecipientKind: 'creator' | 'launch_pool'; }
/**
 * Durable model artifacts. The published web model is the provider GLB itself (validated, not re-encoded), so
 * originalHash === optimizedHash. The thumbnail is the provider-rendered preview. No turntable video is produced.
 */
export interface ModelArtifact { originalHash: string; optimizedHash: string; thumbnailHash: string; turntableHash?: string; modelUrl: string; thumbnailUrl: string; turntableUrl?: string; bytes: number; triangles: number; textures: number; bounds: { min: number[]; max: number[] }; generatedAt: number; provider: 'Meshy'; providerModel: string; processedViews: number; validated: boolean; thumbnailSource?: 'provider_preview'; optimization?: 'provider_output_within_limits'; }
/** This is committed before transactions exist; it has no self-referential hashes. */
export interface ObjectCommitment {
  version: 1; objectId: string; publicName: string; slug: string;
  creatorDid: string; creatorWallet: string; captureSessionId: string;
  captureManifestHash: string; acceptedViewCount: number;
  reconstructionProvider: 'Meshy'; reconstructionModel: string; reconstructionTaskReference: string;
  canonicalViewIds: ViewId[]; originalModelHash: string; optimizedModelHash: string;
  thumbnailHash: string; turntableHash?: string; thesisHash: string;
  story: string; thesis: string; category: string; externalWebsite: string; xUrl: string;
  downloadAllowed: boolean; chainId: 4663; createdAt: number;
  /** AI catalogue name of the physical object, written into the launch transaction. */
  objectName?: string;
  /** ObjectPad naming tag derived from the object name and artifact hashes, e.g. OP-7F3K-92QD. */
  objectTag?: string;
  telegram?: string;
  /** Physical and 3D facts written into the launch transaction (see objectSpecsText). */
  objectSpecs?: string;
}
/** Append-only transaction envelope; the pre-launch commitment is never rewritten. */
export interface ObjectRecord extends ObjectCommitment {
  metadataHash: string; metadataUri: string; canonicalUrl: string;
  tokenAddress: string; curveAddress: string; symbol: string;
  attestationTransactionHash?: string; launchTransactionHash: string;
  provenanceBlockHash?: string; launchBlockHash: string; verifiedName: string;
  status: 'confirmed' | 'reorg_review' | 'hidden'; model: ModelArtifact;
  /** Pons creator-fee recipient: the object's deterministic fee vault. */
  feeVault?: string;
  /** True once the creator's TokenLinked event is confirmed; required to enter the Crafting Table. */
  tokenLinked?: boolean;
  /** 'sponsored': ObjectPad paid the Pons launch fee and a burned minimum first buy; the creator paid nothing. */
  launchMode?: 'sponsored' | 'wallet';
  /** Account that sent the launch transaction (the ObjectPad sponsor for sponsored launches). */
  sponsor?: string;
  /** Exact description string written into the Pons launch calldata (object name, artifact hashes, canonical link). */
  launchDescription?: string;
  /** AI duplicate-object screening performed before reconstruction. */
  uniqueness?: { checkedAt: number; compared: number; model: string };
  confirmedAt?: number;
  /** Latest successful Object Key check-in: the creator re-photographed an object the AI matched to the original scan. */
  checkin?: { at: number; confidence: number };
  /** The coin logo written into the launch (3D snapshot, the creator's own image, or the model render). */
  iconUrl?: string;
  /** Exact UTF-8 object record appended to the launch calldata (see encodeObjectSuffix). */
  launchDataSuffix?: string;
}
export interface Readiness { mode: 'operator_blocked' | 'capture_ready' | 'launch_ready'; blocker: string; checks: { id: string; label: string; ready: boolean }[]; chainId: number; productionAccepted: boolean; contracts?: { registry: string | null; vaultFactory: string | null; forge: string | null; burnEngine: string | null; token: string | null }; feeRecipient?: 'object_fee_vault' | 'creator_wallet'; sponsor?: SponsorStatus | null; }
/** Public view of the launch sponsor wallet. Balances are read from chain; nothing is estimated as funded. */
export interface SponsorStatus { address: string; balanceWei: string; launchCostWei: string; launchesAffordable: number; dailyLimit: number; usedToday: number; /** Free launches each person gets per 24h. */ perPersonDaily?: number; keySource?: 'env' | 'env_invalid' | 'stored'; }
/** Live Pons V2 network market snapshot (all curves on Robinhood Chain, not only ObjectPad coins). */
export interface MarketCoin { token: string; curve: string; symbol: string; name: string; priceEth: number; changePct: number; volumeEth: number; trades: number; buys: number; sells: number; objectId?: string; /** ObjectPad-served proxy of the coin's own on-chain Pons logo. */ logo?: string; }
export interface MarketTrade { id: string; token: string; symbol: string; side: 'buy' | 'sell'; eth: number; tokens: number; trader: string; hash: string; block: number; at: number; objectId?: string; logo?: string; }
/** One ObjectPad coin (a creator launch or an ObjectPad original) with live curve state and exact 24h stats from indexed chain logs. */
export interface ObjectCoin { kind: 'creator' | 'original'; id: string; token: string; curve: string; symbol: string; name: string; logo: string; path: string; tag: string | null; objectName: string | null; priceEth: number; marketCapEth: number; change24h: number; volume24hEth: number; volumeEth: number; trades24h: number; buys24h: number; sells24h: number; trades: number; holders: number; progress: number; graduated: boolean; spark: number[]; lastTradeAt: number | null; launchHash: string | null; launchedAt: number; trending: number; state: 'live' | 'launching'; }
export interface MarketSnapshot { updatedAt: number; windowSeconds: number; ethUsd: number | null; coins: MarketCoin[]; trades: MarketTrade[]; totals: { trades: number; volumeEth: number; coins: number; buys: number; sells: number; creatorFeesEth?: number; protocolFeesEth?: number }; objectpad: { launched: number; scanned: number }; }
export interface PublicFeed { items: ObjectRecord[]; nextCursor: string | null; ranking: 'newest_confirmed'; }
export interface TransactionRequest { id: string; to: `0x${string}`; data: `0x${string}`; value: string; gas: string; chainId: number; nonce?: number; expectedName: string; description: string; fees: { launchFeeWei: string; networkEstimateWei: string; initialBuyWei: string; creatorTaxBps: number; protocolTaxBps: number; feeRecipient: string }; }
export interface CommunityMessage { id: string; creatorId: string; alias: string; text: string; createdAt: number; }
export interface Profile { publicId: string; alias: string; wallet: string | null; rightsAccepted: boolean; }

/** Crockford base32 alphabet (no I, L, O, U) used for human-readable object tags. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** ObjectPad naming methodology: OP- plus 40 bits of the object-name hash in Crockford base32, e.g. OP-7F3K-92QD. */
export function objectTagFrom(hashHex: string): string {
  if (!/^[a-f0-9]{10,}$/.test(hashHex)) throw new Error('Invalid hash');
  let bits = ''; for (const ch of hashHex.slice(0, 10)) bits += parseInt(ch, 16).toString(2).padStart(4, '0');
  let out = ''; for (let i = 0; i < 40; i += 5) out += CROCKFORD[parseInt(bits.slice(i, i + 5), 2)];
  return `OP-${out.slice(0, 4)}-${out.slice(4)}`;
}
/** Canonical input hashed to derive an object's tag: name plus the exact 3D model and capture hashes. */
export const objectNameSeed = (objectName: string, modelHash: string, manifestHash: string): string => `objectpad:object-name:v1|${objectName}|${modelHash}|${manifestHash}`;
/** Normalises an AI catalogue title into the on-chain object name: Title Case, safe characters, at most 48 characters. */
export function normalizeObjectName(raw: string): string {
  const cleaned = raw.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[^A-Za-z0-9 &'.,-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48).trim();
  return cleaned.split(' ').map(word => word ? word[0].toUpperCase() + word.slice(1) : word).join(' ');
}
export const OBJECT_SUFFIX_MAGIC = 'ObjectPad v1';
/** The human-readable record appended after the ABI-encoded launch calldata. */
export function objectSuffixText(tag: string, objectName: string, objectId: string, specs?: string): string { return `${OBJECT_SUFFIX_MAGIC} | ${tag} | ${objectName} | ${objectId}${specs ? ` | ${specs}` : ''}`; }
/** Physical and 3D facts about a scanned object, as a compact on-chain string: `tris=…;verts=…;dims=1.00x0.92x1.00;mat=wool;views=6`. */
export function objectSpecsText(input: { triangles: number; vertices?: number; bounds?: { min: number[]; max: number[] } | null; materials?: string[]; colors?: string[]; views: number; textures?: number }): string {
  const parts = [`tris=${Math.round(input.triangles)}`];
  if (input.vertices) parts.push(`verts=${Math.round(input.vertices)}`);
  if (input.bounds?.min?.length === 3 && input.bounds.max?.length === 3) { const size = input.bounds.max.map((v, i) => Math.abs(v - input.bounds!.min[i])); const top = Math.max(...size, 1e-9); parts.push(`dims=${size.map(v => (v / top).toFixed(2)).join('x')}`); }
  if (input.textures) parts.push(`tex=${input.textures}`);
  const clean = (list: string[] | undefined, max: number) => (list ?? []).map(v => v.toLowerCase().replace(/[^a-z0-9#]/g, '')).filter(Boolean).slice(0, max);
  const mats = clean(input.materials, 3); if (mats.length) parts.push(`mat=${mats.join('+')}`);
  const cols = clean(input.colors, 3).filter(c => /^#[0-9a-f]{6}$/.test(c)); if (cols.length) parts.push(`rgb=${cols.join('+')}`);
  parts.push(`views=${input.views}`);
  return parts.join(';').slice(0, 180);
}
/** Parses an `objectSpecsText` string back into labelled values. */
export function parseObjectSpecs(specs: string | undefined | null): Record<string, string> { const out: Record<string, string> = {}; for (const part of (specs ?? '').split(';')) { const [k, v] = part.split('='); if (k && v) out[k.trim()] = v.trim(); } return out; }
/** Finds and parses an ObjectPad record inside raw transaction input (hex). Returns null when none is present. */
export function readObjectSuffix(inputHex: string): { text: string; tag: string; objectName: string; objectId: string; specs?: string } | null {
  const magic = Array.from(new TextEncoder().encode(`${OBJECT_SUFFIX_MAGIC} | `), b => b.toString(16).padStart(2, '0')).join('');
  const hex = inputHex.toLowerCase().replace(/^0x/, ''); const at = hex.lastIndexOf(magic); if (at < 0 || at % 2) return null;
  const bytes = new Uint8Array((hex.length - at) / 2); for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(at + i * 2, at + i * 2 + 2), 16);
  const text = new TextDecoder().decode(bytes); const parts = text.split(' | ');
  if ((parts.length !== 4 && parts.length !== 5) || !/^OP-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[3])) return null;
  return { text, tag: parts[1], objectName: parts[2], objectId: parts[3], specs: parts[4] };
}
