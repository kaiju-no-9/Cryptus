import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RatchetHeader {
  dhPubKey: Uint8Array;
  pn: number; // Previous chain length
  n: number;  // Message number in current chain
}

export interface SerializedRatchetState {
  dhLocalPrivate: string; // base64
  dhLocalPublic: string;  // base64
  dhRemotePublic: string | null; // base64
  rootKey: string;        // base64
  sendingChainKey: string | null; // base64
  receivingChainKey: string | null; // base64
  nSend: number;
  nRecv: number;
  pnSend: number;
  skippedKeys: Record<string, string>; // "dhPubKeyB64:n" -> messageKeyB64
}

// KDF constants
const KDF_INFO_ROOT = new TextEncoder().encode('CryptusRootKDF');
const KDF_INFO_CHAIN = new TextEncoder().encode('CryptusChainKDF');
const KDF_INFO_MSG = new TextEncoder().encode('CryptusMessageKDF');

// ── KDF Functions ────────────────────────────────────────────────────────────

function kdfRK(rootKey: Uint8Array, dhOutput: Uint8Array): { newRootKey: Uint8Array; chainKey: Uint8Array } {
  const derived = hkdf(sha256, dhOutput, rootKey, KDF_INFO_ROOT, 64);
  return {
    newRootKey: derived.subarray(0, 32),
    chainKey:   derived.subarray(32, 64),
  };
}

function kdfCK(chainKey: Uint8Array): { newChainKey: Uint8Array; messageKey: Uint8Array } {
  const derived = hkdf(sha256, chainKey, new Uint8Array(32), KDF_INFO_CHAIN, 64);
  return {
    newChainKey: derived.subarray(0, 32),
    messageKey:  derived.subarray(32, 64),
  };
}

// ── Double Ratchet Engine ────────────────────────────────────────────────────

export class DoubleRatchet {
  private dhLocalPrivate: Uint8Array;
  private dhLocalPublic: Uint8Array;
  private dhRemotePublic: Uint8Array | null = null;

  private rootKey: Uint8Array;
  private sendingChainKey: Uint8Array | null = null;
  private receivingChainKey: Uint8Array | null = null;

  private nSend = 0;
  private nRecv = 0;
  private pnSend = 0;

  /** Map of skipped message keys: "dhRemotePubB64:n" -> messageKey */
  private skippedKeys = new Map<string, Uint8Array>();
  private readonly MAX_SKIPPED_KEYS = 100;

  private constructor(
    sharedSecret: Uint8Array,
    isInitiator: boolean,
    remoteDhPubKey?: Uint8Array,
  ) {
    const keypair = generateX25519Keypair();
    this.dhLocalPrivate = keypair.privateKey;
    this.dhLocalPublic = keypair.publicKey;
    this.rootKey = new Uint8Array(sharedSecret);

    if (isInitiator && remoteDhPubKey) {
      this.dhRemotePublic = new Uint8Array(remoteDhPubKey);
      const dhOut = x25519.getSharedSecret(this.dhLocalPrivate, this.dhRemotePublic);
      const { newRootKey, chainKey } = kdfRK(this.rootKey, dhOut);
      this.rootKey = newRootKey;
      this.sendingChainKey = chainKey;
    }
  }

  /** Initialize Double Ratchet session for initiator (Alice) */
  static initAlice(sharedSecret: Uint8Array, bobDhPubKey: Uint8Array): DoubleRatchet {
    return new DoubleRatchet(sharedSecret, true, bobDhPubKey);
  }

  /** Initialize Double Ratchet session for responder (Bob) */
  static initBob(sharedSecret: Uint8Array, bobDhKeypair: { privateKey: Uint8Array; publicKey: Uint8Array }): DoubleRatchet {
    const session = new DoubleRatchet(sharedSecret, false);
    session.dhLocalPrivate = bobDhKeypair.privateKey;
    session.dhLocalPublic = bobDhKeypair.publicKey;
    return session;
  }

  /** Encrypt plaintext and advance sending chain ratchet */
  encrypt(plaintext: string): { header: RatchetHeader; ciphertext: Uint8Array } {
    if (!this.sendingChainKey) {
      throw new Error('Sending chain key not initialized');
    }

    const { newChainKey, messageKey } = kdfCK(this.sendingChainKey);
    this.sendingChainKey = newChainKey;

    const header: RatchetHeader = {
      dhPubKey: this.dhLocalPublic,
      pn:       this.pnSend,
      n:        this.nSend,
    };

    this.nSend++;

    // Encrypt with XChaCha20-Poly1305 using derived messageKey
    const nonce = new Uint8Array(randomBytes(24));
    const cipher = xchacha20poly1305(messageKey, nonce);
    const textBytes = new TextEncoder().encode(plaintext);
    const encrypted = cipher.encrypt(textBytes);

    // Wire output: nonce (24 bytes) || ciphertext
    const result = new Uint8Array(nonce.length + encrypted.length);
    result.set(nonce, 0);
    result.set(encrypted, nonce.length);

    return { header, ciphertext: result };
  }

