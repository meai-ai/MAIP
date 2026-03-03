/**
 * Distributed Consensus — Express handlers.
 */

import type { RequestHandler } from "express";
import type { NodeContext } from "../context.js";
import {
  createIsolationProposal,
  voteOnProposal,
  getProposals_,
  getProposal,
} from "./consensus-core.js";

/** POST /maip/governance/consensus/propose — create isolation proposal. */
export function proposeIsolationHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const { targetDid, reason, evidence } = req.body;
    const result = createIsolationProposal(ctx, targetDid, reason, evidence ?? []);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** POST /maip/governance/consensus/:id/vote — vote on a proposal. */
export function voteProposalHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const { vote, reason } = req.body;
    const result = voteOnProposal(ctx, req.params.id as string, vote, reason ?? "");
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/consensus — list proposals. */
export function listProposalsHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const status = req.query.status as string | undefined;
    const result = getProposals_(ctx, status as any);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/consensus/:id — get a specific proposal. */
export function getProposalHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = getProposal(ctx, req.params.id as string);
    res.status(result.httpStatus ?? 200).json(result);
  };
}
