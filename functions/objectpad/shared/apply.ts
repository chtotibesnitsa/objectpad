/**
 * ObjectPad /apply — rules shared by the backend and the web app (kept byte-identical in both trees).
 * Pure functions only: role kinds, compensation labels, status transitions, form validation, file sniffing,
 * UTM sanitation and CSV escaping. Nothing here touches storage or the network.
 */

export const APPLICATION_STATUSES = ['draft', 'submitted', 'received', 'in_review', 'interview', 'requested_material', 'offer', 'accepted', 'rejected', 'withdrawn', 'archived'] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];
export const JOB_STATUSES = ['draft', 'published', 'paused', 'archived'] as const;
export type JobStatus = typeof JOB_STATUSES[number];
export const ROLE_KINDS = ['technical', 'creator', 'producer'] as const;
export type RoleKind = typeof ROLE_KINDS[number];
export const JOB_TEAMS = ['engineering', 'product', 'creator'] as const;
export type JobTeam = typeof JOB_TEAMS[number];
export const WORK_MODES = ['remote', 'san_francisco', 'either'] as const;
export type WorkMode = typeof WORK_MODES[number];
export const LOCATION_MODES = ['remote', 'san_francisco', 'remote_or_sf'] as const;
export type LocationMode = typeof LOCATION_MODES[number];
export const COMP_INTERVALS = ['month', 'year', 'video', 'campaign', 'none'] as const;
export type CompInterval = typeof COMP_INTERVALS[number];
export const FORM_VERSION = 1;
export const CONSENT_VERSION = '2026-09-28.1';

/**
 * Explicit transition matrix. Applicants may only withdraw; everything else is a reviewer action.
 * `draft → submitted` happens only through the submit endpoint.
 */
export const TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  draft: ['submitted'],
  submitted: ['received', 'in_review', 'rejected', 'withdrawn', 'archived'],
  received: ['in_review', 'requested_material', 'rejected', 'withdrawn', 'archived'],
  in_review: ['interview', 'requested_material', 'offer', 'rejected', 'withdrawn', 'archived'],
  requested_material: ['in_review', 'interview', 'rejected', 'withdrawn', 'archived'],
  interview: ['offer', 'requested_material', 'rejected', 'withdrawn', 'archived'],
  offer: ['accepted', 'rejected', 'withdrawn', 'archived'],
  accepted: ['archived'],
  rejected: ['archived'],
  withdrawn: ['archived'],
  archived: [],
};
/** True when a reviewer may move an application from `from` to `to`. */
export const canTransition = (from: ApplicationStatus, to: ApplicationStatus): boolean => TRANSITIONS[from].includes(to);
/** Applicants can withdraw any live application exactly once. */
export const canWithdraw = (s: ApplicationStatus): boolean => canTransition(s, 'withdrawn');

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', received: 'Received', in_review: 'In review', interview: 'Interview', requested_material: 'Material requested',
  offer: 'Offer', accepted: 'Accepted', rejected: 'Closed', withdrawn: 'Withdrawn', archived: 'Archived',
};
/** What an applicant sees. Internal nuance (e.g. archived after a rejection) collapses into plain states. */
export const APPLICANT_STATUS: Record<ApplicationStatus, { label: string; body: string }> = {
  draft: { label: 'Not submitted', body: 'This application was started but never submitted.' },
  submitted: { label: 'Received', body: 'Your application is stored securely and waiting for a reviewer.' },
  received: { label: 'Received', body: 'Your application is stored securely and waiting for a reviewer.' },
  in_review: { label: 'In review', body: 'A member of the hiring team is reviewing your application.' },
  requested_material: { label: 'Action needed', body: 'The team asked for more material. Check your email for details.' },
  interview: { label: 'Interview stage', body: 'You’ve moved to the interview stage. The team will contact you by email to schedule.' },
  offer: { label: 'Offer stage', body: 'The team is in touch with you about an offer.' },
  accepted: { label: 'Accepted', body: 'Welcome to ObjectPad.' },
  rejected: { label: 'Closed', body: 'This application is closed. Thank you for the time you put into it. You’re welcome to apply for future roles.' },
  withdrawn: { label: 'Withdrawn', body: 'You withdrew this application. Its files are scheduled for deletion.' },
  archived: { label: 'Closed', body: 'This application is closed.' },
};

