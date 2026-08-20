import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Storage } from '../../storage/index.js';
import { loadIdentity } from '../../identity/index.js';
import { computeFingerprint, formatFingerprintDisplay } from '../../crypto/index.js';

export async function verifyCommand(peerName: string): Promise<void> {
  const storage = Storage.open();

  const allContacts = storage.contacts.list();
  const contact = allContacts.find((c) => c.displayName === peerName || c.peerId === peerName);

  if (!contact) {
    console.error(`✗  No contact named "${peerName}". Run \`chat contacts list\` to see your contacts.`);
    return;
  }

  // Load our own identity public key
  let localIdentity;
  try {
    localIdentity = await loadIdentity();
  } catch {
    console.error(`✗  Identity not found. Run \`chat init\` first.`);
    return;
  }

  // Compute Safety Number
  const fingerprint = computeFingerprint(localIdentity.publicKey, contact.publicKey);
  const formattedDisplay = formatFingerprintDisplay(fingerprint);

  console.log(`\n========================================================================`);
  console.log(`  SAFETY NUMBER VERIFICATION FOR: ${contact.displayName}`);
  console.log(`========================================================================\n`);

  console.log(`Compare this 60-digit Safety Number with the number on ${contact.displayName}'s device:\n`);
  console.log(formattedDisplay);
  console.log('\n────────────────────────────────────────────────────────────────────────');

  if (contact.fingerprintVerified) {
    console.log(`Status: [V] ALREADY VERIFIED`);
    console.log(`This contact's identity key has already been verified.\n`);
    return;
  }

  console.log(`Status: [U] UNVERIFIED\n`);

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `Does the Safety Number above EXACTLY match ${contact.displayName}'s device? [y/N]: `,
  );
  rl.close();

  if (answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes') {
    storage.contacts.markVerified(contact.peerId);
    console.log(`\n✓  Successfully verified "${contact.displayName}"!`);
    console.log(`Identity key is locked. You will be alerted if their key ever changes.\n`);
  } else {
    console.log(`\n[!] Verification skipped. "${contact.displayName}" remains unverified.\n`);
  }
}
