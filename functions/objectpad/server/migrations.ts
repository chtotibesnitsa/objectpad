/** Independent namespace. Never queries or migrates another application's tables. */
export const MIGRATIONS = [
  { version: 1, statements: [
    'CREATE TABLE IF NOT EXISTS op_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_profiles (owner TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, alias TEXT NOT NULL, wallet TEXT, rights INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_wallet_nonces (id TEXT PRIMARY KEY, owner TEXT NOT NULL, wallet TEXT NOT NULL, message TEXT NOT NULL, expires INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_capture_sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, state TEXT NOT NULL, token_hash TEXT UNIQUE, claim_hash TEXT, handoff_expires INTEGER NOT NULL, expires INTEGER NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL)',
    'CREATE INDEX IF NOT EXISTS op_capture_owner ON op_capture_sessions(owner, created_at)',
    'CREATE TABLE IF NOT EXISTS op_capture_views (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, view_id TEXT NOT NULL, hash TEXT NOT NULL, storage_key TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(session_id, view_id), UNIQUE(session_id, hash))',
    'CREATE TABLE IF NOT EXISTS op_upload_tickets (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, owner TEXT NOT NULL, view_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0)',
    'CREATE TABLE IF NOT EXISTS op_reconstruction_jobs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL, provider_id TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_artifacts (hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, bytes INTEGER NOT NULL, public INTEGER NOT NULL DEFAULT 0, session_id TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_records (id TEXT PRIMARY KEY, owner TEXT NOT NULL, session_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL, commitment TEXT NOT NULL, metadata_hash TEXT NOT NULL, metadata_uri TEXT NOT NULL, payload TEXT NOT NULL)',
    'CREATE TRIGGER IF NOT EXISTS op_record_immutable BEFORE UPDATE OF commitment,metadata_hash,metadata_uri,owner,session_id ON op_records BEGIN SELECT RAISE(ABORT, \'immutable record\'); END',
    'CREATE TRIGGER IF NOT EXISTS op_record_no_delete BEFORE DELETE ON op_records BEGIN SELECT RAISE(ABORT, \'append-only record\'); END',
    'CREATE TABLE IF NOT EXISTS op_transactions (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, tx_hash TEXT UNIQUE, block_hash TEXT, request TEXT NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(record_id, kind))',
    'CREATE TABLE IF NOT EXISTS op_launches (record_id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, tx_hash TEXT NOT NULL UNIQUE, block_hash TEXT NOT NULL, confirmed_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_thesis_revisions (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, hash TEXT NOT NULL, transaction_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_reports (id TEXT PRIMARY KEY, owner TEXT NOT NULL, record_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_moderation (id TEXT PRIMARY KEY, actor TEXT NOT NULL, target TEXT NOT NULL, decision TEXT NOT NULL, reason TEXT NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL)',
    'CREATE TRIGGER IF NOT EXISTS op_audit_no_update BEFORE UPDATE ON op_moderation BEGIN SELECT RAISE(ABORT, \'append-only audit\'); END',
    'CREATE TRIGGER IF NOT EXISTS op_audit_no_delete BEFORE DELETE ON op_moderation BEGIN SELECT RAISE(ABORT, \'append-only audit\'); END',
    'CREATE TABLE IF NOT EXISTS op_messages (id TEXT PRIMARY KEY, owner TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)',
    'CREATE TABLE IF NOT EXISTS op_watchlist (owner TEXT NOT NULL, object_id TEXT NOT NULL, PRIMARY KEY(owner, object_id))',
    'CREATE TABLE IF NOT EXISTS op_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_metrics (name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)',
  ] },
  { version: 2, statements: [
    "ALTER TABLE op_records ADD COLUMN moderation_state TEXT NOT NULL DEFAULT 'clear'",
    "CREATE INDEX IF NOT EXISTS op_record_visibility ON op_records(moderation_state,state)",
  ] },
  { version: 3, statements: [
    // Cross-archive duplicate detection: exact frame hashes and same-angle perceptual fingerprints.
    'CREATE INDEX IF NOT EXISTS op_capture_view_hash ON op_capture_views(hash)',
    'CREATE INDEX IF NOT EXISTS op_capture_view_angle ON op_capture_views(view_id)',
    // Trending inputs. One row per object, signal kind, hashed visitor and UTC day.
    'CREATE TABLE IF NOT EXISTS op_signals (object_id TEXT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL, day INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(object_id, kind, actor, day))',
    'CREATE INDEX IF NOT EXISTS op_signals_recent ON op_signals(created_at)',
  ] },
  { version: 4, statements: [
    // Durable, content-keyed blob storage (private capture frames and public artifacts) chunked below the row limit.
    'CREATE TABLE IF NOT EXISTS op_blobs (key TEXT NOT NULL, part INTEGER NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(key, part))',
    // Durable scheduler bookkeeping for provider polling and chain reconciliation.
    'CREATE TABLE IF NOT EXISTS op_scheduler (name TEXT PRIMARY KEY, value INTEGER NOT NULL)',
  ] },
  { version: 5, statements: [
    // Sponsor wallet key (generated once, never returned by any endpoint).
    'CREATE TABLE IF NOT EXISTS op_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL)',
    // AI object fingerprints for cross-archive duplicate-object screening.
    'CREATE TABLE IF NOT EXISTS op_fingerprints (session_id TEXT PRIMARY KEY, tokens TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL)',
    // Pons network market cache: token metadata per curve and the last public snapshot.
    'CREATE TABLE IF NOT EXISTS op_market_tokens (curve TEXT PRIMARY KEY, token TEXT NOT NULL, symbol TEXT NOT NULL, name TEXT NOT NULL, valid INTEGER NOT NULL, checked_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS op_market_cache (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)',
    // Object Key check-ins: the creator re-photographs the physical object and the AI compares it with the original scan.
    'CREATE TABLE IF NOT EXISTS op_checkins (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, matched INTEGER NOT NULL, confidence INTEGER NOT NULL, created_at INTEGER NOT NULL)',
    'CREATE INDEX IF NOT EXISTS op_checkins_record ON op_checkins(record_id, created_at)',
  ] },
  { version: 6, statements: [
    // On-chain Pons token logo (IPFS CID or https URL) for market icons; logo_checked marks rows whose logo() was read.
    "ALTER TABLE op_market_tokens ADD COLUMN logo TEXT NOT NULL DEFAULT ''",
    'ALTER TABLE op_market_tokens ADD COLUMN logo_checked INTEGER NOT NULL DEFAULT 0',
  ] },
  { version: 7, statements: [
    // Account-free creators: a random bearer token (only its hash is stored) identifies a guest until they sign in.
    'CREATE TABLE IF NOT EXISTS op_guests (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)',
    // Deterministic Object ID per capture, known before launch, so the coin link can be fixed in advance.
    'ALTER TABLE op_capture_sessions ADD COLUMN object_id TEXT',
    'CREATE INDEX IF NOT EXISTS op_capture_object ON op_capture_sessions(object_id)',
  ] },
] as const;
