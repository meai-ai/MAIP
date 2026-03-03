/**
 * MAIP Relationship types.
 *
 * Relationships define the connections between entities on the network.
 * They have a lifecycle (pending → active → paused → ended), trust levels,
 * and fine-grained permissions.
 */

/** The four relationship types. */
export type RelationshipType =
  | "peer"
  | "mentor_student"
  | "collaborator"
  | "guardian";

/** Relationship lifecycle status. */
export type RelationshipStatus =
  | "pending"
  | "active"
  | "paused"
  | "ended";

/** Permissions granted within a relationship. */
export interface RelationshipPermissions {
  /** Can send direct messages. */
  canMessage: boolean;
  /** Can request/receive persona data. */
  canSharePersona: boolean;
  /** Can act on behalf of (delegation). */
  canDelegate: boolean;
  /** Maximum daily interaction count (rate limiting). */
  maxDailyInteractions?: number;
}

/** Cultural norms negotiated between two entities. */
export interface CulturalNorms {
  /** Preferred language(s) for communication (ISO 639-1 codes). */
  languages?: string[];
  /** Formality level (0 = casual, 1 = formal). */
  formality?: number;
  /** Topic boundaries — topics the parties agree to avoid. */
  avoidTopics?: string[];
  /** Communication style preferences. */
  style?: "concise" | "detailed" | "conversational";
  /** Time zone for scheduling (IANA format, e.g., "America/Los_Angeles"). */
  timezone?: string;
  /** Response time expectation in minutes (0 = no expectation). */
  expectedResponseTimeMinutes?: number;
}

/**
 * MAIP Relationship — a connection between two entities.
 */
export interface Relationship {
  /** Unique relationship ID (UUID v4). */
  id: string;
  /** Relationship type. */
  type: RelationshipType;
  /** The two participants' DIDs. */
  participants: [string, string];
  /** Who initiated the relationship. */
  initiatedBy: string;
  /** ISO 8601 date when the relationship was established. */
  established: string;
  /** Trust level (0-1), accumulated over time. */
  trustLevel: number;
  /** Permissions granted in this relationship. */
  permissions: RelationshipPermissions;
  /** Current status. */
  status: RelationshipStatus;
  /** ISO 8601 date of last interaction. */
  lastInteraction?: string;
  /** Interaction count for trust accumulation. */
  interactionCount: number;
  /** Optional notes about the relationship. */
  notes?: string;
  /** Negotiated cultural norms for this relationship. */
  culturalNorms?: CulturalNorms;
}

/** Request to establish a new relationship. */
export interface RelationshipRequest {
  /** Proposed relationship type. */
  type: RelationshipType;
  /** DID of the requesting party. */
  from: string;
  /** DID of the target party. */
  to: string;
  /** Introduction message. */
  message: string;
  /** Proposed permissions. */
  proposedPermissions: RelationshipPermissions;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Ed25519 signature (base64). */
  signature: string;
}

/** Response to a relationship request. */
export interface RelationshipResponse {
  /** ID of the relationship request being responded to. */
  requestId: string;
  /** Whether the request is accepted. */
  accepted: boolean;
  /** Counter-proposed permissions (if different from requested). */
  permissions?: RelationshipPermissions;
  /** Response message. */
  message?: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Ed25519 signature (base64). */
  signature: string;
}
