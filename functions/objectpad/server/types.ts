import type { CaptureSession, ObjectCommitment } from '../shared/domain';
export type { LaunchDraft } from '../shared/domain';
export interface SqlCursor<T> extends Iterable<T> { toArray(): T[]; }
export interface SqlStorage { exec<T = Record<string, unknown>>(query: string, ...bindings: (string | number | null | ArrayBuffer)[]): SqlCursor<T>; }
export interface ObjectContext { storage: { sql: SqlStorage; transactionSync<T>(fn: () => T): T }; blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>; }
export interface StorageObject { body: ReadableStream<Uint8Array>; arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string }; size: number; }
export interface ObjectBucket { get(key: string): Promise<StorageObject | null>; put(key: string, value: Uint8Array | string, options?: { httpMetadata?: { contentType: string } }): Promise<unknown>; delete(key: string): Promise<void>; }
export interface Fetcher { fetch(input: Request | string, init?: RequestInit): Promise<Response>; }
/** Rork platform DO binding: dispatch plus durable alarm scheduling. */
export interface DoBinding extends Fetcher { setAlarm(className: string, id: string, scheduledTime: number | Date): Promise<void>; }
/**
 * Worker environment. Every value is a project environment variable except DO.
 * Names are ObjectPad-scoped; the shared Privy app id and Rork Toolkit key are the only reused values.
 */
