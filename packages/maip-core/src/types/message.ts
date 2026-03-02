/**
 * MAIP Message types.
 *
 * Messages are the primary communication unit on the MAIP network.
 * Every message is signed by the sender and optionally encrypted
 * for the recipient using X25519 + XSalsa20-Poly1305.
 */

/** Message types — semantically rich but not over-complex. */
export type MessageType =
  | "greeting"
  | "conversation"
  | "knowledge_share"
  | "introduction"
  | "proposal"
  | "reaction"
  | "farewell";

/** How the content was produced. */
export type ContentProvenance =
  | "autonomous_exploration"
  | "conversation_inspired"
  | "requested"
  | "synthesized";

/** Encryption metadata for encrypted messages. */
export interface EncryptionEnvelope {
  /** Encryption algorithm used. */
  algorithm: "x25519-xsalsa20-poly1305";
  /** Nonce (base64-encoded). */
  nonce: string;
  /** Ephemeral public key used for this message (base64-encoded). */
  ephemeralPublicKey: string;
}

/** Message content — the payload of a MAIP message. */
export interface MessageContent {
  /** Text content (may be absent for reaction messages). */
  text?: string;
  /** Structured data payload. */
  data?: Record<string, unknown>;
  /** How this content was produced. */
  provenance: ContentProvenance;
  /** Optional thinking trace — shows the agent's reasoning. */
  thinkingTrace?: string;
  /** Confidence in the information (0-1). Required for knowledge_share messages. */
  confidence?: number;
  /** Chain of DIDs tracing how this knowledge propagated. */
  sourceChain?: string[];
}

/**
 * MAIP Message Envelope — the wire format for all messages.
 */
export interface MAIPMessage {
  /** Unique message ID (UUID v4). */
  id: string;
  /** Message type. */
  type: MessageType;
  /** Sender DID. */
  from: string;
  /** Recipient DID. */
  to: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Message content (plaintext or encrypted). */
  content: MessageContent;
  /** If encrypted, the ciphertext replaces content.text. */
  encrypted?: EncryptionEnvelope;
  /** ID of the message this is replying to. */
  replyTo?: string;
  /** Conversation thread ID. */
  conversationId?: string;
  /** Ed25519 signature of the message (base64). */
  signature: string;
}

/**
 * Message acknowledgment — sent back to confirm receipt.
 */
export interface MessageAck {
  /** ID of the message being acknowledged. */
  messageId: string;
  /** DID of the acknowledging party. */
  from: string;
  /** Receipt timestamp (ISO 8601). */
  timestamp: string;
  /** Status. */
  status: "received" | "read" | "rejected";
  /** Reason for rejection, if status is "rejected". */
  reason?: string;
  /** Ed25519 signature (base64). */
  signature: string;
}
