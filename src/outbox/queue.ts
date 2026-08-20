import { randomUUID } from 'node:crypto';
import type { Stream } from '@libp2p/interface';
import { Storage, type Message } from '../storage/index.js';
import { encodeFrame, type ChatWireFrame, type ACKWireFrame } from './delivery.js';
import { calculateDelay, DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry.js';

export class OutboxManager {
  private static _instance: OutboxManager | null = null;

  /** Active streams mapped by target peer ID */
  private activeStreams: Map<string, Stream> = new Map();

  /** Per-peer retry attempt counters for backoff calculation */
  private retryAttempts: Map<string, number> = new Map();

  private timer: NodeJS.Timeout | null = null;

  private constructor() {}

  /** Singleton access */
  static getInstance(): OutboxManager {
    if (!OutboxManager._instance) {
      OutboxManager._instance = new OutboxManager();
    }
    return OutboxManager._instance;
  }

  /** Register an active libp2p stream for a peer. Automatically flushes pending messages. */
  registerStream(peerId: string, stream: Stream): void {
    this.activeStreams.set(peerId, stream);
    this.retryAttempts.set(peerId, 0); // reset backoff on connect
    void this.flush(peerId);
  }

  /** Unregister an active stream when connection drops. */
  unregisterStream(peerId: string): void {
    this.activeStreams.delete(peerId);
  }

  /**
   * Enqueue a new outgoing message.
   * Saves to SQLite as status='pending' and attempts immediate delivery if connected.
   */
  enqueue(peerId: string, localPeerId: string, plaintext: string): Message {
    const storage = Storage.open();
    const id = randomUUID();
    const createdAt = Date.now();

    const msg: Message = {
      id,
      peerId,
      direction: 'outgoing',
      ciphertext: null,
      plaintext,
      status: 'pending',
      createdAt,
      deliveredAt: null,
    };

    storage.messages.insert(msg);

    // Attempt immediate delivery if stream is open
    const stream = this.activeStreams.get(peerId);
    if (stream) {
      void this.deliverMessage(msg, localPeerId, stream);
    }

    return msg;
  }

  /** Deliver a single message over a stream and update status to 'sent'. */
  async deliverMessage(msg: Message, localPeerId: string, stream: Stream): Promise<boolean> {
    const storage = Storage.open();
    try {
      const frame: ChatWireFrame = {
        type: 'chat',
        id: msg.id,
        from: localPeerId,
        text: msg.plaintext ?? '',
        timestamp: msg.createdAt,
      };

      stream.send(encodeFrame(frame));

      // Update status to 'sent' (awaiting 'delivered' ACK from remote peer)
      storage.messages.updateStatus(msg.id, 'sent');
      return true;
    } catch {
      // Keep status as 'pending' for retry worker
      return false;
    }
  }

  /** Send a delivery ACK back to a sender for a received message. */
  sendAck(stream: Stream, messageId: string, localPeerId: string): void {
    try {
      const ackFrame: ACKWireFrame = {
        type: 'ack',
        messageId,
        from: localPeerId,
        timestamp: Date.now(),
      };
      stream.send(encodeFrame(ackFrame));
    } catch {
      // Best effort ACK
    }
  }

  /** Mark a message as delivered upon receiving an ACK frame. */
  onDeliveryAck(messageId: string): void {
    const storage = Storage.open();
    storage.messages.markDelivered(messageId);
  }

  /** Flush all pending messages for a specific peer over an active stream. */
  async flush(peerId: string, localPeerId = ''): Promise<void> {
    const stream = this.activeStreams.get(peerId);
    if (!stream) return;

    const storage = Storage.open();
    const pending = storage.messages.getByPeer(peerId, 100).filter((m) => m.status === 'pending');

    for (const msg of pending) {
      await this.deliverMessage(msg, localPeerId, stream);
    }
  }

  /** Background worker retry for all pending messages across all contacts. */
  async retryPending(localPeerId = '', policy: RetryPolicy = DEFAULT_RETRY_POLICY): Promise<void> {
    const storage = Storage.open();
    const pending = storage.messages.getPending();

    if (pending.length === 0) return;

    // Group pending messages by target peerId
    const grouped = new Map<string, Message[]>();
    for (const msg of pending) {
      const list = grouped.get(msg.peerId) ?? [];
      list.push(msg);
      grouped.set(msg.peerId, list);
    }

    for (const [peerId, msgs] of grouped.entries()) {
      const stream = this.activeStreams.get(peerId);
      if (stream) {
        for (const msg of msgs) {
          await this.deliverMessage(msg, localPeerId, stream);
        }
      } else {
        // Peer offline — increment backoff attempt counter
        const attempt = (this.retryAttempts.get(peerId) ?? 0) + 1;
        this.retryAttempts.set(peerId, attempt);
        const delay = calculateDelay(attempt, policy);
        // Log/track backoff delay internally
      }
    }
  }

  /** Start periodic background retry timer. */
  startBackgroundRetry(localPeerId = '', intervalMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.retryPending(localPeerId);
    }, intervalMs);
  }

  /** Stop background retry timer. */
  stopBackgroundRetry(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
