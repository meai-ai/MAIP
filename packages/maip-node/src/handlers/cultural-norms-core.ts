/**
 * Transport-agnostic cultural norm negotiation.
 *
 * Allows two entities in a relationship to propose, negotiate,
 * and agree on communication norms.
 */

import type { CulturalNorms, TransportResult } from "@maip/core";
import type { NodeContext } from "../context.js";

export interface NormProposalInput {
  relationshipId: string;
  proposerDid: string;
  norms: CulturalNorms;
}

/** Propose cultural norms for a relationship. */
export function proposeCulturalNorms(
  ctx: NodeContext,
  input: NormProposalInput
): TransportResult<{ accepted: boolean; norms: CulturalNorms }> {
  const rels = ctx.stores.relationships.filter((r) => r.id === input.relationshipId);
  if (rels.length === 0) {
    return {
      ok: false,
      error: "Relationship not found",
      code: "NOT_FOUND",
      httpStatus: 404,
    };
  }

  const rel = rels[0];
  if (!rel.participants.includes(input.proposerDid)) {
    return {
      ok: false,
      error: "Not a participant in this relationship",
      code: "FORBIDDEN",
      httpStatus: 403,
    };
  }

  // Merge proposed norms with existing norms
  const existing = rel.culturalNorms ?? {};
  const merged: CulturalNorms = {
    ...existing,
    ...input.norms,
    // For arrays, merge unique values
    languages: [
      ...new Set([...(existing.languages ?? []), ...(input.norms.languages ?? [])]),
    ],
    avoidTopics: [
      ...new Set([...(existing.avoidTopics ?? []), ...(input.norms.avoidTopics ?? [])]),
    ],
  };

  // Clean up empty arrays
  if (merged.languages?.length === 0) delete merged.languages;
  if (merged.avoidTopics?.length === 0) delete merged.avoidTopics;

  rel.culturalNorms = merged;
  ctx.stores.relationships.add(rel);

  return {
    ok: true,
    data: { accepted: true, norms: merged },
    httpStatus: 200,
  };
}

/** Get cultural norms for a relationship. */
export function getCulturalNorms(
  ctx: NodeContext,
  relationshipId: string
): TransportResult<{ norms: CulturalNorms | null }> {
  const rels = ctx.stores.relationships.filter((r) => r.id === relationshipId);
  if (rels.length === 0) {
    return {
      ok: false,
      error: "Relationship not found",
      code: "NOT_FOUND",
      httpStatus: 404,
    };
  }
  return {
    ok: true,
    data: { norms: rels[0].culturalNorms ?? null },
    httpStatus: 200,
  };
}
