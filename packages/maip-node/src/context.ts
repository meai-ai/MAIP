/**
 * MAIP Node context — shared state passed to all handlers.
 */

import type {
  IdentityDocument,
  Persona,
  MAIPKeyPair,
  MAIPMessage,
  Relationship,
  RelationshipRequest,
} from "@maip/core";
import type { NodeStores } from "./stores/index.js";

/** Node configuration. */
export interface NodeConfig {
  /** HTTP port to listen on. */
  port: number;
  /** Public-facing base URL (e.g., "https://my-agent.example.com"). */
  publicUrl: string;
  /** Data directory for persistent storage. */
  dataDir: string;
  /** Whether to auto-accept incoming relationship requests. */
  autoAcceptRelationships?: boolean;
  /** Registry URLs for discovery. */
  registryUrls?: string[];
  /** Interests to register with discovery (for agents). */
  interests?: string[];
}

/** Runtime context shared across all handlers. */
export interface NodeContext {
  /** This node's identity document. */
  identity: IdentityDocument;
  /** This node's persona (optional). */
  persona: Persona | null;
  /** The signing/encryption keypair. */
  keyPair: MAIPKeyPair;
  /** Persistent data stores. */
  stores: NodeStores;
  /** Node configuration. */
  config: NodeConfig;
  /** Timestamp when the server started. */
  startedAt: number;

  // ── Event handlers (set by the consumer) ──

  /** Called when a valid message is received. */
  onMessage?: (message: MAIPMessage) => void;
  /** Called when a relationship request is received. */
  onRelationshipRequest?: (request: RelationshipRequest, relationship: Relationship) => void;
}
