import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@libp2p/yamux';
import { generateKeyPair } from '@libp2p/crypto/keys';
import type { Libp2p } from 'libp2p';

export type { Libp2p };

/**
 * Creates and starts a libp2p node.
 *
 * Stack:
 *   Transport   → TCP
 *   Security    → Noise Protocol Framework (XX handshake)
 *   Multiplexer → yamux
 *
 * If no port is specified, OS assigns a random available port.
 */
export async function createNode(port = 0): Promise<Libp2p> {
  // Generate a fresh ephemeral Ed25519 identity for this session.
  // Phase 1's keystore identity will be plumbed in once we wire
  // loadPrivateKey → libp2p's privateKey option (Phase 3 wire-up step).
  const privateKey = await generateKeyPair('Ed25519');

  const node = await createLibp2p({
    privateKey,
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${port}`],
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
  });

  await node.start();
  return node;
}