export interface JobForm { kind: RoleKind; lead: boolean; requireResume: boolean; skills: string[]; }
/** Public role shape (no internal fields). */
export interface PublicJob {
  publicId: string; slug: string; title: string; team: JobTeam; kind: RoleKind; lead: boolean;
  locationMode: LocationMode; locations: string[]; timezones: string[]; engagementType: string;
  compensation: { currency: string; min: number | null; max: number | null; interval: CompInterval; display: string };
  summary: string; description: string; responsibilities: string[]; qualifications: string[]; niceToHaves: string[];
  experience: string; openings: string; form: JobForm; formVersion: number; publishedAt: number | null; closesAt: number | null;
}

/**
 * The only compensation text a role may show. A numeric floor ("Starting at $5,000 USD/month") renders only when
 * the role has a configured minimum; everything else falls back to the admin-written display text.
 */
export function compensationLabel(c: PublicJob['compensation']): string {
  const money = (n: number) => `${c.currency === 'USD' ? '$' : ''}${n.toLocaleString('en-US')}${c.currency === 'USD' ? '' : ` ${c.currency}`}`;
  const per = c.interval === 'month' ? '/month' : c.interval === 'year' ? '/year' : c.interval === 'video' ? ' per video' : c.interval === 'campaign' ? ' per campaign' : '';
  if (c.min && c.max && c.interval !== 'none') return `${money(c.min)}–${money(c.max)} ${c.currency}${per}`.replace(/ USD\//, ' USD/');
  if (c.min && c.interval !== 'none') return `Starting at ${money(c.min)} ${c.currency}${per}`;
  return c.display.trim() || 'Discussed with each candidate';
}
export const LOCATION_LABEL: Record<LocationMode, string> = { remote: 'Remote worldwide', san_francisco: 'San Francisco', remote_or_sf: 'Remote worldwide + San Francisco' };
export const TEAM_NAME: Record<JobTeam, string> = { engineering: 'Engineering', product: 'Product', creator: 'Creator Network' };
export const WORK_MODE_LABEL: Record<WorkMode, string> = { remote: 'Remote', san_francisco: 'San Francisco', either: 'Either' };

// ---------- Form ----------
export const LINK_KEYS = ['portfolio', 'linkedin', 'github', 'x', 'tiktok', 'instagram', 'youtube'] as const;
export type LinkKey = typeof LINK_KEYS[number];
export const CREATOR_PLATFORMS = ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'X', 'Snapchat', 'Twitch', 'Other'] as const;
export const CREATOR_NICHES = ['Tech', 'Collectibles', 'Toys & hobbies', 'Sneakers & fashion', 'Comedy', 'Lifestyle', 'Finance & crypto', 'Gaming', 'Art & design', 'Education', 'Other'] as const;
export const EDIT_TOOLS = ['CapCut', 'Premiere Pro', 'Final Cut Pro', 'DaVinci Resolve', 'After Effects', 'In-app editors', 'Other'] as const;
export const ON_CAMERA = ['on_camera', 'voice_only', 'hands_only', 'behind_camera'] as const;
export const ON_CAMERA_LABEL: Record<typeof ON_CAMERA[number], string> = { on_camera: 'Comfortable on camera', voice_only: 'Voice-over only', hands_only: 'Hands & product only', behind_camera: 'Behind the camera' };
export const CAPACITY = ['1-2', '3-5', '6-10', '10+'] as const;
export const SOURCES = ['X / Twitter', 'TikTok', 'Instagram', 'Friend or referral', 'ObjectPad site', 'LinkedIn', 'Other'] as const;

