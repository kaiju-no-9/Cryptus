import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { exportBackup, importBackup } from '../../backup/index.js';

export async function exportCommand(opts: { out: string }): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log(`\nExport Encrypted Backup`);
  const passphrase = await rl.question('Enter a passphrase to encrypt your backup file: ');
  const confirm = await rl.question('Confirm backup passphrase: ');
  rl.close();

  if (passphrase !== confirm) {
    console.error('✗  Passphrases do not match. Export cancelled.');
    return;
  }

  if (!passphrase.trim()) {
    console.error('✗  Passphrase cannot be empty.');
    return;
  }

  console.log('\nEncrypting identity keystore and message history database…');

  try {
    await exportBackup(passphrase, opts.out);
    console.log(`✓  Backup exported successfully to: ${opts.out}`);
    console.log(`   Keep this passphrase safe — it is required to restore your backup.\n`);
  } catch (err) {
    console.error(`✗  Export failed: ${(err as Error).message}`);
  }
}

export async function importCommand(file: string): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log(`\nImport Encrypted Backup from: ${file}`);
  const passphrase = await rl.question('Enter backup decryption passphrase: ');
  rl.close();

  console.log('\nDecrypting and restoring identity and database…');

  try {
    const payload = await importBackup(passphrase, file);
    const dateStr = new Date(payload.timestamp).toLocaleString();
    console.log(`✓  Backup restored successfully!`);
    console.log(`   Archive created on: ${dateStr}`);
    console.log(`   Your identity, contacts, and message history have been rehydrated.\n`);
  } catch (err) {
    console.error(`✗  Import failed: ${(err as Error).message}`);
  }
}
