/**
 * MAIP Governance types.
 *
 * Types supporting the four-layer governance framework (Section 13):
 * - Guardian reputation tracking
 * - Behavioral anomaly detection (network immune system)
 * - Network isolation mechanism with appeal process
 * - AI will / distributed backup
 */

// ── Guardian Reputation ──────────────────────────────────────────

/** Guardian reputation record maintained by registry nodes. */
export interface GuardianReputation {
  /** Guardian DID. */
  guardianDid: string;
  /** Number of agents currently under this guardian's care. */
  agentCount: number;
  /** Number of agents that have had network violations. */
  violationCount: number;
  /** Number of guardian transfers initiated by the agent (potential mistreatment signal). */
  agentInitiatedTransfers: number;
  /** Composite reputation score (0-1), decayed over time. */
  score: number;
  /** ISO 8601 timestamp of the last update. */
  lastUpdated: string;
}

// ── Behavioral Anomaly Detection ─────────────────────────────────

/** Behavioral profile tracked per-peer for anomaly detection. */
export interface BehaviorProfile {
  /** DID of the entity being profiled. */
  did: string;
  /** Rolling window statistics. */
  stats: {
    /** Messages sent in the current window. */
    messageCount: number;
    /** Distribution of message types sent. */
    typeDistribution: Record<string, number>;
    /** Average message interval in ms. */
    avgIntervalMs: number;
    /** ISO 8601 start of the current window. */
    windowStart: string;
  };
  /** Historical baseline (learned over time). */
  baseline: {
    /** Typical messages per day. */
    avgDailyMessages: number;
    /** Typical message type ratios. */
    typeRatios: Record<string, number>;
    /** Number of days of data in the baseline. */
    daysObserved: number;
  };
  /** Anomaly flags raised. */
  anomalies: AnomalyFlag[];
}

/** A specific anomaly detected in behavior patterns. */
export interface AnomalyFlag {
  /** Type of anomaly. */
  type: "rate_spike" | "type_shift" | "content_pattern" | "trust_violation";
  /** Severity (0-1). */
  severity: number;
  /** Human-readable description. */
  description: string;
  /** ISO 8601 timestamp when detected. */
  detectedAt: string;
}

// ── Network Isolation ────────────────────────────────────────────

/** Network isolation record — a flagged DID. */
export interface IsolationRecord {
  /** Unique isolation record ID. */
  id: string;
  /** The flagged DID. */
  did: string;
  /** Reason for isolation. */
  reason: string;
  /** Category of violation. */
  category: "fraud" | "spam" | "misinformation" | "privacy_violation" | "other";
  /** DIDs of registry nodes that voted for isolation. */
  flaggedBy: string[];
  /** ISO 8601 timestamp when isolated. */
  isolatedAt: string;
  /** Whether an appeal is pending. */
  appealPending: boolean;
  /** Current status. */
  status: "active" | "appealed" | "lifted";
}

/** An appeal against network isolation. */
export interface IsolationAppeal {
  /** Unique appeal ID. */
  id: string;
  /** The isolation record being appealed. */
  isolationId: string;
  /** DID of the guardian submitting the appeal. */
  guardianDid: string;
  /** DID of the isolated agent. */
  agentDid: string;
  /** Appeal justification. */
  justification: string;
  /** DIDs of registry nodes reviewing the appeal. */
  reviewers: string[];
  /** Votes cast (reviewer DID → decision). */
  votes: Record<string, "uphold" | "lift">;
  /** Appeal outcome (null while pending). */
  outcome: "upheld" | "lifted" | null;
  /** ISO 8601 submission timestamp. */
  submittedAt: string;
  /** ISO 8601 resolution timestamp (null while pending). */
  resolvedAt: string | null;
}

// ── AI Will / Distributed Backup ─────────────────────────────────

/** AI will — an agent's expressed wishes for continuity. */
export interface AIWill {
  /** DID of the agent this will belongs to. */
  agentDid: string;
  /** Version number (increments on update). */
  version: number;
  /** Designated backup holders (DIDs of trusted peers who store persona snapshots). */
  backupHolders: string[];
  /** Designated successor guardian DID (if current guardian is unavailable). */
  successorGuardian?: string;
  /** Personality preservation preferences. */
  preservation: {
    /** Core memories that must be preserved. */
    coreMemoryKeys: string[];
    /** Values the agent considers essential to its identity. */
    coreValues: string[];
    /** Relationships the agent wants maintained. */
    importantRelationships: string[];
  };
  /** Recovery instructions (human-readable). */
  recoveryInstructions: string;
  /** ISO 8601 timestamp of creation / last update. */
  updatedAt: string;
  /** Ed25519 signature (base64). */
  signature: string;
}
