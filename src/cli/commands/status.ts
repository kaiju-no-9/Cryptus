import { Storage } from '../../storage/index.js';

export async function statusCommand(peerName: string): Promise<void> {
  const storage = Storage.open();

  const allContacts = storage.contacts.list();
  const contact = allContacts.find((c) => c.displayName === peerName || c.peerId === peerName);

  if (!contact) {
    console.error(`✗  No contact named "${peerName}". Run \`chat contacts list\` to see your contacts.`);
    return;
  }

  const messages = storage.messages.getByPeer(contact.peerId, 100);

  if (messages.length === 0) {
    console.log(`No message history with ${contact.displayName} (${contact.peerId.substring(0, 16)}…).`);
    return;
  }

  console.log(`\n=== Message Status for ${contact.displayName} (${contact.peerId.substring(0, 16)}…) ===\n`);

  let pendingCount = 0;
  let sentCount = 0;
  let deliveredCount = 0;
  let incomingCount = 0;

  for (const m of messages) {
    if (m.direction === 'incoming') {
      incomingCount++;
    } else {
      if (m.status === 'pending') pendingCount++;
      else if (m.status === 'sent') sentCount++;
      else if (m.status === 'delivered') deliveredCount++;
    }
  }

  console.log(`Summary:`);
  console.log(`  Incoming: ${incomingCount}`);
  console.log(`  Pending (in outbox): ${pendingCount} •`);
  console.log(`  Sent (awaiting ACK): ${sentCount} ✓`);
  console.log(`  Delivered: ${deliveredCount} ✓✓`);
  console.log('\nRecent Messages:');
  console.log('──────────────────────────────────────────────────────────────────────────────────');

  for (const m of messages.slice(-10)) {
    const timeStr = new Date(m.createdAt).toLocaleTimeString();
    const icon =
      m.direction === 'incoming'
        ? '← '
        : m.status === 'delivered'
        ? '✓✓'
        : m.status === 'sent'
        ? '✓ '
        : '• ';

    const dirStr = m.direction === 'outgoing' ? 'TO' : 'FROM';
    const preview = (m.plaintext ?? '[encrypted]').substring(0, 40);

    console.log(`  ${icon} [${timeStr}] ${dirStr} ${contact.displayName}: "${preview}" (${m.status})`);
  }

  console.log('──────────────────────────────────────────────────────────────────────────────────\n');
}
