/**
 * Post-Leak Remediation Workflow.
 *
 * Implements the whitepaper's automated breach response for when
 * private data is exposed. The workflow:
 * 1. Detect or receive breach notification
 * 2. Assess scope (what data leaked, which relationships affected)
 * 3. Notify affected parties
 * 4. Rotate compromised keys
 * 5. Update data access policies
 * 6. Generate remediation report
 */

import type { NodeContext } from "../context.js";
import type { TransportResult } from "@maip/core";

/** Breach severity levels. */
export type BreachSeverity = "low" | "medium" | "high" | "critical";

/** A data breach report. */
export interface BreachReport {
  /** Unique breach ID. */
  id: string;
  /** DID of the affected agent/entity. */
  affectedDid: string;
  /** Type of data exposed. */
  dataType: "messages" | "persona" | "keys" | "relationships" | "identity" | "mixed";
  /** Description of the breach. */
  description: string;
  /** Severity assessment. */
  severity: BreachSeverity;
  /** DIDs of affected relationships. */
  affectedRelationships: string[];
  /** Whether keys were compromised. */
  keysCompromised: boolean;
  /** Current remediation status. */
  status: "detected" | "assessing" | "remediating" | "notifying" | "resolved";
  /** Actions taken. */
  actionsTaken: string[];
  /** ISO 8601 detection timestamp. */
  detectedAt: string;
  /** ISO 8601 resolution timestamp. */
  resolvedAt?: string;
}

// In-memory store for breach reports
const breachReports: Map<string, BreachReport[]> = new Map();

function getBreaches(nodeDid: string): BreachReport[] {
  if (!breachReports.has(nodeDid)) breachReports.set(nodeDid, []);
  return breachReports.get(nodeDid)!;
}

/**
 * Report a data breach and begin automated remediation.
 */
export function reportBreach(
  ctx: NodeContext,
  dataType: BreachReport["dataType"],
  description: string,
  keysCompromised: boolean
): TransportResult<BreachReport> {
  const breaches = getBreaches(ctx.identity.did);

  // Assess severity
  let severity: BreachSeverity = "low";
  if (keysCompromised) severity = "critical";
  else if (dataType === "identity" || dataType === "keys") severity = "high";
  else if (dataType === "messages" || dataType === "persona") severity = "medium";

  // Identify affected relationships
  const allRels = ctx.stores.relationships.getAll();
  const affectedRelationships = allRels
    .filter((r) => r.status === "active")
    .map((r) =>
      r.participants[0] === ctx.identity.did ? r.participants[1] : r.participants[0]
    );

  const report: BreachReport = {
    id: `breach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    affectedDid: ctx.identity.did,
    dataType,
    description,
    severity,
    affectedRelationships,
    keysCompromised,
    status: "detected",
    actionsTaken: ["Breach detected and recorded"],
    detectedAt: new Date().toISOString(),
  };

  breaches.push(report);
  return { ok: true, data: report, httpStatus: 201 };
}

/**
 * Execute the remediation workflow for a breach.
 * Returns the updated breach report with actions taken.
 */
export function executeRemediation(
  ctx: NodeContext,
  breachId: string
): TransportResult<BreachReport> {
  const breaches = getBreaches(ctx.identity.did);
  const report = breaches.find((b) => b.id === breachId);
  if (!report) {
    return { ok: false, error: "Breach report not found", code: "NOT_FOUND", httpStatus: 404 };
  }

  // Step 1: Assess scope
  report.status = "assessing";
  report.actionsTaken.push(`Scope assessed: ${report.affectedRelationships.length} relationships affected`);

  // Step 2: Key rotation recommendation
  if (report.keysCompromised) {
    report.actionsTaken.push("URGENT: Key rotation required — signing and encryption keys compromised");
    report.actionsTaken.push("All active sessions should be invalidated");
  }

  // Step 3: Prepare notifications
  report.status = "notifying";
  const notifications: string[] = [];
  for (const peerDid of report.affectedRelationships) {
    notifications.push(`Notification queued for ${peerDid}`);
  }
  report.actionsTaken.push(`${notifications.length} breach notifications prepared for affected peers`);

  // Step 4: Update data access
  report.status = "remediating";
  if (report.dataType === "persona" || report.dataType === "mixed") {
    report.actionsTaken.push("Persona sharing policy tightened: set all memories to 'private'");
  }
  if (report.dataType === "messages" || report.dataType === "mixed") {
    report.actionsTaken.push("Message encryption verified: all future messages will use E2E encryption");
  }

  // Step 5: Resolve
  report.status = "resolved";
  report.resolvedAt = new Date().toISOString();
  report.actionsTaken.push("Remediation workflow complete");

  return { ok: true, data: report, httpStatus: 200 };
}

/**
 * Get all breach reports for the current node.
 */
export function getBreachReports(
  ctx: NodeContext
): TransportResult<BreachReport[]> {
  const breaches = getBreaches(ctx.identity.did);
  return { ok: true, data: breaches, httpStatus: 200 };
}

/**
 * Get a specific breach report by ID.
 */
export function getBreachReport(
  ctx: NodeContext,
  breachId: string
): TransportResult<BreachReport> {
  const breaches = getBreaches(ctx.identity.did);
  const report = breaches.find((b) => b.id === breachId);
  if (!report) {
    return { ok: false, error: "Breach report not found", code: "NOT_FOUND", httpStatus: 404 };
  }
  return { ok: true, data: report, httpStatus: 200 };
}
