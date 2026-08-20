import type { Libp2p } from 'libp2p';
import type { Stream, Connection } from '@libp2p/interface';
import { StreamMessageEvent } from '@libp2p/interface';
import { Storage } from '../../storage/index.js';
import { decodeFrame, encodeFrame, type ChatWireFrame } from '../../outbox/delivery.js';
import { OutboxManager } from '../../outbox/queue.js';
import { createInterface } from 'node:readline';

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

      // Register stream with outbox to flush pending outbox messages
      outbox.registerStream(remotePeerId, stream);

      let buffer = '';

      stream.addEventListener('message', (evt) => {
        const data = (evt as StreamMessageEvent).data;
        const bytes = data instanceof Uint8Array ? data : data.subarray();
        buffer += new TextDecoder().decode(bytes);

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const frame = decodeFrame(line);

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
              outbox.sendAck(stream, frame.id, localPeerId);
            }
          } catch {
            // Malformed frame — skip
          }
        }
      });

      stream.addEventListener('close', () => {
        outbox.unregisterStream(remotePeerId);
        console.log('\n[peer disconnected]');
      });
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

  // Register stream with outbox
  outbox.registerStream(targetPeerId, stream);
  outbox.startBackgroundRetry(localPeerId, 5000);

  console.log('✅  Connected! Type messages and press Enter. Ctrl+C to quit.\n');
  process.stdout.write('> ');

  let buffer = '';
  stream.addEventListener('message', (evt) => {
    const data = (evt as StreamMessageEvent).data;
    const bytes = data instanceof Uint8Array ? data : data.subarray();
    buffer += new TextDecoder().decode(bytes);

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const frame = decodeFrame(line);

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

          outbox.sendAck(stream, frame.id, localPeerId);
        }
      } catch {
        // Skip
      }
    }
  });

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
