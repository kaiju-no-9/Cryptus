import type { Libp2p } from 'libp2p';
import type { Stream, Connection } from '@libp2p/interface';
import { Storage } from '../../storage/index.js';
import { decodeFrame, encodeFrame, type ChatWireFrame } from '../../outbox/delivery.js';
import { OutboxManager } from '../../outbox/queue.js';
import { createInterface } from 'node:readline';

// ── Stream writer wrapper ────────────────────────────────────────────────────

/**
 * Thin wrapper around a libp2p Stream's send/close to provide
 * a uniform push/end interface for the OutboxManager.
 */
export interface StreamWriter {
  push(data: Uint8Array): void;
  end(): void;
}

function wrapStream(stream: Stream): StreamWriter {
  return {
    push(data: Uint8Array) {
      stream.send(data);
    },
    end() {
      void stream.close();
    },
  };
}

// ── Frame reader ─────────────────────────────────────────────────────────────

/**
 * Reads newline-delimited wire frames from a libp2p Stream.
 * Uses the stream's built-in async iterator (MessageStream is AsyncIterable).
 */
async function readStream(
  stream: Stream,
  onFrame: (frame: any) => void,
  onClose: () => void,
): Promise<void> {
  let buffer = '';
  try {
    for await (const chunk of stream) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk.subarray());
      buffer += new TextDecoder().decode(bytes);
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const frame = decodeFrame(line);
          onFrame(frame);
        } catch { /* skip malformed */ }
      }
    }
  } catch { /* stream error */ }
  onClose();
}

export const CHAT_PROTOCOL = '/cryptus/chat/1.0.0';

/**
 * Registers /cryptus/chat/1.0.0 on the node.
 * Uses OutboxManager to process incoming messages, send ACKs, and handle outgoing frames.
 */
export function registerChatProtocol(node: Libp2p): void {
  const localPeerId = node.peerId.toString();

  node.handle(
    CHAT_PROTOCOL,
    (stream: Stream, connection: Connection) => {
      const remotePeerId = connection.remotePeer.toString();
      const storage = Storage.open();
      const outbox = OutboxManager.getInstance();

      const writer = wrapStream(stream);

      // Register stream with outbox to flush pending outbox messages
      outbox.registerStream(remotePeerId, writer);

      void readStream(
        stream,
        (frame: any) => {
          if (frame.type === 'ack') {
            // Remote peer confirmed receipt of message
            outbox.onDeliveryAck(frame.messageId);
          } else {
            // Incoming chat message
            const ts = new Date(frame.timestamp).toLocaleTimeString();
            process.stdout.write(`\r[${ts}] ${frame.from.substring(0, 8)}…: ${frame.text}\n> `);

            storage.messages.insert({
              id:          frame.id,
              peerId:      remotePeerId,
              direction:   'incoming',
              ciphertext:  null,
              plaintext:   frame.text,
              status:      'delivered',
              createdAt:   frame.timestamp,
              deliveredAt: Date.now(),
            });

            // Send delivery ACK back to sender
            outbox.sendAck(writer, frame.id, localPeerId);
          }
        },
        () => {
          outbox.unregisterStream(remotePeerId);
          console.log('\n[peer disconnected]');
        }
      );
    },
  );
}

/**
 * Dials a peer by multiaddr string, opens a chat stream,
 * registers with OutboxManager, and enters an interactive readline loop.
 */
export async function startChatSession(
  node: Libp2p,
  targetPeerId: string,
  targetAddr: string,
): Promise<void> {
  const storage = Storage.open();
  const localPeerId = node.peerId.toString();
  const outbox = OutboxManager.getInstance();

  console.log(`\nDialing ${targetPeerId.substring(0, 20)}…`);

  const { multiaddr } = await import('@multiformats/multiaddr');
  const connection = await node.dial(multiaddr(targetAddr));
  const stream: Stream = await connection.newStream(CHAT_PROTOCOL);

  const writer = wrapStream(stream);

  // Register stream with outbox
  outbox.registerStream(targetPeerId, writer);
  outbox.startBackgroundRetry(localPeerId, 5000);

  console.log('✅  Connected! Type messages and press Enter. Ctrl+C to quit.\n');
  process.stdout.write('> ');

  void readStream(
    stream,
    (frame: any) => {
      if (frame.type === 'ack') {
        outbox.onDeliveryAck(frame.messageId);
      } else {
        const ts = new Date(frame.timestamp).toLocaleTimeString();
        process.stdout.write(`\r[${ts}] ${frame.from.substring(0, 8)}…: ${frame.text}\n> `);

        storage.messages.insert({
          id:          frame.id,
          peerId:      targetPeerId,
          direction:   'incoming',
          ciphertext:  null,
          plaintext:   frame.text,
          status:      'delivered',
          createdAt:   frame.timestamp,
          deliveredAt: Date.now(),
        });

        outbox.sendAck(writer, frame.id, localPeerId);
      }
    },
    () => {}
  );

  const rl = createInterface({ input: process.stdin });

  await new Promise<void>((resolve) => {
    rl.on('line', (line: string) => {
      if (!line.trim()) return;

      // Queue message via OutboxManager — handles DB insertion and delivery
      outbox.enqueue(targetPeerId, localPeerId, line);
      process.stdout.write('> ');
    });

    rl.on('close', () => {
      outbox.unregisterStream(targetPeerId);
      outbox.stopBackgroundRetry();
      resolve();
    });
  });
}
