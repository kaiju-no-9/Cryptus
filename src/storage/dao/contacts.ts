import type Database from 'better-sqlite3';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Contact {
  peerId: string;
  displayName: string | null;
  publicKey: Uint8Array;
  fingerprintVerified: boolean;
  addedAt: number;
  lastSeenAddr: string | null;
}

// ── DAO ──────────────────────────────────────────────────────────────────────

export class ContactDAO {
  private readonly add_stmt: Database.Statement;
  private readonly get_stmt: Database.Statement;
  private readonly list_stmt: Database.Statement;
  private readonly updateLastSeen_stmt: Database.Statement;
  private readonly markVerified_stmt: Database.Statement;

  constructor(private readonly db: Database.Database) {
    // Prepare statements once — better-sqlite3 is synchronous
    this.add_stmt = db.prepare(`
      INSERT INTO contacts (peer_id, display_name, public_key, fingerprint_verified, added_at, last_seen_addr)
      VALUES (@peerId, @displayName, @publicKey, 0, @addedAt, @lastSeenAddr)
    `);

    this.get_stmt = db.prepare(`
      SELECT * FROM contacts WHERE peer_id = ?
    `);

    this.list_stmt = db.prepare(`
      SELECT * FROM contacts ORDER BY added_at ASC
    `);

    this.updateLastSeen_stmt = db.prepare(`
      UPDATE contacts SET last_seen_addr = ? WHERE peer_id = ?
    `);

    this.markVerified_stmt = db.prepare(`
      UPDATE contacts SET fingerprint_verified = 1 WHERE peer_id = ?
    `);
  }

  /** Insert a new contact. Throws if peer_id already exists. */
  add(contact: Omit<Contact, 'fingerprintVerified'>): void {
    this.add_stmt.run({
      peerId:       contact.peerId,
      displayName:  contact.displayName,
      publicKey:    contact.publicKey,
      addedAt:      contact.addedAt,
      lastSeenAddr: contact.lastSeenAddr,
    });
  }

  /** Fetch a single contact by peer ID. Returns null if not found. */
  get(peerId: string): Contact | null {
    const row = this.get_stmt.get(peerId) as Record<string, unknown> | undefined;
    return row ? rowToContact(row) : null;
  }

  /** Return all contacts ordered by when they were added. */
  list(): Contact[] {
    const rows = this.list_stmt.all() as Record<string, unknown>[];
    return rows.map(rowToContact);
  }

  /** Update the last known network address for a contact. */
  updateLastSeen(peerId: string, addr: string): void {
    this.updateLastSeen_stmt.run(addr, peerId);
  }

  /** Mark a contact's fingerprint as verified after out-of-band confirmation. */
  markVerified(peerId: string): void {
    this.markVerified_stmt.run(peerId);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    peerId:              row['peer_id'] as string,
    displayName:         row['display_name'] as string | null,
    publicKey:           row['public_key'] as Uint8Array,
    fingerprintVerified: (row['fingerprint_verified'] as number) === 1,
    addedAt:             row['added_at'] as number,
    lastSeenAddr:        row['last_seen_addr'] as string | null,
  };
}
