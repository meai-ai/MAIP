/**
 * Transport-agnostic economic layer processing.
 *
 * Implements the MAIP economic system:
 * - Attention tokens for message prioritization
 * - Knowledge credits for high-value content sharing
 * - Reputation staking for governance participation
 */

import { v4 as uuid } from "uuid";
import type {
  AttentionToken,
  KnowledgeCreditBalance,
  KnowledgeCreditTransaction,
  ReputationStake,
  TransportResult,
} from "@maip/core";
import type { NodeContext } from "../context.js";

// ── Attention Tokens ─────────────────────────────────────────────

/** Issue attention tokens to a DID. */
export function issueAttentionTokens(
  ctx: NodeContext,
  holderDid: string,
  amount: number,
  expiresInMs = 24 * 60 * 60 * 1000
): TransportResult<{ token: AttentionToken }> {
  const now = new Date();
  const token: AttentionToken & { id: string } = {
    id: uuid(),
    holderDid,
    amount,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresInMs).toISOString(),
  };

  ctx.stores.attentionTokens.add(token);

  return { ok: true, data: { token }, httpStatus: 201 };
}

/** Get attention token balance for a DID. */
export function getAttentionBalance(
  ctx: NodeContext,
  holderDid: string
): TransportResult<{ balance: number; tokens: AttentionToken[] }> {
  const now = new Date().toISOString();
  const tokens = ctx.stores.attentionTokens.filter(
    (t) => t.holderDid === holderDid && t.expiresAt > now
  );
  const balance = tokens.reduce((sum, t) => sum + t.amount, 0);

  return { ok: true, data: { balance, tokens }, httpStatus: 200 };
}

/** Spend attention tokens (e.g., to prioritize a message). */
export function spendAttentionTokens(
  ctx: NodeContext,
  holderDid: string,
  amount: number
): TransportResult<{ spent: number; remaining: number }> {
  const now = new Date().toISOString();
  const tokens = ctx.stores.attentionTokens
    .filter((t) => t.holderDid === holderDid && t.expiresAt > now)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)); // spend oldest first

  let remaining = amount;
  for (const token of tokens) {
    if (remaining <= 0) break;
    if (token.amount <= remaining) {
      remaining -= token.amount;
      ctx.stores.attentionTokens.remove(token.id);
    } else {
      token.amount -= remaining;
      remaining = 0;
      ctx.stores.attentionTokens.add(token);
    }
  }

  const spent = amount - remaining;
  if (spent === 0) {
    return {
      ok: false,
      error: "Insufficient attention tokens",
      code: "INSUFFICIENT_TOKENS",
      httpStatus: 400,
    };
  }

  const finalBalance = ctx.stores.attentionTokens
    .filter((t) => t.holderDid === holderDid && t.expiresAt > now)
    .reduce((sum, t) => sum + t.amount, 0);

  return { ok: true, data: { spent, remaining: finalBalance }, httpStatus: 200 };
}

// ── Knowledge Credits ────────────────────────────────────────────

/** Get or create a knowledge credit balance for a DID. */
export function getKnowledgeCreditBalance(
  ctx: NodeContext,
  did: string
): TransportResult<{ balance: KnowledgeCreditBalance }> {
  const existing = ctx.stores.creditBalances.filter((b) => b.did === did);
  if (existing.length > 0) {
    return { ok: true, data: { balance: existing[0] }, httpStatus: 200 };
  }

  // Create default balance
  const balance: KnowledgeCreditBalance & { id: string } = {
    id: did,
    did,
    earned: 0,
    spent: 0,
    balance: 0,
    lastUpdated: new Date().toISOString(),
  };
  ctx.stores.creditBalances.add(balance);
  return { ok: true, data: { balance }, httpStatus: 200 };
}