/** Every applicant-editable field. Status, reviewer, scores and notes are not here on purpose (mass-assignment guard). */
export interface ApplicationDraft {
  preferredName: string; email: string; country: string; timezone: string; workMode: WorkMode | '';
  links: Partial<Record<LinkKey, string>>; otherLinks: string[];
  availability: string; startDate: string; summary: string; source: string; consent: boolean; privacyAck: boolean;
  // technical
  shippedLinks: string[]; experienceYears: string; skills: string[]; hardProblem: string; scenario: string; leadership: string; compExpectation: string;
  // creator / producer
  platforms: string[]; handles: string; niches: string[]; examples: string[]; tools: string[]; onCamera: string; languages: string; weeklyCapacity: string; pitch: string;
}
export const EMPTY_DRAFT: ApplicationDraft = {
  preferredName: '', email: '', country: '', timezone: '', workMode: '', links: {}, otherLinks: [], availability: '', startDate: '', summary: '', source: '', consent: false, privacyAck: false,
  shippedLinks: [], experienceYears: '', skills: [], hardProblem: '', scenario: '', leadership: '', compExpectation: '',
  platforms: [], handles: '', niches: [], examples: ['', '', ''], tools: [], onCamera: '', languages: '', weeklyCapacity: '', pitch: '',
};
export const LIMITS = { name: 80, email: 254, country: 60, timezone: 64, availability: 120, startDate: 40, summary: 1200, long: 1500, pitch: 900, short: 160, handles: 300, languages: 120, list: 12, link: 500 } as const;

