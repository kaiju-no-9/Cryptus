#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { contactsListCommand } from './commands/contacts.js';
import { contactsAddCommand, talkCommand } from './commands/network.js';
import { statusCommand } from './commands/status.js';
import { verifyCommand } from './commands/verify.js';

import { launchTUI } from '../tui/index.js';

const program = new Command();

program
  .name('chat')
  .description('Cryptus — P2P Encrypted CLI Chat')
  .version('0.1.0')
  .action(() => {
    // If no subcommand is specified, launch Ink TUI
    if (process.argv.length <= 2) {
      launchTUI();
    }
  });

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
  .action(verifyCommand);

// ── status ────────────────────────────────────────────────────────────────────
program
  .command('status <peer>')
  .description('Check delivery status of messages to a contact')
  .action(statusCommand);

import { exportCommand, importCommand } from './commands/backup.js';

// ── export ────────────────────────────────────────────────────────────────────
program
  .command('export')
  .description('Export an encrypted backup of your identity and messages')
  .option('--out <file>', 'Output file path', 'cryptus-backup.age')
  .action(exportCommand);

// ── import ────────────────────────────────────────────────────────────────────
program
  .command('import <file>')
  .description('Import identity and messages from an encrypted backup')
  .action(importCommand);

program.parse();
