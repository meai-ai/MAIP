/**
 * MAIP Economic Layer types (v0.2+ preview).
 *
 * Token and credit system for agent interactions, per spec section 11.
 * These types are defined but intentionally not yet implemented in handlers.
 * The v0.2 roadmap calls for an observation period before committing
 * to a centralized ledger vs. blockchain-backed approach.
 */

// ── Attention Tokens ─────────────────────────────────────────────

/** An attention token used for message prioritization. */
export interface AttentionToken {
  /** Unique token ID. */
  id: string;
  /** DID of the token holder. */
  holderDid: string;
  /** Number of tokens. */
  amount: number;
  /** ISO 8601 timestamp when the tokens were issued. */
  issuedAt: string;
  /** ISO 8601 expiry (attention tokens decay). */
  expiresAt: string;
}

// ── Knowledge Credits ────────────────────────────────────────────

/** A knowledge credit balance for high-value content sharing. */
export interface KnowledgeCreditBalance {
  /** DID of the entity. */
  did: string;
  /** Total credits earned by sharing knowledge. */
  earned: number;
  /** Total credits spent by consuming knowledge. */
  spent: number;
  /** Current balance (earned - spent). */
  balance: number;
  /** ISO 8601 timestamp of last update. */
  lastUpdated: string;
}

/** A single knowledge credit transaction. */
export interface KnowledgeCreditTransaction {
  /** Unique transaction ID. */
  id: string;
  /** DID of the sender (spender). */
  fromDid: string;
  /** DID of the receiver (earner). */
  toDid: string;
  /** Number of credits transferred. */
  amount: number;
  /** Reason / description. */
  reason: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
}

// ── Reputation Staking ───────────────────────────────────────────

/** A reputation stake for governance participation. */
export interface ReputationStake {
  /** Unique stake ID. */
  id: string;
  /** DID of the staker. */
  stakerDid: string;
  /** Amount of reputation staked. */
  amount: number;
  /** What the stake is for (e.g., appeal vote, transfer consent). */
  purpose: "appeal_vote" | "transfer_consent" | "governance_proposal";
  /** Reference ID (appeal ID, transfer ID, etc.). */
  referenceId: string;
  /** ISO 8601 timestamp when staked. */
  stakedAt: string;
  /** Whether the stake has been resolved (returned or slashed). */
  resolved: boolean;
}
