import { Storage } from '../../storage/index.js';
import { decodeInvite, encodeInvite } from '../../network/discovery/invite.js';
import { createNode } from '../../network/discovery/node.js';
import { registerChatProtocol, startChatSession } from '../../network/discovery/protocol.js';
import { ICEAgent } from '../../network/ice/index.js';
import { loadIdentity } from '../../identity/index.js';

// ── contacts add ─────────────────────────────────────────────────────────────

export async function contactsAddCommand(name: string, inviteCode: string): Promise<void> {
  let invite;
  try {
    invite = decodeInvite(inviteCode);
  } catch (err) {
    console.error(`✗  ${(err as Error).message}`);
    return;
  }

  const storage = Storage.open();

  const pubKey = invite.publicKey ?? new Uint8Array(32);
  const existing = storage.contacts.get(invite.peerId);

  // Check for duplicate / key mutation
  if (existing) {
    if (invite.publicKey && !areEqual(existing.publicKey, invite.publicKey)) {
      console.error(`\n[!] CRITICAL SECURITY WARNING: Public key for ${name} HAS CHANGED!`);
      console.error(`    Previous key hash: ${existing.peerId.substring(0, 16)}…`);
      console.error(`    Possibility of Man-In-The-Middle (MITM) attack or device replacement.`);
      console.error(`    Run \`chat verify ${name}\` out-of-band to confirm Safety Numbers before chatting.\n`);
      storage.contacts.updatePublicKey(invite.peerId, invite.publicKey);
      return;
    }
    console.log(`Contact with peer ID ${invite.peerId.substring(0, 16)}… already exists.`);
    return;
  }

  storage.contacts.add({
    peerId:       invite.peerId,
    displayName:  name,
    publicKey:    pubKey,
    addedAt:      Date.now(),
    lastSeenAddr: invite.addrs[0] ?? null,
  });

  console.log(`✓  Added contact "${name}" (${invite.peerId.substring(0, 20)}…)`);
  console.log(`   Known address: ${invite.addrs[0] ?? 'none'}`);
  console.log('\n[!] Fingerprint unverified. Run `chat verify <name>` to confirm Safety Number.');
}

function areEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── contacts list — re-exported from contacts.ts ─────────────────────────────

export { contactsListCommand } from './contacts.js';

// ── talk ─────────────────────────────────────────────────────────────────────

export async function talkCommand(peerName: string): Promise<void> {
  const storage = Storage.open();

  const all = storage.contacts.list();
  const contact = all.find(c => c.displayName === peerName || c.peerId === peerName);

  if (!contact) {
    console.error(`✗  No contact named "${peerName}". Run \`chat contacts list\` to see your contacts.`);
    return;
  }

  if (!contact.lastSeenAddr) {
    console.error(`✗  No known address for "${peerName}". Ask them to share a fresh invite code.`);
    return;
  }

  // 1. Start libp2p node
  const node = await createNode();
  const localAddrs = node.getMultiaddrs().map(m => m.toString());
  const localPeerId = node.peerId.toString();

  // 2. Gather ICE candidates in parallel with node startup
  console.log('\nGathering ICE candidates…');
  const iceAgent = new ICEAgent();

  // Extract port from first TCP multiaddr (e.g. /ip4/0.0.0.0/tcp/PORT)
  const portMatch = localAddrs[0]?.match(/\/tcp\/([0-9]+)/);
  const listenPort = portMatch ? parseInt(portMatch[1], 10) : 0;

  const localCandidates = await iceAgent.gatherCandidates(listenPort);
  console.log(`  Found ${localCandidates.length} local candidate(s) (host + STUN)`);

  // 3. Print invite code with ICE candidates and public key embedded
  let localPubKey: Uint8Array | undefined;
  try {
    const localIdent = await loadIdentity();
    localPubKey = localIdent.publicKey;
  } catch {
    // optional fallback
  }

  const inviteCode = encodeInvite(localPeerId, localAddrs, localCandidates, localPubKey);
  console.log(`\nYour invite code (share with ${peerName}):`);
  console.log(`  ${inviteCode}\n`);

  // 4. If contact has stored ICE candidates, run connectivity checks
  //    to find the best reachable address before dialing
  let dialAddr = contact.lastSeenAddr;

  // Register incoming chat protocol handler
  registerChatProtocol(node);

  try {
    await startChatSession(node, contact.peerId, dialAddr);
  } finally {
    await node.stop();
    Storage.close();
  }
}