const EMAIL_RE = /^[^\s@<>]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
/** Normalises a free-text value; returns null when it contains hidden control or bidi characters. */
export function cleanText(v: unknown, max: number): string | null { if (typeof v !== 'string') return v === undefined || v === null ? '' : null; const s = v.normalize('NFC').trim(); if (HIDDEN.test(s) || s.length > max) return null; return s; }
/** https-only URL without credentials; returns '' for empty and null for invalid. */
export function cleanUrl(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return ''; if (typeof v !== 'string') return null; let s = v.trim(); if (!s) return '';
  if (!/^https?:\/\//i.test(s) && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s)) s = `https://${s}`;
  if (s.length > LIMITS.link || /[\u0000-\u0020\u007f-\u009f\\]/u.test(s)) return null;
  try { const u = new URL(s); if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null; return u.href; } catch { return null; }
}
export const words = (s: string): number => s.trim() ? s.trim().split(/\s+/).length : 0;
export const sentences = (s: string): number => s.split(/[.!?]+(\s|$)/).filter(x => x && x.trim().length > 3).length;

export type FieldErrors = Partial<Record<string, string>>;
export type StepId = 'about' | 'links' | 'role' | 'review';
export const STEPS: { id: StepId; label: string }[] = [{ id: 'about', label: 'About you' }, { id: 'links', label: 'Work & links' }, { id: 'role', label: 'Role questions' }, { id: 'review', label: 'Review' }];

/** Normalises an untrusted draft object into the typed shape, dropping unknown keys. Throws field codes on invalid values. */
export function normalizeDraft(input: unknown, form: JobForm): { draft: ApplicationDraft; errors: FieldErrors } {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>; const errors: FieldErrors = {};
  const t = (k: keyof ApplicationDraft, max: number): string => { const v = cleanText(o[k], max); if (v === null) { errors[k] = 'TOO_LONG_OR_INVALID'; return ''; } return v; };
  const arr = (k: keyof ApplicationDraft, max: number, allowed?: readonly string[]): string[] => {
    const raw = o[k]; if (raw === undefined || raw === null) return []; if (!Array.isArray(raw) || raw.length > LIMITS.list) { errors[k] = 'LIST_INVALID'; return []; }
    const out: string[] = []; for (const item of raw) { const v = cleanText(item, max); if (v === null) { errors[k] = 'LIST_INVALID'; continue; } if (!v) { out.push(''); continue; } if (allowed && !allowed.includes(v)) { errors[k] = 'LIST_INVALID'; continue; } out.push(v); }
    return out;
  };
  const links: Partial<Record<LinkKey, string>> = {}; const rawLinks = (o.links && typeof o.links === 'object' ? o.links : {}) as Record<string, unknown>;
  for (const key of LINK_KEYS) { const v = cleanUrl(rawLinks[key]); if (v === null) errors[`links.${key}`] = 'LINK_INVALID'; else if (v) links[key] = v; }
  const urls = (k: 'otherLinks' | 'shippedLinks' | 'examples'): string[] => { const list = arr(k, LIMITS.link); return list.map((v, i) => { const u = cleanUrl(v); if (u === null) { errors[`${k}.${i}`] = 'LINK_INVALID'; return v; } return u; }); };
  const workMode = WORK_MODES.find(w => w === o.workMode) ?? '';
  const skills = arr('skills', 80).filter(s => form.skills.includes(s));
  const draft: ApplicationDraft = {
    preferredName: t('preferredName', LIMITS.name), email: t('email', LIMITS.email).toLowerCase(), country: t('country', LIMITS.country), timezone: t('timezone', LIMITS.timezone), workMode,
    links, otherLinks: urls('otherLinks').filter(Boolean).slice(0, 5), availability: t('availability', LIMITS.availability), startDate: t('startDate', LIMITS.startDate), summary: t('summary', LIMITS.summary),
    source: t('source', LIMITS.short), consent: o.consent === true, privacyAck: o.privacyAck === true,
    shippedLinks: urls('shippedLinks').filter(Boolean).slice(0, 5), experienceYears: t('experienceYears', 20), skills, hardProblem: t('hardProblem', LIMITS.long), scenario: t('scenario', LIMITS.long), leadership: t('leadership', LIMITS.long), compExpectation: t('compExpectation', LIMITS.short),
    platforms: arr('platforms', 40, CREATOR_PLATFORMS), handles: t('handles', LIMITS.handles), niches: arr('niches', 40, CREATOR_NICHES), examples: urls('examples').slice(0, 3), tools: arr('tools', 40, EDIT_TOOLS),
    onCamera: ON_CAMERA.find(v => v === o.onCamera) ?? '', languages: t('languages', LIMITS.languages), weeklyCapacity: CAPACITY.find(v => v === o.weeklyCapacity) ?? '', pitch: t('pitch', LIMITS.pitch),
  };
  while (draft.examples.length < 3) draft.examples.push('');
  return { draft, errors };
}

/**
 * Full submission validation for one step (or all). Returns field → message code. Used identically by the
 * browser (inline errors) and the server (authoritative). `hasResume`/`hasSample` report stored clean files.
 */
export function validateStep(step: StepId | 'all', d: ApplicationDraft, form: JobForm, files: { resume: boolean; sample: boolean } = { resume: false, sample: false }): FieldErrors {
  const e: FieldErrors = {}; const all = step === 'all' || step === 'review';
  if (all || step === 'about') {
    if (d.preferredName.length < 2) e.preferredName = 'REQUIRED';
    if (!EMAIL_RE.test(d.email)) e.email = 'EMAIL_INVALID';
    if (d.country.length < 2) e.country = 'REQUIRED';
    if (d.timezone.length < 2) e.timezone = 'REQUIRED';
    if (!d.workMode) e.workMode = 'REQUIRED';
    if (d.availability.length < 2) e.availability = 'REQUIRED';
  }
  if (all || step === 'links') {
    const anyLink = Object.values(d.links).some(Boolean) || d.otherLinks.length > 0;
    if (!anyLink && !(form.kind !== 'technical' && files.sample)) e['links.portfolio'] = 'LINK_REQUIRED';
    if (form.kind === 'technical' && !d.links.github && d.shippedLinks.length === 0 && !d.links.portfolio) e['links.github'] = 'GITHUB_OR_SHIPPED';
    if (d.summary.length < 40) e.summary = 'MIN_40';
    if (form.requireResume && !files.resume) e.resume = 'RESUME_REQUIRED';
    if (!d.source) e.source = 'REQUIRED';
  }
  if (all || step === 'role') {
    if (form.kind === 'technical') {
      if (!d.experienceYears) e.experienceYears = 'REQUIRED';
      if (form.skills.length && d.skills.length === 0) e.skills = 'PICK_ONE';
      if (d.hardProblem.length < 80) e.hardProblem = 'MIN_80';
      if (d.scenario.length < 60) e.scenario = 'MIN_60';
      if (form.lead && d.leadership.length < 60) e.leadership = 'MIN_60';
    } else {
      if (d.platforms.length === 0) e.platforms = 'PICK_ONE';
      if (d.niches.length === 0) e.niches = 'PICK_ONE';
      const examples = d.examples.filter(Boolean); if (examples.length < 1 && !files.sample) e['examples.0'] = 'EXAMPLE_REQUIRED';
      if (d.tools.length === 0) e.tools = 'PICK_ONE';
      if (!d.onCamera) e.onCamera = 'REQUIRED';
      if (d.languages.length < 2) e.languages = 'REQUIRED';
      if (!d.weeklyCapacity) e.weeklyCapacity = 'REQUIRED';
      const n = sentences(d.pitch); if (d.pitch.length < 120 || n < 3 || n > 6) e.pitch = 'PITCH_3_5';
      if (form.kind === 'producer' && d.leadership.length < 60) e.leadership = 'MIN_60';
    }
  }
  if (all) { if (!d.consent) e.consent = 'CONSENT_REQUIRED'; if (!d.privacyAck) e.privacyAck = 'CONSENT_REQUIRED'; }
  return e;
}
export const FIELD_MESSAGE: Record<string, string> = {
  REQUIRED: 'Required.', EMAIL_INVALID: 'Enter a valid email address.', LINK_INVALID: 'Use a full https:// link.', LINK_REQUIRED: 'Add at least one link to your work.',
  GITHUB_OR_SHIPPED: 'Add a GitHub, portfolio or shipped-product link.', MIN_40: 'A few sentences, at least 40 characters.', MIN_60: 'At least 60 characters.', MIN_80: 'At least 80 characters.',
  PICK_ONE: 'Pick at least one.', EXAMPLE_REQUIRED: 'Add at least one content link (or upload a sample).', PITCH_3_5: 'Write 3–5 sentences (at least 120 characters).',
  RESUME_REQUIRED: 'This role asks for a résumé.', CONSENT_REQUIRED: 'Required to submit.', TOO_LONG_OR_INVALID: 'Too long or contains hidden characters.', LIST_INVALID: 'Invalid selection.',
};

// ---------- Files ----------
export type FilePurpose = 'resume' | 'sample';
export const FILE_RULES: Record<FilePurpose, { mimes: readonly string[]; max: number; label: string }> = {
  resume: { mimes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], max: 8 * 1024 * 1024, label: 'PDF or DOCX, up to 8 MB' },
  sample: { mimes: ['video/mp4', 'video/quicktime'], max: 25 * 1024 * 1024, label: 'MP4 or MOV, up to 25 MB (links are better for longer videos)' },
};
/** Metadata check before an upload ticket is issued. */
export function fileAllowed(purpose: FilePurpose, mime: string, size: number): boolean { const r = FILE_RULES[purpose]; return r.mimes.includes(mime) && Number.isInteger(size) && size > 200 && size <= r.max; }
/** Content sniffing: returns the real MIME from magic bytes, or null. Extensions are never trusted. */
export function sniffMime(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'application/zip';
  if (ascii(4, 8) === 'ftyp') { const brand = ascii(8, 12); return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4'; }
  return null;
}
/** Safe display filename: ASCII letters, digits, dot, dash, underscore; max 80 chars; keeps a known extension. */
export function safeFilename(name: string, mime: string): string {
  const ext = mime === 'application/pdf' ? 'pdf' : mime.includes('wordprocessingml') ? 'docx' : mime === 'video/quicktime' ? 'mov' : 'mp4';
  const base = name.replace(/\.[^.]*$/, '').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 70) || 'file';
  return `${base}.${ext}`;
}

