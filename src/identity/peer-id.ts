import { sha256 } from '@noble/hashes/sha2.js';
import { base58btc } from 'multiformats/bases/base58';

/**
 * Derives a stable Peer ID from an Ed25519 public key.
 * Format: base58btc-encoded SHA-256 multihash of the public key.
 * Multihash prefix: 0x12 (sha2-256 code) + 0x20 (32-byte digest length).
 */
export function derivePeerId(publicKey: Uint8Array): string {
  const hash = sha256(publicKey);
  const multihash = new Uint8Array([0x12, 0x20, ...hash]);
  return base58btc.encode(multihash);
}
