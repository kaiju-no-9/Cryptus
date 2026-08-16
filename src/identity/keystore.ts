import { argon2id } from 'hash-wasm';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from 'node:crypto';

export interface EncryptedKeystore {
  salt: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  /** Stored alongside ciphertext so params can be upgraded in future versions */
  argonParams: { m: number; t: number; p: number };
}

/**
 * Argon2id parameters:
 *   m = 65536 → 64 MB memory
 *   t = 3     → 3 iterations
 *   p = 4     → 4-way parallelism
 * These are stored in the keystore file so they can be migrated without
 * requiring the user to re-enter their passphrase.
 */
const DEFAULT_ARGON_PARAMS = { m: 65536, t: 3, p: 4 };

/**
 * Encrypts a private key with a user passphrase.
 * KDF: Argon2id → 32-byte key
 * Cipher: XChaCha20-Poly1305 (authenticated encryption)
 */
export async function encryptKeystore(
  privateKey: Uint8Array,
  passphrase: string
): Promise<EncryptedKeystore> {
  const salt = new Uint8Array(randomBytes(16));
  const nonce = new Uint8Array(randomBytes(24));

  const derivedKey = await argon2id({
    password: passphrase,
    salt,
    parallelism: DEFAULT_ARGON_PARAMS.p,
    iterations: DEFAULT_ARGON_PARAMS.t,
    memorySize: DEFAULT_ARGON_PARAMS.m,
    hashLength: 32,
    outputType: 'binary',
  });

  const cipher = xchacha20poly1305(derivedKey, nonce);
  const ciphertext = cipher.encrypt(privateKey);

  return { salt, nonce, ciphertext, argonParams: DEFAULT_ARGON_PARAMS };
}

/**
 * Decrypts a keystore back to the raw private key bytes.
 * Throws if the passphrase is wrong (AEAD tag mismatch).
 */
export async function decryptKeystore(
  store: EncryptedKeystore,
  passphrase: string
): Promise<Uint8Array> {
  const derivedKey = await argon2id({
    password: passphrase,
    salt: store.salt,
    parallelism: store.argonParams.p,
    iterations: store.argonParams.t,
    memorySize: store.argonParams.m,
    hashLength: 32,
    outputType: 'binary',
  });

  const cipher = xchacha20poly1305(derivedKey, store.nonce);
  return cipher.decrypt(store.ciphertext);
}
