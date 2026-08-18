import { createSocket } from 'node:dgram';
import type { CandidatePair, ICEAgent } from './ice-agent.js';

const CONNECTIVITY_CHECK_TIMEOUT_MS = 3_000;
const MAX_PAIRS_TO_CHECK = 8;

// ── Connectivity check ────────────────────────────────────────────────────────

/**
 * Performs STUN-style connectivity checks on the candidate pairs
 * produced by ICEAgent.formPairs().
 *
 * Checks are run in priority order. The first pair that succeeds
 * (i.e. we can send a UDP probe and get a response within the timeout)
 * is returned immediately — higher priority pairs skip the rest.
 *
 * Returns null if no pair succeeds (peer unreachable via direct path;
 * the caller should fall back to TURN relay).
 */
export async function runConnectivityChecks(
  agent: ICEAgent,
): Promise<CandidatePair | null> {
  const pairs = agent.formPairs();

  if (pairs.length === 0) return null;

  // Only check top N pairs to keep latency reasonable
  const toCheck = pairs.slice(0, MAX_PAIRS_TO_CHECK);

  for (const pair of toCheck) {
    pair.state = 'in-progress';
    const ok = await checkPair(pair);
    if (ok) {
      pair.state = 'succeeded';
      return pair;
    }
    pair.state = 'failed';
  }

  return null;
}

// ── UDP probe ─────────────────────────────────────────────────────────────────

/**
 * Sends a minimal UDP probe to the remote candidate address/port
 * and waits for any response within the timeout.
 *
 * In production this would be a proper STUN Binding Request (RFC 8489).
 * For Phase 4 we use a lightweight probe to validate reachability —
 * full STUN binding is provided by werift under the hood during
 * the actual libp2p connection in Phase 5.
 */
function checkPair(pair: CandidatePair): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createSocket('udp4');
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      try { sock.close(); } catch { /* already closed */ }
      resolve(result);
    };

    const timer = setTimeout(() => finish(false), CONNECTIVITY_CHECK_TIMEOUT_MS);

    sock.on('error', () => {
      clearTimeout(timer);
      finish(false);
    });

    // A real STUN Binding Request magic cookie: 0x2112A442
    // We send a minimal 20-byte STUN probe
    const probe = buildStunProbe();

    sock.on('message', () => {
      clearTimeout(timer);
      finish(true);
    });

    sock.bind(0, () => {
      sock.send(probe, pair.remote.port, pair.remote.address, (err) => {
        if (err) {
          clearTimeout(timer);
          finish(false);
        }
      });
    });
  });
}

// ── Minimal STUN Binding Request ──────────────────────────────────────────────

function buildStunProbe(): Buffer {
  const buf = Buffer.alloc(20);
  // Message Type: Binding Request (0x0001)
  buf.writeUInt16BE(0x0001, 0);
  // Message Length: 0 (no attributes)
  buf.writeUInt16BE(0x0000, 2);
  // Magic Cookie: 0x2112A442 (RFC 5389)
  buf.writeUInt32BE(0x2112a442, 4);
  // Transaction ID: 12 random bytes
  const tid = Buffer.allocUnsafe(12);
  for (let i = 0; i < 12; i++) tid[i] = Math.random() * 256 | 0;
  tid.copy(buf, 8);
  return buf;
}
