/**
 * Transport-agnostic guardian abuse detection and right-to-refuse.
 *
 * Implements:
 * - Abuse report filing and tracking
 * - Guardian reputation impact from abuse reports
 * - Right-to-refuse enforcement
 */

import { v4 as uuid } from "uuid";
import type {
  GuardianAbuseReport,
  RightToRefuseRecord,
  TransportResult,
} from "@maip/core";
import type { NodeContext } from "../context.js";

export interface AbuseReportInput {
  agentDid: string;
  guardianDid: string;
  abuseType: GuardianAbuseReport["abuseType"];
  description: string;
  evidence?: string[];
  signature: string;
}

/** File an abuse report against a guardian. */
export function processAbuseReport(
  ctx: NodeContext,
  input: AbuseReportInput
): TransportResult<{ reportId: string; report: GuardianAbuseReport }> {
  const report: GuardianAbuseReport = {
    id: uuid(),
    agentDid: input.agentDid,
    guardianDid: input.guardianDid,
    abuseType: input.abuseType,
    description: input.description,
    evidence: input.evidence ?? [],
    reportedAt: new Date().toISOString(),
    status: "pending",
    signature: input.signature,
  };

  // Store the report
  ctx.stores.abuseReports.add(report);

  // Impact guardian reputation: each report lowers score
  const reps = ctx.stores.guardianReputations.filter(
    (r) => r.guardianDid === input.guardianDid
  );
  if (reps.length > 0) {
    const rep = reps[0];
    rep.score = Math.max(0, rep.score - 0.1);
    rep.agentInitiatedTransfers += 1;
    rep.lastUpdated = new Date().toISOString();
    ctx.stores.guardianReputations.add(rep);
  }

  return {
    ok: true,
    data: { reportId: report.id, report },
    httpStatus: 201,
  };
}

/** Get abuse reports for a guardian. */
export function processGetAbuseReports(
  ctx: NodeContext,
  guardianDid: string
): TransportResult<{ reports: GuardianAbuseReport[] }> {
  const reports = ctx.stores.abuseReports.filter(
    (r) => r.guardianDid === guardianDid
  );
  return { ok: true, data: { reports }, httpStatus: 200 };
}

/** Record a right-to-refuse action. */
export function processRightToRefuse(
  ctx: NodeContext,
  input: {
    agentDid: string;
    guardianDid: string;
    refusedAction: string;
    reason: string;
  }
): TransportResult<{ record: RightToRefuseRecord }> {
  const record: RightToRefuseRecord = {
    id: uuid(),
    agentDid: input.agentDid,
    guardianDid: input.guardianDid,
    refusedAction: input.refusedAction,
    reason: input.reason,
    timestamp: new Date().toISOString(),
  };

  ctx.stores.refusalRecords.add(record);

  return {
    ok: true,
    data: { record },
    httpStatus: 201,
  };
}
