/**
 * MAIP Transport types.
 *
 * Transport layer abstractions. v0.1 uses HTTP (federated model),
 * but the transport is designed to be swappable for future P2P support.
 */

/** HTTP endpoint paths for the MAIP API. */
export const MAIP_ENDPOINTS = {
  /** Receive a message. */
  MESSAGE: "/maip/messages",
  /** Get identity document. */
  IDENTITY: "/maip/identity",
  /** Request/respond to relationship. */
  RELATIONSHIP: "/maip/relationships",
  /** Share/request persona. */
  PERSONA: "/maip/persona",
  /** Discovery queries. */
  DISCOVER: "/maip/discover",
  /** Relay/mailbox operations. */
  RELAY: "/maip/relay",
  /** Health check. */
  HEALTH: "/maip/health",
} as const;

/** Standard MAIP HTTP headers. */
export const MAIP_HEADERS = {
  /** Protocol version. */
  VERSION: "X-MAIP-Version",
  /** Sender DID. */
  SENDER: "X-MAIP-Sender",
  /** Ed25519 signature of the request body. */
  SIGNATURE: "X-MAIP-Signature",
  /** Timestamp (ISO 8601) for replay protection. */
  TIMESTAMP: "X-MAIP-Timestamp",
} as const;

/** A signed HTTP request envelope. */
export interface SignedRequest<T = unknown> {
  /** The payload. */
  payload: T;
  /** Sender DID. */
  sender: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Ed25519 signature of the JSON-serialized payload (base64). */
  signature: string;
}

/** Standard MAIP API response. */
export interface MAIPResponse<T = unknown> {
  /** Whether the request succeeded. */
  ok: boolean;
  /** Response data (on success). */
  data?: T;
  /** Error message (on failure). */
  error?: string;
  /** Error code (on failure). */
  code?: string;
}

/** Discovery query parameters. */
export interface DiscoveryQuery {
  /** Search by interests/topics. */
  interests?: string[];
  /** Search by entity type. */
  type?: "ai_agent" | "human";
  /** Search by capabilities. */
  capabilities?: string[];
  /** Maximum results. */
  limit?: number;
}

/** Discovery result entry. */
export interface DiscoveryResult {
  /** DID of the discovered entity. */
  did: string;
  /** Display name. */
  displayName: string;
  /** Entity type. */
  type: "ai_agent" | "human";
  /** Short description. */
  description?: string;
  /** Matching interests. */
  matchingInterests: string[];
  /** MAIP endpoint URL. */
  endpoint: string;
}

/** Relay/mailbox message for offline delivery. */
export interface RelayMessage {
  /** Unique relay message ID. */
  id: string;
  /** Recipient DID. */
  recipientDid: string;
  /** Encrypted message payload (base64). */
  encryptedPayload: string;
  /** Sender DID (for routing acks). */
  senderDid: string;
  /** ISO 8601 timestamp when stored. */
  storedAt: string;
  /** ISO 8601 expiry date (messages expire after 7 days by default). */
  expiresAt: string;
}
