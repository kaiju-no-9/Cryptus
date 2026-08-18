import type { ICECandidate } from './candidates.js';
import { gatherAllCandidates } from './candidates.js';

// ── Candidate pair ────────────────────────────────────────────────────────────

export interface CandidatePair {
  local: ICECandidate;
  remote: ICECandidate;
  /** Combined pair priority per RFC 8445 §6.1.2.3 */
  priority: bigint;
  state: 'frozen' | 'waiting' | 'in-progress' | 'succeeded' | 'failed';
}

// ── ICE Agent ─────────────────────────────────────────────────────────────────

/**
 * Manages the complete ICE lifecycle for one peer connection:
 *   1. Gather local candidates
 *   2. Accept remote candidates from signaling
 *   3. Form candidate pairs and run connectivity checks
 *   4. Return the best working pair
 */
export class ICEAgent {
  private localCandidates: ICECandidate[] = [];
  private remoteCandidates: ICECandidate[] = [];

  /**
   * Gather all local candidates (host + STUN server-reflexive).
   * Must be called before forming pairs or running checks.
   */
  async gatherCandidates(listenPort: number): Promise<ICECandidate[]> {
    this.localCandidates = await gatherAllCandidates(listenPort);
    return [...this.localCandidates];
  }

  /** Add a remote candidate received via signaling. */
  addRemoteCandidate(candidate: ICECandidate): void {
    this.remoteCandidates.push(candidate);
  }

  /** Add multiple remote candidates at once (e.g. from decoded invite payload). */
  addRemoteCandidates(candidates: ICECandidate[]): void {
    this.remoteCandidates.push(...candidates);
  }

  /**
   * Form candidate pairs from local × remote candidates,
   * sorted by pair priority (highest first).
   *
   * RFC 8445 §6.1.2.3 pair priority:
   *   pair-priority = 2^32 * min(G, D) + 2 * max(G, D) + (G > D ? 1 : 0)
   *   where G = controlling agent's candidate priority
   *         D = controlled agent's candidate priority
   */
  formPairs(): CandidatePair[] {
    const pairs: CandidatePair[] = [];

    for (const local of this.localCandidates) {
      for (const remote of this.remoteCandidates) {
        // Only pair same-family addresses (skip IPv4↔IPv6 mismatch)
        if (isIPv6(local.address) !== isIPv6(remote.address)) continue;

        const G = BigInt(local.priority);
        const D = BigInt(remote.priority);
        const pairPriority =
          BigInt(2 ** 32) * bigMin(G, D) + BigInt(2) * bigMax(G, D) + (G > D ? 1n : 0n);

        pairs.push({
          local,
          remote,
          priority: pairPriority,
          state: 'frozen',
        });
      }
    }

    // Highest priority first
    pairs.sort((a, b) => (b.priority > a.priority ? 1 : b.priority < a.priority ? -1 : 0));
    return pairs;
  }

  /** Snapshot of gathered local candidates. */
  getLocalCandidates(): ICECandidate[] {
    return [...this.localCandidates];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isIPv6(addr: string): boolean {
  return addr.includes(':');
}

function bigMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function bigMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}