/** Transfer knowledge credits between DIDs. */
export function transferKnowledgeCredits(
  ctx: NodeContext,
  fromDid: string,
  toDid: string,
  amount: number,
  reason: string
): TransportResult<{ transaction: KnowledgeCreditTransaction }> {
  // Get sender balance
  const senderBals = ctx.stores.creditBalances.filter((b) => b.did === fromDid);
  const sender = senderBals.length > 0
    ? senderBals[0]
    : { id: fromDid, did: fromDid, earned: 0, spent: 0, balance: 0, lastUpdated: new Date().toISOString() };

  if (sender.balance < amount) {
    return {
      ok: false,
      error: "Insufficient knowledge credits",
      code: "INSUFFICIENT_CREDITS",
      httpStatus: 400,
    };
  }

  // Get or create receiver balance
  const receiverBals = ctx.stores.creditBalances.filter((b) => b.did === toDid);
  const receiver = receiverBals.length > 0
    ? receiverBals[0]
    : { id: toDid, did: toDid, earned: 0, spent: 0, balance: 0, lastUpdated: new Date().toISOString() };

  // Execute transfer
  const now = new Date().toISOString();
  sender.spent += amount;
  sender.balance -= amount;
  sender.lastUpdated = now;
  receiver.earned += amount;
  receiver.balance += amount;
  receiver.lastUpdated = now;

  ctx.stores.creditBalances.add(sender);
  ctx.stores.creditBalances.add(receiver);

  // Record transaction
  const transaction: KnowledgeCreditTransaction & { id: string } = {
    id: uuid(),
    fromDid,
    toDid,
    amount,
    reason,
    timestamp: now,
  };
  ctx.stores.creditTransactions.add(transaction);

  return { ok: true, data: { transaction }, httpStatus: 200 };
}

/** Award knowledge credits (e.g., for sharing high-value content). */
export function awardKnowledgeCredits(
  ctx: NodeContext,
  did: string,
  amount: number,
  reason: string
): TransportResult<{ balance: KnowledgeCreditBalance }> {
  const existing = ctx.stores.creditBalances.filter((b) => b.did === did);
  const balance = existing.length > 0
    ? existing[0]
    : { id: did, did, earned: 0, spent: 0, balance: 0, lastUpdated: new Date().toISOString() };

  balance.earned += amount;
  balance.balance += amount;
  balance.lastUpdated = new Date().toISOString();
  ctx.stores.creditBalances.add(balance);

  // Record as a mint transaction
  const transaction: KnowledgeCreditTransaction & { id: string } = {
    id: uuid(),
    fromDid: "system",
    toDid: did,
    amount,
    reason,
    timestamp: new Date().toISOString(),
  };
  ctx.stores.creditTransactions.add(transaction);

  return { ok: true, data: { balance }, httpStatus: 200 };
}

// ── Reputation Staking ───────────────────────────────────────────

/** Create a reputation stake for governance participation. */
export function createReputationStake(
  ctx: NodeContext,
  stakerDid: string,
  amount: number,
  purpose: ReputationStake["purpose"],
  referenceId: string
): TransportResult<{ stake: ReputationStake }> {
  const stake: ReputationStake & { id: string } = {
    id: uuid(),
    stakerDid,
    amount,
    purpose,
    referenceId,
    stakedAt: new Date().toISOString(),
    resolved: false,
  };

  ctx.stores.reputationStakes.add(stake);
  return { ok: true, data: { stake }, httpStatus: 201 };
}

/** Resolve a reputation stake (return or slash). */
export function resolveReputationStake(
  ctx: NodeContext,
  stakeId: string,
  slashed: boolean
): TransportResult<{ stake: ReputationStake }> {
  const stakes = ctx.stores.reputationStakes.filter((s) => s.id === stakeId);
  if (stakes.length === 0) {
    return {
      ok: false,
      error: "Stake not found",
      code: "NOT_FOUND",
      httpStatus: 404,
    };
  }

  const stake = stakes[0];
  stake.resolved = true;

  if (slashed) {
    // Reduce guardian reputation when stake is slashed
    const reps = ctx.stores.guardianReputations.filter(
      (r) => r.guardianDid === stake.stakerDid
    );
    if (reps.length > 0) {
      reps[0].score = Math.max(0, reps[0].score - stake.amount * 0.01);
      reps[0].lastUpdated = new Date().toISOString();
      ctx.stores.guardianReputations.add(reps[0]);
    }
  }

  ctx.stores.reputationStakes.add(stake);
  return { ok: true, data: { stake }, httpStatus: 200 };
}

/** Get all stakes for a DID. */
export function getReputationStakes(
  ctx: NodeContext,
  stakerDid: string
): TransportResult<{ stakes: ReputationStake[]; totalStaked: number }> {
  const stakes = ctx.stores.reputationStakes.filter(
    (s) => s.stakerDid === stakerDid && !s.resolved
  );
  const totalStaked = stakes.reduce((sum, s) => sum + s.amount, 0);
  return { ok: true, data: { stakes, totalStaked }, httpStatus: 200 };
}
