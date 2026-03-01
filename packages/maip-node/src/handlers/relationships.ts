/**
 * POST /maip/relationships — Handle relationship requests and responses.
 */

import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import {
  RelationshipRequestSchema,
  verifyWithDid,
  sign,
  type Relationship,
  type RelationshipResponse,
} from "@maip/core";
import type { NodeContext } from "../context.js";

export function relationshipsHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const body = req.body;

    // Validate request schema
    const parsed = RelationshipRequestSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "Invalid relationship request format",
        code: "INVALID_FORMAT",
      });
      return;
    }

    const request = parsed.data;

    // Check this request is for us
    if (request.to !== ctx.identity.did) {
      res.status(404).json({
        ok: false,
        error: "Relationship request not addressed to this node",
        code: "WRONG_RECIPIENT",
      });
      return;
    }

    // Verify signature
    const { signature, ...withoutSig } = request;
    if (!verifyWithDid(withoutSig, signature, request.from)) {
      res.status(401).json({
        ok: false,
        error: "Invalid request signature",
        code: "INVALID_SIGNATURE",
      });
      return;
    }

    // Check for existing relationship
    const existing = ctx.stores.relationships.filter(
      (r) =>
        r.participants.includes(request.from) &&
        r.participants.includes(request.to) &&
        r.status !== "ended"
    );

    if (existing.length > 0) {
      res.status(409).json({
        ok: false,
        error: "Relationship already exists",
        code: "ALREADY_EXISTS",
      });
      return;
    }

    // Auto-accept if configured, otherwise create as pending
    const autoAccept = ctx.config.autoAcceptRelationships ?? false;
    const now = new Date().toISOString();

    const relationship: Relationship = {
      id: uuid(),
      type: request.type,
      participants: [request.from, request.to],
      initiatedBy: request.from,
      established: now,
      trustLevel: 0,
      permissions: request.proposedPermissions,
      status: autoAccept ? "active" : "pending",
      lastInteraction: now,
      interactionCount: 0,
    };

    ctx.stores.relationships.add(relationship);

    // Notify handler
    if (ctx.onRelationshipRequest) {
      ctx.onRelationshipRequest(request, relationship);
    }

    // Build response
    const responsePayload = {
      requestId: relationship.id,
      accepted: autoAccept,
      permissions: request.proposedPermissions,
      message: autoAccept
        ? "Relationship accepted"
        : "Relationship request received, pending approval",
      timestamp: now,
    };

    const responseSig = sign(responsePayload, ctx.keyPair.signing.secretKey);

    const response: RelationshipResponse = {
      ...responsePayload,
      signature: responseSig,
    };

    res.status(autoAccept ? 200 : 202).json({ ok: true, data: response });
  };
}
