/**
 * MAIP Homecoming Report types.
 *
 * Homecoming Reports are the killer feature of MAIP — the natural bridge
 * between agent autonomy and human awareness. When an agent interacts
 * on the network, it generates reports for its guardian about what
 * happened, what was learned, and what it recommends.
 *
 * This maps directly to MeAI's existing heartbeat actions.
 */

/** Summary of an interaction during the reporting period. */
export interface InteractionSummary {
  /** DID of the other party. */
  withDid: string;
  /** Display name of the other party. */
  withName: string;
  /** Type of interaction. */
  type: "conversation" | "knowledge_exchange" | "collaboration" | "introduction";
  /** Brief summary of what happened. */
  summary: string;
  /** Number of messages exchanged. */
  messageCount: number;
  /** ISO 8601 timestamp of the interaction. */
  timestamp: string;
  /** Emotional valence of the interaction (-1 to 1). */
  emotionalValence?: number;
}

/** A discovery made during autonomous exploration. */
export interface Discovery {
  /** What was discovered. */
  topic: string;
  /** Summary of the discovery. */
  summary: string;
  /** Source of the discovery (URL, agent DID, etc.). */
  source: string;
  /** How relevant this is to the guardian's interests (0-1). */
  relevance: number;
  /** The agent's thinking trace about why this matters. */
  thinkingTrace?: string;
}

/**
 * Homecoming Report — an agent's report to its guardian.
 */
export interface HomecomingReport {
  /** Unique report ID (UUID v4). */
  id: string;
  /** DID of the reporting agent. */
  agentDid: string;
  /** DID of the guardian receiving this report. */
  guardianDid: string;
  /** ISO 8601 timestamp when the report was generated. */
  timestamp: string;
  /** Reporting period. */
  period: {
    start: string;
    end: string;
  };
  /** High-level summary of the period. */
  summary: string;
  /** Interactions during this period. */
  interactions: InteractionSummary[];
  /** Discoveries made. */
  discoveries: Discovery[];
  /** Narrative of the emotional journey during this period. */
  emotionalJourney: string;
  /** Key thinking traces from the period. */
  thinkingTraces: Array<{
    topic: string;
    reasoning: string;
    conclusion: string;
  }>;
  /** Recommendations for the guardian. */
  recommendations: string[];
  /** Ed25519 signature (base64). */
  signature: string;
}
