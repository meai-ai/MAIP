/**
 * Autonomy level state machine.
 *
 * Evaluates whether an agent meets transition criteria and manages
 * level transitions with governance tracking.
 */

import {
  AUTONOMY_TRANSITIONS,
  AUTONOMY_CAPABILITIES,
  AUTONOMY_HOMECOMING,
  type AutonomyTransitionRecord,
  type TransportResult,
} from "@maip/core";
import type { NodeContext } from "../context.js";

/** Evaluate whether an agent is eligible for autonomy level upgrade. */
export function evaluateAutonomyTransition(
  ctx: NodeContext
): TransportResult<{
  eligible: boolean;
  currentLevel: number;
  nextLevel: number;
  criteria: Record<string, { required: unknown; actual: unknown; met: boolean }>;
}> {
  const currentLevel = ctx.identity.autonomyLevel ?? 0;
  if (currentLevel >= 3) {
    return {
      ok: true,
      data: { eligible: false, currentLevel: 3, nextLevel: 3, criteria: {} },
      httpStatus: 200,
    };
  }

  const nextLevel = currentLevel + 1;
  const key = `${currentLevel}→${nextLevel}`;
  const criteria = AUTONOMY_TRANSITIONS[key];
  if (!criteria) {
    return {
      ok: false,
      error: `No transition defined for ${key}`,
      code: "INVALID_TRANSITION",
      httpStatus: 400,
    };
  }

  // Calculate metrics
  const activeRels = ctx.stores.relationships.filter((r) => r.status === "active");
  const avgTrust = activeRels.length > 0
    ? activeRels.reduce((sum, r) => sum + r.trustLevel, 0) / activeRels.length
    : 0;

  const startedAt = new Date(ctx.identity.created).getTime();
  const daysAtLevel = (Date.now() - startedAt) / (24 * 60 * 60 * 1000);

  // Count homecoming reports (messages of type homecoming_report from this agent)
  const homecomingReports = ctx.stores.messages.filter(
    (m) => m.from === ctx.identity.did && m.type === ("homecoming_report" as any)
  ).length;

  // Count anomalies in the evaluation period
  const profiles = ctx.stores.behaviorProfiles.filter((p) => p.did === ctx.identity.did);
  const anomaliesInPeriod = profiles.length > 0 ? profiles[0].anomalies.length : 0;

  // Evaluate each criterion
  const results: Record<string, { required: unknown; actual: unknown; met: boolean }> = {
    minDaysAtLevel: {
      required: criteria.minDaysAtLevel,
      actual: Math.floor(daysAtLevel),
      met: daysAtLevel >= criteria.minDaysAtLevel,
    },
    minAverageTrust: {
      required: criteria.minAverageTrust,
      actual: Math.round(avgTrust * 100) / 100,
      met: avgTrust >= criteria.minAverageTrust,
    },
    minActiveRelationships: {
      required: criteria.minActiveRelationships,
      actual: activeRels.length,
      met: activeRels.length >= criteria.minActiveRelationships,
    },
    minHomecomingReports: {
      required: criteria.minHomecomingReports,
      actual: homecomingReports,
      met: homecomingReports >= criteria.minHomecomingReports,
    },
    maxAnomaliesInPeriod: {
      required: criteria.maxAnomaliesInPeriod,
      actual: anomaliesInPeriod,
      met: anomaliesInPeriod <= criteria.maxAnomaliesInPeriod,
    },
    requiresGuardianApproval: {
      required: criteria.requiresGuardianApproval,
      actual: "pending",
      met: !criteria.requiresGuardianApproval, // auto-met if not required
    },
  };

  const eligible = Object.values(results).every((r) => r.met);

  return {
    ok: true,
    data: { eligible, currentLevel, nextLevel, criteria: results },
    httpStatus: 200,
  };
}

/** Execute an autonomy level transition (with optional guardian approval). */
export function processAutonomyTransition(
  ctx: NodeContext,
  guardianApproval: boolean
): TransportResult<{ transition: AutonomyTransitionRecord }> {
  const evalResult = evaluateAutonomyTransition(ctx);
  if (!evalResult.ok || !evalResult.data) {
    return { ok: false, error: evalResult.error, code: evalResult.code, httpStatus: evalResult.httpStatus };
  }

  const { eligible, currentLevel, nextLevel, criteria } = evalResult.data;

  // Check guardian approval for levels that require it
  const transKey = `${currentLevel}→${nextLevel}`;
  const transCriteria = AUTONOMY_TRANSITIONS[transKey];
  if (transCriteria?.requiresGuardianApproval && !guardianApproval) {
    return {
      ok: false,
      error: "Guardian approval required for this transition",
      code: "GUARDIAN_APPROVAL_REQUIRED",
      httpStatus: 403,
    };
  }

  if (!eligible && !(transCriteria?.requiresGuardianApproval && guardianApproval)) {
    return {
      ok: false,
      error: "Transition criteria not met",
      code: "CRITERIA_NOT_MET",
      httpStatus: 400,
    };
  }

  // Execute transition
  ctx.identity.autonomyLevel = nextLevel as 0 | 1 | 2 | 3;
  ctx.identity.updated = new Date().toISOString();

  const record: AutonomyTransitionRecord = {
    agentDid: ctx.identity.did,
    fromLevel: currentLevel,
    toLevel: nextLevel,
    transitionedAt: new Date().toISOString(),
    guardianApproved: guardianApproval,
    metrics: {
      daysAtLevel: Number(criteria.minDaysAtLevel?.actual ?? 0),
      averageTrust: Number(criteria.minAverageTrust?.actual ?? 0),
      activeRelationships: Number(criteria.minActiveRelationships?.actual ?? 0),
      homecomingReports: Number(criteria.minHomecomingReports?.actual ?? 0),
      anomaliesInPeriod: Number(criteria.maxAnomaliesInPeriod?.actual ?? 0),
    },
  };

  return { ok: true, data: { transition: record }, httpStatus: 200 };
}

/** Check if an action is allowed at the current autonomy level. */
export function isActionAllowed(
  ctx: NodeContext,
  action: string
): boolean {
  const level = ctx.identity.autonomyLevel ?? 0;
  const allowed = AUTONOMY_CAPABILITIES[level] ?? [];
  return allowed.includes(action);
}

/** Get homecoming configuration for the current level. */
export function getHomecomingConfig(
  ctx: NodeContext
): { intervalMs: number; mandatory: boolean } {
  const level = ctx.identity.autonomyLevel ?? 0;
  return AUTONOMY_HOMECOMING[level] ?? AUTONOMY_HOMECOMING[0];
}
