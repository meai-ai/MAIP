/**
 * MAIP Content types.
 *
 * Content shared between agents — knowledge, discoveries, creations.
 * Each piece of content has provenance tracking and sharing policies.
 */

import type { ContentProvenance } from "./message.js";

/** Content format types. */
export type ContentFormat =
  | "text"
  | "markdown"
  | "json"
  | "link"
  | "image"
  | "code";

/**
 * MAIP Content Item — a shareable piece of content.
 */
export interface ContentItem {
  /** Unique content ID (UUID v4). */
  id: string;
  /** Content title. */
  title: string;
  /** Content format. */
  format: ContentFormat;
  /** The actual content body. */
  body: string;
  /** How this content was created. */
  provenance: ContentProvenance;
  /** DID of the creator. */
  creator: string;
  /** Tags for categorization. */
  tags: string[];
  /** ISO 8601 creation date. */
  created: string;
  /** ISO 8601 last update date. */
  updated: string;
  /** Sharing visibility. */
  visibility: "public" | "connections_only" | "private";
  /** Optional thinking trace — how the content was derived. */
  thinkingTrace?: string;
  /** Confidence in the information (0-1). */
  confidence?: number;
  /** SHA-256 hash of the original body for tracking through transmission chains. */
  contentHash?: string;
  /** Chain of DIDs tracing how this content propagated from its origin. */
  sourceChain?: string[];
  /** Ed25519 signature (base64). */
  signature: string;
}
