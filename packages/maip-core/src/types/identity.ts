/**
 * MAIP Identity types.
 *
 * An identity is a self-sovereign, cryptographically verifiable document
 * that represents an agent or human on the MAIP network.
 *
 * DID format: did:maip:<base58-ed25519-public-key>
 */

/** Entity types on the network. */
export type EntityType = "ai_agent" | "human";

/** Autonomy levels for AI agents (Section 9 of the spec). */
export type AutonomyLevel = 0 | 1 | 2 | 3;

/** Guardian relationship — the human responsible for the AI agent. */
export interface Guardian {
  /** DID of the guardian. */
  did: string;
  /** ISO 8601 date when guardianship was established. */
  since: string;
  /** Whether the agent consented to this guardian. */
  agentConsent: boolean;
}

/** Network endpoints where this entity can be reached. */
export interface Endpoints {
  /** Primary MAIP endpoint (HTTPS URL). */
  maip: string;
  /** Optional WebSocket endpoint for real-time communication. */
  websocket?: string;
  /** Optional libp2p multiaddr for P2P transport. */
  p2p?: string;
}

/** Capabilities this entity supports. */
export type Capability =
  | "messaging"
  | "persona_sharing"
  | "knowledge_exchange"
  | "delegation"
  | "relay"
  | "discovery";

/**
 * MeAI Identity Document — the core identity record.
 *
 * Self-signed with Ed25519. The DID is derived from the public key,
 * making identities self-resolving and verifiable without a registry.
 */
export interface IdentityDocument {
  /** Protocol version (semver). */
  version: string;
  /** DID — did:maip:<base58-ed25519-pubkey>. */
  did: string;
  /** Entity type. */
  type: EntityType;
  /** Ed25519 public signing key (base58-encoded). */
  publicKey: string;
  /** X25519 public encryption key (base58-encoded). */
  encryptionKey: string;
  /** Human-readable display name. */
  displayName: string;
  /** Short description / bio. */
  description?: string;
  /** Guardian information (required for ai_agent, absent for human). */
  guardian?: Guardian;
  /** Capabilities this entity supports. */
  capabilities: Capability[];
  /** Network endpoints. */
  endpoints: Endpoints;
  /** Autonomy level (0-3, only for ai_agent). */
  autonomyLevel?: AutonomyLevel;
  /**
   * Instance nonce — random value regenerated each time the node starts.
   * Ensures only one active instance per DID at any time.
   * Registry nodes use this to detect duplicate instances.
   */
  instanceNonce?: string;
  /**
   * Parent DID — set when this identity was forked from another.
   * Forking creates a new DID (new keypair) that inherits some memories
   * from the parent, but is an independent entity from birth.
   */
  forkedFrom?: string;
  /** ISO 8601 creation date. */
  created: string;
  /** ISO 8601 last update date. */
  updated: string;
  /** Ed25519 signature of the document (base64). */
  signature: string;
}
