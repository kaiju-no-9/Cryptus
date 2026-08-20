import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { argon2id } from 'hash-wasm';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from 'node:crypto';
import { Storage } from '../storage/index.js';

const DATA_DIR = join(homedir(), '.cryptus');
const KEYSTORE_PATH = join(DATA_DIR, 'keystore.json');
const DB_PATH = join(DATA_DIR, 'data.db');

interface BackupPayload {
  version: number;
  keystoreJson: string;
  dbBase64: string;
  timestamp: number;
}

const ARGON_PARAMS = { m: 65536, t: 3, p: 4 };

/** Export keystore and database into an encrypted .cryptus-backup file */
export async function exportBackup(passphrase: string, outputPath: string): Promise<void> {
  if (!existsSync(KEYSTORE_PATH)) {
    throw new Error('No identity found to export. Run `chat init` first.');
  }

  // Ensure DB wal is checkpointed and closed before reading
  Storage.close();

  const keystoreJson = readFileSync(KEYSTORE_PATH, 'utf-8');
  const dbBytes = existsSync(DB_PATH) ? readFileSync(DB_PATH) : new Uint8Array(0);
  const dbBase64 = Buffer.from(dbBytes).toString('base64');

  const payload: BackupPayload = {
    version: 1,
    keystoreJson,
    dbBase64,
    timestamp: Date.now(),
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

  // Key derivation using Argon2id
  const salt = new Uint8Array(randomBytes(16));
  const nonce = new Uint8Array(randomBytes(24));

  const derivedKey = await argon2id({
    password: passphrase,
    salt,
    parallelism: ARGON_PARAMS.p,
    iterations: ARGON_PARAMS.t,
    memorySize: ARGON_PARAMS.m,
    hashLength: 32,
    outputType: 'binary',
  });

  const cipher = xchacha20poly1305(derivedKey, nonce);
  const ciphertext = cipher.encrypt(payloadBytes);

  // Archive format: Magic (8 bytes) || salt (16 bytes) || nonce (24 bytes) || ciphertext
  const magic = new TextEncoder().encode('CRYPTUSBK');
  const archive = new Uint8Array(magic.length + salt.length + nonce.length + ciphertext.length);

  archive.set(magic, 0);
  archive.set(salt, magic.length);
  archive.set(nonce, magic.length + salt.length);
  archive.set(ciphertext, magic.length + salt.length + nonce.length);

  writeFileSync(outputPath, archive);
}

/** Import and restore identity and database from an encrypted .cryptus-backup file */
export async function importBackup(passphrase: string, inputPath: string): Promise<BackupPayload> {
  if (!existsSync(inputPath)) {
    throw new Error(`Backup file not found: ${inputPath}`);
  }

  const archive = readFileSync(inputPath);
  const magic = archive.subarray(0, 9);
  const magicStr = new TextDecoder().decode(magic);

  if (magicStr !== 'CRYPTUSBK') {
    throw new Error('Invalid backup archive — unrecognized magic header.');
  }

  const salt = archive.subarray(9, 25);
  const nonce = archive.subarray(25, 49);
  const ciphertext = archive.subarray(49);

  const derivedKey = await argon2id({
    password: passphrase,
    salt,
    parallelism: ARGON_PARAMS.p,
    iterations: ARGON_PARAMS.t,
    memorySize: ARGON_PARAMS.m,
    hashLength: 32,
    outputType: 'binary',
  });

  const cipher = xchacha20poly1305(derivedKey, nonce);
  let decryptedBytes: Uint8Array;

  try {
    decryptedBytes = cipher.decrypt(ciphertext);
  } catch {
    throw new Error('Backup decryption failed — incorrect passphrase.');
  }

  const payload = JSON.parse(new TextDecoder().decode(decryptedBytes)) as BackupPayload;

  // Restore keystore and database files
  Storage.close();
  writeFileSync(KEYSTORE_PATH, payload.keystoreJson, 'utf-8');

  if (payload.dbBase64) {
    const dbBytes = Buffer.from(payload.dbBase64, 'base64');
    writeFileSync(DB_PATH, dbBytes);
  }

  return payload;
}
