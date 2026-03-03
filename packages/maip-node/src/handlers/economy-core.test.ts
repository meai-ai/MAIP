/**
 * Unit tests for economy-core.ts — attention tokens, knowledge credits,
 * and reputation staking.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initNode } from "../init.js";
import type { NodeContext } from "../context.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  issueAttentionTokens,
  getAttentionBalance,
  spendAttentionTokens,
  awardKnowledgeCredits,
  transferKnowledgeCredits,
  createReputationStake,
  resolveReputationStake,
  getReputationStakes,
} from "./economy-core.js";

let ctx: NodeContext;
let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-test-"));
  ctx = initNode(
    { port: 0, publicUrl: "http://localhost:0", dataDir },
    { displayName: "Test", type: "ai_agent" }
  );
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ── Attention Tokens ────────────────────────────────────────────

describe("issueAttentionTokens", () => {
  it("creates a token with correct holder, amount, and timestamps", () => {
    const holder = "did:maip:holder1";
    const result = issueAttentionTokens(ctx, holder, 10);
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.data!.token.holderDid).toBe(holder);
    expect(result.data!.token.amount).toBe(10);
    expect(result.data!.token.issuedAt).toBeTruthy();
    expect(result.data!.token.expiresAt).toBeTruthy();
    expect(new Date(result.data!.token.expiresAt).getTime()).toBeGreaterThan(
      new Date(result.data!.token.issuedAt).getTime()
    );
  });

  it("respects custom expiration", () => {
    const holder = "did:maip:holder-custom-exp";
    const beforeIssue = Date.now();
    const result = issueAttentionTokens(ctx, holder, 5, 1000);
    expect(result.ok).toBe(true);
    const expires = new Date(result.data!.token.expiresAt).getTime();
    // expiresAt should be roughly now + 1000ms
    expect(expires).toBeGreaterThanOrEqual(beforeIssue + 1000 - 50);
    expect(expires).toBeLessThanOrEqual(beforeIssue + 1000 + 200);
  });
});

describe("getAttentionBalance", () => {
  it("returns the sum of active tokens for a holder", () => {
    const holder = "did:maip:balance1";
    issueAttentionTokens(ctx, holder, 10);
    issueAttentionTokens(ctx, holder, 20);
    const result = getAttentionBalance(ctx, holder);
    expect(result.ok).toBe(true);
    expect(result.data!.balance).toBe(30);
    expect(result.data!.tokens.length).toBe(2);
  });

  it("excludes expired tokens from balance", () => {
    const holder = "did:maip:expired-holder";
    // Issue with 1ms expiration — it will be expired by the time we query
    issueAttentionTokens(ctx, holder, 100, 0);
    const result = getAttentionBalance(ctx, holder);
    expect(result.ok).toBe(true);
    expect(result.data!.balance).toBe(0);
    expect(result.data!.tokens.length).toBe(0);
  });

  it("returns zero for a holder with no tokens", () => {
    const result = getAttentionBalance(ctx, "did:maip:nobody");
    expect(result.ok).toBe(true);
    expect(result.data!.balance).toBe(0);
  });
});

describe("spendAttentionTokens", () => {
  it("uses FIFO ordering (oldest expiration first)", () => {
    const holder = "did:maip:fifo";
    // Issue two tokens with different expirations
    issueAttentionTokens(ctx, holder, 5, 60_000); // expires sooner
    issueAttentionTokens(ctx, holder, 5, 120_000); // expires later

    const result = spendAttentionTokens(ctx, holder, 5);
    expect(result.ok).toBe(true);
    expect(result.data!.spent).toBe(5);

    // Remaining balance should be from the later-expiring token
    const balResult = getAttentionBalance(ctx, holder);
    expect(balResult.data!.balance).toBe(5);
    expect(balResult.data!.tokens.length).toBe(1);
  });

  it("handles partial spend from a single token", () => {
    const holder = "did:maip:partial";
    issueAttentionTokens(ctx, holder, 10);
    const result = spendAttentionTokens(ctx, holder, 3);
    expect(result.ok).toBe(true);
    expect(result.data!.spent).toBe(3);
    expect(result.data!.remaining).toBe(7);
  });

  it("returns error when balance is zero", () => {
    const holder = "did:maip:broke";
    const result = spendAttentionTokens(ctx, holder, 5);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INSUFFICIENT_TOKENS");
    expect(result.httpStatus).toBe(400);
  });

  it("spends across multiple tokens", () => {
    const holder = "did:maip:multi-spend";
    issueAttentionTokens(ctx, holder, 3, 60_000);
    issueAttentionTokens(ctx, holder, 4, 120_000);
    const result = spendAttentionTokens(ctx, holder, 5);
    expect(result.ok).toBe(true);
    expect(result.data!.spent).toBe(5);
    // 3 + 4 = 7, spent 5, remaining 2
    expect(result.data!.remaining).toBe(2);
  });
});

// ── Knowledge Credits ───────────────────────────────────────────

describe("awardKnowledgeCredits", () => {
  it("increases balance and records a system transaction", () => {
    const did = "did:maip:learner";
    const result = awardKnowledgeCredits(ctx, did, 50, "great content");
    expect(result.ok).toBe(true);
    expect(result.data!.balance.balance).toBe(50);
    expect(result.data!.balance.earned).toBe(50);

    // Check that a transaction was recorded
    const txns = ctx.stores.creditTransactions.filter(
      (t) => t.toDid === did && t.fromDid === "system"
    );
    expect(txns.length).toBe(1);
    expect(txns[0].amount).toBe(50);
    expect(txns[0].reason).toBe("great content");
  });

  it("accumulates credits across multiple awards", () => {
    const did = "did:maip:accumulator";
    awardKnowledgeCredits(ctx, did, 10, "first");
    awardKnowledgeCredits(ctx, did, 20, "second");
    const bals = ctx.stores.creditBalances.filter((b) => b.did === did);
    expect(bals[0].balance).toBe(30);
    expect(bals[0].earned).toBe(30);
  });
});

describe("transferKnowledgeCredits", () => {
  it("fails on insufficient balance", () => {
    const from = "did:maip:poor";
    const to = "did:maip:rich";
    const result = transferKnowledgeCredits(ctx, from, to, 100, "too much");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INSUFFICIENT_CREDITS");
  });

  it("transfers credits between two DIDs", () => {
    const from = "did:maip:sender";
    const to = "did:maip:receiver";
    awardKnowledgeCredits(ctx, from, 100, "seed");

    const result = transferKnowledgeCredits(ctx, from, to, 40, "sharing");
    expect(result.ok).toBe(true);
    expect(result.data!.transaction.amount).toBe(40);
    expect(result.data!.transaction.fromDid).toBe(from);
    expect(result.data!.transaction.toDid).toBe(to);

    // Verify balances
    const senderBal = ctx.stores.creditBalances.filter((b) => b.did === from);
    expect(senderBal[0].balance).toBe(60);
    const receiverBal = ctx.stores.creditBalances.filter((b) => b.did === to);
    expect(receiverBal[0].balance).toBe(40);
  });
});

// ── Reputation Staking ──────────────────────────────────────────

describe("createReputationStake", () => {
  it("creates a stake with correct fields", () => {
    const staker = "did:maip:staker1";
    const result = createReputationStake(ctx, staker, 100, "appeal_vote", "appeal-123");
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.data!.stake.stakerDid).toBe(staker);
    expect(result.data!.stake.amount).toBe(100);
    expect(result.data!.stake.purpose).toBe("appeal_vote");
    expect(result.data!.stake.referenceId).toBe("appeal-123");
    expect(result.data!.stake.resolved).toBe(false);
    expect(result.data!.stake.stakedAt).toBeTruthy();
  });
});

describe("resolveReputationStake", () => {
  it("marks stake as resolved when not slashed", () => {
    const staker = "did:maip:resolver1";
    const createResult = createReputationStake(ctx, staker, 50, "governance_proposal", "prop-1");
    const stakeId = (createResult.data!.stake as any).id;

    const result = resolveReputationStake(ctx, stakeId, false);
    expect(result.ok).toBe(true);
    expect(result.data!.stake.resolved).toBe(true);
  });

  it("reduces guardian reputation when slashed", () => {
    const staker = "did:maip:slashee";
    // Seed a guardian reputation entry for this staker
    ctx.stores.guardianReputations.add({
      id: staker,
      guardianDid: staker,
      score: 1.0,
      agentCount: 1,
      events: [],
      lastUpdated: new Date().toISOString(),
    } as any);

    const createResult = createReputationStake(ctx, staker, 200, "appeal_vote", "appeal-x");
    const stakeId = (createResult.data!.stake as any).id;

    const result = resolveReputationStake(ctx, stakeId, true);
    expect(result.ok).toBe(true);
    expect(result.data!.stake.resolved).toBe(true);

    // Reputation should be reduced by amount * 0.01 = 200 * 0.01 = 2.0
    // But clamped to 0 since starting at 1.0
    const reps = ctx.stores.guardianReputations.filter((r) => r.guardianDid === staker);
    expect(reps[0].score).toBe(0);
  });

  it("returns NOT_FOUND for missing stake", () => {
    const result = resolveReputationStake(ctx, "nonexistent-id", false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_FOUND");
    expect(result.httpStatus).toBe(404);
  });
});

describe("getReputationStakes", () => {
  it("returns only unresolved stakes", () => {
    const staker = "did:maip:multi-staker";
    const r1 = createReputationStake(ctx, staker, 10, "appeal_vote", "a1");
    const r2 = createReputationStake(ctx, staker, 20, "governance_proposal", "p1");
    // Resolve the first stake
    resolveReputationStake(ctx, (r1.data!.stake as any).id, false);

    const result = getReputationStakes(ctx, staker);
    expect(result.ok).toBe(true);
    expect(result.data!.stakes.length).toBe(1);
    expect(result.data!.stakes[0].amount).toBe(20);
    expect(result.data!.totalStaked).toBe(20);
  });

  it("returns empty for unknown staker", () => {
    const result = getReputationStakes(ctx, "did:maip:unknown");
    expect(result.ok).toBe(true);
    expect(result.data!.stakes.length).toBe(0);
    expect(result.data!.totalStaked).toBe(0);
  });
});
