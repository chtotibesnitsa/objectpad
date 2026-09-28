import { useQuery } from '@tanstack/react-query';
import { api, API_BASE, RequestError } from '@/lib/api';
import { useSession } from '@/lib/session';

export type HiringTeam = 'engineering' | 'mobile' | 'design' | 'growth' | 'other';
export type RemotePolicy = 'remote' | 'hybrid' | 'onsite' | 'tbd';
export type Engagement = 'full_time' | 'contract' | 'part_time' | 'tbd';
export type RoleStatus = 'draft' | 'open' | 'paused' | 'closed';
export type ApplicationState = 'new' | 'reviewing' | 'shortlisted' | 'declined' | 'archived';

/** One role, exactly as stored server-side. */
export interface HiringRole {
  id: string; slug: string; title: string; team: HiringTeam; location: string; remotePolicy: RemotePolicy; engagementType: Engagement;
  summary: string; responsibilities: string[]; requiredSkills: string[]; preferredSkills: string[];
  status: RoleStatus; sortOrder: number; publishedAt: number | null; createdAt: number; updatedAt: number;
}
export interface HiringFaq { q: string; a: string; }
/** Public page payload. `{ enabled: false }` alone means the page is hidden (HIRING_PAGE_ENABLED off). */
export type HiringPublic = { enabled: false; roles?: undefined } | { enabled: boolean; preview: boolean; roles: HiringRole[]; faq: HiringFaq[]; privacyContact: string | null };
export interface HiringApplication {
  id: string; roleId: string; roleTitle: string; state: ApplicationState; notes: { at: number; text: string }[]; hasResume: boolean; createdAt: number; updatedAt: number;
  name: string; email: string; xHandle: string; location: string; timezone: string; portfolio: string; github: string; linkedin: string;
  strongestProject: string; whyObjectPad: string; availability: string; consentAt: number;
}
export interface HiringReadiness { id: string; label: string; passed: boolean; detail: string; }
export interface HiringAdminData {
  flag: boolean; enabled: boolean; forcedOff: boolean; settings: { faq: HiringFaq[]; privacyContact: string };
  roles: HiringRole[]; readiness: HiringReadiness[]; applications: HiringApplication[];
}

export const HIRING_KEY = ['objectpad', 'hiring'] as const;
export const TEAM_LABEL: Record<HiringTeam, string> = { engineering: 'Engineering', mobile: 'Mobile', design: 'Product design', growth: 'Growth', other: 'Other' };
export const REMOTE_LABEL: Record<RemotePolicy, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site', tbd: 'To be confirmed' };
export const ENGAGEMENT_LABEL: Record<Engagement, string> = { full_time: 'Full-time', contract: 'Contract', part_time: 'Part-time', tbd: 'To be confirmed' };
export const STATE_LABEL: Record<ApplicationState, string> = { new: 'New', reviewing: 'Reviewing', shortlisted: 'Shortlisted', declined: 'Declined', archived: 'Archived' };
/** True when a text still contains an editable "[TBD …]" placeholder. */
export const isPlaceholder = (s: string): boolean => /\[TBD/i.test(s);
export const roleUnfinished = (r: HiringRole): boolean => r.remotePolicy === 'tbd' || r.engagementType === 'tbd' || isPlaceholder([r.title, r.location, r.summary, ...r.responsibilities, ...r.requiredSkills, ...r.preferredSkills].join(' '));

/** Public /hiring data. Signed-in operators also receive a labelled preview while the page is hidden. */
export function useHiring() {
  const { token, authenticated } = useSession();
  return useQuery({ queryKey: [...HIRING_KEY, 'public', authenticated], queryFn: async () => api<HiringPublic>('/hiring', { token: authenticated ? await token() : null }), staleTime: 30_000 });
}
/** Whether the hiring page is publicly enabled. Used to show or hide the navigation entry. */
export function useHiringEnabled(): boolean {
  const q = useQuery({ queryKey: [...HIRING_KEY, 'flag'], queryFn: () => api<HiringPublic>('/hiring'), staleTime: 300_000, retry: 0 });
  return q.data?.enabled === true;
}

const MESSAGES: Record<string, string> = {
  FORM_EXPIRED: 'This form was open too long. Reload the page and submit again.',
  APPLICATION_REJECTED: 'That submission looked automated. Wait a few seconds and try again.',
  APPLICATION_RECENT: 'You already applied for this role in the last 14 days. We have your application.',
  ROLE_NOT_OPEN: 'This role is no longer accepting applications. Choose another role or send a general application.',
  LINK_REQUIRED: 'Add at least one link: portfolio, GitHub or LinkedIn.',
  LINK_INVALID: 'Links must be full https:// addresses.',
  CONSENT_REQUIRED: 'Please confirm the privacy consent.',
  EMAIL_INVALID: 'Enter a valid email address.',
  X_HANDLE_INVALID: 'X handles use letters, numbers and _ (max 15).',
  RESUME_INVALID: 'Résumés must be a PDF under 5 MB.',
  UPLOAD_TICKET_INVALID: 'The résumé upload window expired. Your application was still received.',
  RATE_LIMITED: 'Too many submissions from this network today. Try again tomorrow.',
  ROLE_UNFINISHED: 'This role still has placeholders or “to be confirmed” fields. Finish it before opening or pausing it.',
  HIRING_NOT_READY: 'Every readiness check has to pass before the page can go public.',
  SLUG_TAKEN: 'Another role already uses this URL slug.',
  SLUG_INVALID: 'Slugs use lowercase letters, numbers and dashes (3–48).',
  ROLE_NOT_DRAFT: 'Only draft roles can be deleted. Close it instead.',
  FORBIDDEN: 'This account is not on the operator allowlist.',
  SIGN_IN_REQUIRED: 'Sign in with an operator account.',
  NOT_FOUND: 'Applications are not open right now.',
};
/** Plain-language hiring error. */
export function hiringError(error: unknown): string {
  if (error instanceof RequestError) return MESSAGES[error.code] ?? error.message;
  return error instanceof Error ? error.message : 'Something went wrong. Retry safely.';
}

/** Authenticated private file download (résumés, CSV export). Nothing is cached or made public. */
export async function downloadPrivate(path: string, token: string | null, filename: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 403 ? 'Not authorized.' : 'Download failed. Retry.');
  const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
