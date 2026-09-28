import { useQuery } from '@tanstack/react-query';
import { api, API_BASE, RequestError } from '@/lib/api';
import { sanitizeUtm, type AnalyticsEvent, type ApplicationDraft, type ApplicationStatus, type FilePurpose, type PublicJob } from '@/shared/apply';

export const APPLY_KEY = ['objectpad', 'apply'] as const;
export interface JobsPayload { jobs: PublicJob[]; social: { tiktok: string | null; instagram: string | null; x: string }; privacyContact: string | null; retentionDays: number; updatedAt: number; }
export interface DraftFile { id: string; purpose: FilePurpose; filename: string; size: number; mime: string; scanStatus: string; scanDetail: string; }
export interface DraftPayload { publicId: string; reference: string; status: ApplicationStatus; job: PublicJob; draft: ApplicationDraft; files: DraftFile[]; updatedAt: number; }
export interface Receipt { reference: string; role: string; submittedAt: number | null; statusUrl: string; statusToken: string; duplicate: boolean; }
export interface ApplicantStatus { reference: string; role: string; roleSlug: string; status: string; body: string; submittedAt: number | null; withdrawnAt: number | null; canWithdraw: boolean; timeline: { label: string; at: number }[]; privacyContact: string | null; }

/** Published roles (public). */
export function useJobs() { return useQuery({ queryKey: [...APPLY_KEY, 'jobs'], queryFn: () => api<JobsPayload>('/jobs'), staleTime: 60_000 }); }
export function useJob(slug: string) { return useQuery({ queryKey: [...APPLY_KEY, 'job', slug], queryFn: () => api<{ job: PublicJob; privacyContact: string | null }>(`/jobs/${slug}`), retry: (n, e) => !(e instanceof RequestError && e.status === 404) && n < 2 }); }

// ---------- attribution (validated UTM only; kept for this browser session) ----------
const UTM_STORE = 'op-apply-utm';
/** Captures UTM params from the landing URL once per session. Never stores anything but the five sanitised keys. */
export function captureUtm(): Record<string, string> {
  try {
    const fromUrl = sanitizeUtm(Object.fromEntries(new URLSearchParams(window.location.search)));
    if (Object.keys(fromUrl).length) sessionStorage.setItem(UTM_STORE, JSON.stringify(fromUrl));
    return sanitizeUtm(JSON.parse(sessionStorage.getItem(UTM_STORE) ?? '{}')) as Record<string, string>;
  } catch { return {}; }
}

