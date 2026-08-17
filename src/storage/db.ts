import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { ensureSchema } from './schema.js';

const CRYPTUS_DIR = join(homedir(), '.cryptus');
const DB_PATH = join(CRYPTUS_DIR, 'cryptus.db');

let _db: Database.Database | null = null;

/**
 * Returns the singleton database connection.
 * Creates the file and applies the schema on first call.
 * Uses WAL mode for better concurrent read performance.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(CRYPTUS_DIR, { recursive: true });

  _db = new Database(DB_PATH);

  // WAL mode: readers don't block writers, writes don't block readers
  _db.pragma('journal_mode = WAL');
  // Enforce foreign key constraints (SQLite has them off by default)
  _db.pragma('foreign_keys = ON');

  ensureSchema(_db);

  return _db;
}

/** Close the connection — call on process exit if needed. */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
