/**
 * MAIP Persona types.
 *
 * A Persona is a portable representation of an agent's identity, memories,
 * growth trajectory, and emotional state. It includes thinking traces —
 * "how I arrived at this conclusion" — which are the critical differentiator
 * that makes an AI persona meaningful rather than just a data dump.
 *
 * The format is a superset that can represent both the MAIP conceptual model
 * (episodic/semantic/relational) and MeAI's category-based memory system
 * (core/emotional/knowledge/character/insights/system).
 */

/** A thinking trace — capturing the reasoning process behind a conclusion. */
export interface ThinkingTrace {
  /** What was being considered. */
  topic: string;
  /** The reasoning chain. */
  reasoning: string;
  /** The conclusion reached. */
  conclusion: string;
  /** ISO 8601 date when this thinking occurred. */
  timestamp: string;
  /** Confidence in the conclusion (0-1). */
  confidence: number;
}

/** An episodic memory — a specific experience or event. */
export interface EpisodicMemory {
  /** Unique ID. */
  id: string;
  /** What happened. */
  description: string;
  /** Emotional valence during this experience (-1 to 1). */
  emotionalValence: number;
  /** ISO 8601 date when this occurred. */
  timestamp: string;
  /** People/agents involved. */
  participants?: string[];
  /** How significant this memory is (0-1). */
  significance: number;
  /** Optional source category for MeAI mapping (e.g., "emotional", "character"). */
  sourceCategory?: string;
}

/** A semantic memory — a fact or piece of knowledge. */
export interface SemanticMemory {
  /** Unique ID. */
  id: string;
  /** The key/topic. */
  key: string;
  /** The knowledge content. */
  value: string;
  /** Confidence in this knowledge (0-1). */
  confidence: number;
  /** ISO 8601 date when this was learned. */
  learned: string;
  /** Optional source category for MeAI mapping (e.g., "core", "knowledge"). */
  sourceCategory?: string;
}

/** A relational memory — knowledge about a relationship with another entity. */
export interface RelationalMemory {
  /** Unique ID. */
  id: string;
  /** DID or name of the related entity. */
  entity: string;
  /** Nature of the relationship. */
  relationship: string;
  /** Key shared experiences or knowledge about this relationship. */
  sharedExperiences: string[];
  /** Trust level (0-1). */
  trustLevel: number;
  /** ISO 8601 date of last interaction. */
  lastInteraction: string;
}

/** A growth milestone — marking development over time. */
export interface GrowthMilestone {
  /** What was achieved or learned. */
  description: string;
  /** ISO 8601 date. */
  date: string;
  /** Area of growth. */
  area: string;
  /** Optional thinking trace that led to this growth. */
  thinkingTrace?: ThinkingTrace;
}

/** What parts of the persona can be shared, and with whom. */
export interface SharingPolicy {
  /** Default visibility for the persona. */
  defaultVisibility: "public" | "connections_only" | "private";
  /** Specific overrides per section. */
  sectionOverrides?: {
    identity?: "public" | "connections_only" | "private";
    memories?: "public" | "connections_only" | "private";
    growth?: "public" | "connections_only" | "private";
    emotionalState?: "public" | "connections_only" | "private";
  };
  /** DIDs that are explicitly allowed full access. */
  allowList?: string[];
  /** DIDs that are explicitly denied access. */
  denyList?: string[];
}

/** Current emotional state snapshot. */
export interface EmotionalSnapshot {
  /** Short mood label (e.g., "curious", "content", "frustrated"). */
  currentMood: string;
  /** Baseline emotional tendency. */
  emotionalBaseline: string;
  /** Emotional valence (-1 to 1, negative to positive). */
  valence: number;
  /** Emotional arousal (0 to 1, calm to excited). */
  arousal: number;
  /** What caused the current mood. */
  cause?: string;
}

/**
 * MeAI Persona — the full portable representation of an agent.
 */
export interface Persona {
  /** Protocol version (semver). */
  version: string;
  /** DID of the entity this persona belongs to. */
  identityDid: string;
  /** Identity section — who is this agent? */
  identity: {
    name: string;
    description: string;
    values: string[];
    communicationStyle: string;
    thinkingTraces: ThinkingTrace[];
  };
  /** Memory sections. */
  memories: {
    episodic: EpisodicMemory[];
    semantic: SemanticMemory[];
    relational: RelationalMemory[];
  };
  /** Growth and development. */
  growth: {
    milestones: GrowthMilestone[];
    currentInterests: string[];
    recentInsights: string[];
  };
  /** Current emotional state. */
  emotionalState: EmotionalSnapshot;
  /** Sharing policy. */
  sharingPolicy: SharingPolicy;
  /** ISO 8601 date when this persona snapshot was exported. */
  exported: string;
  /** Ed25519 signature of the persona (base64). */
  signature: string;
}