/** Privacy-conscious analytics: event name + an optional role slug. No names, emails, answers, file names or tokens. */
export function track(event: AnalyticsEvent, dim = ''): void {
  const utm = event === 'apply_view' ? captureUtm() : {};
  void fetch(`${API_BASE}/applications/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, dim: dim.slice(0, 64), ...utm }), keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => undefined);
}

// ---------- draft session (server-side draft; only its id + secret live in this browser) ----------
interface DraftHandle { publicId: string; secret: string; reference: string; }
const handleKey = (slug: string) => `op-apply-draft:${slug}`;
export function loadHandle(slug: string): DraftHandle | null { try { const v = JSON.parse(localStorage.getItem(handleKey(slug)) ?? 'null') as DraftHandle | null; return v && /^[0-9a-f-]{36}$/.test(v.publicId) && /^[a-f0-9]{64}$/.test(v.secret) ? v : null; } catch { return null; } }
export function saveHandle(slug: string, h: DraftHandle): void { try { localStorage.setItem(handleKey(slug), JSON.stringify(h)); } catch { /* private mode: draft still lives server-side for this tab */ } }
export function clearHandle(slug: string): void { try { localStorage.removeItem(handleKey(slug)); } catch { /* ignore */ } }

export async function createDraft(slug: string, clientKey: string): Promise<{ publicId: string; reference: string; draftSecret: string | null }> {
  return api('/applications/draft', { method: 'POST', body: { jobSlug: slug, clientKey, utm: captureUtm() } });
}
const withSecret = (h: DraftHandle) => ({ 'X-Draft-Secret': h.secret });
export const getDraft = (h: DraftHandle) => api<DraftPayload>(`/applications/${h.publicId}`, { headers: withSecret(h) });
export const patchDraft = (h: DraftHandle, draft: ApplicationDraft) => api<{ savedAt: number; errors: Record<string, string> }>(`/applications/${h.publicId}`, { method: 'PATCH', body: { draft }, headers: withSecret(h) });
export const submitDraft = (h: DraftHandle, website: string) => api<{ ok: true; receipt: Receipt } | { ok: false; errors: Record<string, string> }>(`/applications/${h.publicId}/submit`, { method: 'POST', body: { website }, headers: withSecret(h), timeout: 40_000 }).catch(error => {
  if (error instanceof RequestError && error.status === 422) throw new RequestError('Some answers need attention.', 'VALIDATION', 422); throw error;
});
export const deleteFile = (h: DraftHandle, id: string) => api(`/applications/${h.publicId}/files/${id}`, { method: 'DELETE', headers: withSecret(h) });

/** Private upload: metadata-validated ticket, then the bytes with progress. Resolves with the scanned file record. */
export async function uploadFile(h: DraftHandle, purpose: FilePurpose, file: File, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<DraftFile> {
  const ticket = await api<{ fileId: string; uploadPath: string; ticket: string; maxBytes: number }>(`/applications/${h.publicId}/upload-ticket`, { method: 'POST', body: { purpose, mime: file.type, size: file.size, name: file.name }, headers: withSecret(h) });
  return new Promise<DraftFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('PUT', `${API_BASE}${ticket.uploadPath}`); xhr.setRequestHeader('Content-Type', 'application/octet-stream'); xhr.setRequestHeader('X-Upload-Token', ticket.ticket); xhr.timeout = 180_000;
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => { let data: { file?: DraftFile; error?: string } = {}; try { data = JSON.parse(xhr.responseText) as typeof data; } catch { /* handled below */ } if (xhr.status >= 200 && xhr.status < 300 && data.file) resolve(data.file); else reject(new RequestError(applyError(new RequestError('', data.error ?? 'UPLOAD_FAILED', xhr.status)), data.error ?? 'UPLOAD_FAILED', xhr.status)); };
    xhr.onerror = () => reject(new RequestError('Upload interrupted. Check your connection and retry.', 'UPLOAD_NETWORK', 0));
    xhr.ontimeout = () => reject(new RequestError('Upload timed out. Retry on a stronger connection or share a link instead.', 'UPLOAD_TIMEOUT', 0));
    signal?.addEventListener('abort', () => xhr.abort()); xhr.send(file);
  });
}

// ---------- status ----------
export const fetchStatus = (token: string) => api<ApplicantStatus>('/applications/status', { method: 'POST', body: { token } });
export const withdraw = (token: string) => api<ApplicantStatus>('/applications/withdraw', { method: 'POST', body: { token } });
export const requestStatusLink = (email: string, reference: string) => api<{ ok: true }>('/applications/status-link', { method: 'POST', body: { email, reference } });

const MESSAGES: Record<string, string> = {
  ROLE_NOT_OPEN: 'This role is not accepting applications right now.', ROLE_NOT_FOUND: 'This role is not open.', DRAFT_NOT_FOUND: 'This draft is no longer available. Start a fresh application.',
  ALREADY_SUBMITTED: 'This application was already submitted.', ALREADY_WITHDRAWN: 'This application was withdrawn.', TOO_FAST: 'That was very fast. Take a moment to check your answers, then submit again.',
  APPLICATION_REJECTED: 'That submission looked automated. Reload the page and try again.', RATE_LIMITED: 'Too many attempts from this network. Wait a little and retry.',
  EMAIL_RATE_LIMITED: 'This email has submitted several applications today. Try again tomorrow.', FILE_NOT_ALLOWED: 'That file type or size isn’t accepted.', FILE_CONTENT_MISMATCH: 'The file contents don’t match its type. Export it again as a real PDF, DOCX, MP4 or MOV.',
  FILE_QUARANTINED: 'This file contains active content (scripts, macros or embedded objects) and was quarantined. Upload a plain PDF instead.', FILE_TOO_LARGE: 'The file is too large. Share a link instead.',
  UPLOAD_TICKET_INVALID: 'The upload window expired. Choose the file again to retry.', STATUS_LINK_INVALID: 'This status link isn’t valid (it may have been replaced by a newer one). Request a fresh link below.',
  STATUS_LINK_EXPIRED: 'This status link expired. Request a fresh link below.', CANNOT_WITHDRAW: 'This application can no longer be withdrawn.', ORIGIN_REJECTED: 'This site address is not allowed to submit applications.',
  FORBIDDEN: 'This account doesn’t have hiring access.', SIGN_IN_REQUIRED: 'Sign in with your ObjectPad staff account.', TRANSITION_INVALID: 'That status change isn’t allowed from the current stage.',
  COMPENSATION_GUARANTEE: 'Compensation text can’t promise guaranteed earnings.', SLUG_TAKEN: 'Another role already uses this URL.', SLUG_INVALID: 'URLs use lowercase letters, numbers and dashes.',
};
/** Plain-language /apply error. */
export function applyError(error: unknown): string {
  if (error instanceof RequestError) return MESSAGES[error.code] ?? (error.message || 'Something went wrong. Your progress is saved; retry safely.');
  return error instanceof Error ? error.message : 'Something went wrong. Your progress is saved; retry safely.';
}
