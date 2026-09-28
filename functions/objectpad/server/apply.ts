import { ApiError, sha256 } from '../shared/security';
import { secureNonce } from '../shared/people';
import {
  APPLICANT_STATUS, APPLICATION_STATUSES, canTransition, canWithdraw, COMP_INTERVALS, CONSENT_VERSION, csvCell, EMPTY_DRAFT, FILE_RULES, fileAllowed, FORM_VERSION, JOB_STATUSES, JOB_TEAMS,
  LOCATION_MODES, normalizeDraft, publicReference, ROLE_KINDS, safeFilename, sanitizeUtm, sniffMime, STATUS_LABEL, validateStep, ANALYTICS_EVENTS,
  type ApplicationDraft, type ApplicationStatus, type CompInterval, type FilePurpose, type JobForm, type JobStatus, type JobTeam, type LocationMode, type PublicJob, type RoleKind,
} from '../shared/apply';
import type { Store } from './store';
import type { Runtime } from './types';

/**
 * ObjectPad /apply: job openings, account-free applications, private files, applicant status links, reviewer workspace,
 * email delivery log and aggregated funnel metrics. All data lives in the Durable Object's SQLite database.
 * Contact details are AES-GCM encrypted; tokens and draft secrets are stored only as SHA-256 hashes.
 */
const DAY = 86_400_000;
const STATUS_TTL = 60 * DAY; const TICKET_TTL = 20 * 60_000; const MIN_FILL_MS = 15_000;
const EMAIL_RE = /^[^\s@<>]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const TEST_EMAIL = /@(example\.com|test\.objectpad\.fun)$/i;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;
const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0));

interface JobPayload {
  lead: boolean; locationMode: LocationMode; locations: string[]; timezones: string[]; engagementType: string;
  compensation: { currency: string; min: number | null; max: number | null; interval: CompInterval; display: string };
  summary: string; description: string; responsibilities: string[]; qualifications: string[]; niceToHaves: string[];
  experience: string; openings: string; requireResume: boolean; skills: string[];
}
interface JobRow { id: string; public_id: string; slug: string; title: string; team: JobTeam; kind: RoleKind; status: JobStatus; sort_order: number; payload: string; published_at: number | null; closes_at: number | null; created_at: number; updated_at: number; }
interface AppRow {
  id: string; public_id: string; reference: string; job_id: string; form_version: number; preferred_name: string; email_enc: string; email_hash: string; country: string; timezone: string; work_mode: string;
  availability: string; start_date: string; summary: string; source: string; campaign: string; utm: string; status: ApplicationStatus; assigned_reviewer: string | null; draft_secret_hash: string;
  client_key_hash: string; is_test: number; tags: string; submitted_at: number | null; withdrawn_at: number | null; retention_at: number | null; deleted_at: number | null; created_at: number; updated_at: number;
}
interface FileRow { id: string; app_id: string; purpose: FilePurpose; object_key: string | null; filename: string; mime: string; size: number; checksum: string; scan_status: string; scan_detail: string; ticket_hash: string | null; ticket_expires: number | null; retention_at: number | null; created_at: number; }
interface DeliveryRow { id: string; app_id: string | null; template: string; recipient_enc: string; payload_enc: string | null; status: string; provider_id: string | null; attempts: number; last_error: string; dedupe_key: string; next_at: number; created_at: number; updated_at: number; }
export type StaffRole = 'admin' | 'reviewer';

const BASE_TIMEZONES = ['Americas (UTC−8 to −3)', 'Europe & Africa (UTC−1 to +3)', 'Asia-Pacific (UTC+5 to +10)'];
const TECH_SKILLS = ['TypeScript', 'React', 'Node / Workers', 'SQL (Postgres / SQLite)', 'EVM (viem / ethers)', 'Solidity', 'Cloudflare Workers / Durable Objects', 'Testing & CI', 'Observability & incidents', 'Security review'];
const FE_SKILLS = ['TypeScript', 'React', 'CSS / Tailwind', 'Design systems', 'Accessibility (WCAG)', 'Motion', 'Performance', 'Figma', 'three.js / WebGL', 'Product analytics'];
const BE_SKILLS = ['TypeScript', 'Node / Workers', 'SQL (Postgres / SQLite)', 'Queues & scheduled jobs', 'Chain indexing', 'RPC reliability', 'Wallet / relayer security', 'Idempotent APIs', 'Testing', 'Observability'];
const TO_BE_DISCUSSED = 'Discussed with each candidate';
const SEED: (Omit<JobRow, 'id' | 'public_id' | 'payload' | 'published_at' | 'closes_at' | 'created_at' | 'updated_at'> & { payload: JobPayload })[] = [
  { slug: 'lead-full-stack-web3-developer', title: 'Lead Full-Stack / Web3 Developer', team: 'engineering', kind: 'technical', status: 'published', sort_order: 0, payload: {
    lead: true, locationMode: 'remote_or_sf', locations: ['Remote worldwide', 'San Francisco (optional)'], timezones: BASE_TIMEZONES, engagementType: 'Full-time or long-term contract',
    compensation: { currency: 'USD', min: 5000, max: null, interval: 'month', display: '' }, experience: 'Lead / senior', openings: 'Several, across time zones', requireResume: false, skills: TECH_SKILLS,
    summary: 'Own ObjectPad end to end, from the phone capture to the onchain launch: architecture, deployment quality and time-zone coverage.',
    description: 'ObjectPad turns a phone camera into a free launchpad for the physical world. You will own large parts of a live production system: a React web app, native capture apps, a Workers + Durable Objects backend, 3D reconstruction jobs and Robinhood Chain integrations. You make architecture decisions, review code, mentor, and keep the product fast, safe and honest about its state while your time zone is on call.',
    responsibilities: ['Own features from API and storage to UI, and ship them safely', 'Make and document architecture decisions', 'Review code and mentor other engineers', 'Keep deployments, monitoring and incident response sharp', 'Harden wallet, launch and upload paths against abuse', 'Provide coverage for your time zone'],
    qualifications: ['Shipped production software you can point to', 'Strong TypeScript across frontend and backend', 'Databases, APIs and Web3 integrations in production', 'Security, testing and monitoring habits', 'Clear written communication'],
    niceToHaves: ['Cloudflare Workers / Durable Objects', 'viem, Solidity or chain indexing', 'three.js / WebGL', 'Experience leading a small team'] } },
  { slug: 'frontend-ui-product-engineer', title: 'Frontend / UI Product Engineer or Product Designer', team: 'product', kind: 'technical', status: 'published', sort_order: 1, payload: {
    lead: false, locationMode: 'remote_or_sf', locations: ['Remote worldwide', 'San Francisco (optional)'], timezones: BASE_TIMEZONES, engagementType: 'Full-time or contract',
    compensation: { currency: 'USD', min: null, max: null, interval: 'none', display: TO_BE_DISCUSSED }, experience: 'Mid to senior', openings: 'Open', requireResume: false, skills: FE_SKILLS,
    summary: 'Build the interfaces people touch: responsive, accessible, fast and conversion-aware, from design to production code.',
    description: 'You design and build the ObjectPad interface across web and mobile web: capture flows, object pages, launch flows and the design system. You care about accessibility, motion restraint, browser performance and whether a first-time visitor understands the product in seconds.',
    responsibilities: ['Ship production UI from design to code', 'Evolve the design system and its components', 'Make flows accessible, fast and clear on phones', 'Use analytics and user feedback to improve conversion'],
    qualifications: ['A portfolio or shipped-product evidence', 'Production UI systems and responsive interaction', 'Accessibility and performance fundamentals', 'Taste and restraint in motion'],
    niceToHaves: ['React + Tailwind', 'three.js / 3D presentation', 'Motion design tools', 'Consumer or crypto product experience'] } },
  { slug: 'backend-web3-engineer', title: 'Backend / Web3 Engineer', team: 'engineering', kind: 'technical', status: 'published', sort_order: 2, payload: {
    lead: false, locationMode: 'remote_or_sf', locations: ['Remote worldwide', 'San Francisco (optional)'], timezones: BASE_TIMEZONES, engagementType: 'Full-time or contract',
    compensation: { currency: 'USD', min: null, max: null, interval: 'none', display: TO_BE_DISCUSSED }, experience: 'Mid to senior', openings: 'Open', requireResume: false, skills: BE_SKILLS,
    summary: 'APIs, queues, chain events and wallet safety: the systems that make every launch reliable and recoverable.',
    description: 'You own the services behind ObjectPad: typed APIs, scheduled jobs, chain indexing, RPC reliability, idempotent launch paths, wallet and relayer security, and recovery when something upstream fails.',
    responsibilities: ['Design and ship reliable, idempotent APIs', 'Run queues, alarms and scheduled jobs', 'Index chain events and reconcile state', 'Protect wallets, relayers and launch paths', 'Add tests, metrics and alerts; own failure recovery'],
    qualifications: ['A GitHub, project link or credible shipped-work description', 'Production backend experience in TypeScript or similar', 'SQL and data-integrity judgment', 'Experience with EVM chains or RPC providers'],
    niceToHaves: ['Cloudflare Workers / Durable Objects', 'viem', 'Incident response', 'Security audits'] } },
  { slug: 'ugc-short-form-creator', title: 'UGC / Short-Form Creator', team: 'creator', kind: 'creator', status: 'published', sort_order: 3, payload: {
    lead: false, locationMode: 'remote_or_sf', locations: ['Remote worldwide (where legally supported)', 'San Francisco collaboration (optional)'], timezones: ['Any'], engagementType: 'Paid creator engagement',
    compensation: { currency: 'USD', min: null, max: null, interval: 'none', display: 'Paid · per-video, retainer or campaign · rate agreed with each creator' }, experience: 'Any level — your work matters more than your follower count', openings: '100+ creator opportunities planned, onboarded in cohorts', requireResume: false, skills: [],
    summary: 'Show people outside crypto how a toy, collectible or everyday object becomes a live market, in 20 seconds.',
    description: 'You film on your phone, demo the product, and edit hooks, cuts and captions that make ObjectPad obvious to someone who has never touched crypto. Prior TikTok, Reels or Shorts experience helps; a huge following is not required. Crypto experience is optional.',
    responsibilities: ['Film product demos and object stories on a phone', 'Edit hooks, cuts and captions for TikTok, Reels and Shorts', 'Turn a technical product into a story mainstream viewers get', 'Hit agreed briefs and posting schedules', 'Clearly disclose paid partnerships'],
    qualifications: ['Examples of short-form videos you made', 'Comfort shooting and editing on a phone', 'Storytelling and consistency'],
    niceToHaves: ['An existing audience on any platform', 'Collectibles, toys, sneakers or tech niches', 'Multiple languages', 'Based in or near San Francisco'] } },
  { slug: 'creator-lead-producer', title: 'Creator Lead / Producer', team: 'creator', kind: 'producer', status: 'published', sort_order: 4, payload: {
    lead: true, locationMode: 'remote_or_sf', locations: ['Remote worldwide', 'San Francisco (optional)'], timezones: BASE_TIMEZONES, engagementType: 'Full-time or contract',
    compensation: { currency: 'USD', min: null, max: null, interval: 'none', display: TO_BE_DISCUSSED }, experience: 'Experienced producer or creator manager', openings: 'Open', requireResume: false, skills: [],
    summary: 'Run the creator network: briefs, calendars, feedback, approvals, brand quality and what each campaign teaches us.',
    description: 'You manage briefs, calendars, creator feedback, approvals, brand quality, attribution and campaign learnings across TikTok, Instagram and other short-form channels as the creator network grows toward 100+ people.',
    responsibilities: ['Write briefs and run the content calendar', 'Give creators fast, specific feedback', 'Approve content for quality, accuracy and disclosure', 'Track attribution and share what works'],
    qualifications: ['Managed creators, UGC or short-form programs', 'Sharp editorial taste', 'Organised with calendars and approvals'],
    niceToHaves: ['Built a creator program from scratch', 'Paid social experience', 'Crypto or consumer-tech launches'] } },
];