// ---------- Attribution & export ----------
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
/** Keeps only the five UTM keys, 1–80 chars of [A-Za-z0-9 ._+-]. Anything else (emails, tokens, markup) is dropped. */
export function sanitizeUtm(input: unknown): Partial<Record<typeof UTM_KEYS[number], string>> {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>; const out: Partial<Record<typeof UTM_KEYS[number], string>> = {};
  for (const k of UTM_KEYS) { const v = o[k]; if (typeof v !== 'string') continue; const s = v.trim().slice(0, 80); if (s && /^[A-Za-z0-9 ._+-]+$/.test(s) && !s.includes('@')) out[k] = s; }
  return out;
}
/** One CSV cell: quoted, quotes doubled, formula-leading characters neutralised (spreadsheet injection). */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? '' : Array.isArray(v) ? v.join(' | ') : String(v);
  if (/^[=+\-@\t\r|%]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
/** Non-sequential public reference, e.g. OP-7KQ2-M9XD. Crockford-style alphabet without look-alikes. */
export function publicReference(random: Uint8Array): string {
  const A = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; const c = Array.from(random.slice(0, 8), b => A[b % A.length]).join('');
  return `OP-${c.slice(0, 4)}-${c.slice(4, 8)}`;
}
export const ANALYTICS_EVENTS = ['apply_view', 'role_view', 'application_start', 'step_about', 'step_links', 'step_role', 'step_review', 'upload_ok', 'upload_error', 'validation_error', 'application_submit'] as const;
export type AnalyticsEvent = typeof ANALYTICS_EVENTS[number];