  /** Decrypt ciphertext and step receiving/DH ratchet */
  decrypt(header: RatchetHeader, ciphertext: Uint8Array): string {
    const key = this.skipMessageKeys(header.dhPubKey, header.n);

    const nonce = ciphertext.subarray(0, 24);
    const cipherBytes = ciphertext.subarray(24);

    let messageKey = key;

    if (!messageKey) {
      // Check if DH ratchet step is needed
      if (!this.dhRemotePublic || !areUint8ArraysEqual(header.dhPubKey, this.dhRemotePublic)) {
        this.skipMessageKeysForDh(header.dhPubKey, header.pn);
        this.dhRatchetStep(header.dhPubKey);
      }

      this.skipMessageKeysForDh(header.dhPubKey, header.n);

      if (!this.receivingChainKey) {
        throw new Error('Receiving chain key not initialized');
      }

      const { newChainKey, messageKey: mKey } = kdfCK(this.receivingChainKey);
      this.receivingChainKey = newChainKey;
      this.nRecv++;
      messageKey = mKey;
    }

    const cipher = xchacha20poly1305(messageKey, nonce);
    const decryptedBytes = cipher.decrypt(cipherBytes);
    return new TextDecoder().decode(decryptedBytes);
  }

  /** DH Ratchet step when remote DH key changes */
  private dhRatchetStep(remoteDhPubKey: Uint8Array): void {
    this.pnSend = this.nSend;
    this.nSend = 0;
    this.nRecv = 0;
    this.dhRemotePublic = new Uint8Array(remoteDhPubKey);

    // DH step 1: derive receiving chain
    const dhOut1 = x25519.getSharedSecret(this.dhLocalPrivate, this.dhRemotePublic);
    const rk1 = kdfRK(this.rootKey, dhOut1);
    this.rootKey = rk1.newRootKey;
    this.receivingChainKey = rk1.chainKey;

    // DH step 2: generate new local DH keypair and derive sending chain
    const newKeypair = generateX25519Keypair();
    this.dhLocalPrivate = newKeypair.privateKey;
    this.dhLocalPublic = newKeypair.publicKey;

    const dhOut2 = x25519.getSharedSecret(this.dhLocalPrivate, this.dhRemotePublic);
    const rk2 = kdfRK(this.rootKey, dhOut2);
    this.rootKey = rk2.newRootKey;
    this.sendingChainKey = rk2.chainKey;
  }

  private skipMessageKeysForDh(remoteDhPubKey: Uint8Array, until: number): void {
    if (!this.receivingChainKey) return;

    while (this.nRecv < until) {
      const { newChainKey, messageKey } = kdfCK(this.receivingChainKey);
      this.receivingChainKey = newChainKey;
      const keyId = `${toB64(remoteDhPubKey)}:${this.nRecv}`;
      this.skippedKeys.set(keyId, messageKey);
      if (this.skippedKeys.size > this.MAX_SKIPPED_KEYS) {
        // Evict oldest skipped key
        const firstKey = this.skippedKeys.keys().next().value;
        if (firstKey) this.skippedKeys.delete(firstKey);
      }
      this.nRecv++;
    }
  }

  private skipMessageKeys(remoteDhPubKey: Uint8Array, n: number): Uint8Array | null {
    const keyId = `${toB64(remoteDhPubKey)}:${n}`;
    const mKey = this.skippedKeys.get(keyId);
    if (mKey) {
      this.skippedKeys.delete(keyId);
      return mKey;
    }
    return null;
  }

  /** Serialize ratchet state to JSON-safe object for SQLite persistence */
  serialize(): SerializedRatchetState {
    const skippedObj: Record<string, string> = {};
    for (const [k, v] of this.skippedKeys.entries()) {
      skippedObj[k] = toB64(v);
    }

    return {
      dhLocalPrivate:    toB64(this.dhLocalPrivate),
      dhLocalPublic:     toB64(this.dhLocalPublic),
      dhRemotePublic:    this.dhRemotePublic ? toB64(this.dhRemotePublic) : null,
      rootKey:           toB64(this.rootKey),
      sendingChainKey:   this.sendingChainKey ? toB64(this.sendingChainKey) : null,
      receivingChainKey: this.receivingChainKey ? toB64(this.receivingChainKey) : null,
      nSend:             this.nSend,
      nRecv:             this.nRecv,
      pnSend:            this.pnSend,
      skippedKeys:       skippedObj,
    };
  }

  /** Restore Double Ratchet session from serialized state */
  static deserialize(state: SerializedRatchetState): DoubleRatchet {
    const dummyKey = new Uint8Array(32);
    const session = new DoubleRatchet(dummyKey, false);

    session.dhLocalPrivate = fromB64(state.dhLocalPrivate);
    session.dhLocalPublic = fromB64(state.dhLocalPublic);
    session.dhRemotePublic = state.dhRemotePublic ? fromB64(state.dhRemotePublic) : null;
    session.rootKey = fromB64(state.rootKey);
    session.sendingChainKey = state.sendingChainKey ? fromB64(state.sendingChainKey) : null;
    session.receivingChainKey = state.receivingChainKey ? fromB64(state.receivingChainKey) : null;
    session.nSend = state.nSend;
    session.nRecv = state.nRecv;
    session.pnSend = state.pnSend;

    session.skippedKeys.clear();
    for (const [k, v] of Object.entries(state.skippedKeys)) {
      session.skippedKeys.set(k, fromB64(v));
    }

    return session;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function generateX25519Keypair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = new Uint8Array(randomBytes(32));
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

function toB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function fromB64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
