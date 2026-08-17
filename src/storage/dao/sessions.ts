import type Database from 'better-sqlite3';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Session {
  peerId: string;
  sessionState: Uint8Array;
  updatedAt: number;
}

// ── DAO ──────────────────────────────────────────────────────────────────────

export class SessionDAO {
  private readonly save_stmt: Database.Statement;
  private readonly load_stmt: Database.Statement;
  private readonly delete_stmt: Database.Statement;

  constructor(private readonly db: Database.Database) {
    // UPSERT — either insert or overwrite the existing session for this peer
    this.save_stmt = db.prepare(`
      INSERT INTO sessions (peer_id, session_state, updated_at)
      VALUES (@peerId, @sessionState, @updatedAt)
      ON CONFLICT(peer_id) DO UPDATE SET
        session_state = excluded.session_state,
        updated_at    = excluded.updated_at
    `);

    this.load_stmt = db.prepare(`
      SELECT * FROM sessions WHERE peer_id = ?
    `);

    this.delete_stmt = db.prepare(`
      DELETE FROM sessions WHERE peer_id = ?
    `);
  }

  /**
   * Persist (or overwrite) a serialized ratchet/Noise session for a peer.
   * Called after every message send/receive to keep state in sync.
   */
  save(session: Session): void {
    this.save_stmt.run({
      peerId:       session.peerId,
      sessionState: session.sessionState,
      updatedAt:    session.updatedAt,
    });
  }

  /** Load a persisted session. Returns null if none exists for this peer. */
  load(peerId: string): Session | null {
    const row = this.load_stmt.get(peerId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      peerId:       row['peer_id'] as string,
      sessionState: row['session_state'] as Uint8Array,
      updatedAt:    row['updated_at'] as number,
    };
  }

  /** Remove a session (e.g., when a contact is deleted or session is reset). */
  delete(peerId: string): void {
    this.delete_stmt.run(peerId);
  }
}
