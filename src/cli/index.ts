#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { contactsListCommand } from './commands/contacts.js';
import { contactsAddCommand, talkCommand } from './commands/network.js';

const program = new Command();

program
  .name('chat')
  .description('Cryptus — P2P Encrypted CLI Chat')
  .version('0.1.0');

// ── init ────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialize your identity and encrypted keystore')
  .action(initCommand);

// ── contacts ─────────────────────────────────────────────────────────────────
const contacts = program
  .command('contacts')
  .description('Manage your contacts');

contacts
  .command('add <name> <invite-code>')
  .description('Add a contact using their invite code')
  .action(contactsAddCommand);

contacts
  .command('list')
  .description('List all contacts')
  .action(contactsListCommand);

// ── talk ──────────────────────────────────────────────────────────────────────
program
  .command('talk <peer>')
  .description('Start a chat session with a contact')
  .action(talkCommand);

// ── verify ────────────────────────────────────────────────────────────────────
program
  .command('verify <peer>')
  .description("Verify a contact's identity fingerprint")
  .action(async (peer: string) => {
    console.log(`[Phase 7] Verifying ${peer} — not yet implemented`);
  });

// ── status ────────────────────────────────────────────────────────────────────
program
  .command('status <peer>')
  .description('Check delivery status of messages to a contact')
  .action(async (peer: string) => {
    console.log(`[Phase 6] Status for ${peer} — not yet implemented`);
  });

// ── export ────────────────────────────────────────────────────────────────────
program
  .command('export')
  .description('Export an encrypted backup of your identity and messages')
  .option('--out <file>', 'Output file path', 'cryptus-backup.age')
  .action(async (opts: { out: string }) => {
    console.log(`[Phase 10] Exporting to ${opts.out} — not yet implemented`);
  });

// ── import ────────────────────────────────────────────────────────────────────
program
  .command('import <file>')
  .description('Import identity and messages from an encrypted backup')
  .action(async (file: string) => {
    console.log(`[Phase 10] Importing from ${file} — not yet implemented`);
  });

program.parse();
