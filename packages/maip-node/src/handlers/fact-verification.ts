/**
 * Distributed Fact Verification — Express handlers.
 */

import type { RequestHandler } from "express";
import type { NodeContext } from "../context.js";
import {
  submitFactClaim,
  verifyFactClaim,
  getFactClaim,
  searchFactClaims,
} from "./fact-verification-core.js";

/** POST /maip/governance/facts — submit a fact claim. */
export function submitFactHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const { claim, source, domain } = req.body;
    const result = submitFactClaim(ctx, claim, source, domain ?? "general");
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** POST /maip/governance/facts/:id/verify — verify a fact claim. */
export function verifyFactHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const { verdict, confidence, evidence } = req.body;
    const result = verifyFactClaim(
      ctx,
      req.params.id as string,
      verdict,
      confidence ?? 0.5,
      evidence ?? ""
    );
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/facts/:id — get a fact claim. */
export function getFactHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = getFactClaim(ctx, req.params.id as string);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/facts — search fact claims. */
export function searchFactsHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const domain = req.query.domain as string | undefined;
    const status = req.query.status as string | undefined;
    const result = searchFactClaims(ctx, domain, status as any);
    res.status(result.httpStatus ?? 200).json(result);
  };
}
