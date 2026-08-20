import type Database from 'better-sqlite3';

// ── Types ────────────────────────────────────────────────────────────────────

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'read';
export type MessageDirection = 'outgoing' | 'incoming';

export interface Message {
  id: string;
  peerId: string;
  direction: MessageDirection;
  ciphertext: Uint8Array | null;
  plaintext: string | null;
  status: MessageStatus;
  createdAt: number;
  deliveredAt: number | null;
}

// ── DAO ──────────────────────────────────────────────────────────────────────

export class MessageDAO {
  private readonly insert_stmt: Database.Statement;
  private readonly get_stmt: Database.Statement;
  private readonly getByPeer_stmt: Database.Statement;
  private readonly updateStatus_stmt: Database.Statement;
  private readonly getPending_stmt: Database.Statement;
  private readonly markDelivered_stmt: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.insert_stmt = db.prepare(`
      INSERT INTO messages (id, peer_id, direction, ciphertext, plaintext, status, created_at, delivered_at)
      VALUES (@id, @peerId, @direction, @ciphertext, @plaintext, @status, @createdAt, @deliveredAt)
    `);

    this.get_stmt = db.prepare(`
      SELECT * FROM messages WHERE id = ?
    `);

    // Most recent messages first, capped for UI rendering
    this.getByPeer_stmt = db.prepare(`
      SELECT * FROM messages
      WHERE peer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    this.updateStatus_stmt = db.prepare(`
      UPDATE messages SET status = ? WHERE id = ?
    `);

    // All pending messages for the outbox retry worker
    this.getPending_stmt = db.prepare(`
      SELECT * FROM messages
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `);

    this.markDelivered_stmt = db.prepare(`
      UPDATE messages
      SET status = 'delivered', delivered_at = ?
      WHERE id = ?
    `);
  }

  /** Insert a new message into the store. */
  insert(msg: Message): void {
    this.insert_stmt.run({
      id:          msg.id,
      peerId:      msg.peerId,
      direction:   msg.direction,
      ciphertext:  msg.ciphertext,
      plaintext:   msg.plaintext,
      status:      msg.status,
      createdAt:   msg.createdAt,
      deliveredAt: msg.deliveredAt,
    });
  }

  /** Get a single message by ID. Returns null if not found. */
  get(id: string): Message | null {
    const row = this.get_stmt.get(id) as Record<string, unknown> | undefined;
    return row ? rowToMessage(row) : null;
  }

  /** Return the N most recent messages for a peer (default 50). */
  getByPeer(peerId: string, limit = 50): Message[] {
    const rows = this.getByPeer_stmt.all(peerId, limit) as Record<string, unknown>[];
    return rows.map(rowToMessage);
  }

  /** Move a message through the delivery state machine. */
  updateStatus(id: string, status: MessageStatus): void {
    this.updateStatus_stmt.run(status, id);
  }

  /** Mark a message as delivered and record the timestamp. */
  markDelivered(id: string): void {
    this.markDelivered_stmt.run(Date.now(), id);
  }

  /** Return all pending messages — used by the outbox retry loop. */
  getPending(): Message[] {
    const rows = this.getPending_stmt.all() as Record<string, unknown>[];
    return rows.map(rowToMessage);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id:          row['id'] as string,
    peerId:      row['peer_id'] as string,
    direction:   row['direction'] as MessageDirection,
    ciphertext:  row['ciphertext'] as Uint8Array | null,
    plaintext:   row['plaintext'] as string | null,
    status:      row['status'] as MessageStatus,
    createdAt:   row['created_at'] as number,
    deliveredAt: row['delivered_at'] as number | null,
  };
}
