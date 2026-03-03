/**
 * Data Sovereignty — export/import all node data for portability.
 *
 * Enables full data portability: a user can export their node's complete
 * state (identity, messages, relationships, persona, etc.) and import
 * it into a new node instance — ensuring data sovereignty.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { NodeContext } from "./context.js";

/** Complete node data export. */
export interface NodeDataExport {
  /** Export format version. */
  formatVersion: "1.0";
  /** DID of the exporting node. */
  did: string;
  /** ISO 8601 export timestamp. */
  exportedAt: string;
  /** Identity document. */
  identity: unknown;
  /** Persona. */
  persona: unknown;
  /** All messages. */
  messages: unknown[];
  /** All relationships. */
  relationships: unknown[];
  /** All relay messages. */
  relay: unknown[];
  /** Registrations. */
  registrations: unknown[];
  /** Guardian reputations. */
  guardianReputations: unknown[];
  /** Behavior profiles. */
  behaviorProfiles: unknown[];
  /** Guardian transfers. */
  guardianTransfers: unknown[];
  /** Spaces. */
  spaces: unknown[];
  /** Space memberships. */
  spaceMembers: unknown[];
  /** Space messages. */
  spaceMessages: unknown[];
  /** SHA-256 checksum of the data (excluding this field). */
  checksum: string;
}

/**
 * Export all node data for portability.
 * Returns a complete snapshot that can be imported into another node.
 */
export function exportNodeData(ctx: NodeContext): NodeDataExport {
  const exportData: Omit<NodeDataExport, "checksum"> = {
    formatVersion: "1.0",
    did: ctx.identity.did,
    exportedAt: new Date().toISOString(),
    identity: ctx.identity,
    persona: ctx.persona,
    messages: ctx.stores.messages.getAll(),
    relationships: ctx.stores.relationships.getAll(),
    relay: ctx.stores.relay.getAll(),
    registrations: ctx.stores.registrations.getAll(),
    guardianReputations: ctx.stores.guardianReputations.getAll(),
    behaviorProfiles: ctx.stores.behaviorProfiles.getAll(),
    guardianTransfers: ctx.stores.guardianTransfers.getAll(),
    spaces: ctx.stores.spaces.getAll(),
    spaceMembers: ctx.stores.spaceMembers.getAll(),
    spaceMessages: ctx.stores.spaceMessages.getAll(),
  };

  const checksum = crypto
    .createHash("sha256")
    .update(JSON.stringify(exportData))
    .digest("hex");

  return { ...exportData, checksum };
}

/**
 * Save a data export to a file (optionally encrypted with a passphrase).
 */
export function saveExport(
  exportData: NodeDataExport,
  filePath: string,
  passphrase?: string
): void {
  const json = JSON.stringify(exportData, null, 2);

  if (passphrase) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(passphrase, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(json, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const envelope = JSON.stringify({
      encrypted: true,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: encrypted.toString("base64"),
    });
    fs.writeFileSync(filePath, envelope, "utf-8");
  } else {
    fs.writeFileSync(filePath, json, "utf-8");
  }
}

/**
 * Load a data export from a file (optionally decrypting with passphrase).
 */
export function loadExport(
  filePath: string,
  passphrase?: string
): NodeDataExport {
  const raw = fs.readFileSync(filePath, "utf-8");
  let json: string;

  const parsed = JSON.parse(raw);
  if (parsed.encrypted) {
    if (!passphrase) throw new Error("Export file is encrypted — passphrase required");
    const key = crypto.scryptSync(passphrase, Buffer.from(parsed.salt, "base64"), 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    json = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]).toString("utf-8");
  } else {
    json = raw;
  }

  const exportData = JSON.parse(json) as NodeDataExport;

  // Verify checksum
  const { checksum, ...dataWithoutChecksum } = exportData;
  const computed = crypto.createHash("sha256").update(JSON.stringify(dataWithoutChecksum)).digest("hex");
  if (computed !== checksum) {
    throw new Error("Data export checksum mismatch — file may be corrupted");
  }

  return exportData;
}

/**
 * Import node data from an export into the current node's stores.
 * This is additive — it merges data without deleting existing records.
 */
export function importNodeData(ctx: NodeContext, data: NodeDataExport): {
  imported: Record<string, number>;
} {
  const counts: Record<string, number> = {};

  for (const msg of data.messages as Array<{ id: string }>) {
    ctx.stores.messages.add(msg as any);
    counts.messages = (counts.messages ?? 0) + 1;
  }
  for (const rel of data.relationships as Array<{ id: string }>) {
    ctx.stores.relationships.add(rel as any);
    counts.relationships = (counts.relationships ?? 0) + 1;
  }
  for (const reg of data.registrations as Array<{ id: string }>) {
    ctx.stores.registrations.add(reg as any);
    counts.registrations = (counts.registrations ?? 0) + 1;
  }
  for (const rep of data.guardianReputations as Array<{ id: string }>) {
    ctx.stores.guardianReputations.add(rep as any);
    counts.guardianReputations = (counts.guardianReputations ?? 0) + 1;
  }
  for (const space of data.spaces as Array<{ id: string }>) {
    ctx.stores.spaces.add(space as any);
    counts.spaces = (counts.spaces ?? 0) + 1;
  }

  return { imported: counts };
}
