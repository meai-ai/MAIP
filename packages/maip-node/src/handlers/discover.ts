/**
 * GET /maip/discover — Discovery endpoint.
 *
 * When this node acts as a registry, it searches its registration store.
 * Query params: interests (comma-separated), type, capabilities (comma-separated), limit.
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";
import { processDiscoveryQuery } from "./discover-core.js";

export function discoverHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const interestsParam = req.query.interests as string | undefined;
    const typeParam = req.query.type as string | undefined;
    const capabilitiesParam = req.query.capabilities as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const requesterDid = req.query.requester as string | undefined;

    const interests = interestsParam ? interestsParam.split(",").map((s) => s.trim()) : undefined;
    const capabilities = capabilitiesParam ? capabilitiesParam.split(",").map((s) => s.trim()) : undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const result = processDiscoveryQuery(ctx, {
      interests,
      type: typeParam as "ai_agent" | "human" | undefined,
      capabilities,
      limit,
      requesterDid,
    });

    res.json({ ok: true, data: result.data });
  };
}
