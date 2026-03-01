/**
 * GET /maip/persona — Return this node's persona (with sharing policy enforcement).
 */

import type { Request, Response } from "express";
import { MAIP_HEADERS } from "@maip/core";
import type { NodeContext } from "../context.js";

export function personaHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    if (!ctx.persona) {
      res.status(404).json({
        ok: false,
        error: "No persona configured for this node",
        code: "NO_PERSONA",
      });
      return;
    }

    const senderDid = req.headers[MAIP_HEADERS.SENDER.toLowerCase()] as string | undefined;
    const policy = ctx.persona.sharingPolicy;

    // Check deny list
    if (senderDid && policy.denyList?.includes(senderDid)) {
      res.status(403).json({
        ok: false,
        error: "Access denied",
        code: "ACCESS_DENIED",
      });
      return;
    }

    // Check allow list (bypasses visibility)
    if (senderDid && policy.allowList?.includes(senderDid)) {
      res.json({ ok: true, data: ctx.persona });
      return;
    }

    // Check visibility
    if (policy.defaultVisibility === "private") {
      res.status(403).json({
        ok: false,
        error: "Persona is private",
        code: "ACCESS_DENIED",
      });
      return;
    }

    if (policy.defaultVisibility === "connections_only") {
      if (!senderDid) {
        res.status(401).json({
          ok: false,
          error: "Authentication required — include X-MAIP-Sender header",
          code: "AUTH_REQUIRED",
        });
        return;
      }

      const hasRelationship = ctx.stores.relationships.filter(
        (r) =>
          r.status === "active" &&
          r.participants.includes(senderDid) &&
          r.participants.includes(ctx.identity.did) &&
          r.permissions.canSharePersona
      );

      if (hasRelationship.length === 0) {
        res.status(403).json({
          ok: false,
          error: "No active relationship with persona sharing permission",
          code: "ACCESS_DENIED",
        });
        return;
      }
    }

    // Apply section-level visibility filtering
    const persona = { ...ctx.persona };
    const overrides = policy.sectionOverrides;

    if (overrides) {
      const isConnection = senderDid
        ? ctx.stores.relationships.filter(
            (r) =>
              r.status === "active" &&
              r.participants.includes(senderDid) &&
              r.participants.includes(ctx.identity.did)
          ).length > 0
        : false;

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

    res.json({ ok: true, data: persona });
  };
}
