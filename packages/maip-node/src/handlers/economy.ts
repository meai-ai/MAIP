/**
 * Express handlers for the economic layer.
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";
import {
  issueAttentionTokens,
  getAttentionBalance,
  spendAttentionTokens,
  getKnowledgeCreditBalance,
  transferKnowledgeCredits,
  awardKnowledgeCredits,
  createReputationStake,
  resolveReputationStake,
  getReputationStakes,
} from "./economy-core.js";

function respond(res: Response, result: { ok: boolean; data?: unknown; error?: string; code?: string; httpStatus?: number }) {
  res.status(result.httpStatus ?? 200).json({
    ok: result.ok,
    ...(result.data ? { data: result.data } : {}),
    ...(result.error ? { error: result.error, code: result.code } : {}),
  });
}

// ── Attention Tokens ─────────────────────────────────────────────

export function issueTokensHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { holderDid, amount, expiresInMs } = req.body;
    respond(res, issueAttentionTokens(ctx, holderDid, amount, expiresInMs));
  };
}

export function getTokenBalanceHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    respond(res, getAttentionBalance(ctx, req.params.did as string));
  };
}

export function spendTokensHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { holderDid, amount } = req.body;
    respond(res, spendAttentionTokens(ctx, holderDid, amount));
  };
}

// ── Knowledge Credits ────────────────────────────────────────────

export function getCreditBalanceHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    respond(res, getKnowledgeCreditBalance(ctx, req.params.did as string));
  };
}

export function transferCreditsHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { fromDid, toDid, amount, reason } = req.body;
    respond(res, transferKnowledgeCredits(ctx, fromDid, toDid, amount, reason));
  };
}

export function awardCreditsHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { did, amount, reason } = req.body;
    respond(res, awardKnowledgeCredits(ctx, did, amount, reason));
  };
}

// ── Reputation Staking ───────────────────────────────────────────

export function createStakeHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { stakerDid, amount, purpose, referenceId } = req.body;
    respond(res, createReputationStake(ctx, stakerDid, amount, purpose, referenceId));
  };
}

export function resolveStakeHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { slashed } = req.body;
    respond(res, resolveReputationStake(ctx, req.params.id as string, slashed ?? false));
  };
}

export function getStakesHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    respond(res, getReputationStakes(ctx, req.params.did as string));
  };
}
