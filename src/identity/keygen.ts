import { ed25519 } from '@noble/curves/ed25519.js';
import { randomBytes } from 'node:crypto';

/**
 * Generates a fresh Ed25519 keypair.
 * The private key is 32 random bytes; the public key is derived from it.
 */
export function generateKeypair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const privateKey = randomBytes(32);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey: new Uint8Array(privateKey) };
}
