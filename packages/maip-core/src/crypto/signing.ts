/**
 * MAIP Message Signing & Verification.
 *
 * Uses Ed25519 for all signatures. Messages are signed by serializing
 * the payload to canonical JSON (sorted keys) and signing the UTF-8 bytes.
 */

import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "./encoding.js";
import { didToPublicKey } from "./keys.js";

/**
 * Create a canonical JSON string for signing.
 *
 * Keys are sorted alphabetically at all levels to ensure deterministic
 * serialization regardless of object insertion order.
 */
export function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);

  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalize).join(",") + "]";
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys.map(
      (key) =>
        JSON.stringify(key) +
        ":" +
        canonicalize((obj as Record<string, unknown>)[key])
    );
    return "{" + pairs.join(",") + "}";
  }

  return String(obj);
}

/**
 * Sign a payload with an Ed25519 secret key.
 *
 * The payload is canonicalized to JSON, then the UTF-8 bytes are signed.
 * Returns the signature as a base64 string.
 */
export function sign(payload: unknown, secretKey: Uint8Array): string {
  const message = new TextEncoder().encode(canonicalize(payload));
  const signature = nacl.sign.detached(message, secretKey);
  return encodeBase64(signature);
}

/**
 * Verify a signature against a payload and public key.
 *
 * @param payload The original payload (will be canonicalized).
 * @param signature Base64-encoded signature.
 * @param publicKey Ed25519 public key (raw bytes).
 */
export function verify(
  payload: unknown,
  signature: string,
  publicKey: Uint8Array
): boolean {
  try {
    const message = new TextEncoder().encode(canonicalize(payload));
    const sig = decodeBase64(signature);
    return nacl.sign.detached.verify(message, sig, publicKey);
  } catch {
    return false;
  }
}

/**
 * Verify a signature using the sender's DID.
 *
 * Extracts the public key from the DID and verifies.
 */
export function verifyWithDid(
  payload: unknown,
  signature: string,
  senderDid: string
): boolean {
  try {
    const publicKey = didToPublicKey(senderDid);
    return verify(payload, signature, publicKey);
  } catch {
    return false;
  }
}

/**
 * Sign a document, adding the signature field.
 *
 * Creates a copy of the document without the "signature" field,
 * signs it, and returns the document with the signature added.
 */
export function signDocument<T extends Record<string, unknown>>(
  doc: T,
  secretKey: Uint8Array
): T & { signature: string } {
  const { signature: _, ...withoutSig } = doc;
  const sig = sign(withoutSig, secretKey);
  return { ...doc, signature: sig };
}

/**
 * Verify a self-signed document.
 *
 * Removes the "signature" field, canonicalizes the rest, and verifies.
 */
export function verifyDocument(
  doc: Record<string, unknown>,
  publicKey: Uint8Array
): boolean {
  const { signature, ...withoutSig } = doc;
  if (typeof signature !== "string") return false;
  return verify(withoutSig, signature, publicKey);
}
