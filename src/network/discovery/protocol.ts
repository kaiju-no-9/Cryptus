import type { Libp2p } from 'libp2p';
import type { Stream, Connection } from '@libp2p/interface';
import { StreamMessageEvent } from '@libp2p/interface';
import { Storage } from '../../storage/index.js';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

export const CHAT_PROTOCOL = '/cryptus/chat/1.0.0';

// ── Wire message format ───────────────────────────────────────────────────────

interface WireMessage {
  id: string;
  from: string;        // sender peerId
  text: string;        // plaintext (Noise transport encrypts the stream itself)
  timestamp: number;
}

function encodeFrame(msg: WireMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg) + '\n');
}

// ── Incoming handler ──────────────────────────────────────────────────────────

/**
 * Registers /cryptus/chat/1.0.0 on the node.
 * libp2p v3 uses an event-based stream API:
 *   - listen for 'message' events on the stream for incoming data
 *   - call stream.send() to write outgoing data
 */
export function registerChatProtocol(node: Libp2p): void {
  node.handle(
    CHAT_PROTOCOL,
    (stream: Stream, connection: Connection) => {
      const remotePeerId = connection.remotePeer.toString();
      const storage = Storage.open();
      let buffer = '';

      stream.addEventListener('message', (evt) => {
        const data = (evt as StreamMessageEvent).data;
        const bytes = data instanceof Uint8Array ? data : data.subarray();
        buffer += new TextDecoder().decode(bytes);

        // Messages are newline-delimited JSON
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg: WireMessage = JSON.parse(line);
            const ts = new Date(msg.timestamp).toLocaleTimeString();
            process.stdout.write(`\r[${ts}] ${msg.from.substring(0, 8)}…: ${msg.text}\n> `);

            storage.messages.insert({
              id:          msg.id,
              peerId:      remotePeerId,
              direction:   'incoming',
              ciphertext:  null,
              plaintext:   msg.text,
              status:      'delivered',
              createdAt:   msg.timestamp,
              deliveredAt: Date.now(),
            });
          } catch {
            // malformed frame — skip
          }
        }
      });

      stream.addEventListener('close', () => {
        console.log('\n[peer disconnected]');
      });
    },
  );
}

// ── Outgoing / interactive session ────────────────────────────────────────────

/**
 * Dials a peer by multiaddr string, opens a chat stream,
 * and enters an interactive readline loop.
 */
export async function startChatSession(
  node: Libp2p,
  targetPeerId: string,
  targetAddr: string,
): Promise<void> {
  const storage = Storage.open();
  const localPeerId = node.peerId.toString();

  console.log(`\nDialing ${targetPeerId.substring(0, 20)}…`);

  const { multiaddr } = await import('@multiformats/multiaddr');
  const connection = await node.dial(multiaddr(targetAddr));
  const stream: Stream = await connection.newStream(CHAT_PROTOCOL);

  console.log('✅  Connected! Type messages and press Enter. Ctrl+C to quit.\n');
  process.stdout.write('> ');

  // Print incoming messages from this specific stream too
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
        const msg: WireMessage = JSON.parse(line);
        const ts = new Date(msg.timestamp).toLocaleTimeString();
        process.stdout.write(`\r[${ts}] ${msg.from.substring(0, 8)}…: ${msg.text}\n> `);
        storage.messages.insert({
          id: msg.id, peerId: targetPeerId, direction: 'incoming',
          ciphertext: null, plaintext: msg.text, status: 'delivered',
          createdAt: msg.timestamp, deliveredAt: Date.now(),
        });
      } catch { /* skip */ }
    }
  });

  // Readline loop → send each line as a framed message
  const rl = createInterface({ input: process.stdin });

  await new Promise<void>((resolve) => {
    rl.on('line', (line: string) => {
      if (!line.trim()) return;

      const msg: WireMessage = {
        id:        randomUUID(),
        from:      localPeerId,
        text:      line,
        timestamp: Date.now(),
      };

      storage.messages.insert({
        id:          msg.id,
        peerId:      targetPeerId,
        direction:   'outgoing',
        ciphertext:  null,
        plaintext:   msg.text,
        status:      'pending',
        createdAt:   msg.timestamp,
        deliveredAt: null,
      });

      stream.send(encodeFrame(msg));
      storage.messages.updateStatus(msg.id, 'sent');
      process.stdout.write('> ');
    });

    rl.on('close', () => resolve());
  });
}
