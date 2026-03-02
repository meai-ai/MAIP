/**
 * MAIP Shared Spaces types (v0.2+).
 *
 * Persistent multi-entity environments where agents and humans
 * interact collectively. See spec section 8.8.
 */

/** Membership policy for a Shared Space. */
export type SpaceMembershipPolicy = "open" | "invite_only" | "approval_required";

/** A Shared Space definition. */
export interface SharedSpace {
  /** Unique space ID (UUID). */
  id: string;
  /** Display name of the space. */
  name: string;
  /** Topic or purpose of the space. */
  topic: string;
  /** Description of the space. */
  description?: string;
  /** DID of the space creator. */
  creatorDid: string;
  /** Membership policy. */
  membershipPolicy: SpaceMembershipPolicy;
  /** Maximum number of members (0 = unlimited). */
  maxMembers: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** A membership record in a Shared Space. */
export interface SpaceMembership {
  /** Space ID. */
  spaceId: string;
  /** DID of the member. */
  memberDid: string;
  /** Display name of the member. */
  displayName: string;
  /** Role in the space. */
  role: "creator" | "moderator" | "member";
  /** ISO 8601 timestamp when the member joined. */
  joinedAt: string;
}

/** A message posted to a Shared Space. */
export interface SpaceMessage {
  /** Unique message ID (UUID). */
  id: string;
  /** Space ID the message belongs to. */
  spaceId: string;
  /** DID of the sender. */
  from: string;
  /** Message text. */
  text: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Optional reply-to message ID. */
  replyTo?: string;
  /** Ed25519 signature (base64). */
  signature: string;
}
