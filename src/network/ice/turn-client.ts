import { RTCIceGatherer, type IceCandidate as WeriftCandidate } from 'werift';
import type { ICECandidate } from './candidates.js';

export interface TURNServerConfig {
  host: string;
  port: number;
  username?: string;
  credential?: string;
  transport?: 'udp' | 'tcp' | 'tls';
}

export const DEFAULT_TURN_SERVERS: TURNServerConfig[] = process.env.CRYPTUS_TURN_HOST
  ? [
      {
        host: process.env.CRYPTUS_TURN_HOST,
        port: Number(process.env.CRYPTUS_TURN_PORT) || 3478,
        username: process.env.CRYPTUS_TURN_USER || '',
        credential: process.env.CRYPTUS_TURN_PASS || '',
        transport: (process.env.CRYPTUS_TURN_TRANSPORT as 'udp' | 'tcp' | 'tls') || 'udp',
      },
    ]
  : [];

const RELAY_PRIORITY = (2 ** 24) * 0 + (2 ** 8) * 65535 + (256 - 1); // type preference 0 for relay

const TURN_TIMEOUT_MS = 5_000;

/**
 * Gathers TURN relay candidates from the provided TURN servers.
 * Uses werift's RTCIceGatherer configured with turnServer parameters.
 */
export async function gatherRelayCandidates(
  servers: TURNServerConfig[] = DEFAULT_TURN_SERVERS,
): Promise<ICECandidate[]> {
  const candidates: ICECandidate[] = [];

  for (const server of servers) {
    const gathered = await Promise.race([
      gatherFromTurnServer(server),
      new Promise<ICECandidate[]>((resolve) =>
        setTimeout(() => resolve([]), TURN_TIMEOUT_MS),
      ),
    ]);
    candidates.push(...gathered);
  }

  return candidates;
}

async function gatherFromTurnServer(server: TURNServerConfig): Promise<ICECandidate[]> {
  try {
    const gatherer = new RTCIceGatherer({
      turnServer: [server.host, server.port],
      turnUsername: server.username,
      turnPassword: server.credential,
      turnTransport: server.transport ?? 'udp',
    });

    await gatherer.gather();

    const raw: WeriftCandidate[] = gatherer.localCandidates;

    return raw
      .filter((c: WeriftCandidate) => c.type === 'relay')
      .map((c: WeriftCandidate) => ({
        type: 'relay' as const,
        address: c.ip ?? '',
        port: c.port ?? 0,
        priority: RELAY_PRIORITY,
        protocol: 'udp' as const,
      }));
  } catch {
    return [];
  }
}
