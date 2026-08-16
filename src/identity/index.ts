import { generateKeypair } from './keygen.js';
import { derivePeerId } from './peer-id.js';
import { encryptKeystore, decryptKeystore, type EncryptedKeystore } from './keystore.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface Identity {
  publicKey: Uint8Array;
  peerId: string;
}

// All cryptus data lives in ~/.cryptus/
const CRYPTUS_DIR = join(homedir(), '.cryptus');
const KEYSTORE_PATH = join(CRYPTUS_DIR, 'keystore.json');  // encrypted private key
const PUBKEY_PATH = join(CRYPTUS_DIR, 'identity.json');    // public key + peer ID (not secret)

// ── Create ──────────────────────────────────────────────────────────────────

/**
 * Generates a fresh identity, encrypts the private key, and persists both
 * files to disk. Call only once — guard with identityExists() first.
 */
export async function createIdentity(passphrase: string): Promise<Identity> {
  const { publicKey, privateKey } = generateKeypair();
  const peerId = derivePeerId(publicKey);
  const encryptedStore = await encryptKeystore(privateKey, passphrase);

  await mkdir(CRYPTUS_DIR, { recursive: true });

  // keystore.json — contains the encrypted private key (safe to back up)
  await writeFile(KEYSTORE_PATH, JSON.stringify({
    salt:       Buffer.from(encryptedStore.salt).toString('base64'),
    nonce:      Buffer.from(encryptedStore.nonce).toString('base64'),
    ciphertext: Buffer.from(encryptedStore.ciphertext).toString('base64'),
    argonParams: encryptedStore.argonParams,
  }, null, 2));

  // identity.json — public information only (no secrets here)
  await writeFile(PUBKEY_PATH, JSON.stringify({
    publicKey: Buffer.from(publicKey).toString('base64'),
    peerId,
  }, null, 2));

  return { publicKey, peerId };
}

// ── Load ─────────────────────────────────────────────────────────────────────

/** Loads the public identity from disk (no passphrase needed). */
export async function loadIdentity(): Promise<Identity> {
  const data = JSON.parse(await readFile(PUBKEY_PATH, 'utf-8'));
  return {
    publicKey: new Uint8Array(Buffer.from(data.publicKey, 'base64')),
    peerId: data.peerId,
  };
}

/** Decrypts and returns the raw private key bytes. Requires passphrase. */
export async function loadPrivateKey(passphrase: string): Promise<Uint8Array> {
  const data = JSON.parse(await readFile(KEYSTORE_PATH, 'utf-8'));
  const store: EncryptedKeystore = {
    salt:       new Uint8Array(Buffer.from(data.salt, 'base64')),
    nonce:      new Uint8Array(Buffer.from(data.nonce, 'base64')),
    ciphertext: new Uint8Array(Buffer.from(data.ciphertext, 'base64')),
    argonParams: data.argonParams,
  };
  return decryptKeystore(store, passphrase);
}

// ── Guard ────────────────────────────────────────────────────────────────────

/** Returns true if an identity has already been created on this machine. */
export async function identityExists(): Promise<boolean> {
  try {
    await readFile(PUBKEY_PATH);
    return true;
  } catch {
    return false;
  }
}
