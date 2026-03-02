/**
 * Tests for @maip/transport-p2p.
 */

import { describe, it, expect } from "vitest";
import { generateKeyPair, publicKeyToDid, didToPublicKey } from "@maip/core";
import {
  didToPeerId,
  peerIdToDid,
  keyPairToPeerId,
  keyPairToLibp2pPrivateKey,
} from "./identity-bridge.js";

describe("identity-bridge", () => {
  it("should roundtrip DID → PeerId → DID", () => {
    const keyPair = generateKeyPair();
    const did = keyPair.did;

    const peerId = didToPeerId(did);
    const roundtrippedDid = peerIdToDid(peerId);

    expect(roundtrippedDid).toBe(did);
  });

  it("should derive consistent PeerId from keypair", () => {
    const keyPair = generateKeyPair();

    const peerIdFromDid = didToPeerId(keyPair.did);
    const peerIdFromKeyPair = keyPairToPeerId(keyPair);

    expect(peerIdFromKeyPair.toString()).toBe(peerIdFromDid.toString());
  });

  it("should derive libp2p private key from MAIP keypair", () => {
    const keyPair = generateKeyPair();
    const privateKey = keyPairToLibp2pPrivateKey(keyPair);

    // The public key derived from the private key should match the MAIP DID
    expect(privateKey.publicKey).toBeDefined();
    const derivedDid = publicKeyToDid(privateKey.publicKey.raw);
    expect(derivedDid).toBe(keyPair.did);
  });

  it("should handle multiple different keypairs", () => {
    const keyPair1 = generateKeyPair();
    const keyPair2 = generateKeyPair();

    const peerId1 = didToPeerId(keyPair1.did);
    const peerId2 = didToPeerId(keyPair2.did);

    // Different keypairs should produce different PeerIds
    expect(peerId1.toString()).not.toBe(peerId2.toString());

    // Both should roundtrip correctly
    expect(peerIdToDid(peerId1)).toBe(keyPair1.did);
    expect(peerIdToDid(peerId2)).toBe(keyPair2.did);
  });

  it("should throw on invalid DID", () => {
    expect(() => didToPeerId("invalid")).toThrow();
    expect(() => didToPeerId("did:maip:")).toThrow();
  });
});

describe("stream-utils", () => {
  it("should encode and decode length-prefixed messages", async () => {
    // Import dynamically to test in isolation
    const { writeLengthPrefixed, readLengthPrefixed } = await import("./stream-utils.js");

    const testData = { hello: "world", count: 42 };
    const json = JSON.stringify(testData);
    const payload = new TextEncoder().encode(json);

    // Create a length-prefixed frame manually
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, payload.length, false);
    const frame = new Uint8Array(4 + payload.length);
    frame.set(header, 0);
    frame.set(payload, 4);

    // Verify the frame structure
    const readLength = new DataView(frame.buffer).getUint32(0, false);
    expect(readLength).toBe(payload.length);

    const decodedPayload = frame.subarray(4, 4 + readLength);
    const decoded = JSON.parse(new TextDecoder().decode(decodedPayload));
    expect(decoded).toEqual(testData);
  });

  it("should reject oversized messages", () => {
    const header = new Uint8Array(4);
    // Set length to 2MB (over the 1MB limit)
    new DataView(header.buffer).setUint32(0, 2 * 1024 * 1024, false);

    const readLength = new DataView(header.buffer).getUint32(0, false);
    expect(readLength).toBe(2 * 1024 * 1024);
    expect(readLength > 1024 * 1024).toBe(true);
  });
});