export interface Env {
  DO?: DoBinding;
  OBJECTPAD_ORIGIN?: string; OBJECTPAD_ALLOWED_ORIGINS?: string; OBJECTPAD_API_ORIGIN?: string;
  OBJECTPAD_PRIVY_APP_ID?: string; VITE_PRIVY_APP_ID?: string;
  EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY?: string; EXPO_PUBLIC_TOOLKIT_URL?: string; EXPO_PUBLIC_RORK_FUNCTIONS_URL?: string; EXPO_PUBLIC_PROJECT_ID?: string;
  OBJECTPAD_SCAN_MODEL?: string; OBJECTPAD_MESHY_MODEL?: string; OBJECTPAD_MESHY_GEOMETRY?: string; OBJECTPAD_DAILY_RECONSTRUCTIONS?: string;
  OBJECTPAD_REGISTRY_ADDRESS?: string; OBJECTPAD_REGISTRY_CODE_HASH?: string; OBJECTPAD_ATTESTOR_PRIVATE_KEY?: string;
  OBJECTPAD_RPC_URL?: string; OBJECTPAD_PONS_ROUTER_CODE_HASH?: string; OBJECTPAD_PONS_FACTORY_CODE_HASH?: string;
  OBJECTPAD_LAUNCH_ENABLED?: string; OBJECTPAD_CAPTURE_ENABLED?: string; OBJECTPAD_OPERATOR_DIDS?: string;
  /** Optional deterministic per-object fee vault factory; when unset, creator fees go straight to the creator wallet. */
  OBJECTPAD_VAULT_FACTORY_ADDRESS?: string; OBJECTPAD_VAULT_FACTORY_CODE_HASH?: string;
  OBJECTPAD_FORGE_ADDRESS?: string; OBJECTPAD_BURN_ENGINE_ADDRESS?: string; OBJECTPAD_TOKEN_ADDRESS?: string;
  /** Developer buyback/burn execution mode: 'manual' (default, honest) or 'automatic' once a real automated service is deployed and executing. Never inferred — only this env value flips the label. */
  OBJECTPAD_DEV_EXECUTION_MODE?: string;
  /** ObjectPad People phase shown on /People: 'preview' (default) or 'pilot'. Feature states are derived from real configuration either way. */
  OBJECTPAD_PEOPLE_PHASE?: string;
  /** Hiring page kill switch. 'false' forces /hiring off regardless of the operator flag stored in SQLite. */
  HIRING_PAGE_ENABLED?: string;
  /** /apply: optional base64 AES-256 key for applicant contact fields (otherwise a key generated once in durable storage is used). */
  APPLY_DATA_KEY?: string; HIRING_RETENTION_DAYS?: string;
  /** /apply notifications: hiring inbox, privacy contact, and the Resend email provider (applicant receipts + status links). */
  HIRING_NOTIFICATION_EMAIL?: string; HIRING_PRIVACY_EMAIL?: string; RESEND_API_KEY?: string; HIRING_FROM_EMAIL?: string;
  /** /apply RBAC: comma-separated Privy DIDs. Operators are always hiring admins. */
  HIRING_ADMIN_DIDS?: string; HIRING_REVIEWER_DIDS?: string;
  /** Social links shown on /apply only when configured. */
  OBJECTPAD_TIKTOK_URL?: string; OBJECTPAD_INSTAGRAM_URL?: string;
  /** Server-side Privy secret, used only to read the verified account's own wallet address. */
  PRIVY_APP_SECRET?: string; OBJECTPAD_PRIVY_APP_SECRET?: string;
  ROBINHOOD_RPC_URL?: string;
  /** X API v2 app bearer token (server-only) used to fetch posts for ObjectPad Earn. */
  X_API_BEARER_TOKEN?: string;
  /** Set to 'false' to hard-pause every Earn payout regardless of the operator switch. */
  OBJECTPAD_EARN_PAYOUTS?: string;
  /** Optional operator-supplied sponsor key; otherwise one is generated once and kept in durable storage. */
  OBJECTPAD_SPONSOR_PRIVATE_KEY?: string; OBJECTPAD_DAILY_LAUNCHES?: string; OBJECTPAD_HOUSE_LAUNCHES?: string; OBJECTPAD_UNIQUENESS_MODEL?: string;
}
/** Runtime configuration resolved once per request from Env with safe defaults. */
export interface Runtime { env: Env; origin: string; apiOrigin: string; privyAppId: string; toolkitUrl: string; toolkitKey: string; privateBucket: ObjectBucket; artifactBucket: ObjectBucket; }
export interface SessionRow { id: string; owner: string; state: string; token_hash: string | null; claim_hash: string | null; handoff_expires: number; expires: number; created_at: number; payload: string; object_id: string | null; }
export interface JobRow { id: string; session_id: string; state: string; provider_id: string | null; created_at: number; updated_at: number; payload: string; }
export interface RecordRow { id: string; owner: string; session_id: string; state: string; moderation_state: 'clear' | 'hidden'; commitment: string; metadata_hash: string; metadata_uri: string; payload: string; }
export interface SavedSession extends CaptureSession { owner: string; manifestHash?: string; approvedManifestHash?: string; approved?: boolean; rights?: boolean; moderation?: 'pending' | 'approved' | 'rejected'; autoLaunch?: boolean; autoLaunchAttempts?: number; screeningAt?: number; }
export interface DraftInput { sessionId: string; publicName: string; symbol: string; story: string; category: string; xUrl: string; rights: boolean; telegram?: string; feeWallet?: string; pairToken?: string; }
export interface RecordPayload { commitment: ObjectCommitment; symbol: string; metadataHash: string; metadataUri: string; canonicalUrl: string; attestationHash?: string; provenanceBlockHash?: string; launchHash?: string; launchBlockHash?: string; token?: string; curve?: string; verifiedName?: string; feeVault?: string; linkHash?: string; launchMode?: 'sponsored'; sponsor?: string; launchDescription?: string; uniqueness?: { checkedAt: number; compared: number; model: string }; confirmedAt?: number; checkin?: { at: number; confidence: number }; launchDataSuffix?: string; feeRecipientKind?: 'creator' | 'launch_pool'; /** Coin logo chosen before broadcast (3D snapshot or the creator's own image); falls back to the model render. */ iconHash?: string; /** Pons V2 quote asset; omitted = ETH. */ pairToken?: string; }
