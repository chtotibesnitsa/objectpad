import type { ObjectBucket, ObjectContext, SqlStorage, StorageObject } from './types';
import { MIGRATIONS } from './migrations';
import { ApiError, canonicalJson, sha256 } from '../shared/security';
/** Durable SQLite blobs are stored in chunks below the 2 MB row limit. */
const CHUNK = 1_500_000;
/** Durable SQLite state, entirely namespaced to this independent application (op_* tables). */
export class Store {
  readonly sql: SqlStorage;
  constructor(private readonly ctx: ObjectContext) { this.sql = ctx.storage.sql; }
  migrate(): void {
    this.sql.exec('CREATE TABLE IF NOT EXISTS op_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
    for (const migration of MIGRATIONS) if (!this.one('SELECT version FROM op_migrations WHERE version = ?', migration.version)) this.ctx.storage.transactionSync(() => { for (const statement of migration.statements) this.sql.exec(statement); this.sql.exec('INSERT INTO op_migrations(version,applied_at) VALUES (?,?)', migration.version, Date.now()); });
  }
  one<T = Record<string, unknown>>(query: string, ...args: (string | number | null)[]): T | undefined { return this.sql.exec<T>(query, ...args).toArray()[0]; }
  all<T = Record<string, unknown>>(query: string, ...args: (string | number | null)[]): T[] { return this.sql.exec<T>(query, ...args).toArray(); }
  run(query: string, ...args: (string | number | null)[]): void { this.sql.exec(query, ...args); }
  atomic<T>(fn: () => T): T { return this.ctx.storage.transactionSync(fn); }
  metric(name: string): void { if (!/^[a-z_]{3,64}$/.test(name)) return; this.run('INSERT INTO op_metrics(name,value) VALUES (?,1) ON CONFLICT(name) DO UPDATE SET value=value+1', name); }
  rate(key: string, limit: number, period: number): void {
    const now = Date.now(); this.atomic(() => { const row = this.one<{ count: number; expires: number }>('SELECT count,expires FROM op_rate_limits WHERE key=?', key); if (row && row.expires > now && row.count >= limit) throw new ApiError('RATE_LIMITED', 429); this.run('INSERT INTO op_rate_limits(key,count,expires) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,expires=excluded.expires', key, row && row.expires > now ? row.count + 1 : 1, row && row.expires > now ? row.expires : now + period); });
  }
  /** Consumes one unit of a shared daily budget; throws when exhausted. */
  budget(key: string, limit: number, code: string): void {
    const day = Math.floor(Date.now() / 86_400_000); const name = `${key}:${day}`;
    this.atomic(() => { const row = this.one<{ count: number }>('SELECT count FROM op_rate_limits WHERE key=?', name); if ((row?.count ?? 0) >= limit) throw new ApiError(code, 429); this.run('INSERT INTO op_rate_limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', name, (day + 2) * 86_400_000); });
  }
  /** Appends a hash-chained moderation decision. Rows can never be updated or deleted (triggers). */
  async audit(actor: string, target: string, decision: string, reason: string): Promise<string> {
    const previousHash = this.one<{ hash: string }>('SELECT hash FROM op_moderation ORDER BY rowid DESC LIMIT 1')?.hash ?? '0'.repeat(64);
    const event = { target, reason, decision, actor, createdAt: Date.now(), previousHash }; const hash = await sha256(canonicalJson(event));
    this.run('INSERT INTO op_moderation(id,actor,target,decision,reason,previous_hash,hash,created_at) VALUES (?,?,?,?,?,?,?,?)', crypto.randomUUID(), actor, target, decision, reason, previousHash, hash, event.createdAt);
    return hash;
  }
  /** Content-keyed blob storage inside this object's SQLite database. Private and public data use separate namespaces. */
  bucket(namespace: 'private' | 'artifacts'): ObjectBucket {
    const scoped = (key: string) => `${namespace}:${key}`;
    return {
      put: async (key, value, options) => {
        const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; const type = options?.httpMetadata?.contentType ?? 'application/octet-stream';
        this.atomic(() => { this.run('DELETE FROM op_blobs WHERE key=?', scoped(key)); for (let part = 0, offset = 0; offset < bytes.length || part === 0; part++, offset += CHUNK) { const slice = bytes.slice(offset, offset + CHUNK); this.sql.exec('INSERT INTO op_blobs(key,part,content_type,size,data) VALUES (?,?,?,?,?)', scoped(key), part, type, bytes.length, slice.buffer as ArrayBuffer); if (offset + CHUNK >= bytes.length) break; } });
      },
      get: async key => {
        const rows = this.all<{ content_type: string; size: number; data: ArrayBuffer }>('SELECT content_type,size,data FROM op_blobs WHERE key=? ORDER BY part ASC', scoped(key)); if (!rows.length) return null;
        const size = Number(rows[0].size); const output = new Uint8Array(size); let offset = 0; for (const row of rows) { const chunk = new Uint8Array(row.data); output.set(chunk, offset); offset += chunk.length; }
        if (offset !== size) throw new ApiError('STORAGE_CORRUPTED', 503);
        const object: StorageObject = { size, httpMetadata: { contentType: rows[0].content_type }, arrayBuffer: async () => output.slice().buffer as ArrayBuffer, get body() { return new Blob([output]).stream(); } };
        return object;
      },
      delete: async key => { this.run('DELETE FROM op_blobs WHERE key=?', scoped(key)); },
    };
  }
}
