import { ApiError, safeHttpUrl, sha256 } from '../shared/security';
import { secureNonce } from '../shared/people';
import type { Store } from './store';
import type { Runtime } from './types';

/**
 * ObjectPad hiring: data-driven roles, private applications, and the HIRING_PAGE_ENABLED flag.
 * The flag lives in SQLite and can only be switched on by an operator once every readiness check passes
 * (no "[TBD" placeholders left, at least one open role, a privacy contact). An env value of 'false' forces it off.
 */
export const TEAMS = ['engineering', 'mobile', 'design', 'growth', 'other'] as const;
export const REMOTE = ['remote', 'hybrid', 'onsite', 'tbd'] as const;
export const ENGAGEMENT = ['full_time', 'contract', 'part_time', 'tbd'] as const;
export const ROLE_STATUS = ['draft', 'open', 'paused', 'closed'] as const;
export const APP_STATES = ['new', 'reviewing', 'shortlisted', 'declined', 'archived'] as const;
type Team = typeof TEAMS[number]; type Remote = typeof REMOTE[number]; type Engagement = typeof ENGAGEMENT[number]; type RoleStatus = typeof ROLE_STATUS[number]; type AppState = typeof APP_STATES[number];

export interface Role {
  id: string; slug: string; title: string; team: Team; location: string; remotePolicy: Remote; engagementType: Engagement;
  summary: string; responsibilities: string[]; requiredSkills: string[]; preferredSkills: string[];
  status: RoleStatus; sortOrder: number; publishedAt: number | null; createdAt: number; updatedAt: number;
}
interface RoleRow { id: string; slug: string; payload: string; status: RoleStatus; sort_order: number; published_at: number | null; created_at: number; updated_at: number; }
interface Faq { q: string; a: string; }
interface Settings { faq: Faq[]; privacyContact: string; }
interface AppRow { id: string; role_id: string; payload: string; state: AppState; notes: string; resume_key: string | null; resume_ticket_hash: string | null; resume_ticket_expires: number | null; created_at: number; updated_at: number; }
export interface Readiness { id: string; label: string; passed: boolean; detail: string; }

