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
    const requesterDid = req.query.requester as string | undefined;

    const interests = interestsParam ? interestsParam.split(",").map((s) => s.trim().toLowerCase()) : [];
    const capabilities = capabilitiesParam ? capabilitiesParam.split(",").map((s) => s.trim()) : [];
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    let results = ctx.stores.registrations.getAll();

    // Exclude isolated DIDs from discovery
    const isolatedDids = new Set(
      ctx.stores.isolations.filter((r) => r.status === "active").map((r) => r.did)
    );
    results = results.filter((r) => !isolatedDids.has(r.did));

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

    // Build requester's existing connection profile for diversity scoring
    const requesterInterests = new Set<string>();
    const requesterConnTypes = new Set<string>();
    if (requesterDid) {
      const requesterReg = ctx.stores.registrations.filter((r) => r.did === requesterDid);
      if (requesterReg.length > 0) {
        for (const i of requesterReg[0].interests) requesterInterests.add(i.toLowerCase());
      }
      // Check existing relationships
      const existingRels = ctx.stores.relationships.filter(
        (r) => r.status === "active" && r.participants.includes(requesterDid)
      );
      for (const rel of existingRels) {
        const peer = rel.participants.find((p) => p !== requesterDid);
        if (peer) {
          const peerReg = ctx.stores.registrations.filter((r) => r.did === peer);
          if (peerReg.length > 0) {
            requesterConnTypes.add(peerReg[0].type);
            for (const i of peerReg[0].interests) requesterInterests.add(i.toLowerCase());
          }
        }
      }
    }

    // Filter and score by interests
    let scored: Array<{ entry: typeof results[0]; matchingInterests: string[]; diversityScore: number }>;
    if (interests.length > 0) {
      scored = results
        .map((entry) => {
          const matching = entry.interests.filter((i) =>
            interests.some(
              (q) => i.toLowerCase().includes(q) || q.includes(i.toLowerCase())
            )
          );
          const diversityScore = computeDiversityScore(entry, requesterInterests, requesterConnTypes);
          return { entry, matchingInterests: matching, diversityScore };
        })
        .filter((s) => s.matchingInterests.length > 0)
        .sort((a, b) => {
          // Sort by combined relevance + diversity (diversity breaks ties)
          const relevanceDiff = b.matchingInterests.length - a.matchingInterests.length;
          if (relevanceDiff !== 0) return relevanceDiff;
          return b.diversityScore - a.diversityScore;
        });
    } else {
      scored = results.map((entry) => ({
        entry,
        matchingInterests: [],
        diversityScore: computeDiversityScore(entry, requesterInterests, requesterConnTypes),
      }));
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
      diversityScore: s.diversityScore,
    }));

    res.json({ ok: true, data: discoveryResults });
  };
}

/**
 * Compute diversity score for a candidate result.
 * Higher score = more diverse from requester's existing network.
 */
function computeDiversityScore(
  candidate: { type: string; interests: string[] },
  requesterInterests: Set<string>,
  requesterConnTypes: Set<string>
): number {
  if (requesterInterests.size === 0) return 0.5; // No data → neutral

  // Factor 1: Novel interests (interests the requester doesn't already have)
  const candidateInterests = candidate.interests.map((i) => i.toLowerCase());
  const novelInterests = candidateInterests.filter((i) => !requesterInterests.has(i));
  const interestNovelty = candidateInterests.length > 0
    ? novelInterests.length / candidateInterests.length
    : 0;

  // Factor 2: Type diversity (different entity types)
  const typeDiversity = requesterConnTypes.has(candidate.type) ? 0 : 1;

  // Weighted combination
  return interestNovelty * 0.7 + typeDiversity * 0.3;
}
