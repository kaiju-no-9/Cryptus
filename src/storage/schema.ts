import type Database from 'better-sqlite3';

/**
 * Creates all tables and indexes if they do not already exist.
 * Safe to call on every startup — all statements use IF NOT EXISTS.
 */
export function ensureSchema(db: Database.Database): void {
  db.exec(`
    -- ── Identity (singleton row) ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS identity (
      id                     INTEGER PRIMARY KEY CHECK (id = 1),
      public_key             BLOB NOT NULL,
      encrypted_private_key  BLOB NOT NULL,
      created_at             INTEGER NOT NULL
    );

    -- ── Contacts ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS contacts (
      peer_id                TEXT PRIMARY KEY,
      display_name           TEXT,
      public_key             BLOB NOT NULL,
      fingerprint_verified   INTEGER DEFAULT 0,
      added_at               INTEGER NOT NULL,
      last_seen_addr         TEXT
    );

    -- ── Messages ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS messages (
      id                     TEXT PRIMARY KEY,
      peer_id                TEXT NOT NULL REFERENCES contacts(peer_id),
      direction              TEXT CHECK(direction IN ('outgoing','incoming')),
      ciphertext             BLOB,
      plaintext              TEXT,
      status                 TEXT CHECK(status IN ('pending','sent','delivered','failed','read')),
      created_at             INTEGER NOT NULL,
      delivered_at           INTEGER
    );

    -- Fast conversation rendering (newest-first pagination)
    CREATE INDEX IF NOT EXISTS idx_messages_peer_created
    ON messages(peer_id, created_at DESC);

    -- Fast outbox query for the retry worker
    CREATE INDEX IF NOT EXISTS idx_messages_pending
    ON messages(status, created_at ASC)
    WHERE status = 'pending';

    -- ── Sessions ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sessions (
      peer_id                TEXT PRIMARY KEY REFERENCES contacts(peer_id),
      session_state          BLOB,
      updated_at             INTEGER NOT NULL
    );
  `);
}
