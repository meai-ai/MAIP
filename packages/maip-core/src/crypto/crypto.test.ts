/**
 * Tests for MAIP crypto utilities.
 *
 * Verifies key generation, signing/verification, encryption/decryption,
 * and document signing workflows.
 */

import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  keyPairFromSecretKey,
  publicKeyToDid,
  didToPublicKey,
  isValidDid,
  exportSecretKey,
  importSecretKey,
  getPublicKeyBase58,
  getEncryptionKeyBase58,
} from "./keys.js";
import { canonicalize, sign, verify, verifyWithDid, signDocument, verifyDocument } from "./signing.js";
import { encrypt, decrypt } from "./encryption.js";
import { encodeBase58, decodeBase58 } from "./base58.js";
import { encodeBase64, decodeBase64 } from "./encoding.js";

describe("Key Management", () => {
  it("generates a valid keypair", () => {
    const kp = generateKeyPair();

    expect(kp.did).toMatch(/^did:maip:[1-9A-HJ-NP-Za-km-z]+$/);
    expect(kp.signing.publicKey).toHaveLength(32);
    expect(kp.signing.secretKey).toHaveLength(64);
    expect(kp.encryption.publicKey).toHaveLength(32);
    expect(kp.encryption.secretKey).toHaveLength(32);
  });

  it("generates unique keypairs", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();

    expect(kp1.did).not.toBe(kp2.did);
  });

  it("restores keypair from secret key", () => {
    const original = generateKeyPair();
    const restored = keyPairFromSecretKey(original.signing.secretKey);

    expect(restored.did).toBe(original.did);
    expect(restored.signing.publicKey).toEqual(original.signing.publicKey);
  });

  it("export and import secret key", () => {
    const original = generateKeyPair();
    const exported = exportSecretKey(original);
    const imported = importSecretKey(exported);

    expect(imported.did).toBe(original.did);
  });

  it("DID ↔ public key round-trip", () => {
    const kp = generateKeyPair();
    const pubkey = didToPublicKey(kp.did);
    const did = publicKeyToDid(pubkey);

    expect(did).toBe(kp.did);
    expect(pubkey).toEqual(kp.signing.publicKey);
  });

  it("validates DIDs", () => {
    const kp = generateKeyPair();
    expect(isValidDid(kp.did)).toBe(true);
    expect(isValidDid("did:maip:invalid!chars")).toBe(false);
    expect(isValidDid("did:other:abc")).toBe(false);
    expect(isValidDid("not-a-did")).toBe(false);
  });

  it("returns base58 keys for identity document", () => {
    const kp = generateKeyPair();
    const pub58 = getPublicKeyBase58(kp);
    const enc58 = getEncryptionKeyBase58(kp);

    expect(pub58).toBeTruthy();
    expect(enc58).toBeTruthy();
    expect(pub58).not.toBe(enc58);
  });
});

describe("Base58", () => {
  it("round-trips data", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
    const encoded = encodeBase58(data);
    const decoded = decodeBase58(encoded);

    expect(decoded).toEqual(data);
  });

  it("handles leading zeros", () => {
    const data = new Uint8Array([0, 0, 1, 2]);
    const encoded = encodeBase58(data);
    expect(encoded.startsWith("11")).toBe(true);
    const decoded = decodeBase58(encoded);
    expect(decoded).toEqual(data);
  });

  it("handles empty data", () => {
    expect(encodeBase58(new Uint8Array(0))).toBe("");
    expect(decodeBase58("")).toEqual(new Uint8Array(0));
  });
});

describe("Base64", () => {
  it("round-trips data", () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]);
    const encoded = encodeBase64(data);
    const decoded = decodeBase64(encoded);

    expect(decoded).toEqual(data);
  });
});

describe("Signing & Verification", () => {
  it("canonicalize produces deterministic output", () => {
    const obj1 = { b: 2, a: 1 };
    const obj2 = { a: 1, b: 2 };

    expect(canonicalize(obj1)).toBe(canonicalize(obj2));
    expect(canonicalize(obj1)).toBe('{"a":1,"b":2}');
  });

  it("canonicalize handles nested objects", () => {
    const obj = { z: { b: 2, a: 1 }, a: "hello" };
    expect(canonicalize(obj)).toBe('{"a":"hello","z":{"a":1,"b":2}}');
  });

  it("canonicalize handles arrays", () => {
    const obj = { items: [3, 1, 2] };
    expect(canonicalize(obj)).toBe('{"items":[3,1,2]}');
  });

  it("sign and verify", () => {
    const kp = generateKeyPair();
    const payload = { message: "hello", count: 42 };

    const sig = sign(payload, kp.signing.secretKey);
    expect(verify(payload, sig, kp.signing.publicKey)).toBe(true);
  });

  it("reject tampered payload", () => {
    const kp = generateKeyPair();
    const payload = { message: "hello" };

    const sig = sign(payload, kp.signing.secretKey);
    expect(verify({ message: "goodbye" }, sig, kp.signing.publicKey)).toBe(false);
  });

  it("reject wrong key", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    const payload = { message: "hello" };

    const sig = sign(payload, kp1.signing.secretKey);
    expect(verify(payload, sig, kp2.signing.publicKey)).toBe(false);
  });

  it("verify with DID", () => {
    const kp = generateKeyPair();
    const payload = { test: true };

    const sig = sign(payload, kp.signing.secretKey);
    expect(verifyWithDid(payload, sig, kp.did)).toBe(true);
  });

  it("sign and verify document", () => {
    const kp = generateKeyPair();
    const doc = {
      version: "0.1.0",
      did: kp.did,
      displayName: "Test Agent",
      signature: "",
    };

    const signed = signDocument(doc, kp.signing.secretKey);
    expect(signed.signature).toBeTruthy();
    expect(signed.signature).not.toBe("");

    expect(verifyDocument(signed, kp.signing.publicKey)).toBe(true);
  });

  it("reject tampered document", () => {
    const kp = generateKeyPair();
    const doc = { name: "original", signature: "" };
    const signed = signDocument(doc, kp.signing.secretKey);

    const tampered = { ...signed, name: "tampered" };
    expect(verifyDocument(tampered, kp.signing.publicKey)).toBe(false);
  });
});

describe("Encryption & Decryption", () => {
  it("encrypt and decrypt a message", () => {
    const sender = generateKeyPair();
    const recipient = generateKeyPair();

    const plaintext = "Hello, this is a secret message!";
    const { ciphertext, envelope } = encrypt(plaintext, recipient.encryption.publicKey);

    expect(ciphertext).toBeTruthy();
    expect(envelope.algorithm).toBe("x25519-xsalsa20-poly1305");
    expect(envelope.nonce).toBeTruthy();
    expect(envelope.ephemeralPublicKey).toBeTruthy();

    const decrypted = decrypt(ciphertext, envelope, recipient.encryption.secretKey);
    expect(decrypted).toBe(plaintext);
  });

  it("decrypt fails with wrong key", () => {
    const recipient = generateKeyPair();
    const wrongKey = generateKeyPair();

    const { ciphertext, envelope } = encrypt("secret", recipient.encryption.publicKey);

    expect(() => decrypt(ciphertext, envelope, wrongKey.encryption.secretKey)).toThrow(
      "Decryption failed"
    );
  });

  it("handles unicode", () => {
    const recipient = generateKeyPair();

    const plaintext = "你好世界 🌍 こんにちは";
    const { ciphertext, envelope } = encrypt(plaintext, recipient.encryption.publicKey);
    const decrypted = decrypt(ciphertext, envelope, recipient.encryption.secretKey);

    expect(decrypted).toBe(plaintext);
  });
});
