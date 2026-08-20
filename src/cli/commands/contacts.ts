import { Storage } from '../../storage/index.js';

export async function contactsListCommand(): Promise<void> {
  const storage = Storage.open();
  const contacts = storage.contacts.list();

  if (contacts.length === 0) {
    console.log('No contacts yet.');
    console.log('Add one with:  chat contacts add <name> <invite-code>');
    return;
  }

  console.log(`\n${'NAME'.padEnd(20)} ${'VERIFIED'.padEnd(10)} ${'PEER ID'.padEnd(55)} LAST SEEN`);
  console.log('─'.repeat(110));

  for (const c of contacts) {
    const name      = (c.displayName ?? '(unnamed)').padEnd(20);
    const verified  = (c.fingerprintVerified ? '[V] yes' : '[U] no ').padEnd(10);
    const peerId    = c.peerId.padEnd(55);
    const lastSeen  = c.lastSeenAddr ?? 'never';
    console.log(`${name} ${verified} ${peerId} ${lastSeen}`);
  }
  console.log('');
}
