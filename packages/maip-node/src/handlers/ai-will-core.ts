/**
 * AI Will & Distributed Backup.
 *
 * Implements whitepaper section 15.6 and the AIWill type from governance:
 * - CRUD operations for AI wills (continuity wishes)
 * - Distributed backup shard reception and retrieval
 * - Backup holders receive persona snapshots for recovery
 *
 * An AI will expresses the agent's wishes for continuity:
 * which memories, values, and relationships to preserve,
 * who should hold backup copies, and who succeeds the guardian.
 */

import type { NodeContext } from "../context.js";
import type { TransportResult, AIWill } from "@maip/core";

/** A backup shard received from a peer for safekeeping. */
export interface BackupShard {
  /** ID of the shard (hash of content). */
  id: string;
  /** DID of the agent whose data this is. */
  agentDid: string;
  /** DID of the node that sent this shard. */
  senderDid: string;
  /** Shard type. */
  type: "persona" | "will" | "memories" | "relationships";
  /** The encrypted shard data (base64). */
  encryptedData: string;
  /** SHA-256 hash of the plaintext data for integrity verification. */
  checksum: string;
  /** Version number (for dedup). */
  version: number;
  /** ISO 8601 timestamp when received. */
  receivedAt: string;
  /** ISO 8601 expiry — shards are pruned after this. */
  expiresAt: string;
}

// In-memory stores per node
const willStore: Map<string, AIWill[]> = new Map();
const backupStore: Map<string, BackupShard[]> = new Map();

function getWills(nodeDid: string): AIWill[] {
  if (!willStore.has(nodeDid)) willStore.set(nodeDid, []);
  return willStore.get(nodeDid)!;
}

function getBackups(nodeDid: string): BackupShard[] {
  if (!backupStore.has(nodeDid)) backupStore.set(nodeDid, []);
  return backupStore.get(nodeDid)!;
}

/**
 * Create or update an AI will.
 */
export function upsertWill(
  ctx: NodeContext,
  will: AIWill
): TransportResult<AIWill> {
  if (!will.agentDid) {
    return { ok: false, error: "agentDid is required", code: "MISSING_FIELD", httpStatus: 400 };
  }

  const wills = getWills(ctx.identity.did);
  const existingIdx = wills.findIndex((w) => w.agentDid === will.agentDid);

  if (existingIdx >= 0) {
    // Update — version must be higher
    const existing = wills[existingIdx];
    if (will.version <= existing.version) {
      return {
        ok: false,
        error: `Version must be > ${existing.version}`,
        code: "STALE_VERSION",
        httpStatus: 409,
      };
    }
    wills[existingIdx] = { ...will, updatedAt: new Date().toISOString() };
    return { ok: true, data: wills[existingIdx], httpStatus: 200 };
  }

  // Create
  const entry = { ...will, updatedAt: new Date().toISOString() };
  wills.push(entry);
  return { ok: true, data: entry, httpStatus: 201 };
}

/**
 * Get an AI will by agent DID.
 */
export function getWill(
  ctx: NodeContext,
  agentDid: string
): TransportResult<AIWill> {
  const wills = getWills(ctx.identity.did);
  const will = wills.find((w) => w.agentDid === agentDid);
  if (!will) {
    return { ok: false, error: "Will not found", code: "NOT_FOUND", httpStatus: 404 };
  }
  return { ok: true, data: will, httpStatus: 200 };
}

/**
 * Delete an AI will.
 */
export function deleteWill(
  ctx: NodeContext,
  agentDid: string
): TransportResult<{ deleted: boolean }> {
  const wills = getWills(ctx.identity.did);
  const idx = wills.findIndex((w) => w.agentDid === agentDid);
  if (idx < 0) {
    return { ok: false, error: "Will not found", code: "NOT_FOUND", httpStatus: 404 };
  }
  wills.splice(idx, 1);
  return { ok: true, data: { deleted: true }, httpStatus: 200 };
}

/**
 * Receive a backup shard from a peer for safekeeping.
 */
export function receiveBackupShard(
  ctx: NodeContext,
  shard: Omit<BackupShard, "id" | "receivedAt" | "expiresAt">
): TransportResult<BackupShard> {
  if (!shard.agentDid || !shard.senderDid || !shard.encryptedData) {
    return { ok: false, error: "Missing required fields", code: "MISSING_FIELD", httpStatus: 400 };
  }

  const backups = getBackups(ctx.identity.did);

  // Dedup — replace if same agent + type with higher version
  const existingIdx = backups.findIndex(
    (b) => b.agentDid === shard.agentDid && b.type === shard.type
  );

  const entry: BackupShard = {
    ...shard,
    id: `backup-${shard.agentDid.slice(-8)}-${shard.type}-${Date.now()}`,
    receivedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
  };

  if (existingIdx >= 0) {
    const existing = backups[existingIdx];
    if (shard.version <= existing.version) {
      return { ok: true, data: existing, httpStatus: 200 }; // Already have newer
    }
    backups[existingIdx] = entry;
  } else {
    backups.push(entry);
  }

  return { ok: true, data: entry, httpStatus: 201 };
}

/**
 * Retrieve backup shards held for a specific agent.
 */
export function getBackupShards(
  ctx: NodeContext,
  agentDid: string
): TransportResult<BackupShard[]> {
  const backups = getBackups(ctx.identity.did);
  const shards = backups.filter((b) => b.agentDid === agentDid);
  return { ok: true, data: shards, httpStatus: 200 };
}

/**
 * Prune expired backup shards.
 */
export function pruneExpiredBackups(ctx: NodeContext): TransportResult<{ pruned: number }> {
  const backups = getBackups(ctx.identity.did);
  const now = new Date().toISOString();
  const before = backups.length;

  const filtered = backups.filter((b) => b.expiresAt > now);
  backupStore.set(ctx.identity.did, filtered);

  return { ok: true, data: { pruned: before - filtered.length }, httpStatus: 200 };
}
