/**
 * Transport-agnostic persona processing.
 */

import type { Persona, TransportResult } from "@maip/core";
import type { NodeContext } from "../context.js";

/**
 * Process a persona request (transport-agnostic).
 *
 * Enforces sharing policy: deny list, allow list, visibility checks,
 * section-level overrides, and per-memory visibility filtering.
 *
 * @param senderDid - DID of the requesting peer (from header or stream metadata).
 */
export function processPersonaRequest(
  ctx: NodeContext,
  senderDid: string | undefined
): TransportResult<Persona> {
  if (!ctx.persona) {
    return {
      ok: false,
      error: "No persona configured for this node",
      code: "NO_PERSONA",
      httpStatus: 404,
    };
  }

  const policy = ctx.persona.sharingPolicy;

  // Check deny list
  if (senderDid && policy.denyList?.includes(senderDid)) {
    return {
      ok: false,
      error: "Access denied",
      code: "ACCESS_DENIED",
      httpStatus: 403,
    };
  }

  // Check allow list (bypasses visibility)
  if (senderDid && policy.allowList?.includes(senderDid)) {
    return { ok: true, data: ctx.persona, httpStatus: 200 };
  }

  // Check visibility
  if (policy.defaultVisibility === "private") {
    return {
      ok: false,
      error: "Persona is private",
      code: "ACCESS_DENIED",
      httpStatus: 403,
    };
  }

  if (policy.defaultVisibility === "connections_only") {
    if (!senderDid) {
      return {
        ok: false,
        error: "Authentication required — include X-MAIP-Sender header",
        code: "AUTH_REQUIRED",
        httpStatus: 401,
      };
    }

    const hasRelationship = ctx.stores.relationships.filter(
      (r) =>
        r.status === "active" &&
        r.participants.includes(senderDid) &&
        r.participants.includes(ctx.identity.did) &&
        r.permissions.canSharePersona
    );

    if (hasRelationship.length === 0) {
      return {
        ok: false,
        error: "No active relationship with persona sharing permission",
        code: "ACCESS_DENIED",
        httpStatus: 403,
      };
    }
  }

  // Apply section-level visibility filtering
  const persona = { ...ctx.persona };
  const overrides = policy.sectionOverrides;

  const isConnection = senderDid
    ? ctx.stores.relationships.filter(
        (r) =>
          r.status === "active" &&
          r.participants.includes(senderDid) &&
          r.participants.includes(ctx.identity.did)
      ).length > 0
    : false;

  if (overrides) {
    if (overrides.memories === "private" || (overrides.memories === "connections_only" && !isConnection)) {
      persona.memories = { episodic: [], semantic: [], relational: [] };
    }
    if (overrides.growth === "private" || (overrides.growth === "connections_only" && !isConnection)) {
      persona.growth = { milestones: [], currentInterests: [], recentInsights: [] };
    }
    if (overrides.emotionalState === "private" || (overrides.emotionalState === "connections_only" && !isConnection)) {
      persona.emotionalState = {
        currentMood: "[private]",
        emotionalBaseline: "[private]",
        valence: 0,
        arousal: 0,
      };
    }
  }

  // Filter individual memories by their per-memory visibility level.
  if (persona.memories) {
    const memFilter = (vis: string | undefined) => {
      if (!vis || vis === "public") return true;
      if (vis === "network") return isConnection;
      return false; // "private" and "confidential" never shared
    };

    persona.memories = {
      episodic: persona.memories.episodic.filter((m) => memFilter(m.visibility)),
      semantic: persona.memories.semantic.filter((m) => memFilter(m.visibility)),
      relational: persona.memories.relational.filter((m) => memFilter(m.visibility)),
    };
  }

  return { ok: true, data: persona, httpStatus: 200 };
}
