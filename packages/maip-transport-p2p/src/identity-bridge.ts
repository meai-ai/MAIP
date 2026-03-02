/**
 * DID <-> PeerId conversion bridge.
 *
 * MAIP DIDs (`did:maip:<base58-ed25519-pubkey>`) and libp2p PeerIds both derive
 * from Ed25519 public keys. This module converts between them with zero overhead.
 */

import { publicKeyFromRaw, privateKeyFromRaw } from "@libp2p/crypto/keys";
import { peerIdFromPublicKey, peerIdFromPrivateKey } from "@libp2p/peer-id";
import type { PeerId, Ed25519PeerId } from "@libp2p/interface";
import type { Ed25519PrivateKey } from "@libp2p/interface";
import { didToPublicKey, publicKeyToDid, type MAIPKeyPair } from "@maip/core";

/**
 * Convert a MAIP DID to a libp2p PeerId.
 *
 * Extracts the Ed25519 public key from the DID and wraps it as a PeerId.
 */
export function didToPeerId(did: string): Ed25519PeerId {
  const ed25519PubKey = didToPublicKey(did); // 32-byte Uint8Array
  const libp2pKey = publicKeyFromRaw(ed25519PubKey);
  return peerIdFromPublicKey(libp2pKey) as Ed25519PeerId;
}

/**
 * Convert a libp2p PeerId to a MAIP DID.
 *
 * Extracts the raw Ed25519 public key from the PeerId and encodes as did:maip:.
 */
export function peerIdToDid(peerId: PeerId): string {
  if (!peerId.publicKey) {
    throw new Error("PeerId has no public key — cannot convert to DID");
  }
  // peerId.publicKey is a CryptoKey; extract the raw 32-byte Ed25519 key
  const rawKey = peerId.publicKey.raw;
  return publicKeyToDid(rawKey);
}

/**
 * Derive a libp2p Ed25519PrivateKey from a MAIP keypair.
 *
 * NaCl Ed25519 secret key is 64 bytes: first 32 = seed, last 32 = public key.
 * libp2p's privateKeyFromRaw() needs the full 64-byte key (seed + pubkey) for
 * Ed25519 — passing only 32 bytes would be interpreted as secp256k1.
 */
export function keyPairToLibp2pPrivateKey(keyPair: MAIPKeyPair): Ed25519PrivateKey {
  // Pass the full 64-byte NaCl secret key (seed + public key)
  // so libp2p can identify it as Ed25519
  const fullKey = keyPair.signing.secretKey;
  return privateKeyFromRaw(fullKey) as Ed25519PrivateKey;
}

/**
 * Derive a libp2p PeerId from a MAIP keypair.
 */
export function keyPairToPeerId(keyPair: MAIPKeyPair): Ed25519PeerId {
  const privateKey = keyPairToLibp2pPrivateKey(keyPair);
  return peerIdFromPrivateKey(privateKey) as Ed25519PeerId;
}
