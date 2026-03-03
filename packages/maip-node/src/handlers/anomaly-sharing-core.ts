/**
 * Cross-Node Anomaly Sharing.
 *
 * Implements the whitepaper's "network immune system" — nodes share
 * anomaly reports with peers so the network can collectively identify
 * and respond to threats. Uses a simple gossip protocol where each
 * node forwards new anomaly reports to its known peers.
 */

import type { AnomalyFlag } from "@maip/core";
import type { NodeContext } from "../context.js";
import type { TransportResult } from "@maip/core";

/** A shared anomaly report broadcast across the network. */
export interface SharedAnomalyReport {
  /** Unique report ID. */
  id: string;
  /** DID of the node that detected the anomaly. */
  reporterDid: string;
  /** DID of the entity exhibiting anomalous behavior. */
  subjectDid: string;
  /** The anomaly flag. */
  anomaly: AnomalyFlag;
  /** Number of hops this report has taken (TTL decrements). */
  hops: number;
  /** Maximum hops allowed (default 3). */
  maxHops: number;
  /** DIDs of nodes that have seen this report (prevents loops). */
  seenBy: string[];
  /** ISO 8601 timestamp when first reported. */
  reportedAt: string;
}

/** Aggregated threat assessment for a DID. */
export interface ThreatAssessment {
  /** The assessed DID. */
  did: string;
  /** Number of independent reports. */
  reportCount: number;
  /** Average severity across reports. */
  averageSeverity: number;
  /** Most common anomaly type. */
  primaryType: string;
  /** Number of unique reporters. */
  uniqueReporters: number;
  /** Threat level: low / medium / high / critical. */
  threatLevel: "low" | "medium" | "high" | "critical";
  /** ISO 8601 of most recent report. */
  lastReportedAt: string;
}

// In-memory store for received anomaly reports (per-node)
const sharedReports: Map<string, SharedAnomalyReport[]> = new Map();

function getNodeReports(nodeDid: string): SharedAnomalyReport[] {
  if (!sharedReports.has(nodeDid)) sharedReports.set(nodeDid, []);
  return sharedReports.get(nodeDid)!;
}

/**
 * Receive and store an anomaly report from a peer node.
 * Returns whether the report was new (not previously seen).
 */
export function receiveAnomalyReport(
  ctx: NodeContext,
  report: SharedAnomalyReport
): TransportResult<{ accepted: boolean; shouldForward: boolean }> {
  const reports = getNodeReports(ctx.identity.did);

  // Check if we've already seen this report
  const existing = reports.find((r) => r.id === report.id);
  if (existing) {
    return { ok: true, data: { accepted: false, shouldForward: false }, httpStatus: 200 };
  }

  // Check TTL
  if (report.hops >= report.maxHops) {
    return { ok: true, data: { accepted: false, shouldForward: false }, httpStatus: 200 };
  }

  // Don't accept reports about ourselves
  if (report.subjectDid === ctx.identity.did) {
    return { ok: true, data: { accepted: false, shouldForward: false }, httpStatus: 200 };
  }

  // Mark as seen by us
  const updated: SharedAnomalyReport = {
    ...report,
    hops: report.hops + 1,
    seenBy: [...report.seenBy, ctx.identity.did],
  };

  reports.push(updated);

  // Keep reports bounded (last 1000)
  if (reports.length > 1000) {
    reports.splice(0, reports.length - 1000);
  }

  // Should forward if hops haven't exceeded max
  const shouldForward = updated.hops < updated.maxHops;
  return { ok: true, data: { accepted: true, shouldForward }, httpStatus: 200 };
}

/**
 * Create a new anomaly report to share with the network.
 */
export function createAnomalyReport(
  ctx: NodeContext,
  subjectDid: string,
  anomaly: AnomalyFlag,
  maxHops = 3
): SharedAnomalyReport {
  const report: SharedAnomalyReport = {
    id: `anomaly-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    reporterDid: ctx.identity.did,
    subjectDid,
    anomaly,
    hops: 0,
    maxHops,
    seenBy: [ctx.identity.did],
    reportedAt: new Date().toISOString(),
  };

  const reports = getNodeReports(ctx.identity.did);
  reports.push(report);
  return report;
}

/**
 * Assess the threat level of a DID based on aggregated anomaly reports.
 */
export function assessThreat(
  ctx: NodeContext,
  subjectDid: string
): TransportResult<ThreatAssessment> {
  const reports = getNodeReports(ctx.identity.did);
  const relevant = reports.filter((r) => r.subjectDid === subjectDid);

  if (relevant.length === 0) {
    return {
      ok: true,
      data: {
        did: subjectDid,
        reportCount: 0,
        averageSeverity: 0,
        primaryType: "none",
        uniqueReporters: 0,
        threatLevel: "low",
        lastReportedAt: "",
      },
      httpStatus: 200,
    };
  }

  const totalSeverity = relevant.reduce((sum, r) => sum + r.anomaly.severity, 0);
  const avgSeverity = totalSeverity / relevant.length;
  const uniqueReporters = new Set(relevant.map((r) => r.reporterDid)).size;

  // Count anomaly types
  const typeCounts: Record<string, number> = {};
  for (const r of relevant) {
    typeCounts[r.anomaly.type] = (typeCounts[r.anomaly.type] ?? 0) + 1;
  }
  const primaryType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];

  // Determine threat level
  let threatLevel: ThreatAssessment["threatLevel"] = "low";
  if (avgSeverity > 0.8 && uniqueReporters >= 3) threatLevel = "critical";
  else if (avgSeverity > 0.6 && uniqueReporters >= 2) threatLevel = "high";
  else if (avgSeverity > 0.4 || uniqueReporters >= 2) threatLevel = "medium";

  const sorted = relevant.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));

  return {
    ok: true,
    data: {
      did: subjectDid,
      reportCount: relevant.length,
      averageSeverity: Math.round(avgSeverity * 100) / 100,
      primaryType,
      uniqueReporters,
      threatLevel,
      lastReportedAt: sorted[0].reportedAt,
    },
    httpStatus: 200,
  };
}

/**
 * Get pending reports that should be forwarded to peers.
 */
export function getPendingForwards(
  ctx: NodeContext
): SharedAnomalyReport[] {
  const reports = getNodeReports(ctx.identity.did);
  return reports.filter((r) => r.hops < r.maxHops);
}
