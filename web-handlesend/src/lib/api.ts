import type { Readiness } from '@/shared/domain';

const DEFAULT_API = 'https://objectpad-backend.rork.app';
const configured = ((import.meta.env.VITE_OBJECTPAD_API_URL as string | undefined) || (import.meta.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL as string | undefined) || DEFAULT_API).trim().replace(/\/$/, '');
/**
 * ObjectPad's own backend, used for background requests only (long 3D jobs and uploads can't go through the site's
 * 120s proxy). Every link a person sees or shares is built on objectpad.fun by the backend.
 */
export const API_ORIGIN = /^https:\/\//.test(configured) ? configured : DEFAULT_API;
export const API_BASE = `${API_ORIGIN}/api`;

export const NOT_CONFIGURED: Readiness = { mode: 'operator_blocked', blocker: 'The ObjectPad service could not be reached. Scans, 3D models and launches stay paused until it responds.', productionAccepted: false, chainId: 4663, checks: [{ id: 'storage', label: 'ObjectPad API & durable storage', ready: false }, { id: 'auth', label: 'Optional sign-in (X, wallet, email)', ready: false }, { id: 'media', label: 'Photo checks & AI content screening', ready: false }, { id: 'meshy', label: '3D scan engine', ready: false }, { id: 'uniqueness', label: 'AI duplicate-object check', ready: false }, { id: 'sponsor', label: 'Launch treasury funded', ready: false }, { id: 'launch', label: 'Robinhood Chain launches (code-pinned)', ready: false }] };

