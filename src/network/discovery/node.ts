import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@libp2p/yamux';
import { generateKeyPair, generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import type { Libp2p } from 'libp2p';
import { loadIdentity } from '../../identity/index.js';

export type { Libp2p };

/**
 * Creates and starts a libp2p node.
 *
 * Stack:
 *   Transport   → TCP
 *   Security    → Noise Protocol Framework (XX handshake)
 *   Multiplexer → yamux
 *
 * If a persistent identity exists (~/.cryptus/identity.json), it derives
 * a stable Ed25519 keypair from the stored public key so the libp2p
 * Peer ID remains consistent across sessions.
 *
 * Falls back to an ephemeral identity if `chat init` has not been run.
 */
export async function createNode(port = 0): Promise<Libp2p> {
  let privateKey;

  try {
    // Attempt to load the persistent identity and derive a stable
    // libp2p keypair from it so the Peer ID never changes.
    const identity = await loadIdentity();
    privateKey = await generateKeyPairFromSeed('Ed25519', identity.publicKey);
  } catch {
    // No identity yet — fall back to ephemeral key (pre-init usage)
    privateKey = await generateKeyPair('Ed25519');
  }

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

