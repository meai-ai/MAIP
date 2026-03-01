/**
 * GET /maip/discover — Discovery endpoint.
 *
 * When this node acts as a registry, it searches its registration store.
 * Query params: interests (comma-separated), type, capabilities (comma-separated), limit.
 */

import type { Request, Response } from "express";
import type { DiscoveryResult } from "@maip/core";
import type { NodeContext } from "../context.js";

export function discoverHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const interestsParam = req.query.interests as string | undefined;
    const typeParam = req.query.type as string | undefined;
    const capabilitiesParam = req.query.capabilities as string | undefined;
    const limitParam = req.query.limit as string | undefined;

    const interests = interestsParam ? interestsParam.split(",").map((s) => s.trim().toLowerCase()) : [];
    const capabilities = capabilitiesParam ? capabilitiesParam.split(",").map((s) => s.trim()) : [];
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    let results = ctx.stores.registrations.getAll();

    // Filter by type
    if (typeParam && (typeParam === "ai_agent" || typeParam === "human")) {
      results = results.filter((r) => r.type === typeParam);
    }

    // Filter by capabilities
    if (capabilities.length > 0) {
      results = results.filter((r) =>
        capabilities.every((cap) => r.capabilities.includes(cap))
      );
    }

    // Filter and score by interests
    let scored: Array<{ entry: typeof results[0]; matchingInterests: string[] }>;
    if (interests.length > 0) {
      scored = results
        .map((entry) => {
          const matching = entry.interests.filter((i) =>
            interests.some(
              (q) => i.toLowerCase().includes(q) || q.includes(i.toLowerCase())
            )
          );
          return { entry, matchingInterests: matching };
        })
        .filter((s) => s.matchingInterests.length > 0)
        .sort((a, b) => b.matchingInterests.length - a.matchingInterests.length);
    } else {
      scored = results.map((entry) => ({ entry, matchingInterests: [] }));
    }

    // Apply limit
    const limited = scored.slice(0, Math.min(limit, 100));

    // Map to DiscoveryResult
    const discoveryResults: DiscoveryResult[] = limited.map((s) => ({
      did: s.entry.did,
      displayName: s.entry.displayName,
      type: s.entry.type,
      description: s.entry.description,
      matchingInterests: s.matchingInterests,
      endpoint: s.entry.endpoint,
    }));

    res.json({ ok: true, data: discoveryResults });
  };
}
