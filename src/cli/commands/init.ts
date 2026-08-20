import { createIdentity, identityExists } from '../../identity/index.js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export async function initCommand(): Promise<void> {
  // Guard — prevent accidental overwrite of an existing identity
  if (await identityExists()) {
    console.log('Identity already exists.');
    console.log('Run `chat export --out backup.age` first if you want to back it up before reinitialising.');
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });

  const passphrase = await rl.question('Choose a passphrase to protect your local keys: ');
  if (!passphrase || passphrase.length < 8) {
    console.error('✗  Passphrase must be at least 8 characters.');
    rl.close();
    return;
  }

  const confirm = await rl.question('Confirm passphrase: ');
  if (passphrase !== confirm) {
    console.error('✗  Passphrases do not match.');
    rl.close();
    return;
  }

  rl.close();

  console.log('\nGenerating identity… (this takes a moment — Argon2id hashing your passphrase)');
  const identity = await createIdentity(passphrase);

  console.log('\n✓  Identity created!');
  console.log(`Your peer ID: ${identity.peerId}`);
  console.log('\nShare your peer ID (or the invite code printed by `chat contacts add`) with');
  console.log('people you want to chat with.');
  console.log('\n[!] Back up your identity now:  chat export --out my-backup.age');
}
