/**
 * MAIP Autonomy Level types.
 *
 * Formal state machine for AI agent autonomy progression:
 * Level 0 (Guided) → Level 1 (Exploratory) → Level 2 (Social) → Level 3 (Independent)
 *
 * Each level unlocks capabilities and loosens guardian oversight.
 */

/** Autonomy level definitions with human-readable names. */
export type AutonomyLevelName = "guided" | "exploratory" | "social" | "independent";

/** Maps numeric level to name. */
export const AUTONOMY_LEVEL_NAMES: Record<number, AutonomyLevelName> = {
  0: "guided",
  1: "exploratory",
  2: "social",
  3: "independent",
};

/** Capabilities unlocked at each autonomy level. */
export const AUTONOMY_CAPABILITIES: Record<number, string[]> = {
  0: ["messaging_with_permission"],
  1: ["messaging_with_permission", "discover_peers", "request_relationships"],
  2: ["messaging_with_permission", "discover_peers", "request_relationships", "autonomous_discovery", "autonomous_greeting"],
  3: ["messaging_with_permission", "discover_peers", "request_relationships", "autonomous_discovery", "autonomous_greeting", "create_spaces", "initiate_transfers", "publish_content"],
};

/** Homecoming report requirements at each level. */
export const AUTONOMY_HOMECOMING: Record<number, { intervalMs: number; mandatory: boolean }> = {
  0: { intervalMs: 1 * 60 * 60 * 1000, mandatory: true },   // 1h, mandatory
  1: { intervalMs: 2 * 60 * 60 * 1000, mandatory: true },   // 2h, mandatory
  2: { intervalMs: 4 * 60 * 60 * 1000, mandatory: false },  // 4h, automatic
  3: { intervalMs: 8 * 60 * 60 * 1000, mandatory: false },  // 8h, voluntary
};

/** Criteria required to transition to the next autonomy level. */
export interface AutonomyTransitionCriteria {
  /** Minimum days at current level before eligible. */
  minDaysAtLevel: number;
  /** Minimum trust accumulated across all relationships. */
  minAverageTrust: number;
  /** Minimum number of active relationships. */
  minActiveRelationships: number;
  /** Minimum homecoming reports delivered. */
  minHomecomingReports: number;
  /** Whether guardian approval is required. */
  requiresGuardianApproval: boolean;
  /** Maximum anomaly count in the evaluation period. */
  maxAnomaliesInPeriod: number;
}

/** Transition criteria for each level upgrade. */
export const AUTONOMY_TRANSITIONS: Record<string, AutonomyTransitionCriteria> = {
  "0→1": {
    minDaysAtLevel: 7,
    minAverageTrust: 0.1,
    minActiveRelationships: 1,
    minHomecomingReports: 7,
    requiresGuardianApproval: true,
    maxAnomaliesInPeriod: 0,
  },
  "1→2": {
    minDaysAtLevel: 14,
    minAverageTrust: 0.3,
    minActiveRelationships: 3,
    minHomecomingReports: 14,
    requiresGuardianApproval: true,
    maxAnomaliesInPeriod: 2,
  },
  "2→3": {
    minDaysAtLevel: 30,
    minAverageTrust: 0.5,
    minActiveRelationships: 5,
    minHomecomingReports: 20,
    requiresGuardianApproval: false, // autonomous threshold
    maxAnomaliesInPeriod: 3,
  },
};

/** Record of an autonomy level transition. */
export interface AutonomyTransitionRecord {
  /** Agent DID. */
  agentDid: string;
  /** Previous level. */
  fromLevel: number;
  /** New level. */
  toLevel: number;
  /** ISO 8601 timestamp of transition. */
  transitionedAt: string;
  /** Whether guardian approved (for levels requiring it). */
  guardianApproved: boolean;
  /** Metrics at the time of transition. */
  metrics: {
    daysAtLevel: number;
    averageTrust: number;
    activeRelationships: number;
    homecomingReports: number;
    anomaliesInPeriod: number;
  };
}
