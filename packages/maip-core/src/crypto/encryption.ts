/**
 * MAIP Message Encryption.
 *
 * Uses X25519 key exchange + XSalsa20-Poly1305 (NaCl box)
 * for authenticated encryption of private messages.
 */

import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "./encoding.js";
import type { EncryptionEnvelope } from "../types/message.js";

/**
 * Encrypt a message for a recipient.
 *
 * Uses an ephemeral X25519 keypair for forward secrecy.
 * The recipient uses their X25519 secret key + the ephemeral public key to decrypt.
 *
 * @param plaintext The message to encrypt (UTF-8 string).
 * @param recipientPublicKey The recipient's X25519 public key.
 * @returns The ciphertext (base64) and encryption envelope.
 */
export function encrypt(
  plaintext: string,
  recipientPublicKey: Uint8Array
): { ciphertext: string; envelope: EncryptionEnvelope } {
  // Generate ephemeral keypair for forward secrecy
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  const messageBytes = new TextEncoder().encode(plaintext);
  const encrypted = nacl.box(
    messageBytes,
    nonce,
    recipientPublicKey,
    ephemeral.secretKey
  );

  if (!encrypted) {
    throw new Error("Encryption failed");
  }

  return {
    ciphertext: encodeBase64(encrypted),
    envelope: {
      algorithm: "x25519-xsalsa20-poly1305",
      nonce: encodeBase64(nonce),
      ephemeralPublicKey: encodeBase64(ephemeral.publicKey),
    },
  };
}

/**
 * Decrypt a message.
 *
 * @param ciphertext Base64-encoded ciphertext.
 * @param envelope Encryption envelope with nonce and ephemeral public key.
 * @param recipientSecretKey The recipient's X25519 secret key.
 * @returns The decrypted plaintext string.
 */
export function decrypt(
  ciphertext: string,
  envelope: EncryptionEnvelope,
  recipientSecretKey: Uint8Array
): string {
  const encryptedBytes = decodeBase64(ciphertext);
  const nonce = decodeBase64(envelope.nonce);
  const ephemeralPublicKey = decodeBase64(envelope.ephemeralPublicKey);

  const decrypted = nacl.box.open(
    encryptedBytes,
    nonce,
    ephemeralPublicKey,
    recipientSecretKey
  );

  if (!decrypted) {
    throw new Error("Decryption failed — invalid key or corrupted message");
  }

  return new TextDecoder().decode(decrypted);
}