const EMAIL = /^[^\s@<>]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const X_HANDLE = /^@?[A-Za-z0-9_]{1,15}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const RESUME_MAX = 5 * 1024 * 1024;
const FORM_MIN_MS = 3_000; const FORM_MAX_MS = 3 * 3_600_000; const TICKET_MS = 30 * 60_000;
const placeholder = (s: string): boolean => /\[TBD/i.test(s);
const text = (value: unknown, min: number, max: number, code: string): string => {
  if (typeof value !== 'string') throw new ApiError(code); const v = value.normalize('NFC').trim();
  // eslint-disable-next-line no-control-regex
  if (v.length < min || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/u.test(v)) throw new ApiError(code); return v;
};
const optional = (value: unknown, max: number, code: string): string => value === undefined || value === null || value === '' ? '' : text(value, 0, max, code);
const list = (value: unknown, code: string): string[] => { if (!Array.isArray(value) || value.length > 12) throw new ApiError(code); return value.map(v => text(v, 2, 200, code)); };
const pick = <T extends string>(values: readonly T[], v: unknown, code: string): T => { const hit = values.find(x => x === v); if (!hit) throw new ApiError(code); return hit; };
const link = (value: unknown, code: string): string => { if (value === undefined || value === null || value === '') return ''; const safe = safeHttpUrl(typeof value === 'string' ? value.trim() : ''); if (!safe) throw new ApiError(code); return safe; };

const DEFAULT_SETTINGS: Settings = {
  privacyContact: '',
  faq: [
    { q: 'Is the work remote?', a: '[TBD — state the remote policy and any time-zone overlap you need.]' },
    { q: 'What does the process look like?', a: '[TBD — list the steps, e.g. intro call, paid work sample, team conversation.]' },
    { q: 'When will I hear back?', a: '[TBD — only state a response time you can keep.]' },
    { q: 'Contract or full-time?', a: '[TBD — explain which roles are contract, full-time or either.]' },
    { q: 'What happens to my application data?', a: 'Applications are stored in ObjectPad’s private database and can only be read by authenticated members of the hiring team. Nothing you send is ever shown publicly, and résumés are never published. You can ask us to delete your application at any time.' },
  ],
};
const TBD_LOCATION = '[TBD — location or remote regions]';
const SEED: Omit<Role, 'id' | 'status' | 'publishedAt' | 'createdAt' | 'updatedAt'>[] = [
  { slug: 'full-stack-engineer', title: 'Full-Stack Engineer', team: 'engineering', location: TBD_LOCATION, remotePolicy: 'tbd', engagementType: 'tbd', sortOrder: 0,
    summary: 'Own the path from a phone capture to a live onchain coin: the Workers + Durable Objects backend, the React web app, 3D reconstruction jobs and chain integration.',
    responsibilities: ['Ship features end to end across API, storage and web UI', 'Harden capture validation, uniqueness checks and launch safety', 'Keep the system observable, fast and honest about its state'],
    requiredSkills: ['Production TypeScript', 'HTTP APIs and SQL', 'A product you shipped end to end'], preferredSkills: ['Cloudflare Workers / Durable Objects', 'viem or other EVM tooling', 'three.js / WebGL'] },
  { slug: 'mobile-engineer', title: 'Mobile Engineer (iOS / Android)', team: 'mobile', location: TBD_LOCATION, remotePolicy: 'tbd', engagementType: 'tbd', sortOrder: 1,
    summary: 'Build the native capture apps: guided multi-angle camera flows, reliable uploads on bad networks, and a fast, native-feeling launch experience.',
    responsibilities: ['Own the Swift/SwiftUI and Kotlin/Compose apps', 'Build camera pipelines that work on real devices', 'Ship through App Store and Google Play review'],
    requiredSkills: ['Shipped native iOS or Android apps', 'Camera or media APIs', 'Offline-tolerant networking'], preferredSkills: ['Both platforms', 'AVFoundation / CameraX', 'On-device vision'] },
  { slug: 'product-designer', title: 'Product Designer', team: 'design', location: TBD_LOCATION, remotePolicy: 'tbd', engagementType: 'tbd', sortOrder: 2,
    summary: 'Shape how people capture, verify and launch real objects: the design system, capture UX, motion and the 3D presentation of every object.',
    responsibilities: ['Own flows from first scan to live coin', 'Evolve the design system across web and native', 'Prototype motion and 3D moments'],
    requiredSkills: ['A portfolio of shipped product work', 'Interaction and visual design', 'Comfort working directly in production'], preferredSkills: ['Motion design', '3D tools', 'Front-end code'] },
  { slug: 'growth-marketing', title: 'Growth & Marketing', team: 'growth', location: TBD_LOCATION, remotePolicy: 'tbd', engagementType: 'tbd', sortOrder: 3,
    summary: 'Tell the story of ObjectPad in public: social, creator partnerships, content and launches, measured by real usage.',
    responsibilities: ['Run social and launch campaigns', 'Build creator and community partnerships', 'Turn product updates into content'],
    requiredSkills: ['Grew an audience or product you can point to', 'Strong writing', 'Comfort with data'], preferredSkills: ['Crypto-native communities', 'Short-form video', 'Design tools'] },
];

export class HiringService {
  constructor(private readonly store: Store, private readonly runtime: Runtime) {
    const s = (q: string) => store.run(q);
    s('CREATE TABLE IF NOT EXISTS op_hiring_roles (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, status TEXT NOT NULL, sort_order INTEGER NOT NULL, published_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_hiring_settings (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    s('CREATE TABLE IF NOT EXISTS op_hiring_applications (id TEXT PRIMARY KEY, role_id TEXT NOT NULL, email_hash TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL, notes TEXT NOT NULL, resume_key TEXT, resume_ticket_hash TEXT, resume_ticket_expires INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    s('CREATE INDEX IF NOT EXISTS op_hiring_applications_email ON op_hiring_applications(email_hash, created_at)');
    s('CREATE TABLE IF NOT EXISTS op_hiring_form_tokens (hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, used_at INTEGER)');
    if (!store.one('SELECT id FROM op_hiring_settings WHERE id=1')) store.atomic(() => {
      store.run('INSERT INTO op_hiring_settings(id,enabled,payload,updated_at) VALUES (1,0,?,?)', JSON.stringify(DEFAULT_SETTINGS), Date.now());
      const now = Date.now(); for (const r of SEED) store.run('INSERT OR IGNORE INTO op_hiring_roles(id,slug,payload,status,sort_order,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', crypto.randomUUID(), r.slug, JSON.stringify(r), 'draft', r.sortOrder, null, now, now);
    });
  }

  private settingsRow() { const row = this.store.one<{ enabled: number; payload: string; updated_at: number }>('SELECT enabled,payload,updated_at FROM op_hiring_settings WHERE id=1'); return { flag: row?.enabled === 1, settings: row ? JSON.parse(row.payload) as Settings : DEFAULT_SETTINGS }; }
  /** HIRING_PAGE_ENABLED: the stored operator flag, unless the deployment forces it off. */
  enabled(): boolean { return this.runtime.env.HIRING_PAGE_ENABLED !== 'false' && this.settingsRow().flag; }
  private role(row: RoleRow): Role { const p = JSON.parse(row.payload) as Role; return { ...p, id: row.id, slug: row.slug, status: row.status, sortOrder: row.sort_order, publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private roles(): Role[] { return this.store.all<RoleRow>('SELECT * FROM op_hiring_roles ORDER BY sort_order ASC, created_at ASC').map(r => this.role(r)); }
  private roleText(r: Role): string { return [r.title, r.location, r.summary, ...r.responsibilities, ...r.requiredSkills, ...r.preferredSkills].join(' '); }

  readiness(): Readiness[] {
    const { settings } = this.settingsRow(); const roles = this.roles(); const open = roles.filter(r => r.status === 'open');
    const roleHoles = open.filter(r => placeholder(this.roleText(r)) || r.remotePolicy === 'tbd' || r.engagementType === 'tbd');
    const faqHoles = settings.faq.filter(f => placeholder(f.q) || placeholder(f.a));
    return [
      { id: 'open_role', label: 'At least one role is open', passed: open.length > 0, detail: open.length ? `${open.length} open` : 'Open a role once its details are final.' },
      { id: 'role_details', label: 'Open roles have final location, remote policy and engagement type', passed: open.length > 0 && roleHoles.length === 0, detail: roleHoles.length ? `Unfinished: ${roleHoles.map(r => r.title).join(', ')}` : 'No placeholders' },
      { id: 'faq', label: 'Every FAQ answer is written (no [TBD] left)', passed: faqHoles.length === 0, detail: faqHoles.length ? `${faqHoles.length} unanswered: ${faqHoles.map(f => f.q).join(' · ')}` : 'All answered' },
      { id: 'privacy', label: 'A privacy / deletion contact email is set', passed: EMAIL.test(settings.privacyContact), detail: settings.privacyContact || 'Missing' },
      { id: 'deployment', label: 'Deployment does not force the page off', passed: this.runtime.env.HIRING_PAGE_ENABLED !== 'false', detail: this.runtime.env.HIRING_PAGE_ENABLED === 'false' ? 'HIRING_PAGE_ENABLED=false on the server' : 'OK' },
    ];
  }

  /** Public page data. Visitors get nothing while the flag is off; operators get a labelled preview. */
  publicView(preview: boolean) {
    const enabled = this.enabled(); if (!enabled && !preview) return { enabled: false as const };
    const { settings } = this.settingsRow();
    const roles = this.roles().filter(r => r.status === 'open' || r.status === 'paused' || (preview && r.status === 'draft'));
    return { enabled, preview: !enabled, roles, faq: settings.faq, privacyContact: EMAIL.test(settings.privacyContact) ? settings.privacyContact : null };
  }

  /** One-time form token: submissions faster than a human (< 3 s) or replayed are rejected. */
  async formToken() {
    if (!this.enabled()) throw new ApiError('NOT_FOUND', 404);
    const token = secureNonce(); this.store.run('INSERT INTO op_hiring_form_tokens(hash,created_at) VALUES (?,?)', await sha256(`hiring-form:${token}`), Date.now());
    this.store.run('DELETE FROM op_hiring_form_tokens WHERE created_at<?', Date.now() - 86_400_000); return { token };
  }

  async apply(data: Record<string, unknown>) {
    if (!this.enabled()) throw new ApiError('NOT_FOUND', 404);
    if (typeof data.website === 'string' && data.website.trim()) throw new ApiError('APPLICATION_REJECTED');
    const tokenHash = await sha256(`hiring-form:${typeof data.formToken === 'string' ? data.formToken.slice(0, 128) : ''}`);
    const token = this.store.one<{ created_at: number; used_at: number | null }>('SELECT created_at,used_at FROM op_hiring_form_tokens WHERE hash=?', tokenHash);
    const age = token ? Date.now() - token.created_at : -1;
    if (!token || token.used_at || age > FORM_MAX_MS) throw new ApiError('FORM_EXPIRED'); if (age < FORM_MIN_MS) throw new ApiError('APPLICATION_REJECTED');
    const roleId = typeof data.roleId === 'string' ? data.roleId : '';
    let roleTitle = 'General application';
    if (roleId !== 'general') { const row = this.store.one<RoleRow>('SELECT * FROM op_hiring_roles WHERE id=?', roleId); if (!row || row.status !== 'open') throw new ApiError('ROLE_NOT_OPEN'); roleTitle = this.role(row).title; }
    const email = text(data.email, 5, 254, 'EMAIL_INVALID').toLowerCase(); if (!EMAIL.test(email)) throw new ApiError('EMAIL_INVALID');
    const xRaw = optional(data.xHandle, 16, 'X_HANDLE_INVALID'); if (xRaw && !X_HANDLE.test(xRaw)) throw new ApiError('X_HANDLE_INVALID');
    const application = {
      roleId, roleTitle, name: text(data.name, 2, 80, 'NAME_INVALID'), email, xHandle: xRaw.replace(/^@/, ''),
      location: text(data.location, 2, 80, 'LOCATION_INVALID'), timezone: text(data.timezone, 2, 60, 'TIMEZONE_INVALID'),
      portfolio: link(data.portfolio, 'LINK_INVALID'), github: link(data.github, 'LINK_INVALID'), linkedin: link(data.linkedin, 'LINK_INVALID'),
      strongestProject: text(data.strongestProject, 30, 2000, 'PROJECT_INVALID'), whyObjectPad: text(data.whyObjectPad, 30, 2000, 'WHY_INVALID'),
      availability: text(data.availability, 2, 120, 'AVAILABILITY_INVALID'),
    };
    if (!application.portfolio && !application.github && !application.linkedin) throw new ApiError('LINK_REQUIRED');
    if (data.consent !== true) throw new ApiError('CONSENT_REQUIRED');
    const emailHash = await sha256(`hiring:${email}:${roleId}`);
    if (this.store.one('SELECT id FROM op_hiring_applications WHERE email_hash=? AND created_at>?', emailHash, Date.now() - 14 * 86_400_000)) throw new ApiError('APPLICATION_RECENT', 409);
    const id = crypto.randomUUID(); const ticket = data.withResume === true ? secureNonce() : null; const now = Date.now();
    this.store.atomic(() => {
      this.store.run('UPDATE op_hiring_form_tokens SET used_at=? WHERE hash=?', now, tokenHash);
      this.store.run('INSERT INTO op_hiring_applications(id,role_id,email_hash,payload,state,notes,resume_key,resume_ticket_hash,resume_ticket_expires,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, roleId, emailHash, JSON.stringify({ ...application, consentAt: now }), 'new', '[]', null, null, null, now, now);
    });
    if (ticket) this.store.run('UPDATE op_hiring_applications SET resume_ticket_hash=?,resume_ticket_expires=? WHERE id=?', await sha256(`hiring-resume:${ticket}`), now + TICKET_MS, id);
    this.store.metric('hiring_application'); return { id, resumeTicket: ticket };
  }

  /** Optional PDF résumé, attached once with the single-use ticket returned at submission. Stored privately. */
  async attachResume(id: string, ticket: string, bytes: Uint8Array) {
    const row = this.store.one<AppRow>('SELECT * FROM op_hiring_applications WHERE id=?', id);
    if (!row || !row.resume_ticket_hash || !row.resume_ticket_expires || row.resume_ticket_expires < Date.now() || row.resume_ticket_hash !== await sha256(`hiring-resume:${ticket.slice(0, 128)}`)) throw new ApiError('UPLOAD_TICKET_INVALID', 403);
    if (bytes.length < 200 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new ApiError('RESUME_INVALID', 415);
    const key = `hiring/resume/${id}`; await this.runtime.privateBucket.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
    this.store.run('UPDATE op_hiring_applications SET resume_key=?,resume_ticket_hash=NULL,resume_ticket_expires=NULL,updated_at=? WHERE id=?', key, Date.now(), id); return { ok: true };
  }

  // ---------- Operator-only admin ----------
  private async audit(actor: string, target: string, event: string, detail = ''): Promise<void> { await this.store.audit(await sha256(`hiring:${actor}`), `hiring:${target}`, event, detail.slice(0, 400)); }
  private application(row: AppRow) { return { id: row.id, roleId: row.role_id, state: row.state, notes: JSON.parse(row.notes) as { at: number; text: string }[], hasResume: Boolean(row.resume_key), createdAt: row.created_at, updatedAt: row.updated_at, ...JSON.parse(row.payload) as Record<string, unknown> }; }
  admin() {
    const { flag, settings } = this.settingsRow();
    return { flag, enabled: this.enabled(), forcedOff: this.runtime.env.HIRING_PAGE_ENABLED === 'false', settings, roles: this.roles(), readiness: this.readiness(),
      applications: this.store.all<AppRow>('SELECT * FROM op_hiring_applications ORDER BY created_at DESC LIMIT 500').map(r => this.application(r)) };
  }
  private parseRole(data: Record<string, unknown>) {
    const slug = text(data.slug, 3, 48, 'SLUG_INVALID'); if (!SLUG.test(slug)) throw new ApiError('SLUG_INVALID');
    return { slug, title: text(data.title, 3, 80, 'TITLE_INVALID'), team: pick(TEAMS, data.team, 'TEAM_INVALID'), location: text(data.location, 2, 80, 'LOCATION_INVALID'),
      remotePolicy: pick(REMOTE, data.remotePolicy, 'REMOTE_INVALID'), engagementType: pick(ENGAGEMENT, data.engagementType, 'ENGAGEMENT_INVALID'),
      summary: text(data.summary, 10, 600, 'SUMMARY_INVALID'), responsibilities: list(data.responsibilities, 'LIST_INVALID'), requiredSkills: list(data.requiredSkills, 'LIST_INVALID'), preferredSkills: list(data.preferredSkills, 'LIST_INVALID') };
  }
  private assertPublishable(r: Omit<Role, 'id' | 'status' | 'sortOrder' | 'publishedAt' | 'createdAt' | 'updatedAt'>): void {
    if (placeholder([r.title, r.location, r.summary, ...r.responsibilities, ...r.requiredSkills, ...r.preferredSkills].join(' ')) || r.remotePolicy === 'tbd' || r.engagementType === 'tbd') throw new ApiError('ROLE_UNFINISHED');
  }
  async saveRole(actor: string, id: string | null, data: Record<string, unknown>) {
    const role = this.parseRole(data); const now = Date.now();
    const clash = this.store.one<{ id: string }>('SELECT id FROM op_hiring_roles WHERE slug=?', role.slug); if (clash && clash.id !== id) throw new ApiError('SLUG_TAKEN', 409);
    if (id) {
      const row = this.store.one<RoleRow>('SELECT * FROM op_hiring_roles WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404);
      if (row.status === 'open' || row.status === 'paused') this.assertPublishable(role);
      this.store.run('UPDATE op_hiring_roles SET slug=?,payload=?,updated_at=? WHERE id=?', role.slug, JSON.stringify(role), now, id);
    } else {
      id = crypto.randomUUID(); const order = (this.store.one<{ n: number | null }>('SELECT MAX(sort_order) AS n FROM op_hiring_roles')?.n ?? -1) + 1;
      this.store.run('INSERT INTO op_hiring_roles(id,slug,payload,status,sort_order,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', id, role.slug, JSON.stringify(role), 'draft', order, null, now, now);
    }
    await this.audit(actor, id, 'role_saved', role.slug); return this.admin();
  }
  async setRoleStatus(actor: string, id: string, data: Record<string, unknown>) {
    const status = pick(ROLE_STATUS, data.status, 'STATUS_INVALID'); const row = this.store.one<RoleRow>('SELECT * FROM op_hiring_roles WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404);
    if (status === 'open' || status === 'paused') this.assertPublishable(this.role(row));
    this.store.run('UPDATE op_hiring_roles SET status=?,published_at=COALESCE(published_at,?),updated_at=? WHERE id=?', status, status === 'open' ? Date.now() : null, Date.now(), id);
    if (this.enabled() && !this.readiness().every(c => c.passed)) this.store.run('UPDATE op_hiring_settings SET enabled=0,updated_at=? WHERE id=1', Date.now());
    await this.audit(actor, id, `role_${status}`); return this.admin();
  }
  async deleteRole(actor: string, id: string) {
    const row = this.store.one<RoleRow>('SELECT status FROM op_hiring_roles WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404); if (row.status !== 'draft') throw new ApiError('ROLE_NOT_DRAFT', 409);
    this.store.run('DELETE FROM op_hiring_roles WHERE id=?', id); await this.audit(actor, id, 'role_deleted'); return this.admin();
  }
  async reorder(actor: string, data: Record<string, unknown>) {
    const ids = Array.isArray(data.ids) ? data.ids.filter((v): v is string => typeof v === 'string').slice(0, 100) : []; if (!ids.length) throw new ApiError('INVALID_INPUT');
    this.store.atomic(() => ids.forEach((id, i) => this.store.run('UPDATE op_hiring_roles SET sort_order=?,updated_at=? WHERE id=?', i, Date.now(), id)));
    await this.audit(actor, 'roles', 'roles_reordered'); return this.admin();
  }
  async saveSettings(actor: string, data: Record<string, unknown>) {
    const faq = (Array.isArray(data.faq) ? data.faq : []).slice(0, 16).map(f => { const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>; return { q: text(o.q, 4, 160, 'FAQ_INVALID'), a: text(o.a, 4, 1500, 'FAQ_INVALID') }; });
    const privacyContact = optional(data.privacyContact, 254, 'EMAIL_INVALID').toLowerCase(); if (privacyContact && !EMAIL.test(privacyContact)) throw new ApiError('EMAIL_INVALID');
    this.store.run('UPDATE op_hiring_settings SET payload=?,updated_at=? WHERE id=1', JSON.stringify({ faq, privacyContact }), Date.now());
    if (this.enabled() && !this.readiness().every(c => c.passed)) this.store.run('UPDATE op_hiring_settings SET enabled=0,updated_at=? WHERE id=1', Date.now());
    await this.audit(actor, 'settings', 'settings_saved'); return this.admin();
  }
  /** Turning HIRING_PAGE_ENABLED on requires every readiness check to pass; turning it off is always allowed. */
  async setFlag(actor: string, data: Record<string, unknown>) {
    const on = data.enabled === true; if (on && !this.readiness().every(c => c.passed)) throw new ApiError('HIRING_NOT_READY', 409);
    this.store.run('UPDATE op_hiring_settings SET enabled=?,updated_at=? WHERE id=1', on ? 1 : 0, Date.now()); await this.audit(actor, 'flag', on ? 'page_enabled' : 'page_disabled'); return this.admin();
  }
  async updateApplication(actor: string, id: string, data: Record<string, unknown>) {
    const row = this.store.one<AppRow>('SELECT * FROM op_hiring_applications WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404);
    const state = data.state === undefined ? row.state : pick(APP_STATES, data.state, 'STATE_INVALID');
    const notes = JSON.parse(row.notes) as { at: number; text: string }[]; const note = optional(data.note, 1500, 'NOTE_INVALID'); if (note) notes.push({ at: Date.now(), text: note });
    this.store.run('UPDATE op_hiring_applications SET state=?,notes=?,updated_at=? WHERE id=?', state, JSON.stringify(notes.slice(-50)), Date.now(), id);
    await this.audit(actor, id, 'application_updated', state); return this.application({ ...row, state, notes: JSON.stringify(notes) });
  }
  async deleteApplication(actor: string, id: string) {
    const row = this.store.one<AppRow>('SELECT resume_key FROM op_hiring_applications WHERE id=?', id); if (!row) throw new ApiError('NOT_FOUND', 404);
    if (row.resume_key) await this.runtime.privateBucket.delete(row.resume_key);
    this.store.run('DELETE FROM op_hiring_applications WHERE id=?', id); await this.audit(actor, id, 'application_deleted'); return { ok: true };
  }
  async resume(id: string): Promise<Response> {
    const row = this.store.one<AppRow>('SELECT resume_key FROM op_hiring_applications WHERE id=?', id); if (!row?.resume_key) throw new ApiError('NOT_FOUND', 404);
    const file = await this.runtime.privateBucket.get(row.resume_key); if (!file) throw new ApiError('NOT_FOUND', 404);
    return new Response(file.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="resume-${id.slice(0, 8)}.pdf"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  /** CSV export. Cells are quoted and formula-leading characters are neutralised (CSV injection). */
  async exportCsv(actor: string): Promise<Response> {
    const cols = ['id', 'createdAt', 'roleTitle', 'state', 'name', 'email', 'xHandle', 'location', 'timezone', 'portfolio', 'github', 'linkedin', 'availability', 'strongestProject', 'whyObjectPad', 'hasResume'] as const;
    const cell = (v: unknown): string => { let s = v === undefined || v === null ? '' : typeof v === 'number' && v > 1e12 ? new Date(v).toISOString() : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    const rows = this.store.all<AppRow>('SELECT * FROM op_hiring_applications ORDER BY created_at DESC').map(r => this.application(r) as Record<string, unknown>);
    await this.audit(actor, 'export', 'applications_exported', String(rows.length));
    return new Response([cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="objectpad-applications-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  }
}

export { RESUME_MAX };