const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Your session expired. Sign in again.',
  RATE_LIMITED: 'Too many requests. Wait a moment and retry.',
  PROFILE_REQUIRED: 'Create your public creator profile in Settings first.',
  OPERATOR_SETUP_REQUIRED: 'Capture is not enabled on this deployment yet.',
  HANDOFF_EXPIRED_OR_USED: 'This QR code expired or was already used. Generate a new one on your desktop.',
  CAPTURE_DEVICE_NOT_AUTHORIZED: 'This device no longer holds the capture session. Recover it below.',
  UPLOAD_TICKET_INVALID: 'The upload ticket expired. Retry the upload.',
  IMAGE_RESOLUTION: 'The photo resolution is too low. Use the rear camera in good light.',
  IMAGE_QUALITY: 'The photo is too blurry, dark or bright. Retake this angle.',
  DUPLICATE_VIEW: 'This angle looks the same as another. Move around the object and retake.',
  DUPLICATE_ARCHIVE_FRAME: 'This exact photo already exists in the archive. Capture your own object.',
  NEAR_DUPLICATE_CAPTURE: 'This capture closely matches an existing object in the archive. Each launch needs its own object.',
  NO_OBJECT: 'No single object was detected. Center one object in the frame and retake.',
  PEOPLE_IN_FRAME: 'A person or face is visible. Keep people out of the frame and retake.',
  DOCUMENT_IN_FRAME: 'A document or personal information is visible. Remove it and retake.',
  SCREEN_IN_FRAME: 'A screen is visible. Capture a physical object instead.',
  PROHIBITED_OBJECT: 'This object is not permitted on ObjectPad.',
  OBJECT_OR_BACKGROUND_QUALITY: 'Keep the object centered on a consistent background and retake.',
  MEDIA_VALIDATION_UNAVAILABLE: 'The AI took too long to answer. Tap Try again: your photos are saved.',
  CAPTURE_INCOMPLETE: 'All six guided angles are required first.',
  DUPLICATE_OBJECT: 'This object is already on ObjectPad. Every real object can become exactly one coin, so this scan can’t launch.',
  DUPLICATE_ARTIFACT: 'This model or capture already belongs to another coin.',
  SPONSOR_EMPTY: 'Free launches are paused until the launch treasury is topped up. Your coin launches automatically once it is.',
  LAUNCH_BUDGET_REACHED: 'Today’s free launches are used up. Your coin launches automatically tomorrow.',
  WALLET_REQUIRED: 'Your account has no wallet yet. Sign out and back in to create one automatically.',
  LAUNCH_SIMULATION_FAILED: 'The launch did not pass its safety simulation. Nothing was sent; retry in a moment.',
  LAUNCH_BROADCAST_FAILED: 'The network didn’t take the launch just now. Nothing was spent. Tap Launch now to send it again.',
  ICON_INVALID: 'Use a JPG or PNG at least 128 × 128 pixels for the coin icon.',
  ICON_LOCKED: 'The launch is already sent, so the coin icon is locked in.',
  PONS_LAUNCH_PAUSED: 'New launches are paused on the launchpad. Your coin launches automatically when it reopens.',
  LAUNCH_DRAFT_REQUIRED: 'Add a coin name first.',
  METADATA_INVALID: 'Check the coin name (2–32 characters), ticker (2–10 letters or digits) and story (10–280 characters).',
  RECORD_ALREADY_COMMITTED: 'This coin’s details are already sealed and can’t be edited.',
  CAPTURE_CLOSED: 'This scan is closed. Start a new one.',
  CHECKIN_REPLAY: 'That is one of the original scan photos. Take a fresh photo of the object.',
  MARKET_UNAVAILABLE: 'Live market data is temporarily unavailable.',
  PROVIDER_FAILED: 'The 3D rebuild failed. Retake the photos in even light on a plain surface and try again.',
  RECONSTRUCTION_BUDGET_REACHED: 'Today’s reconstruction capacity is used up. Try again tomorrow.',
  PROVIDER_CREDITS: 'Reconstruction credits are exhausted. The operator has been notified.',
  MODEL_NOT_READY: 'The model is not ready yet.',
  RECORD_PREREQUISITES: 'The 3D model has to pass its checks first.',
  LAUNCH_OPERATOR_BLOCKED: 'Onchain launches are not enabled yet: the ObjectPad provenance registry has not been deployed.',
  DEPLOYMENT_CODE_MISMATCH: 'Deployed contract code does not match the pinned version. Launches are paused for safety.',
  ORIGIN_REJECTED: 'This site address is not allowed to make changes.',
  NOT_FOUND: 'Nothing exists at this address.',
  X_LINK_UNVERIFIED: 'Link your X account (Sign in with X) before adding an X link. Only your own verified account can be attached to a coin.',
  X_LINK_NOT_YOURS: 'That X link isn’t your verified account. You can only attach your own X profile to a coin.',
  VAULT_SIZE_INVALID: 'A vault holds 2 to 12 live coins.',
  VAULT_NAME_INVALID: 'Give the vault a name of 3 to 40 characters.',
  VAULT_LIMIT: 'You’ve reached the vault limit for this account.',
  VAULT_EMPTY: 'None of this vault’s coins are trading right now.',
  REGENERATE_LIMIT: 'This scan has used its free 3D rebuilds. Rescan the object for a fresh set of photos.',
  WALLET_INVALID: 'That wallet address doesn’t look right. Paste a full 0x… address or leave it empty.',
  LINK_INVALID: 'Use https://x.com/handle and https://t.me/group links, or leave them empty.',
  SIGN_IN_REQUIRED: 'Sign in to save scans to an inventory.',
  HANDOFF_UNAVAILABLE: 'This scan can’t be opened on another phone right now.',
  OBJECT_RECORD_MISMATCH: 'The launch transaction didn’t carry the expected object record, so it is held for review.',
  CAPTURE_STORAGE_MISSING: 'A stored photo is missing. Rescan the object.',
  PROVIDER_PAYLOAD_TOO_LARGE: 'The photos were too heavy for the 3D engine. Rebuilding with lighter copies.',
  PROVIDER_UNAVAILABLE: 'The 3D engine didn’t answer. Rebuilding from the same photos.',
  PROVIDER_REQUEST_TIMEOUT: 'The 3D engine took too long to accept the job. Rebuilding from the same photos.',
  PROVIDER_AUTH: 'The 3D engine refused the request. We’re on it — try again in a minute.',
  PROVIDER_RATE_LIMIT: 'The 3D engine is busy. Try again in a few seconds.',
  PROVIDER_REJECTED_INPUT: 'The 3D engine couldn’t use these photos. Rescan in even light on a plain surface.',
  PROVIDER_TIMEOUT: 'The 3D build took too long. Rebuild from the same photos.',
};
/** Maps server error codes to plain language without exposing internals. */
export function describeError(code: string): string { return MESSAGES[code] ?? `The request could not be completed (${code.replaceAll('_', ' ').toLowerCase()}). Retry safely.`; }

/** Error carrying the server's stable error code and HTTP status. */
export class RequestError extends Error { constructor(message: string, readonly code: string, readonly status: number) { super(message); this.name = 'RequestError'; } }
/** Options for one ObjectPad API request. */
export interface ApiOptions { token?: string | null; method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string>; binary?: Blob; timeout?: number; }
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.binary) headers['Content-Type'] = options.binary.type;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: options.method ?? 'GET', headers, body: options.binary ?? (options.body === undefined ? undefined : JSON.stringify(options.body)), signal: options.signal ?? AbortSignal.timeout(options.timeout ?? 25_000), credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new Error('ObjectPad could not be reached. Check your connection and retry.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('ObjectPad API is not responding. See system status.');
  const data = await response.json() as { error?: string; message?: string };
  if (!response.ok) { const code = data.error ?? 'SERVICE_UNAVAILABLE'; throw new RequestError(data.message ?? describeError(code), code, response.status); }
  return data as T;
}
export async function fetchReadiness(): Promise<Readiness> { return api<Readiness>('/status'); }
