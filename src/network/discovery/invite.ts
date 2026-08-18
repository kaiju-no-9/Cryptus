import { base58btc } from 'multiformats/bases/base58';
import type { ICECandidate } from '../ice/index.js';

export interface InviteCode {
  peerId: string;
  addrs: string[];
  /** ICE candidates gathered at time of code generation (optional, Phase 4+) */
  iceCandidates?: ICECandidate[];
}

const PREFIX = 'chat1';

/**
 * Encodes a peer's ID and multiaddrs into a shareable invite code.
 * Format: "chat1" + base58btc( JSON({ peerId, addrs }) )
 *
 * The prefix makes codes easy to recognise and copy-paste.
 */
export function encodeInvite(
  peerId: string,
  addrs: string[],
  iceCandidates?: ICECandidate[],
): string {
  const payload = JSON.stringify({ peerId, addrs, iceCandidates });
  const bytes = new TextEncoder().encode(payload);
  return PREFIX + base58btc.encode(bytes);
}

/**
 * Decodes an invite code back into peerId + multiaddrs.
 * Throws a descriptive error on malformed input.
 */
export function decodeInvite(code: string): InviteCode {
  if (!code.startsWith(PREFIX)) {
    throw new Error(`Invalid invite code — must start with "${PREFIX}"`);
  }

  const encoded = code.slice(PREFIX.length);

  let bytes: Uint8Array;
  try {
    bytes = base58btc.decode(encoded);
  } catch {
    throw new Error('Invalid invite code — base58 decode failed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Invalid invite code — JSON parse failed');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['peerId'] !== 'string' ||
    !Array.isArray((parsed as Record<string, unknown>)['addrs'])
  ) {
    throw new Error('Invalid invite code — unexpected payload shape');
  }

  const p = parsed as Record<string, unknown>;
  return {
    peerId:         p['peerId'] as string,
    addrs:          p['addrs'] as string[],
    iceCandidates:  Array.isArray(p['iceCandidates'])
                      ? (p['iceCandidates'] as ICECandidate[])
                      : undefined,
  };
}