export class ApplyService {
  private dataKey: Promise<{ env: CryptoKey | null; local: CryptoKey }> | null = null;
  constructor(private readonly store: Store, private readonly runtime: Runtime) {
    const s = (q: string) => store.run(q);
    s('CREATE TABLE IF NOT EXISTS op_apply_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_jobs (id TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, team TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, sort_order INTEGER NOT NULL, payload TEXT NOT NULL, published_at INTEGER, closes_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_apps (id TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, reference TEXT NOT NULL UNIQUE, job_id TEXT NOT NULL REFERENCES op_jobs(id), form_version INTEGER NOT NULL, preferred_name TEXT NOT NULL DEFAULT \'\', email_enc TEXT NOT NULL DEFAULT \'\', email_hash TEXT NOT NULL DEFAULT \'\', country TEXT NOT NULL DEFAULT \'\', timezone TEXT NOT NULL DEFAULT \'\', work_mode TEXT NOT NULL DEFAULT \'\', availability TEXT NOT NULL DEFAULT \'\', start_date TEXT NOT NULL DEFAULT \'\', summary TEXT NOT NULL DEFAULT \'\', source TEXT NOT NULL DEFAULT \'\', campaign TEXT NOT NULL DEFAULT \'\', utm TEXT NOT NULL DEFAULT \'{}\', status TEXT NOT NULL, assigned_reviewer TEXT, draft_secret_hash TEXT NOT NULL, client_key_hash TEXT NOT NULL UNIQUE, is_test INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT \'[]\', submitted_at INTEGER, withdrawn_at INTEGER, retention_at INTEGER, deleted_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    s('CREATE INDEX IF NOT EXISTS op_apps_status ON op_apps(status, submitted_at)'); s('CREATE INDEX IF NOT EXISTS op_apps_job ON op_apps(job_id, status)'); s('CREATE INDEX IF NOT EXISTS op_apps_email ON op_apps(email_hash)');
    s('CREATE TABLE IF NOT EXISTS op_app_answers (app_id TEXT PRIMARY KEY REFERENCES op_apps(id) ON DELETE CASCADE, form_version INTEGER NOT NULL, answers TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_app_links (app_id TEXT NOT NULL REFERENCES op_apps(id) ON DELETE CASCADE, kind TEXT NOT NULL, url TEXT NOT NULL)'); s('CREATE INDEX IF NOT EXISTS op_app_links_app ON op_app_links(app_id)');
    s('CREATE TABLE IF NOT EXISTS op_app_files (id TEXT PRIMARY KEY, app_id TEXT NOT NULL REFERENCES op_apps(id) ON DELETE CASCADE, purpose TEXT NOT NULL, object_key TEXT, filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, checksum TEXT NOT NULL DEFAULT \'\', scan_status TEXT NOT NULL, scan_detail TEXT NOT NULL DEFAULT \'\', ticket_hash TEXT, ticket_expires INTEGER, retention_at INTEGER, created_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_app_events (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, actor TEXT NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, detail TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL)'); s('CREATE INDEX IF NOT EXISTS op_app_events_app ON op_app_events(app_id, created_at)');
    s('CREATE TRIGGER IF NOT EXISTS op_app_events_immutable BEFORE UPDATE ON op_app_events BEGIN SELECT RAISE(ABORT, \'immutable\'); END');
    s('CREATE TABLE IF NOT EXISTS op_app_notes (id TEXT PRIMARY KEY, app_id TEXT NOT NULL REFERENCES op_apps(id) ON DELETE CASCADE, author TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_app_scores (id TEXT PRIMARY KEY, app_id TEXT NOT NULL REFERENCES op_apps(id) ON DELETE CASCADE, reviewer TEXT NOT NULL, rubric_version INTEGER NOT NULL, scores TEXT NOT NULL, recommendation TEXT NOT NULL, created_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_app_consents (id TEXT PRIMARY KEY, app_id TEXT NOT NULL REFERENCES op_apps(id) ON DELETE CASCADE, consent_version TEXT NOT NULL, policy_revision TEXT NOT NULL, network_hash TEXT NOT NULL, created_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_app_tokens (hash TEXT PRIMARY KEY, app_id TEXT NOT NULL, purpose TEXT NOT NULL, expires INTEGER NOT NULL, revoked_at INTEGER, last_used_at INTEGER, created_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_email_deliveries (id TEXT PRIMARY KEY, app_id TEXT, template TEXT NOT NULL, recipient_enc TEXT NOT NULL, payload_enc TEXT, status TEXT NOT NULL, provider_id TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT \'\', dedupe_key TEXT NOT NULL UNIQUE, next_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_apply_metrics (day INTEGER NOT NULL, event TEXT NOT NULL, dim TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, event, dim))');
    s('CREATE TABLE IF NOT EXISTS op_apply_saved_filters (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, name TEXT NOT NULL, query TEXT NOT NULL, created_at INTEGER NOT NULL)');
    if (!store.one("SELECT v FROM op_apply_kv WHERE k='seeded'")) store.atomic(() => {
      const now = Date.now();
      for (const j of SEED) store.run('INSERT OR IGNORE INTO op_jobs(id,public_id,slug,title,team,kind,status,sort_order,payload,published_at,closes_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', crypto.randomUUID(), crypto.randomUUID(), j.slug, j.title, j.team, j.kind, j.status, j.sort_order, JSON.stringify(j.payload), now, null, now, now);
      store.run("INSERT INTO op_apply_kv(k,v) VALUES ('seeded',?)", String(now));
    });
  }

  // ---------- crypto helpers ----------
  private keys() {
    if (!this.dataKey) this.dataKey = (async () => {
      const envRaw = (this.runtime.env.APPLY_DATA_KEY ?? '').trim();
      let local = this.store.one<{ v: string }>("SELECT v FROM op_apply_kv WHERE k='data_key'")?.v;
      if (!local) { local = b64(crypto.getRandomValues(new Uint8Array(32))); this.store.run("INSERT OR IGNORE INTO op_apply_kv(k,v) VALUES ('data_key',?)", local); local = this.store.one<{ v: string }>("SELECT v FROM op_apply_kv WHERE k='data_key'")!.v; }
      const imp = (raw: string) => crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
      return { env: /^[A-Za-z0-9+/]{43}=$/.test(envRaw) ? await imp(envRaw) : null, local: await imp(local) };
    })();
    return this.dataKey;
  }
  private async enc(value: string): Promise<string> {
    if (!value) return ''; const k = await this.keys(); const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k.env ?? k.local, new TextEncoder().encode(value)));
    return `${k.env ? 'v1e' : 'v1k'}:${b64(iv)}:${b64(ct)}`;
  }
  private async dec(value: string): Promise<string> {
    if (!value) return ''; const [v, iv, ct] = value.split(':'); const k = await this.keys(); const key = v === 'v1e' ? k.env : k.local; if (!key || !iv || !ct) return '';
    try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct))); } catch { return ''; }
  }
  private emailHash(email: string): Promise<string> { return sha256(`apply-email:${email.trim().toLowerCase()}`); }
  private retentionDays(): number { const n = Number(this.runtime.env.HIRING_RETENTION_DAYS); return Number.isFinite(n) && n >= 30 && n <= 1095 ? Math.floor(n) : 365; }

  // ---------- jobs ----------
  private job(row: JobRow): PublicJob {
    const p = JSON.parse(row.payload) as JobPayload;
    return { publicId: row.public_id, slug: row.slug, title: row.title, team: row.team, kind: row.kind, lead: p.lead, locationMode: p.locationMode, locations: p.locations, timezones: p.timezones, engagementType: p.engagementType,
      compensation: p.compensation, summary: p.summary, description: p.description, responsibilities: p.responsibilities, qualifications: p.qualifications, niceToHaves: p.niceToHaves, experience: p.experience, openings: p.openings,
      form: { kind: row.kind, lead: p.lead, requireResume: p.requireResume, skills: p.skills }, formVersion: FORM_VERSION, publishedAt: row.published_at, closesAt: row.closes_at };
  }
  private live(row: JobRow | undefined): row is JobRow { return Boolean(row && row.status === 'published' && (!row.closes_at || row.closes_at > Date.now())); }
  /** GET /jobs: only published, unexpired roles. */
  publicJobs() {
    const jobs = this.store.all<JobRow>("SELECT * FROM op_jobs WHERE status='published' ORDER BY sort_order ASC, created_at ASC").filter(r => this.live(r)).map(r => this.job(r));
    return { jobs, social: { tiktok: this.socialUrl(this.runtime.env.OBJECTPAD_TIKTOK_URL), instagram: this.socialUrl(this.runtime.env.OBJECTPAD_INSTAGRAM_URL), x: 'https://x.com/objectpadfun' }, privacyContact: this.privacyContact(), retentionDays: this.retentionDays(), updatedAt: Date.now() };
  }
  private socialUrl(raw: string | undefined): string | null { const v = (raw ?? '').trim(); return /^https:\/\/(www\.)?(tiktok\.com|instagram\.com)\/[A-Za-z0-9_.@/-]{2,80}$/.test(v) ? v : null; }
  private privacyContact(): string | null { const v = (this.runtime.env.HIRING_PRIVACY_EMAIL ?? this.runtime.env.HIRING_NOTIFICATION_EMAIL ?? '').trim().toLowerCase(); return EMAIL_RE.test(v) ? v : null; }
  publicJob(slug: string) { const row = this.store.one<JobRow>('SELECT * FROM op_jobs WHERE slug=?', slug); if (!this.live(row)) throw new ApiError('ROLE_NOT_FOUND', 404); return { job: this.job(row), privacyContact: this.privacyContact() }; }

  // ---------- analytics (aggregated, no PII) ----------
  track(data: Record<string, unknown>): { ok: true } {
    const event = ANALYTICS_EVENTS.find(e => e === data.event); if (!event) throw new ApiError('EVENT_INVALID');
    const dimRaw = typeof data.dim === 'string' ? data.dim : ''; const dim = /^[a-z0-9_-]{0,64}$/.test(dimRaw) ? dimRaw : '';
    const day = Math.floor(Date.now() / DAY); this.store.run('INSERT INTO op_apply_metrics(day,event,dim,count) VALUES (?,?,?,1) ON CONFLICT(day,event,dim) DO UPDATE SET count=count+1', day, event, dim);
    const src = sanitizeUtm(data).utm_source; if (src && (event === 'apply_view')) this.store.run('INSERT INTO op_apply_metrics(day,event,dim,count) VALUES (?,?,?,1) ON CONFLICT(day,event,dim) DO UPDATE SET count=count+1', day, 'view_source', src.toLowerCase().slice(0, 40));
    return { ok: true };
  }

  // ---------- applicant: drafts ----------
  private async appBySecret(publicId: string, secret: unknown): Promise<AppRow> {
    const row = this.store.one<AppRow>('SELECT * FROM op_apps WHERE public_id=? AND deleted_at IS NULL', publicId);
    if (!row || typeof secret !== 'string' || secret.length > 128 || row.draft_secret_hash !== await sha256(`apply-draft:${secret}`)) throw new ApiError('DRAFT_NOT_FOUND', 404);
    return row;
  }
  private jobRowById(id: string): JobRow { const r = this.store.one<JobRow>('SELECT * FROM op_jobs WHERE id=?', id); if (!r) throw new ApiError('ROLE_NOT_FOUND', 404); return r; }
  /** POST /applications/draft — idempotent per client key. The draft secret is returned exactly once. */
  async createDraft(data: Record<string, unknown>) {
    const slug = typeof data.jobSlug === 'string' ? data.jobSlug : ''; const job = this.store.one<JobRow>('SELECT * FROM op_jobs WHERE slug=?', slug); if (!this.live(job)) throw new ApiError('ROLE_NOT_OPEN', 409);
    const clientKey = typeof data.clientKey === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(data.clientKey) ? data.clientKey : ''; if (!clientKey) throw new ApiError('INVALID_INPUT');
    const clientHash = await sha256(`apply-client:${clientKey}`);
    const existing = this.store.one<AppRow>('SELECT * FROM op_apps WHERE client_key_hash=?', clientHash); if (existing) return { publicId: existing.public_id, reference: existing.reference, draftSecret: null };
    const utm = sanitizeUtm(data.utm); const source = typeof data.source === 'string' ? data.source.slice(0, 40).replace(/[^A-Za-z0-9 ._+-]/g, '') : '';
    const secret = secureNonce(); const now = Date.now(); const id = crypto.randomUUID(); const publicId = crypto.randomUUID(); const reference = publicReference(crypto.getRandomValues(new Uint8Array(8)));
    this.store.run('INSERT INTO op_apps(id,public_id,reference,job_id,form_version,status,draft_secret_hash,client_key_hash,utm,campaign,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, publicId, reference, job.id, FORM_VERSION, 'draft', await sha256(`apply-draft:${secret}`), clientHash, JSON.stringify(utm), utm.utm_campaign ?? '', source || utm.utm_source || '', now, now);
    this.store.run('INSERT INTO op_app_answers(app_id,form_version,answers,updated_at) VALUES (?,?,?,?)', id, FORM_VERSION, JSON.stringify(EMPTY_DRAFT), now);
    this.event(id, 'applicant', 'draft_created', null, 'draft'); this.track({ event: 'application_start', dim: job.slug });
    return { publicId, reference, draftSecret: secret };
  }
  private answers(appId: string): ApplicationDraft { const r = this.store.one<{ answers: string }>('SELECT answers FROM op_app_answers WHERE app_id=?', appId); return { ...EMPTY_DRAFT, ...(r ? JSON.parse(r.answers) as Partial<ApplicationDraft> : {}) }; }
  private files(appId: string): FileRow[] { return this.store.all<FileRow>("SELECT * FROM op_app_files WHERE app_id=? AND scan_status<>'deleted' ORDER BY created_at ASC", appId); }
  private fileState(appId: string) { const f = this.files(appId).filter(x => x.scan_status === 'clean'); return { resume: f.some(x => x.purpose === 'resume'), sample: f.some(x => x.purpose === 'sample') }; }
  private publicFile(f: FileRow) { return { id: f.id, purpose: f.purpose, filename: f.filename, size: f.size, mime: f.mime, scanStatus: f.scan_status, scanDetail: f.scan_detail }; }
  /** GET draft (resume after reload). */
  async getDraft(publicId: string, secret: unknown) {
    const row = await this.appBySecret(publicId, secret); const job = this.jobRowById(row.job_id);
    return { publicId, reference: row.reference, status: row.status, job: this.job(job), draft: this.answers(row.id), files: this.files(row.id).map(f => this.publicFile(f)), updatedAt: row.updated_at };
  }
  /** PATCH — applicant-editable fields only; invalid fields are dropped and reported, never stored. */
  async updateDraft(publicId: string, secret: unknown, data: Record<string, unknown>) {
    const row = await this.appBySecret(publicId, secret); if (row.status !== 'draft') throw new ApiError('ALREADY_SUBMITTED', 409);
    const job = this.jobRowById(row.job_id); const form = this.job(job).form;
    const { draft, errors } = normalizeDraft(data.draft, form); const now = Date.now();
    const email = EMAIL_RE.test(draft.email) ? draft.email : '';
    this.store.atomic(() => {
      this.store.run('UPDATE op_app_answers SET answers=?,form_version=?,updated_at=? WHERE app_id=?', JSON.stringify(draft), FORM_VERSION, now, row.id);
    });
    this.store.run('UPDATE op_apps SET preferred_name=?,email_enc=?,email_hash=?,country=?,timezone=?,work_mode=?,availability=?,start_date=?,summary=?,updated_at=? WHERE id=?', draft.preferredName, await this.enc(email), email ? await this.emailHash(email) : '', draft.country, draft.timezone, draft.workMode, draft.availability, draft.startDate, draft.summary, now, row.id);
    return { savedAt: now, errors };
  }

  // ---------- applicant: files ----------
  async uploadTicket(publicId: string, secret: unknown, data: Record<string, unknown>) {
    const row = await this.appBySecret(publicId, secret); if (row.status !== 'draft') throw new ApiError('ALREADY_SUBMITTED', 409);
    const purpose: FilePurpose | undefined = data.purpose === 'resume' || data.purpose === 'sample' ? data.purpose : undefined; if (!purpose) throw new ApiError('FILE_INVALID');
    const job = this.job(this.jobRowById(row.job_id)); if (purpose === 'sample' && job.kind === 'technical') throw new ApiError('FILE_INVALID');
    const mime = typeof data.mime === 'string' ? data.mime : ''; const size = Number(data.size);
    if (!fileAllowed(purpose, mime, size)) throw new ApiError('FILE_NOT_ALLOWED', 415);
    for (const f of this.files(row.id).filter(x => x.purpose === purpose)) await this.dropFile(f);
    const id = crypto.randomUUID(); const ticket = secureNonce(); const now = Date.now();
    this.store.run('INSERT INTO op_app_files(id,app_id,purpose,object_key,filename,mime,size,scan_status,ticket_hash,ticket_expires,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, row.id, purpose, null, safeFilename(typeof data.name === 'string' ? data.name : 'file', mime), mime, size, 'awaiting_upload', await sha256(`apply-file:${ticket}`), now + TICKET_TTL, now);
    return { fileId: id, uploadPath: `/applications/${publicId}/files/${id}`, ticket, expiresAt: now + TICKET_TTL, maxBytes: FILE_RULES[purpose].max };
  }
  /** PUT file bytes with the single-use ticket. Content is sniffed, checksummed and structurally scanned before anyone can read it. */
  async putFile(publicId: string, fileId: string, ticket: string, bytes: Uint8Array) {
    const app = this.store.one<AppRow>('SELECT * FROM op_apps WHERE public_id=? AND deleted_at IS NULL', publicId); const f = app ? this.store.one<FileRow>('SELECT * FROM op_app_files WHERE id=? AND app_id=?', fileId, app.id) : undefined;
    if (!app || !f || !f.ticket_hash || !f.ticket_expires || f.ticket_expires < Date.now() || f.ticket_hash !== await sha256(`apply-file:${ticket.slice(0, 128)}`)) throw new ApiError('UPLOAD_TICKET_INVALID', 403);
    if (app.status !== 'draft') throw new ApiError('ALREADY_SUBMITTED', 409);
    const rule = FILE_RULES[f.purpose]; if (bytes.length > rule.max || bytes.length < 200) throw new ApiError('FILE_NOT_ALLOWED', 413);
    const sniffed = sniffMime(bytes); const docx = f.mime.includes('wordprocessingml');
    const ok = docx ? sniffed === 'application/zip' && this.hasAscii(bytes, 'word/') : sniffed === f.mime || (f.purpose === 'sample' && (sniffed === 'video/mp4' || sniffed === 'video/quicktime'));
    if (!ok) { this.store.run("UPDATE op_app_files SET scan_status='rejected',scan_detail=?,ticket_hash=NULL WHERE id=?", 'File contents do not match the declared type.', f.id); throw new ApiError('FILE_CONTENT_MISMATCH', 415); }
    const scan = this.structuralScan(bytes, f.mime); const key = `apply/${app.id}/${f.id}`;
    if (scan.clean) await this.runtime.privateBucket.put(key, bytes, { httpMetadata: { contentType: 'application/octet-stream' } });
    this.store.run('UPDATE op_app_files SET object_key=?,size=?,checksum=?,scan_status=?,scan_detail=?,ticket_hash=NULL,ticket_expires=NULL WHERE id=?', scan.clean ? key : null, bytes.length, await sha256(bytes), scan.clean ? 'clean' : 'quarantined', scan.detail, f.id);
    this.store.run('UPDATE op_apps SET updated_at=? WHERE id=?', Date.now(), app.id);
    if (!scan.clean) throw new ApiError('FILE_QUARANTINED', 422);
    return { file: this.publicFile({ ...f, size: bytes.length, scan_status: 'clean', scan_detail: scan.detail }) };
  }
  private hasAscii(bytes: Uint8Array, needle: string): boolean { const n = new TextEncoder().encode(needle); outer: for (let i = 0; i <= bytes.length - n.length; i++) { for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer; return true; } return false; }
  /**
   * Built-in structural scan (no third-party antivirus is configured): rejects PDFs with JavaScript, launch actions or
   * embedded files, and DOCX files that carry macros or OLE objects. Videos must be MP4/QuickTime containers.
   */
  private structuralScan(bytes: Uint8Array, mime: string): { clean: boolean; detail: string } {
    if (mime === 'application/pdf') { const bad = ['/JavaScript', '/JS ', '/JS(', '/Launch', '/EmbeddedFile', '/RichMedia', '/XFA'].find(t => this.hasAscii(bytes, t)); return bad ? { clean: false, detail: `Active PDF content (${bad.trim()}) is not accepted. Export a plain PDF.` } : { clean: true, detail: 'Structural check passed: no scripts, launch actions or embedded files.' }; }
    if (mime.includes('wordprocessingml')) { const bad = ['vbaProject', 'oleObject', 'activeX'].find(t => this.hasAscii(bytes, t)); return bad ? { clean: false, detail: 'Documents with macros or embedded objects are not accepted. Upload a PDF.' } : { clean: true, detail: 'Structural check passed: no macros or embedded objects.' }; }
    return { clean: true, detail: 'Container check passed (MP4/QuickTime).' };
  }
  private async dropFile(f: FileRow): Promise<void> { if (f.object_key) await this.runtime.privateBucket.delete(f.object_key).catch(() => undefined); this.store.run("UPDATE op_app_files SET scan_status='deleted',object_key=NULL,ticket_hash=NULL WHERE id=?", f.id); }
  async deleteFile(publicId: string, secret: unknown, fileId: string) { const row = await this.appBySecret(publicId, secret); if (row.status !== 'draft') throw new ApiError('ALREADY_SUBMITTED', 409); const f = this.store.one<FileRow>('SELECT * FROM op_app_files WHERE id=? AND app_id=?', fileId, row.id); if (f) await this.dropFile(f); return { ok: true }; }

  // ---------- applicant: submit / status / withdraw ----------
  private event(appId: string, actor: string, event: string, from: string | null, to: string | null, detail = ''): string { const id = crypto.randomUUID(); this.store.run('INSERT INTO op_app_events(id,app_id,actor,event,from_status,to_status,detail,created_at) VALUES (?,?,?,?,?,?,?,?)', id, appId, actor, event, from, to, detail.slice(0, 400), Date.now()); return id; }
  private async mintStatusToken(appId: string): Promise<string> {
    const token = secureNonce(); const now = Date.now();
    this.store.run("UPDATE op_app_tokens SET revoked_at=? WHERE app_id=? AND purpose='status' AND revoked_at IS NULL AND created_at<?", now, appId, now - 60_000);
    this.store.run('INSERT INTO op_app_tokens(hash,app_id,purpose,expires,created_at) VALUES (?,?,?,?,?)', await sha256(`apply-status:${token}`), appId, 'status', now + STATUS_TTL, now); return token;
  }
  private statusUrl(token: string): string { return `${this.runtime.origin}/apply/status#t=${token}`; }
  /** Atomic, idempotent submit. A second call returns the same receipt with a fresh status link. */
  async submit(publicId: string, secret: unknown, data: Record<string, unknown>, networkHash: string) {
    const row = await this.appBySecret(publicId, secret); const jobRow = this.jobRowById(row.job_id); const job = this.job(jobRow);
    if (row.status !== 'draft') { if (row.status === 'withdrawn') throw new ApiError('ALREADY_WITHDRAWN', 409); const token = await this.mintStatusToken(row.id); return { ok: true as const, receipt: { reference: row.reference, role: jobRow.title, submittedAt: row.submitted_at, statusUrl: this.statusUrl(token), statusToken: token, duplicate: true } }; }
    if (typeof data.website === 'string' && data.website.trim()) throw new ApiError('APPLICATION_REJECTED');
    if (Date.now() - row.created_at < MIN_FILL_MS) throw new ApiError('TOO_FAST', 429);
    if (!this.live(jobRow)) throw new ApiError('ROLE_NOT_OPEN', 409);
    const draft = this.answers(row.id); const errors = validateStep('all', draft, job.form, this.fileState(row.id));
    if (Object.keys(errors).length) return { ok: false as const, errors };
    const emailHash = await this.emailHash(draft.email); this.store.peek(`apply-email:${emailHash}`, 5, 'EMAIL_RATE_LIMITED');
    const isTest = TEST_EMAIL.test(draft.email) ? 1 : 0; const now = Date.now(); const retention = now + this.retentionDays() * DAY;
    const token = secureNonce(); const tokenHash = await sha256(`apply-status:${token}`); const emailEnc = await this.enc(draft.email);
    const links: [string, string][] = [...Object.entries(draft.links).filter((e): e is [string, string] => Boolean(e[1])), ...draft.otherLinks.map(u => ['other', u] as [string, string]), ...draft.shippedLinks.map(u => ['shipped', u] as [string, string]), ...draft.examples.filter(Boolean).map(u => ['example', u] as [string, string])];
    const receiptBody = await this.enc(JSON.stringify(this.renderEmail('received', { name: draft.preferredName, role: jobRow.title, reference: row.reference, statusUrl: this.statusUrl(token) })));
    const staffTo = (this.runtime.env.HIRING_NOTIFICATION_EMAIL ?? '').trim().toLowerCase();
    const staffBody = EMAIL_RE.test(staffTo) ? await this.enc(JSON.stringify(this.renderEmail('internal_new', { name: '', role: jobRow.title, reference: row.reference, statusUrl: `${this.runtime.origin}/admin/applications/${row.public_id}` }))) : null;
    const staffEnc = staffBody ? await this.enc(staffTo) : '';
    this.store.atomic(() => {
      const current = this.store.one<{ status: string }>('SELECT status FROM op_apps WHERE id=?', row.id); if (current?.status !== 'draft') throw new ApiError('ALREADY_SUBMITTED', 409);
      this.store.run("UPDATE op_apps SET status='submitted',submitted_at=?,retention_at=?,email_enc=?,email_hash=?,is_test=?,source=CASE WHEN ?<>'' THEN ? ELSE source END,updated_at=? WHERE id=?", now, retention, emailEnc, emailHash, isTest, draft.source, draft.source, now, row.id);
      this.store.run('DELETE FROM op_app_links WHERE app_id=?', row.id); for (const [kind, url] of links) this.store.run('INSERT INTO op_app_links(app_id,kind,url) VALUES (?,?,?)', row.id, kind, url);
      this.store.run('INSERT INTO op_app_consents(id,app_id,consent_version,policy_revision,network_hash,created_at) VALUES (?,?,?,?,?,?)', crypto.randomUUID(), row.id, CONSENT_VERSION, 'privacy-2026-09', networkHash.slice(0, 16), now);
      this.store.run('INSERT INTO op_app_tokens(hash,app_id,purpose,expires,created_at) VALUES (?,?,?,?,?)', tokenHash, row.id, 'status', now + STATUS_TTL, now);
      const ev = this.event(row.id, 'applicant', 'submitted', 'draft', 'submitted', isTest ? 'test' : '');
      this.store.run('INSERT OR IGNORE INTO op_email_deliveries(id,app_id,template,recipient_enc,payload_enc,status,attempts,dedupe_key,next_at,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,?)', crypto.randomUUID(), row.id, 'received', emailEnc, receiptBody, 'queued', `${row.id}:received:${ev}`, now, now, now);
      if (staffBody) this.store.run('INSERT OR IGNORE INTO op_email_deliveries(id,app_id,template,recipient_enc,payload_enc,status,attempts,dedupe_key,next_at,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,?)', crypto.randomUUID(), row.id, 'internal_new', staffEnc, staffBody, 'queued', `${row.id}:internal:${ev}`, now, now, now);
    });
    this.store.bump(`apply-email:${emailHash}`, DAY); if (!isTest) this.track({ event: 'application_submit', dim: jobRow.slug }); this.store.metric('apply_submitted');
    return { ok: true as const, receipt: { reference: row.reference, role: jobRow.title, submittedAt: now, statusUrl: this.statusUrl(token), statusToken: token, duplicate: false } };
  }
  private async appByToken(token: unknown): Promise<AppRow> {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError('STATUS_LINK_INVALID', 404);
    const t = this.store.one<{ app_id: string; expires: number; revoked_at: number | null }>("SELECT app_id,expires,revoked_at FROM op_app_tokens WHERE hash=? AND purpose='status'", await sha256(`apply-status:${token}`));
    if (!t || t.revoked_at) throw new ApiError('STATUS_LINK_INVALID', 404); if (t.expires < Date.now()) throw new ApiError('STATUS_LINK_EXPIRED', 410);
    const row = this.store.one<AppRow>('SELECT * FROM op_apps WHERE id=? AND deleted_at IS NULL', t.app_id); if (!row) throw new ApiError('STATUS_LINK_INVALID', 404);
    this.store.run('UPDATE op_app_tokens SET last_used_at=? WHERE hash=?', Date.now(), await sha256(`apply-status:${token}`)); return row;
  }
  /** Applicant-safe status: no notes, scores, reviewer or internal events. */
  async status(token: unknown) {
    const row = await this.appByToken(token); const job = this.jobRowById(row.job_id); const s = APPLICANT_STATUS[row.status];
    const timeline = this.store.all<{ to_status: string; created_at: number }>("SELECT to_status,created_at FROM op_app_events WHERE app_id=? AND to_status IS NOT NULL AND event IN ('submitted','status_changed','withdrawn') ORDER BY created_at ASC", row.id)
      .map(e => ({ label: APPLICANT_STATUS[e.to_status as ApplicationStatus]?.label ?? 'Updated', at: e.created_at })).filter((e, i, a) => i === 0 || a[i - 1].label !== e.label);
    return { reference: row.reference, role: job.title, roleSlug: job.slug, status: s.label, body: s.body, submittedAt: row.submitted_at, withdrawnAt: row.withdrawn_at, canWithdraw: canWithdraw(row.status), timeline, privacyContact: this.privacyContact() };
  }
  async withdraw(token: unknown) {
    const row = await this.appByToken(token); if (row.status === 'withdrawn') return this.status(token); if (!canWithdraw(row.status)) throw new ApiError('CANNOT_WITHDRAW', 409);
    const now = Date.now(); const email = await this.dec(row.email_enc); const job = this.jobRowById(row.job_id);
    const body = email ? await this.enc(JSON.stringify(this.renderEmail('withdrawn', { name: row.preferred_name, role: job.title, reference: row.reference, statusUrl: '' }))) : null;
    this.store.atomic(() => {
      this.store.run("UPDATE op_apps SET status='withdrawn',withdrawn_at=?,retention_at=?,updated_at=? WHERE id=?", now, now + 30 * DAY, now, row.id);
      this.store.run('UPDATE op_app_files SET retention_at=? WHERE app_id=?', now + 30 * DAY, row.id);
      const ev = this.event(row.id, 'applicant', 'withdrawn', row.status, 'withdrawn');
      if (body) this.store.run('INSERT OR IGNORE INTO op_email_deliveries(id,app_id,template,recipient_enc,payload_enc,status,attempts,dedupe_key,next_at,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,?)', crypto.randomUUID(), row.id, 'withdrawn', row.email_enc, body, 'queued', `${row.id}:withdrawn:${ev}`, now, now, now);
    });
    return this.status(token);
  }
  /** Re-send a status link. Always answers the same way so it can't be used to discover applicants. */
  async requestLink(data: Record<string, unknown>) {
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase().slice(0, 254) : ''; const ref = typeof data.reference === 'string' ? data.reference.trim().toUpperCase().slice(0, 20) : '';
    if (!EMAIL_RE.test(email) || !/^OP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(ref)) return { ok: true };
    const row = this.store.one<AppRow>("SELECT * FROM op_apps WHERE reference=? AND email_hash=? AND status<>'draft' AND deleted_at IS NULL", ref, await this.emailHash(email)); if (!row) return { ok: true };
    const token = await this.mintStatusToken(row.id); const now = Date.now(); const job = this.jobRowById(row.job_id);
    const ev = this.event(row.id, 'applicant', 'status_link_requested', null, null);
    this.store.run('INSERT OR IGNORE INTO op_email_deliveries(id,app_id,template,recipient_enc,payload_enc,status,attempts,dedupe_key,next_at,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,?)', crypto.randomUUID(), row.id, 'status_link', row.email_enc, await this.enc(JSON.stringify(this.renderEmail('status_link', { name: row.preferred_name, role: job.title, reference: row.reference, statusUrl: this.statusUrl(token) }))), 'queued', `${row.id}:status_link:${ev}`, now, now, now);
    return { ok: true };
  }

  // ---------- email ----------
  /** Plain-text + HTML templates. Applicant-impacting templates other than receipts are only sent after a human confirms. */
  renderEmail(template: string, v: { name: string; role: string; reference: string; statusUrl: string; message?: string }): { subject: string; text: string; html: string } {
    const hi = v.name ? `Hi ${v.name},` : 'Hi,'; const sign = '\n\n— The ObjectPad hiring team\nobjectpad.fun/apply';
    const status = v.statusUrl ? `\n\nCheck your application status (private link, valid 60 days):\n${v.statusUrl}` : '';
    const extra = v.message ? `\n\n${v.message}` : '';
    const map: Record<string, [string, string]> = {
      received: [`We received your application — ${v.reference}`, `${hi}\n\nThanks for applying for ${v.role} at ObjectPad. Your application ${v.reference} is stored securely and a member of the hiring team will review it. We read every application; timing depends on volume and the role.${status}\n\nYou can withdraw at any time from that page. Applying never requires buying or holding a token.`],
      status_link: [`Your ObjectPad application link — ${v.reference}`, `${hi}\n\nHere is a fresh private link for application ${v.reference} (${v.role}). Older links stop working.${status}`],
      requested_material: [`More material requested — ${v.reference}`, `${hi}\n\nThe team reviewing your application for ${v.role} would like a little more from you.${extra}${status}`],
      interview: [`Next step: interview — ${v.reference}`, `${hi}\n\nThanks for your application for ${v.role}. We'd like to talk.${extra}${status}`],
      withdrawn: [`Application withdrawn — ${v.reference}`, `${hi}\n\nYour application ${v.reference} for ${v.role} has been withdrawn. Its files will be deleted within 30 days. You're welcome to apply again in future.`],
      rejected: [`Your ObjectPad application — ${v.reference}`, `${hi}\n\nThank you for applying for ${v.role}. After review, we won't be moving forward with this application right now.${extra}\n\nThis was a decision made by a person on our team. You're welcome to apply for future roles.`],
      internal_new: [`New application · ${v.role} · ${v.reference}`, `A new application was submitted for ${v.role} (${v.reference}).\n\nReview it in the protected dashboard (sign-in required):\n${v.statusUrl}\n\nNo applicant details are included in this email.`],
    };
    const [subject, body] = map[template] ?? map.received; const text = body + (template === 'internal_new' ? '' : sign);
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const html = `<!doctype html><html lang="en"><body style="margin:0;background:#ECEEF1;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0C0D10"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:28px;border:1px solid #DADDE3"><p style="margin:0 0 18px;font:700 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#6A6E78">OBJECTPAD · HIRING</p>${esc(text).split('\n\n').map(p => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${p.replace(/\n/g, '<br>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0C0D10;font-weight:700">$1</a>')}</p>`).join('')}</div></body></html>`;
    return { subject, text, html };
  }
  private emailConfigured(): boolean { return Boolean((this.runtime.env.RESEND_API_KEY ?? '').trim() && EMAIL_RE.test((this.runtime.env.HIRING_FROM_EMAIL ?? '').replace(/^.*<|>$/g, '').trim())); }
  /** Delivers queued email with retries/backoff. Each row is sent at most once (provider idempotency key = dedupe key). */
  async deliver(limit = 10): Promise<number> {
    const now = Date.now(); const rows = this.store.all<DeliveryRow>("SELECT * FROM op_email_deliveries WHERE status IN ('queued','retry','not_configured') AND next_at<=? ORDER BY created_at ASC LIMIT ?", now, limit);
    if (!rows.length) return 0;
    if (!this.emailConfigured()) { for (const r of rows) if (r.status !== 'not_configured') this.store.run("UPDATE op_email_deliveries SET status='not_configured',last_error='Email provider not configured (RESEND_API_KEY / HIRING_FROM_EMAIL)',updated_at=? WHERE id=?", now, r.id); return 0; }
    let sent = 0;
    for (const r of rows) {
      const claimed = this.store.one<{ n: number }>("SELECT COUNT(*) AS n FROM op_email_deliveries WHERE id=? AND status IN ('queued','retry','not_configured')", r.id); if (!claimed?.n) continue;
      this.store.run("UPDATE op_email_deliveries SET status='sending',attempts=attempts+1,updated_at=? WHERE id=?", now, r.id);
      try {
        const to = await this.dec(r.recipient_enc); const payload = r.payload_enc ? JSON.parse(await this.dec(r.payload_enc)) as { subject: string; text: string; html: string } : null; if (!to || !payload) throw new Error('payload_missing');
        const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${this.runtime.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json', 'Idempotency-Key': r.dedupe_key.slice(0, 256) }, body: JSON.stringify({ from: this.runtime.env.HIRING_FROM_EMAIL!.trim(), to: [to], subject: payload.subject, text: payload.text, html: payload.html, ...(this.privacyContact() ? { reply_to: this.privacyContact() } : {}) }), signal: AbortSignal.timeout(12_000) });
        const out = await res.json().catch(() => ({})) as { id?: string; message?: string };
        if (!res.ok) throw new Error(`provider_${res.status}:${String(out.message ?? '').slice(0, 120)}`);
        this.store.run("UPDATE op_email_deliveries SET status='sent',provider_id=?,payload_enc=NULL,last_error='',updated_at=? WHERE id=?", String(out.id ?? '').slice(0, 80), Date.now(), r.id); sent++;
      } catch (error) {
        const attempts = r.attempts + 1; const msg = (error instanceof Error ? error.message : 'send_failed').replace(/[^\w:. -]/g, '').slice(0, 160);
        this.store.run('UPDATE op_email_deliveries SET status=?,last_error=?,next_at=?,payload_enc=CASE WHEN ?>=6 THEN NULL ELSE payload_enc END,updated_at=? WHERE id=?', attempts >= 6 ? 'failed' : 'retry', msg, Date.now() + Math.min(6 * 3_600_000, 60_000 * 2 ** attempts), attempts, Date.now(), r.id);
      }
    }
    return sent;
  }
  hasPendingEmail(): boolean { return this.emailConfigured() && Boolean(this.store.one("SELECT id FROM op_email_deliveries WHERE status IN ('queued','retry','not_configured') LIMIT 1")); }
  /** Retention: purge expired applications and files; clear old test data and abandoned drafts. */
  async maintenance(): Promise<void> {
    const now = Date.now();
    const expired = this.store.all<{ id: string }>("SELECT id FROM op_apps WHERE deleted_at IS NULL AND ((retention_at IS NOT NULL AND retention_at<?) OR (status='draft' AND updated_at<?) OR (is_test=1 AND created_at<?)) LIMIT 50", now, now - 30 * DAY, now - 3 * DAY);
    for (const a of expired) await this.purge(a.id, 'system', 'retention');
    for (const f of this.store.all<FileRow>("SELECT * FROM op_app_files WHERE retention_at IS NOT NULL AND retention_at<? AND scan_status<>'deleted' LIMIT 50", now)) await this.dropFile(f);
    this.store.run('DELETE FROM op_app_tokens WHERE expires<?', now - DAY);
  }
  private async purge(appId: string, actor: string, reason: string): Promise<void> {
    for (const f of this.store.all<FileRow>('SELECT * FROM op_app_files WHERE app_id=?', appId)) await this.dropFile(f);
    this.store.atomic(() => {
      for (const t of ['op_app_answers', 'op_app_links', 'op_app_notes', 'op_app_scores', 'op_app_consents', 'op_app_tokens']) this.store.run(`DELETE FROM ${t} WHERE app_id=?`, appId);
      this.store.run("UPDATE op_email_deliveries SET recipient_enc='',payload_enc=NULL WHERE app_id=?", appId);
      this.store.run("UPDATE op_apps SET preferred_name='[deleted]',email_enc='',email_hash='',summary='',availability='',start_date='',country='',timezone='',tags='[]',deleted_at=?,updated_at=? WHERE id=?", Date.now(), Date.now(), appId);
      this.event(appId, actor, 'deleted', null, null, reason);
    });
  }

  // ---------- staff ----------
  staffRole(viewer: string): StaffRole | null {
    const list = (v: string | undefined) => (v ?? '').split(',').map(x => x.trim()).filter(Boolean);
    if (list(this.runtime.env.OBJECTPAD_OPERATOR_DIDS).includes(viewer) || list(this.runtime.env.HIRING_ADMIN_DIDS).includes(viewer)) return 'admin';
    if (list(this.runtime.env.HIRING_REVIEWER_DIDS).includes(viewer)) return 'reviewer'; return null;
  }
  private staffList() { const ids = new Set([...(this.runtime.env.OBJECTPAD_OPERATOR_DIDS ?? '').split(','), ...(this.runtime.env.HIRING_ADMIN_DIDS ?? '').split(','), ...(this.runtime.env.HIRING_REVIEWER_DIDS ?? '').split(',')].map(x => x.trim()).filter(Boolean)); return [...ids].map(id => ({ id, label: `Staff ${id.slice(-6)}` })); }
  private actor(viewer: string): string { return `staff:${viewer.slice(-10)}`; }
  private requireAdmin(role: StaffRole): void { if (role !== 'admin') throw new ApiError('FORBIDDEN', 403); }
  private async staffAudit(viewer: string, target: string, event: string, detail = ''): Promise<void> { await this.store.audit(await sha256(`apply:${viewer}`), `apply:${target}`, event, detail.slice(0, 300)); }
  private appRow(publicId: string): AppRow { const r = this.store.one<AppRow>('SELECT * FROM op_apps WHERE public_id=? AND deleted_at IS NULL', publicId); if (!r || r.status === 'draft') throw new ApiError('NOT_FOUND', 404); return r; }

  /** Filtered, paginated list. Search by name (substring), exact email (hashed) or reference. */
  async list(q: URLSearchParams) {
    const where: string[] = ["a.status<>'draft'", 'a.deleted_at IS NULL']; const args: (string | number)[] = [];
    const str = (k: string, max = 80) => (q.get(k) ?? '').trim().slice(0, max);
    const search = str('q'); if (search) { if (/^OP-/i.test(search)) { where.push('a.reference=?'); args.push(search.toUpperCase()); } else if (search.includes('@')) { where.push('a.email_hash=?'); args.push(await this.emailHash(search)); } else { where.push('a.preferred_name LIKE ?'); args.push(`%${search.replace(/[%_]/g, '')}%`); } }
    const role = str('role'); if (role) { where.push('j.slug=?'); args.push(role); }
    const status = str('status'); if (status && (APPLICATION_STATUSES as readonly string[]).includes(status)) { where.push('a.status=?'); args.push(status); } else if (!status) where.push("a.status NOT IN ('archived')");
    const mode = str('workMode'); if (mode) { where.push('a.work_mode=?'); args.push(mode); }
    const tz = str('timezone'); if (tz) { where.push('a.timezone LIKE ?'); args.push(`%${tz.replace(/[%_]/g, '')}%`); }
    const source = str('source'); if (source) { where.push('a.source=?'); args.push(source); }
    const campaign = str('campaign'); if (campaign) { where.push('a.campaign=?'); args.push(campaign); }
    const assigned = str('assigned'); if (assigned === 'none') where.push('a.assigned_reviewer IS NULL'); else if (assigned) { where.push('a.assigned_reviewer=?'); args.push(assigned); }
    const platform = str('platform'); if (platform) { where.push("EXISTS (SELECT 1 FROM op_app_answers x WHERE x.app_id=a.id AND x.answers LIKE ?)"); args.push(`%"${platform.replace(/[%_"]/g, '')}"%`); }
    const lang = str('language'); if (lang) { where.push("EXISTS (SELECT 1 FROM op_app_answers x WHERE x.app_id=a.id AND json_extract(x.answers,'$.languages') LIKE ?)"); args.push(`%${lang.replace(/[%_]/g, '')}%`); }
    const tag = str('tag'); if (tag) { where.push('a.tags LIKE ?'); args.push(`%"${tag.replace(/[%_"]/g, '')}"%`); }
    const from = Number(q.get('from')); if (from > 0) { where.push('a.submitted_at>=?'); args.push(from); } const to = Number(q.get('to')); if (to > 0) { where.push('a.submitted_at<=?'); args.push(to); }
    if (q.get('tests') !== '1') where.push('a.is_test=0');
    const page = Math.max(0, Math.floor(Number(q.get('page')) || 0)); const size = 25; const sql = where.join(' AND ');
    const total = this.store.one<{ n: number }>(`SELECT COUNT(*) AS n FROM op_apps a JOIN op_jobs j ON j.id=a.job_id WHERE ${sql}`, ...args)?.n ?? 0;
    const rows = this.store.all<AppRow & { job_title: string; job_slug: string; dupes: number }>(`SELECT a.*, j.title AS job_title, j.slug AS job_slug, (SELECT COUNT(*) FROM op_apps b WHERE b.email_hash=a.email_hash AND b.id<>a.id AND b.status<>'draft' AND a.email_hash<>'') AS dupes FROM op_apps a JOIN op_jobs j ON j.id=a.job_id WHERE ${sql} ORDER BY a.submitted_at DESC LIMIT ? OFFSET ?`, ...args, size, page * size);
    return { total, page, pageSize: size, items: rows.map(r => ({ id: r.public_id, reference: r.reference, name: r.preferred_name, role: r.job_title, roleSlug: r.job_slug, status: r.status, workMode: r.work_mode, timezone: r.timezone, country: r.country, source: r.source, campaign: r.campaign, assigned: r.assigned_reviewer, tags: JSON.parse(r.tags) as string[], submittedAt: r.submitted_at, duplicates: r.dupes, isTest: r.is_test === 1 })) };
  }
  overview(role: StaffRole) {
    const byStatus = this.store.all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM op_apps WHERE status<>'draft' AND deleted_at IS NULL AND is_test=0 GROUP BY status");
    const byRole = this.store.all<{ slug: string; title: string; n: number }>("SELECT j.slug, j.title, COUNT(a.id) AS n FROM op_jobs j LEFT JOIN op_apps a ON a.job_id=j.id AND a.status<>'draft' AND a.deleted_at IS NULL AND a.is_test=0 GROUP BY j.id ORDER BY j.sort_order");
    return { role, staff: this.staffList(), byStatus, byRole, jobs: this.store.all<JobRow>('SELECT * FROM op_jobs ORDER BY sort_order ASC').map(r => ({ ...this.job(r), status: r.status, id: r.id })), emailConfigured: this.emailConfigured(), notificationInbox: EMAIL_RE.test((this.runtime.env.HIRING_NOTIFICATION_EMAIL ?? '').trim()), retentionDays: this.retentionDays() };
  }
  metrics() {
    const since = Math.floor(Date.now() / DAY) - 30; const m = (event: string) => this.store.all<{ dim: string; n: number }>('SELECT dim, SUM(count) AS n FROM op_apply_metrics WHERE event=? AND day>=? GROUP BY dim ORDER BY n DESC LIMIT 20', event, since);
    const sum = (event: string) => this.store.one<{ n: number | null }>('SELECT SUM(count) AS n FROM op_apply_metrics WHERE event=? AND day>=?', event, since)?.n ?? 0;
    const live = "status<>'draft' AND deleted_at IS NULL AND is_test=0";
    const aging = this.store.one<{ d: number | null }>(`SELECT AVG((? - submitted_at) / 86400000.0) AS d FROM op_apps WHERE ${live} AND status IN ('submitted','received')`, Date.now())?.d ?? null;
    return {
      windowDays: 30, funnel: { views: sum('apply_view'), roleViews: sum('role_view'), starts: sum('application_start'), submits: sum('application_submit') },
      startsByRole: m('application_start'), submitsByRole: m('application_submit'), viewSources: m('view_source'), validationErrors: m('validation_error'), uploads: { ok: sum('upload_ok'), error: sum('upload_error') },
      sources: this.store.all(`SELECT source AS dim, COUNT(*) AS n FROM op_apps WHERE ${live} GROUP BY source ORDER BY n DESC LIMIT 12`),
      timezones: this.store.all(`SELECT timezone AS dim, COUNT(*) AS n FROM op_apps WHERE ${live} GROUP BY timezone ORDER BY n DESC LIMIT 12`),
      languages: this.store.all(`SELECT json_extract(x.answers,'$.languages') AS dim, COUNT(*) AS n FROM op_apps a JOIN op_app_answers x ON x.app_id=a.id WHERE a.${live.replace(/ AND /g, ' AND a.')} AND json_extract(x.answers,'$.languages')<>'' GROUP BY dim ORDER BY n DESC LIMIT 12`),
      avgDaysWaiting: aging === null ? null : Math.round(aging * 10) / 10,
    };
  }
  async detail(viewer: string, publicId: string) {
    const r = this.appRow(publicId); const job = this.jobRowById(r.job_id); const email = await this.dec(r.email_enc);
    await this.staffAudit(viewer, r.id, 'application_viewed');
    const notes = this.store.all<{ id: string; author: string; body: string; created_at: number }>('SELECT id,author,body,created_at FROM op_app_notes WHERE app_id=? ORDER BY created_at ASC', r.id);
    const scores = this.store.all<{ id: string; reviewer: string; rubric_version: number; scores: string; recommendation: string; created_at: number }>('SELECT * FROM op_app_scores WHERE app_id=? ORDER BY created_at ASC', r.id).map(s => ({ ...s, scores: JSON.parse(s.scores) as Record<string, number> }));
    const events = this.store.all<{ actor: string; event: string; from_status: string | null; to_status: string | null; detail: string; created_at: number }>('SELECT actor,event,from_status,to_status,detail,created_at FROM op_app_events WHERE app_id=? ORDER BY created_at ASC', r.id);
    const deliveries = this.store.all<{ id: string; template: string; status: string; attempts: number; last_error: string; created_at: number; updated_at: number }>('SELECT id,template,status,attempts,last_error,created_at,updated_at FROM op_email_deliveries WHERE app_id=? ORDER BY created_at ASC', r.id);
    const dupes = r.email_hash ? this.store.all<{ public_id: string; reference: string; status: string; submitted_at: number; title: string }>("SELECT a.public_id,a.reference,a.status,a.submitted_at,j.title FROM op_apps a JOIN op_jobs j ON j.id=a.job_id WHERE a.email_hash=? AND a.id<>? AND a.status<>'draft' AND a.deleted_at IS NULL", r.email_hash, r.id) : [];
    return {
      id: r.public_id, reference: r.reference, status: r.status, statusLabel: STATUS_LABEL[r.status], next: APPLICATION_STATUSES.filter(s => canTransition(r.status, s)), job: this.job(job),
      applicant: { name: r.preferred_name, email, country: r.country, timezone: r.timezone, workMode: r.work_mode, availability: r.availability, startDate: r.start_date, summary: r.summary },
      answers: this.answers(r.id), links: this.store.all<{ kind: string; url: string }>('SELECT kind,url FROM op_app_links WHERE app_id=?', r.id), files: this.files(r.id).filter(f => f.scan_status !== 'awaiting_upload').map(f => this.publicFile(f)),
      attribution: { source: r.source, campaign: r.campaign, utm: JSON.parse(r.utm) as Record<string, string> }, assigned: r.assigned_reviewer, tags: JSON.parse(r.tags) as string[], isTest: r.is_test === 1,
      submittedAt: r.submitted_at, withdrawnAt: r.withdrawn_at, retentionAt: r.retention_at, notes, scores, events, deliveries, duplicates: dupes,
      consent: this.store.one('SELECT consent_version,policy_revision,created_at FROM op_app_consents WHERE app_id=? ORDER BY created_at DESC LIMIT 1', r.id) ?? null,
    };
  }
  async download(viewer: string, publicId: string, fileId: string): Promise<Response> {
    const r = this.appRow(publicId); const f = this.store.one<FileRow>('SELECT * FROM op_app_files WHERE id=? AND app_id=?', fileId, r.id);
    if (!f?.object_key || f.scan_status !== 'clean') throw new ApiError('FILE_UNAVAILABLE', 404); const file = await this.runtime.privateBucket.get(f.object_key); if (!file) throw new ApiError('FILE_UNAVAILABLE', 404);
    await this.staffAudit(viewer, r.id, 'file_downloaded', f.purpose);
    return new Response(file.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${r.reference}-${f.filename}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  }
  async assign(viewer: string, publicId: string, data: Record<string, unknown>) {
    const r = this.appRow(publicId); const reviewer = data.reviewer === null ? null : typeof data.reviewer === 'string' && this.staffList().some(s => s.id === data.reviewer) ? data.reviewer : undefined; if (reviewer === undefined) throw new ApiError('REVIEWER_INVALID');
    this.store.run('UPDATE op_apps SET assigned_reviewer=?,updated_at=? WHERE id=?', reviewer, Date.now(), r.id); this.event(r.id, this.actor(viewer), 'assigned', null, null, reviewer ? `Staff ${reviewer.slice(-6)}` : 'unassigned'); await this.staffAudit(viewer, r.id, 'assigned');
    return this.detail(viewer, publicId);
  }
  emailPreview(publicId: string, data: Record<string, unknown>) {
    const r = this.appRow(publicId); const to = APPLICATION_STATUSES.find(s => s === data.to); const job = this.jobRowById(r.job_id);
    const template = to === 'rejected' ? 'rejected' : to === 'interview' ? 'interview' : to === 'requested_material' ? 'requested_material' : null; if (!template) return { template: null };
    const message = typeof data.message === 'string' ? data.message.slice(0, 1500) : '';
    return { template, ...this.renderEmail(template, { name: r.preferred_name, role: job.title, reference: r.reference, statusUrl: '[private status link]', message }) };
  }
  /** Reviewer status change. Enforces the transition matrix; applicant email only when a human ticks "send". */
  async transition(viewer: string, publicId: string, data: Record<string, unknown>) {
    const r = this.appRow(publicId); const to = APPLICATION_STATUSES.find(s => s === data.to); if (!to || !canTransition(r.status, to)) throw new ApiError('TRANSITION_INVALID', 409);
    const send = data.sendEmail === true; const message = typeof data.message === 'string' ? data.message.trim().slice(0, 1500) : ''; const now = Date.now(); const job = this.jobRowById(r.job_id);
    const template = to === 'rejected' ? 'rejected' : to === 'interview' ? 'interview' : to === 'requested_material' ? 'requested_material' : null;
    let payload: string | null = null; let token = '';
    if (send && template && r.email_enc) { token = to === 'rejected' ? '' : await this.mintStatusToken(r.id); payload = await this.enc(JSON.stringify(this.renderEmail(template, { name: r.preferred_name, role: job.title, reference: r.reference, statusUrl: token ? this.statusUrl(token) : '', message }))); }
    this.store.atomic(() => {
      const cur = this.store.one<{ status: ApplicationStatus }>('SELECT status FROM op_apps WHERE id=?', r.id); if (!cur || !canTransition(cur.status, to)) throw new ApiError('TRANSITION_INVALID', 409);
      this.store.run('UPDATE op_apps SET status=?,retention_at=CASE WHEN ?=\'archived\' THEN MIN(COALESCE(retention_at,?),?) ELSE retention_at END,updated_at=? WHERE id=?', to, to, now + this.retentionDays() * DAY, now + this.retentionDays() * DAY, now, r.id);
      const ev = this.event(r.id, this.actor(viewer), 'status_changed', cur.status, to, send && template ? `email:${template}` : '');
      if (payload) this.store.run('INSERT OR IGNORE INTO op_email_deliveries(id,app_id,template,recipient_enc,payload_enc,status,attempts,dedupe_key,next_at,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?,?,?)', crypto.randomUUID(), r.id, template!, r.email_enc, payload, 'queued', `${r.id}:${template}:${ev}`, now, now, now);
    });
    await this.staffAudit(viewer, r.id, 'status_changed', to); return this.detail(viewer, publicId);
  }
  async note(viewer: string, publicId: string, data: Record<string, unknown>) {
    const r = this.appRow(publicId); const body = typeof data.body === 'string' ? data.body.normalize('NFC').trim() : ''; if (body.length < 1 || body.length > 2000) throw new ApiError('NOTE_INVALID');
    this.store.run('INSERT INTO op_app_notes(id,app_id,author,body,created_at) VALUES (?,?,?,?,?)', crypto.randomUUID(), r.id, `Staff ${viewer.slice(-6)}`, body, Date.now()); this.event(r.id, this.actor(viewer), 'note_added', null, null); await this.staffAudit(viewer, r.id, 'note_added');
    return this.detail(viewer, publicId);
  }
  async score(viewer: string, publicId: string, data: Record<string, unknown>) {
    const r = this.appRow(publicId); const kind = this.jobRowById(r.job_id).kind; const cats = RUBRIC[kind];
    const raw = (data.scores && typeof data.scores === 'object' ? data.scores : {}) as Record<string, unknown>; const scores: Record<string, number> = {};
    for (const c of cats) { const v = Number(raw[c]); if (!Number.isInteger(v) || v < 1 || v > 4) throw new ApiError('SCORE_INVALID'); scores[c] = v; }
    const rec = ['strong_yes', 'yes', 'no', 'strong_no'].find(x => x === data.recommendation); if (!rec) throw new ApiError('SCORE_INVALID');
    this.store.run('INSERT INTO op_app_scores(id,app_id,reviewer,rubric_version,scores,recommendation,created_at) VALUES (?,?,?,?,?,?,?)', crypto.randomUUID(), r.id, `Staff ${viewer.slice(-6)}`, RUBRIC_VERSION, JSON.stringify(scores), rec, Date.now());
    this.event(r.id, this.actor(viewer), 'scored', null, null, rec); await this.staffAudit(viewer, r.id, 'scored'); return this.detail(viewer, publicId);
  }
  async tags(viewer: string, publicId: string, data: Record<string, unknown>) {
    const r = this.appRow(publicId); const tags = (Array.isArray(data.tags) ? data.tags : []).filter((t): t is string => typeof t === 'string').map(t => t.trim().toLowerCase().slice(0, 24)).filter(t => /^[a-z0-9 _-]{1,24}$/.test(t)).slice(0, 12);
    this.store.run('UPDATE op_apps SET tags=?,updated_at=? WHERE id=?', JSON.stringify([...new Set(tags)]), Date.now(), r.id); this.event(r.id, this.actor(viewer), 'tags_updated', null, null); return this.detail(viewer, publicId);
  }
  async bulk(viewer: string, data: Record<string, unknown>) {
    const ids = (Array.isArray(data.ids) ? data.ids : []).filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)).slice(0, 100); if (!ids.length || data.confirm !== true) throw new ApiError('INVALID_INPUT');
    let changed = 0; const skipped: string[] = [];
    for (const id of ids) { try { if (data.action === 'assign') await this.assign(viewer, id, { reviewer: data.value ?? null }); else if (data.action === 'status') await this.transition(viewer, id, { to: data.value, sendEmail: false }); else throw new ApiError('INVALID_INPUT'); changed++; } catch { skipped.push(id); } }
    return { changed, skipped };
  }
  async purgeByStaff(viewer: string, role: StaffRole, publicId: string) { this.requireAdmin(role); const r = this.appRow(publicId); await this.purge(r.id, this.actor(viewer), 'staff_request'); await this.staffAudit(viewer, r.id, 'application_deleted'); return { ok: true }; }
  /** Admin-only, audited CSV export with selected columns and injection-safe cells. */
  async exportCsv(viewer: string, role: StaffRole, q: URLSearchParams): Promise<Response> {
    this.requireAdmin(role);
    const allowed = ['reference', 'submittedAt', 'role', 'status', 'name', 'email', 'country', 'timezone', 'workMode', 'availability', 'startDate', 'source', 'campaign', 'links', 'summary', 'assigned', 'tags'] as const;
    const cols = (q.get('fields') ?? 'reference,submittedAt,role,status,name,email,timezone,workMode,source').split(',').filter((c): c is typeof allowed[number] => (allowed as readonly string[]).includes(c));
    if (!cols.length) throw new ApiError('INVALID_INPUT');
    const all: Record<string, unknown>[] = []; const page = new URLSearchParams(q); let n = 0;
    for (;;) { page.set('page', String(n)); const res = await this.list(page); for (const it of res.items) { const row = this.store.one<AppRow>('SELECT * FROM op_apps WHERE public_id=?', it.id)!; all.push({ ...it, email: cols.includes('email') ? await this.dec(row.email_enc) : '', availability: row.availability, startDate: row.start_date, summary: row.summary, links: this.store.all<{ url: string }>('SELECT url FROM op_app_links WHERE app_id=?', row.id).map(l => l.url), submittedAt: it.submittedAt ? new Date(it.submittedAt).toISOString() : '' }); } if ((n + 1) * res.pageSize >= res.total || n > 200) break; n++; }
    await this.staffAudit(viewer, 'export', 'applications_exported', `${all.length} rows · ${cols.join('|')}`);
    return new Response([cols.join(','), ...all.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="objectpad-applications-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  }
  async savedFilters(viewer: string) { return this.store.all('SELECT id,name,query,created_at FROM op_apply_saved_filters WHERE owner_hash=? ORDER BY created_at DESC', await sha256(`apply:${viewer}`)); }
  async saveFilter(viewer: string, data: Record<string, unknown>) {
    const name = typeof data.name === 'string' ? data.name.trim().slice(0, 40) : ''; const query = typeof data.query === 'string' ? data.query.slice(0, 600) : ''; if (!name || /[<>]/.test(name)) throw new ApiError('INVALID_INPUT');
    this.store.run('INSERT INTO op_apply_saved_filters(id,owner_hash,name,query,created_at) VALUES (?,?,?,?,?)', crypto.randomUUID(), await sha256(`apply:${viewer}`), name, query, Date.now()); return this.savedFilters(viewer);
  }
  async deleteFilter(viewer: string, id: string) { this.store.run('DELETE FROM op_apply_saved_filters WHERE id=? AND owner_hash=?', id, await sha256(`apply:${viewer}`)); return this.savedFilters(viewer); }
  deliveries() { return this.store.all('SELECT d.id,d.template,d.status,d.attempts,d.last_error,d.created_at,d.updated_at,a.reference FROM op_email_deliveries d LEFT JOIN op_apps a ON a.id=d.app_id ORDER BY d.created_at DESC LIMIT 100'); }
  retryDelivery(role: StaffRole, id: string) { this.requireAdmin(role); this.store.run("UPDATE op_email_deliveries SET status='retry',next_at=? WHERE id=? AND status IN ('failed','not_configured','retry') AND payload_enc IS NOT NULL", Date.now(), id); return { ok: true }; }

  // ---------- job editor (admin) ----------
  async saveJob(viewer: string, role: StaffRole, id: string | null, data: Record<string, unknown>) {
    this.requireAdmin(role);
    const s = (k: string, min: number, max: number): string => { const v = typeof data[k] === 'string' ? (data[k] as string).normalize('NFC').trim() : ''; if (v.length < min || v.length > max || /[<>]/.test(v)) throw new ApiError(`${k.toUpperCase()}_INVALID`); return v; };
    const l = (k: string, maxItems = 12): string[] => { const v = data[k]; if (!Array.isArray(v) || v.length > maxItems) throw new ApiError(`${k.toUpperCase()}_INVALID`); return v.map(x => typeof x === 'string' ? x.trim() : '').filter(x => x.length >= 2 && x.length <= 200 && !/[<>]/.test(x)); };
    const slug = s('slug', 3, 64); if (!SLUG.test(slug)) throw new ApiError('SLUG_INVALID');
    const team = JOB_TEAMS.find(t => t === data.team); const kind = ROLE_KINDS.find(k => k === data.kind); const locationMode = LOCATION_MODES.find(m => m === data.locationMode); if (!team || !kind || !locationMode) throw new ApiError('INVALID_INPUT');
    const c = (data.compensation && typeof data.compensation === 'object' ? data.compensation : {}) as Record<string, unknown>;
    const num = (v: unknown): number | null => v === null || v === '' || v === undefined ? null : Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 10_000_000 ? Math.round(Number(v)) : (() => { throw new ApiError('COMPENSATION_INVALID'); })();
    const interval = COMP_INTERVALS.find(i => i === c.interval) ?? 'none'; const min = num(c.min); const max = num(c.max); if (min && max && max < min) throw new ApiError('COMPENSATION_INVALID');
    const currency = typeof c.currency === 'string' && /^[A-Z]{3}$/.test(c.currency) ? c.currency : 'USD'; const display = typeof c.display === 'string' ? c.display.trim().slice(0, 120).replace(/[<>]/g, '') : '';
    if (/guarantee/i.test(display)) throw new ApiError('COMPENSATION_GUARANTEE');
    const payload: JobPayload = { lead: data.lead === true, locationMode, locations: l('locations', 6), timezones: l('timezones', 6), engagementType: s('engagementType', 2, 80), compensation: { currency, min, max, interval, display },
      summary: s('summary', 10, 400), description: s('description', 20, 3000), responsibilities: l('responsibilities'), qualifications: l('qualifications'), niceToHaves: l('niceToHaves'), experience: s('experience', 2, 120), openings: s('openings', 2, 120), requireResume: data.requireResume === true, skills: l('skills', 16) };
    const title = s('title', 3, 100); const now = Date.now(); const closesAt = num(data.closesAt);
    const clash = this.store.one<{ id: string }>('SELECT id FROM op_jobs WHERE slug=?', slug); if (clash && clash.id !== id) throw new ApiError('SLUG_TAKEN', 409);
    if (id) { if (!this.store.one('SELECT id FROM op_jobs WHERE id=?', id)) throw new ApiError('NOT_FOUND', 404); this.store.run('UPDATE op_jobs SET slug=?,title=?,team=?,kind=?,payload=?,closes_at=?,updated_at=? WHERE id=?', slug, title, team, kind, JSON.stringify(payload), closesAt, now, id); }
    else { id = crypto.randomUUID(); const order = (this.store.one<{ n: number | null }>('SELECT MAX(sort_order) AS n FROM op_jobs')?.n ?? -1) + 1; this.store.run('INSERT INTO op_jobs(id,public_id,slug,title,team,kind,status,sort_order,payload,published_at,closes_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, crypto.randomUUID(), slug, title, team, kind, 'draft', order, JSON.stringify(payload), null, closesAt, now, now); }
    await this.staffAudit(viewer, id, 'job_saved', slug); return this.overview(role);
  }
  async setJobStatus(viewer: string, role: StaffRole, id: string, data: Record<string, unknown>) {
    this.requireAdmin(role); const status = JOB_STATUSES.find(s => s === data.status); if (!status) throw new ApiError('STATUS_INVALID');
    if (!this.store.one('SELECT id FROM op_jobs WHERE id=?', id)) throw new ApiError('NOT_FOUND', 404);
    this.store.run('UPDATE op_jobs SET status=?,published_at=CASE WHEN ?=\'published\' THEN COALESCE(published_at,?) ELSE published_at END,updated_at=? WHERE id=?', status, status, Date.now(), Date.now(), id);
    await this.staffAudit(viewer, id, `job_${status}`); return this.overview(role);
  }
  async reorderJobs(viewer: string, role: StaffRole, data: Record<string, unknown>) { this.requireAdmin(role); const ids = (Array.isArray(data.ids) ? data.ids : []).filter((v): v is string => typeof v === 'string').slice(0, 100); this.store.atomic(() => ids.forEach((id, i) => this.store.run('UPDATE op_jobs SET sort_order=? WHERE id=?', i, id))); await this.staffAudit(viewer, 'jobs', 'jobs_reordered'); return this.overview(role); }
}

export const RUBRIC_VERSION = 1;
export const RUBRIC: Record<RoleKind, string[]> = {
  technical: ['shipped_work', 'technical_depth', 'production_judgment', 'security', 'communication', 'ownership'],
  creator: ['hook_and_story', 'shooting', 'editing', 'consistency', 'platform_fluency', 'pitch'],
  producer: ['creator_management', 'editorial_taste', 'organisation', 'attribution', 'communication', 'pitch'],
};
