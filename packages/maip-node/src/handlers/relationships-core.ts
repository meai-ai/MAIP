/**
 * Transport-agnostic relationship processing.
 */

import { v4 as uuid } from "uuid";
import {
  RelationshipRequestSchema,
  verifyWithDid,
  sign,
  type Relationship,
  type RelationshipResponse,
  type TransportResult,
} from "@maip/core";
import type { NodeContext } from "../context.js";

/**
 * Process an incoming relationship request (transport-agnostic).
 *
 * Validates schema, checks recipient, verifies signature, checks for existing
 * relationships, creates the relationship, and fires callbacks.
 */
export function processRelationshipRequest(
  ctx: NodeContext,
  body: unknown
): TransportResult<RelationshipResponse> {
  // Validate request schema
  const parsed = RelationshipRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid relationship request format",
      code: "INVALID_FORMAT",
      httpStatus: 400,
    };
  }

  const request = parsed.data;

  // Check this request is for us
  if (request.to !== ctx.identity.did) {
    return {
      ok: false,
      error: "Relationship request not addressed to this node",
      code: "WRONG_RECIPIENT",
      httpStatus: 404,
    };
  }

  // Verify signature
  const { signature, ...withoutSig } = request;
  if (!verifyWithDid(withoutSig, signature, request.from)) {
    return {
      ok: false,
      error: "Invalid request signature",
      code: "INVALID_SIGNATURE",
      httpStatus: 401,
    };
  }

  // Check for existing relationship
  const existing = ctx.stores.relationships.filter(
    (r) =>
      r.participants.includes(request.from) &&
      r.participants.includes(request.to) &&
      r.status !== "ended"
  );

  if (existing.length > 0) {
    return {
      ok: false,
      error: "Relationship already exists",
      code: "ALREADY_EXISTS",
      httpStatus: 409,
    };
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

  return {
    ok: true,
    data: response,
    httpStatus: autoAccept ? 200 : 202,
  };
}
