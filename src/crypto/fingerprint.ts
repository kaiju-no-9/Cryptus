import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Computes a deterministic Signal-style 60-digit Safety Number (fingerprint)
 * from two public keys.
 *
 * Sorting the keys lexicographically guarantees that both Alice and Bob compute
 * the exact same Safety Number regardless of who initiated the connection.
 *
 * Format: 12 blocks of 5 digits separated by spaces.
 * Example: "12345 67890 13579 24680 98765 43210 11223 34455 56677 88990 12345 67890"
 */
export function computeFingerprint(keyA: Uint8Array, keyB: Uint8Array): string {
  // Sort keys lexicographically
  const [first, second] = compareUint8Arrays(keyA, keyB) <= 0 ? [keyA, keyB] : [keyB, keyA];

  // Concatenate: "CryptusSafetyNumber" || first || second
  const prefix = new TextEncoder().encode('CryptusSafetyNumber');
  const combined = new Uint8Array(prefix.length + first.length + second.length);
  combined.set(prefix, 0);
  combined.set(first, prefix.length);
  combined.set(second, prefix.length + first.length);

  // Digest with SHA-256
  const hash = sha256(combined);

  // Convert first 30 bytes into 12 5-digit numbers (each 2.5 bytes = 0..65535, % 100000 -> 5 digits)
  const blocks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const val = ((hash[i * 2] << 16) | (hash[i * 2 + 1] << 8) | hash[(i * 2 + 2) % hash.length]) >>> 0;
    const num = (val % 100000).toString().padStart(5, '0');
    blocks.push(num);
  }

  return blocks.join(' ');
}

/** Lexicographical comparison for two Uint8Arrays */
function compareUint8Arrays(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** Format fingerprint with line breaks for clean terminal display (3 blocks per line) */
export function formatFingerprintDisplay(fingerprint: string): string {
  const blocks = fingerprint.split(' ');
  const lines: string[] = [];
  for (let i = 0; i < blocks.length; i += 3) {
    lines.push(blocks.slice(i, i + 3).join('   '));
  }
  return lines.join('\n');
}
