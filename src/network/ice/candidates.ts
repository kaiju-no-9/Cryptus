import { networkInterfaces } from 'node:os';
import { RTCIceGatherer, type IceCandidate as WeriftCandidate } from 'werift';

// ── Types ────────────────────────────────────────────────────────────────────

export type CandidateType = 'host' | 'srflx' | 'relay';

export interface ICECandidate {
  /** RFC 8445 candidate type */
  type: CandidateType;
  /** IP address (IPv4 or IPv6) */
  address: string;
  /** UDP port */
  port: number;
  /**
   * RFC 8445 §5.1.2 priority formula:
   *   priority = (2^24 × type-preference) + (2^8 × local-preference) + (256 - component-id)
   *   host=126, srflx=100, relay=0
   */
  priority: number;
  /** transport protocol — always 'udp' for ICE */
  protocol: 'udp';
}

// ── Priority helpers ──────────────────────────────────────────────────────────

function icePriority(typePreference: number, localPreference = 65535): number {
  return (2 ** 24) * typePreference + (2 ** 8) * localPreference + (256 - 1);
}

const PRIORITY = {
  host:  icePriority(126),
  srflx: icePriority(100),
  relay: icePriority(0),
};

// ── Host candidates ───────────────────────────────────────────────────────────

/**
 * Enumerate all local network interfaces and return one host candidate
 * per non-loopback, non-internal IPv4 address.
 *
 * The port is the port our libp2p TCP listener is already bound to.
 */
export function gatherHostCandidates(listenPort: number): ICECandidate[] {
  const candidates: ICECandidate[] = [];
  const ifaces = networkInterfaces();

  for (const iface of Object.values(ifaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      // Skip loopback, internal-only, and IPv6 (ICE works on IPv4 first)
      if (addr.internal || addr.family !== 'IPv4') continue;
      candidates.push({
        type:     'host',
        address:  addr.address,
        port:     listenPort,
        priority: PRIORITY.host,
        protocol: 'udp',
      });
    }
  }

  // Always include loopback as a last-resort host candidate (same-machine tests)
  candidates.push({
    type:     'host',
    address:  '127.0.0.1',
    port:     listenPort,
    priority: icePriority(126, 1), // lower local preference for loopback
    protocol: 'udp',
  });

  return candidates;
}

// ── STUN server-reflexive candidates ─────────────────────────────────────────

const DEFAULT_STUN_SERVERS = [
  ['stun.l.google.com', 19302],
  ['stun1.l.google.com', 19302],
  ['stun.cloudflare.com', 3478],
] as [string, number][];

const STUN_TIMEOUT_MS = 5_000;

/**
 * Uses werift's RTCIceGatherer to ask a STUN server for our public IP:port.
 * Returns an empty array if the STUN server is unreachable or times out.
 */
export async function gatherSrflxCandidates(
  stunServers: [string, number][] = DEFAULT_STUN_SERVERS,
): Promise<ICECandidate[]> {
  const candidates: ICECandidate[] = [];

  for (const [host, port] of stunServers) {
    const gathered = await Promise.race([
      gatherFromStun(host, port),
      new Promise<ICECandidate[]>((resolve) =>
        setTimeout(() => resolve([]), STUN_TIMEOUT_MS),
      ),
    ]);
    candidates.push(...gathered);
    // Stop after the first successful server to keep startup fast
    if (candidates.length > 0) break;
  }

  return candidates;
}

async function gatherFromStun(host: string, port: number): Promise<ICECandidate[]> {
  try {
    const gatherer = new RTCIceGatherer({ stunServer: [host, port] });

    // gather() resolves when gathering is complete in werift v0.24
    await gatherer.gather();

    // localCandidates is a getter property in werift v0.24
    const raw: WeriftCandidate[] = gatherer.localCandidates;

    return raw
      .filter((c: WeriftCandidate) => c.type === 'srflx')
      .map((c: WeriftCandidate) => ({
        type:     'srflx' as const,
        address:  c.ip ?? '',      // werift uses .ip not .address
        port:     c.port ?? 0,
        priority: PRIORITY.srflx,
        protocol: 'udp' as const,
      }));
  } catch {
    return [];
  }
}

// ── All candidates ────────────────────────────────────────────────────────────

/**
 * Gather all available candidates for the local node.
 * Returns them sorted by priority (highest first), which is the order
 * connectivity checks should be performed in.
 */
export async function gatherAllCandidates(listenPort: number): Promise<ICECandidate[]> {
  const [host, srflx] = await Promise.all([
    Promise.resolve(gatherHostCandidates(listenPort)),
    gatherSrflxCandidates(),
  ]);

  const all = [...host, ...srflx];
  // Sort highest priority first (RFC 8445 §6.1.4.2)
  all.sort((a, b) => b.priority - a.priority);
  return all;
}
