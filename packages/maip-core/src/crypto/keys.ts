/**
 * MAIP Key Management.
 *
 * Uses Ed25519 for signing and X25519 for encryption.
 * Ed25519 signing keys are converted to X25519 encryption keys
 * using tweetnacl's built-in conversion.
 *
 * DID format: did:maip:<base58-ed25519-public-key>
 */

import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "./encoding.js";
import { encodeBase58, decodeBase58 } from "./base58.js";

/** A MAIP keypair — signing + encryption keys. */
export interface MAIPKeyPair {
  /** Ed25519 signing keypair. */
  signing: nacl.SignKeyPair;
  /** X25519 encryption keypair (derived from signing keys). */
  encryption: {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  };
  /** The DID derived from the public signing key. */
  did: string;
}

/** DID method prefix. */
const DID_PREFIX = "did:maip:";

/**
 * Generate a new MAIP keypair.
 *
 * Creates an Ed25519 signing keypair and derives the X25519
 * encryption keypair from it.
 */
export function generateKeyPair(): MAIPKeyPair {
  const signing = nacl.sign.keyPair();
  const encryption = deriveEncryptionKeyPair(signing.secretKey);

  return {
    signing,
    encryption,
    did: publicKeyToDid(signing.publicKey),
  };
}

/**
 * Restore a keypair from a secret key (64 bytes for Ed25519).
 */
export function keyPairFromSecretKey(secretKey: Uint8Array): MAIPKeyPair {
  const signing = nacl.sign.keyPair.fromSecretKey(secretKey);
  const encryption = deriveEncryptionKeyPair(signing.secretKey);

  return {
    signing,
    encryption,
    did: publicKeyToDid(signing.publicKey),
  };
}

/**
 * Derive the DID from an Ed25519 public key.
 */
export function publicKeyToDid(publicKey: Uint8Array): string {
  return DID_PREFIX + encodeBase58(publicKey);
}

/**
 * Extract the Ed25519 public key from a DID.
 */
export function didToPublicKey(did: string): Uint8Array {
  if (!did.startsWith(DID_PREFIX)) {
    throw new Error(`Invalid MAIP DID: ${did}`);
  }
  return decodeBase58(did.slice(DID_PREFIX.length));
}

/**
 * Validate a DID format.
 */
export function isValidDid(did: string): boolean {
  if (!did.startsWith(DID_PREFIX)) return false;
  try {
    const key = didToPublicKey(did);
    return key.length === nacl.sign.publicKeyLength;
  } catch {
    return false;
  }
}

/**
 * Export a keypair for storage (secret key as base64).
 */
export function exportSecretKey(keyPair: MAIPKeyPair): string {
  return encodeBase64(keyPair.signing.secretKey);
}

/**
 * Import a keypair from a stored secret key (base64).
 */
export function importSecretKey(base64SecretKey: string): MAIPKeyPair {
  const secretKey = decodeBase64(base64SecretKey);
  return keyPairFromSecretKey(secretKey);
}

/**
 * Get the public signing key as base58 (for IdentityDocument.publicKey).
 */
export function getPublicKeyBase58(keyPair: MAIPKeyPair): string {
  return encodeBase58(keyPair.signing.publicKey);
}

/**
 * Get the public encryption key as base58 (for IdentityDocument.encryptionKey).
 */
export function getEncryptionKeyBase58(keyPair: MAIPKeyPair): string {
  return encodeBase58(keyPair.encryption.publicKey);
}

// ── Internal key conversion ──────────────────────────────────────

/**
 * Derive a X25519 box keypair from an Ed25519 signing keypair.
 *
 * Since tweetnacl doesn't expose ed2curve conversion, we derive
 * a deterministic X25519 secret key by hashing the Ed25519 seed
 * (first 32 bytes of the 64-byte secret key), then clamping it.
 * The X25519 public key is then computed from the secret key
 * using nacl.box.keyPair.fromSecretKey() to ensure they form
 * a valid keypair.
 */
function deriveEncryptionKeyPair(edSecretKey: Uint8Array): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  // Use the Ed25519 seed (first 32 bytes) to deterministically derive
  // an X25519 secret key via SHA-512 hash
  const seed = edSecretKey.subarray(0, 32);
  const hash = nacl.hash(seed);
  const x25519Secret = new Uint8Array(32);
  x25519Secret.set(hash.subarray(0, 32));
  // Clamp for X25519
  x25519Secret[0] &= 248;
  x25519Secret[31] &= 127;
  x25519Secret[31] |= 64;

  // Derive the matching public key from the secret key
  const boxKp = nacl.box.keyPair.fromSecretKey(x25519Secret);
  return {
    publicKey: boxKp.publicKey,
    secretKey: boxKp.secretKey,
  };
}
