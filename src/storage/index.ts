import { getDb, closeDb } from './db.js';
import { ContactDAO } from './dao/contacts.js';
import { MessageDAO } from './dao/messages.js';
import { SessionDAO } from './dao/sessions.js';

// Re-export types so consumers import from one place
export type { Contact } from './dao/contacts.js';
export type { Message, MessageStatus, MessageDirection } from './dao/messages.js';
export type { Session } from './dao/sessions.js';

// ── Facade ───────────────────────────────────────────────────────────────────

/**
 * Single entry point to all storage DAOs.
 * Call `Storage.open()` once at startup; DAOs are lazily shared from there.
 *
 * @example
 * const storage = Storage.open();
 * storage.contacts.list();
 * storage.messages.getPending();
 */
export class Storage {
  readonly contacts: ContactDAO;
  readonly messages: MessageDAO;
  readonly sessions: SessionDAO;

  private constructor() {
    const db = getDb();
    this.contacts = new ContactDAO(db);
    this.messages = new MessageDAO(db);
    this.sessions = new SessionDAO(db);
  }

  private static _instance: Storage | null = null;

  /** Returns the singleton Storage instance. Creates it on first call. */
  static open(): Storage {
    if (!Storage._instance) {
      Storage._instance = new Storage();
    }
    return Storage._instance;
  }

  /** Close the underlying database connection. */
  static close(): void {
    closeDb();
    Storage._instance = null;
  }
}
