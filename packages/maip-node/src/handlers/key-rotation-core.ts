/**
 * Transport-agnostic key rotation processing.
 *
 * Implements the key rotation protocol: an entity can rotate their keys
 * by signing the new key with the old key (continuity proof).
 */

import {
  generateKeyPair,
  exportSecretKey,
  getPublicKeyBase58,
  getEncryptionKeyBase58,
  sign,
  verifyWithDid,
  signDocument,
  type MAIPKeyPair,
  type TransportResult,
  type KeyRotationRecord,
  type KeyRevocationNotice,
} from "@maip/core";
import type { NodeContext } from "../context.js";

export interface KeyRotationResult {
  newPublicKey: string;
  newEncryptionKey: string;
  newDid: string;
  rotationRecord: KeyRotationRecord;
}

/**
 * Rotate the node's keys. Signs the new key with the old key as proof of continuity.
 * Returns the new keys and a rotation record that peers can verify.
 */
export function processKeyRotation(
  ctx: NodeContext,
  reason: KeyRotationRecord["reason"]
): TransportResult<KeyRotationResult> {
  const oldPublicKey = ctx.identity.publicKey;
  const oldSecretKey = ctx.keyPair.signing.secretKey;

  // Generate new keypair
  const newKeyPair = generateKeyPair();
  const newPublicKey = getPublicKeyBase58(newKeyPair);
  const newEncryptionKey = getEncryptionKeyBase58(newKeyPair);

  // Create rotation proof: sign the new public key with the old secret key
  const rotationProof = sign({ newPublicKey, timestamp: new Date().toISOString() }, oldSecretKey);

  const rotationRecord: KeyRotationRecord = {
    previousKey: oldPublicKey,
    newKey: newPublicKey,
    rotationProof,
    rotatedAt: new Date().toISOString(),
    reason,
  };

  // Update the node's identity with new keys
  const fs = require("node:fs");
  const path = require("node:path");

  // Save new secret key
  fs.writeFileSync(
    path.join(ctx.config.dataDir, "secret.key"),
    exportSecretKey(newKeyPair),
    "utf-8"
  );

  // Save rotation history
  const historyPath = path.join(ctx.config.dataDir, "key-rotations.json");
  let history: KeyRotationRecord[] = [];
  if (fs.existsSync(historyPath)) {
    try { history = JSON.parse(fs.readFileSync(historyPath, "utf-8")); } catch { /* ignore */ }
  }
  history.push(rotationRecord);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");

  // Update identity document with new keys
  ctx.identity.publicKey = newPublicKey;
  ctx.identity.encryptionKey = newEncryptionKey;
  ctx.identity.did = newKeyPair.did;
  ctx.identity.updated = new Date().toISOString();

  // Re-sign identity
  const { signature: _, ...withoutSig } = ctx.identity;
  const signed = signDocument(
    withoutSig as Record<string, unknown>,
    newKeyPair.signing.secretKey
  );
  ctx.identity.signature = (signed as { signature: string }).signature;

  // Persist updated identity
  fs.writeFileSync(
    path.join(ctx.config.dataDir, "identity.json"),
    JSON.stringify(ctx.identity, null, 2),
    "utf-8"
  );

  // Update keypair reference
  (ctx as { keyPair: MAIPKeyPair }).keyPair = newKeyPair;

  return {
    ok: true,
    data: {
      newPublicKey,
      newEncryptionKey,
      newDid: newKeyPair.did,
      rotationRecord,
    },
    httpStatus: 200,
  };
}

/**
 * Verify a key rotation record — confirms the new key was signed by the old key.
 */
export function verifyKeyRotation(record: KeyRotationRecord): boolean {
  try {
    return verifyWithDid(
      { newPublicKey: record.newKey, timestamp: record.rotatedAt },
      record.rotationProof,
      `did:maip:${record.previousKey}`
    );
  } catch {
    return false;
  }
}

/**
 * Process a key revocation notice from a peer.
 * Stores the revocation so future messages from the revoked key are rejected.
 */
export function processKeyRevocation(
  ctx: NodeContext,
  notice: KeyRevocationNotice
): TransportResult<{ acknowledged: boolean }> {
  // Store revocation in a revocations list
  const fs = require("node:fs");
  const path = require("node:path");
  const revocationsPath = path.join(ctx.config.dataDir, "revocations.json");
  let revocations: KeyRevocationNotice[] = [];
  if (fs.existsSync(revocationsPath)) {
    try { revocations = JSON.parse(fs.readFileSync(revocationsPath, "utf-8")); } catch { /* ignore */ }
  }
  revocations.push(notice);
  fs.writeFileSync(revocationsPath, JSON.stringify(revocations, null, 2), "utf-8");

  return { ok: true, data: { acknowledged: true }, httpStatus: 200 };
}
