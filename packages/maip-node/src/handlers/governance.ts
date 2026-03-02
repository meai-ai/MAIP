/**
 * Governance endpoints — guardian reputation, network isolation, appeals.
 *
 * These endpoints are used by registry nodes to manage governance data.
 * Regular nodes consume this data to make trust decisions.
 */

import { v4 as uuid } from "uuid";
import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";

// ── Guardian Reputation ──────────────────────────────────────────

/** GET /maip/governance/reputation/:did — look up guardian reputation. */
export function getGuardianReputationHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const did = req.params.did;
    const entry = ctx.stores.guardianReputations.filter((r) => r.guardianDid === did);
    if (entry.length === 0) {
      res.json({ ok: true, data: null });
      return;
    }
    res.json({ ok: true, data: entry[0] });
  };
}

/** POST /maip/governance/reputation — report guardian behavior event. */
export function reportGuardianEventHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { guardianDid, event } = req.body;
    if (!guardianDid || !event) {
      res.status(400).json({ ok: false, error: "Missing guardianDid or event", code: "INVALID_FORMAT" });
      return;
    }

    const validEvents = ["agent_registered", "agent_violation", "agent_initiated_transfer"];
    if (!validEvents.includes(event)) {
      res.status(400).json({ ok: false, error: `Invalid event: ${event}`, code: "INVALID_FORMAT" });
      return;
    }

    // Find or create reputation entry
    const existing = ctx.stores.guardianReputations.filter((r) => r.guardianDid === guardianDid);
    const now = new Date().toISOString();

    if (existing.length > 0) {
      const rep = existing[0];
      if (event === "agent_registered") rep.agentCount++;
      if (event === "agent_violation") rep.violationCount++;
      if (event === "agent_initiated_transfer") rep.agentInitiatedTransfers++;
      rep.score = computeGuardianScore(rep.agentCount, rep.violationCount, rep.agentInitiatedTransfers);
      rep.lastUpdated = now;
      ctx.stores.guardianReputations.add(rep);
    } else {
      const newRep = {
        id: guardianDid,
        guardianDid,
        agentCount: event === "agent_registered" ? 1 : 0,
        violationCount: event === "agent_violation" ? 1 : 0,
        agentInitiatedTransfers: event === "agent_initiated_transfer" ? 1 : 0,
        score: 1.0,
        lastUpdated: now,
      };
      newRep.score = computeGuardianScore(newRep.agentCount, newRep.violationCount, newRep.agentInitiatedTransfers);
      ctx.stores.guardianReputations.add(newRep);
    }

    res.json({ ok: true, data: { recorded: true } });
  };
}

/**
 * Compute guardian reputation score.
 * Starts at 1.0, penalized by violations and agent-initiated transfers.
 */
function computeGuardianScore(agents: number, violations: number, transfers: number): number {
  if (agents === 0) return 1.0;
  const violationPenalty = violations * 0.15;
  const transferPenalty = transfers * 0.1;
  return Math.max(0, Math.min(1, 1.0 - violationPenalty - transferPenalty));
}

// ── Network Isolation ────────────────────────────────────────────

/** POST /maip/governance/isolate — flag a DID for network isolation. */
export function isolateHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { did, reason, category, flaggedBy } = req.body;
    if (!did || !reason || !category || !flaggedBy) {
      res.status(400).json({ ok: false, error: "Missing required fields", code: "INVALID_FORMAT" });
      return;
    }

    // Check if already isolated
    const existing = ctx.stores.isolations.filter((r) => r.did === did && r.status === "active");
    if (existing.length > 0) {
      // Add the new flagger to the existing record
      const record = existing[0];
      if (!record.flaggedBy.includes(flaggedBy)) {
        record.flaggedBy.push(flaggedBy);
        ctx.stores.isolations.add(record);
      }
      res.json({ ok: true, data: { isolationId: record.id, alreadyIsolated: true } });
      return;
    }

    const record = {
      id: uuid(),
      did,
      reason,
      category,
      flaggedBy: [flaggedBy],
      isolatedAt: new Date().toISOString(),
      appealPending: false,
      status: "active" as const,
    };

    ctx.stores.isolations.add(record);
    res.json({ ok: true, data: { isolationId: record.id, alreadyIsolated: false } });
  };
}

