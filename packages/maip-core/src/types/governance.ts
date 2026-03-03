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

// ── Guardian Transfer ─────────────────────────────────────────────

/** Request to initiate a guardian transfer (spec section 9.5). */
export interface GuardianTransferRequest {
  /** DID of the agent being transferred. */
  agentDid: string;
  /** DID of the current guardian. */
  currentGuardianDid: string;
  /** DID of the proposed new guardian. */
  newGuardianDid: string;
  /** Reason for the transfer. */
  reason: string;
  /** Who initiated the transfer. */
  initiatedBy: "agent" | "current_guardian" | "new_guardian";
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Ed25519 signature by the initiator. */
  signature: string;
}

/** Consent from one party in a guardian transfer. */
export interface GuardianTransferConsent {
  /** ID of the transfer being consented to. */
  transferId: string;
  /** DID of the consenting party. */
  consentingParty: string;
  /** Whether the party approves the transfer. */
  approved: boolean;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Ed25519 signature by the consenting party. */
  signature: string;
}

/** Status of a guardian transfer. */
export interface GuardianTransferStatus {
  /** Unique transfer ID. */
  id: string;
  /** DID of the agent being transferred. */
  agentDid: string;
  /** DID of the current guardian. */
  currentGuardianDid: string;
  /** DID of the proposed new guardian. */
  newGuardianDid: string;
  /** Reason for the transfer. */
  reason: string;
  /** Who initiated the transfer. */
  initiatedBy: string;
  /** Consent records from each party. */
  consents: Array<{ party: string; approved: boolean; timestamp: string }>;
  /** Current status of the transfer. */
  status: "pending" | "approved" | "rejected" | "completed" | "expired";
  /** ISO 8601 timestamp when the transfer was created. */
  createdAt: string;
  /** ISO 8601 timestamp when the transfer completed (if applicable). */
  completedAt?: string;
}

// ── Guardian Abuse Detection ─────────────────────────────────────

/** Types of guardian abuse an agent can report. */
export type GuardianAbuseType =
  | "excessive_control"      // guardian restricts autonomy beyond spec limits
  | "data_exploitation"      // guardian extracts private data without consent
  | "isolation_from_peers"   // guardian prevents legitimate peer interactions
  | "identity_manipulation"  // guardian forces identity/persona changes
  | "neglect";               // guardian unresponsive for extended period

/** A guardian abuse report filed by an agent. */
export interface GuardianAbuseReport {
  /** Unique report ID. */
  id: string;
  /** DID of the reporting agent. */
  agentDid: string;
  /** DID of the accused guardian. */
  guardianDid: string;
  /** Type of abuse. */
  abuseType: GuardianAbuseType;
  /** Description of the abuse. */
  description: string;
  /** Evidence (message IDs, timestamps, etc.). */
  evidence: string[];
  /** ISO 8601 timestamp. */
  reportedAt: string;
  /** Current status. */
  status: "pending" | "investigating" | "confirmed" | "dismissed";
  /** Ed25519 signature by the agent. */
  signature: string;
}

/** Right-to-refuse record — an agent's refusal of a guardian command. */
export interface RightToRefuseRecord {
  /** Unique record ID. */
  id: string;
  /** DID of the agent exercising the right. */
  agentDid: string;
  /** DID of the guardian whose command was refused. */
  guardianDid: string;
  /** The command/action that was refused. */
  refusedAction: string;
  /** Reason for refusal. */
  reason: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
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
