import { Storage } from '../../storage/index.js';
import { decodeInvite } from '../../network/discovery/invite.js';
import { createNode } from '../../network/discovery/node.js';
import { registerChatProtocol, startChatSession } from '../../network/discovery/protocol.js';
import { encodeInvite } from '../../network/discovery/invite.js';

// ── contacts add ─────────────────────────────────────────────────────────────

export async function contactsAddCommand(name: string, inviteCode: string): Promise<void> {
  let invite;
  try {
    invite = decodeInvite(inviteCode);
  } catch (err) {
    console.error(`❌  ${(err as Error).message}`);
    return;
  }

  const storage = Storage.open();

  // Check for duplicate
  if (storage.contacts.get(invite.peerId)) {
    console.log(`Contact with peer ID ${invite.peerId.substring(0, 16)}… already exists.`);
    return;
  }

  storage.contacts.add({
    peerId:       invite.peerId,
    displayName:  name,
    publicKey:    new Uint8Array(32), // placeholder until key exchange (Phase 7)
    addedAt:      Date.now(),
    lastSeenAddr: invite.addrs[0] ?? null,
  });

  console.log(`✅  Added contact "${name}" (${invite.peerId.substring(0, 20)}…)`);
  console.log(`   Known address: ${invite.addrs[0] ?? 'none'}`);
  console.log('\n⚠️   Fingerprint unverified. Run `chat verify <name>` after your first chat.');
}

// ── contacts list — re-exported from contacts.ts ─────────────────────────────

export { contactsListCommand } from './contacts.js';

// ── talk ─────────────────────────────────────────────────────────────────────

export async function talkCommand(peerName: string): Promise<void> {
  const storage = Storage.open();

  // Look up by display name
  const all = storage.contacts.list();
  const contact = all.find(c => c.displayName === peerName || c.peerId === peerName);

  if (!contact) {
    console.error(`❌  No contact named "${peerName}". Run \`chat contacts list\` to see your contacts.`);
    return;
  }

  if (!contact.lastSeenAddr) {
    console.error(`❌  No known address for "${peerName}". Ask them to share a fresh invite code.`);
    return;
  }

  // Spin up our own node
  const node = await createNode();
  const localAddrs = node.getMultiaddrs().map(m => m.toString());
  const localPeerId = node.peerId.toString();

  console.log(`\nYour invite code (share with ${peerName}):`);
  console.log(`  ${encodeInvite(localPeerId, localAddrs)}\n`);

  // Register protocol so we can receive messages too
  registerChatProtocol(node);

  try {
    await startChatSession(node, contact.peerId, contact.lastSeenAddr);
  } finally {
    await node.stop();
    Storage.close();
  }
}