/** GET /maip/governance/isolation/:did — check if a DID is isolated. */
export function checkIsolationHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const did = req.params.did;
    const active = ctx.stores.isolations.filter((r) => r.did === did && r.status === "active");
    res.json({
      ok: true,
      data: {
        isolated: active.length > 0,
        record: active.length > 0 ? active[0] : null,
      },
    });
  };
}

/** POST /maip/governance/appeal — submit an appeal against isolation. */
export function appealHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { isolationId, guardianDid, agentDid, justification } = req.body;
    if (!isolationId || !guardianDid || !agentDid || !justification) {
      res.status(400).json({ ok: false, error: "Missing required fields", code: "INVALID_FORMAT" });
      return;
    }

    const isolation = ctx.stores.isolations.getById(isolationId);
    if (!isolation) {
      res.status(404).json({ ok: false, error: "Isolation record not found", code: "NOT_FOUND" });
      return;
    }

    if (isolation.status !== "active") {
      res.status(400).json({ ok: false, error: "Isolation is not active", code: "INVALID_STATE" });
      return;
    }

    // Mark isolation as having a pending appeal
    isolation.appealPending = true;
    isolation.status = "appealed";
    ctx.stores.isolations.add(isolation);

    const appeal = {
      id: uuid(),
      isolationId,
      guardianDid,
      agentDid,
      justification,
      reviewers: [],
      votes: {},
      outcome: null,
      submittedAt: new Date().toISOString(),
      resolvedAt: null,
    };

    ctx.stores.appeals.add(appeal);
    res.json({ ok: true, data: { appealId: appeal.id } });
  };
}

/** POST /maip/governance/appeal/:id/vote — vote on an appeal. */
export function appealVoteHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const appealId = req.params.id as string;
    const { reviewerDid, vote } = req.body;

    if (!reviewerDid || !vote || !["uphold", "lift"].includes(vote)) {
      res.status(400).json({ ok: false, error: "Missing reviewerDid or invalid vote", code: "INVALID_FORMAT" });
      return;
    }

    const appeal = ctx.stores.appeals.getById(appealId);
    if (!appeal) {
      res.status(404).json({ ok: false, error: "Appeal not found", code: "NOT_FOUND" });
      return;
    }

    if (appeal.outcome !== null) {
      res.status(400).json({ ok: false, error: "Appeal already resolved", code: "INVALID_STATE" });
      return;
    }

    // Reviewer must not be one of the original flaggers
    const isolation = ctx.stores.isolations.getById(appeal.isolationId);
    if (isolation && isolation.flaggedBy.includes(reviewerDid)) {
      res.status(403).json({ ok: false, error: "Original flagger cannot review appeal", code: "CONFLICT_OF_INTEREST" });
      return;
    }

    // Record vote
    if (!appeal.reviewers.includes(reviewerDid)) {
      appeal.reviewers.push(reviewerDid);
    }
    appeal.votes[reviewerDid] = vote;

    // Check if we have enough votes to resolve (minimum 3 reviewers)
    const totalVotes = Object.keys(appeal.votes).length;
    if (totalVotes >= 3) {
      const liftVotes = Object.values(appeal.votes).filter((v) => v === "lift").length;
      const majority = Math.ceil(totalVotes / 2);
      if (liftVotes >= majority) {
        appeal.outcome = "lifted";
        if (isolation) {
          isolation.status = "lifted";
          isolation.appealPending = false;
          ctx.stores.isolations.add(isolation);
        }
      } else {
        appeal.outcome = "upheld";
        if (isolation) {
          isolation.status = "active";
          isolation.appealPending = false;
          ctx.stores.isolations.add(isolation);
        }
      }
      appeal.resolvedAt = new Date().toISOString();
    }

    ctx.stores.appeals.add(appeal);
    res.json({ ok: true, data: { appeal } });
  };
}
