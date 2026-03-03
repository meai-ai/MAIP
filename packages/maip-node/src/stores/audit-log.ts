/**
 * Tamper-Proof Audit Log.
 *
 * Append-only log with hash chains for governance accountability.
 * Every entry includes a SHA-256 hash of the previous entry, creating
 * an immutable chain. Any tampering breaks the chain and is detectable.
 *
 * Implements the whitepaper's Layer 1 requirement: protocol-level
 * tamper-proof records for all governance actions.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** An entry in the audit log. */
export interface AuditLogEntry {
  /** Sequential index. */
  index: number;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Category of action. */
  category:
    | "identity"
    | "message"
    | "relationship"
    | "governance"
    | "autonomy"
    | "key_rotation"
    | "guardian_transfer"
    | "isolation"
    | "economy";
  /** Action performed. */
  action: string;
  /** DID of the actor. */
  actorDid: string;
  /** Target DID (if applicable). */
  targetDid?: string;
  /** Action-specific details. */
  details: Record<string, unknown>;
  /** SHA-256 hash of the previous entry. */
  previousHash: string;
  /** SHA-256 hash of this entry (computed over all fields except this one). */
  hash: string;
}

/**
 * AuditLog — append-only tamper-proof log with hash chains.
 */
export class AuditLog {
  private entries: AuditLogEntry[] = [];
  private filePath: string;

  constructor(dataDir: string, filename = "audit-log.json") {
    this.filePath = path.join(dataDir, filename);
    this.load();
  }

  /** Append a new entry to the log. */
  append(
    category: AuditLogEntry["category"],
    action: string,
    actorDid: string,
    details: Record<string, unknown>,
    targetDid?: string
  ): AuditLogEntry {
    const previousHash =
      this.entries.length > 0
        ? this.entries[this.entries.length - 1].hash
        : "0".repeat(64); // Genesis hash

    const entry: Omit<AuditLogEntry, "hash"> = {
      index: this.entries.length,
      timestamp: new Date().toISOString(),
      category,
      action,
      actorDid,
      targetDid,
      details,
      previousHash,
    };

    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(entry))
      .digest("hex");

    const fullEntry: AuditLogEntry = { ...entry, hash };
    this.entries.push(fullEntry);
    this.save();
    return fullEntry;
  }

  /** Verify the integrity of the entire chain. Returns first broken index or -1 if valid. */
  verify(): { valid: boolean; brokenAt?: number; expected?: string; actual?: string } {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      // Verify previous hash linkage
      if (i === 0) {
        if (entry.previousHash !== "0".repeat(64)) {
          return { valid: false, brokenAt: 0, expected: "0".repeat(64), actual: entry.previousHash };
        }
      } else {
        if (entry.previousHash !== this.entries[i - 1].hash) {
          return { valid: false, brokenAt: i, expected: this.entries[i - 1].hash, actual: entry.previousHash };
        }
      }

      // Verify self-hash
      const { hash, ...rest } = entry;
      const computed = crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
      if (computed !== hash) {
        return { valid: false, brokenAt: i, expected: computed, actual: hash };
      }
    }

    return { valid: true };
  }

  /** Get all entries. */
  getAll(): AuditLogEntry[] {
    return [...this.entries];
  }

  /** Get entries by category. */
  getByCategory(category: AuditLogEntry["category"]): AuditLogEntry[] {
    return this.entries.filter((e) => e.category === category);
  }

  /** Get entries by actor DID. */
  getByActor(actorDid: string): AuditLogEntry[] {
    return this.entries.filter((e) => e.actorDid === actorDid);
  }

  /** Get entries in a time range. */
  getByTimeRange(from: string, to: string): AuditLogEntry[] {
    return this.entries.filter((e) => e.timestamp >= from && e.timestamp <= to);
  }

  /** Get the latest N entries. */
  getLatest(n: number): AuditLogEntry[] {
    return this.entries.slice(-n);
  }

  /** Total entry count. */
  count(): number {
    return this.entries.length;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.entries = JSON.parse(raw);
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), "utf-8");
  }
}
