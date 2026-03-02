/**
 * Shared Spaces — transport-agnostic core logic (v0.2+).
 *
 * Implements multi-entity environments per spec section 8.8.
 */

import { v4 as uuid } from "uuid";
import type { SharedSpace, SpaceMembership, SpaceMessage, SpaceMembershipPolicy } from "@maip/core";
import type { NodeContext } from "../context.js";

// ── Types for store entries ────────────────────────────────────

export interface SpaceEntry extends SharedSpace {
  id: string;
}

export interface SpaceMembershipEntry extends SpaceMembership {
  id: string;
}

export interface SpaceMessageEntry extends SpaceMessage {
  id: string;
}

// ── Create Space ────────────────────────────────────────────────

export function processCreateSpace(
  ctx: NodeContext,
  body: {
    name: string;
    topic: string;
    description?: string;
    creatorDid: string;
    membershipPolicy?: SpaceMembershipPolicy;
    maxMembers?: number;
  }
): { ok: boolean; data?: { space: SharedSpace }; error?: string; code?: string } {
  if (!body.name || !body.topic || !body.creatorDid) {
    return { ok: false, error: "Missing required fields: name, topic, creatorDid", code: "INVALID_FORMAT" };
  }

  const now = new Date().toISOString();
  const space: SpaceEntry = {
    id: uuid(),
    name: body.name,
    topic: body.topic,
    description: body.description,
    creatorDid: body.creatorDid,
    membershipPolicy: body.membershipPolicy ?? "open",
    maxMembers: body.maxMembers ?? 0,
    createdAt: now,
  };

  ctx.stores.spaces.add(space);

  // Creator auto-joins as creator role
  const membership: SpaceMembershipEntry = {
    id: `${space.id}:${body.creatorDid}`,
    spaceId: space.id,
    memberDid: body.creatorDid,
    displayName: "Creator",
    role: "creator",
    joinedAt: now,
  };
  ctx.stores.spaceMembers.add(membership);

  return { ok: true, data: { space } };
}

// ── Join Space ──────────────────────────────────────────────────

export function processJoinSpace(
  ctx: NodeContext,
  spaceId: string,
  body: { memberDid: string; displayName: string }
): { ok: boolean; data?: { membership: SpaceMembership }; error?: string; code?: string } {
  if (!body.memberDid || !body.displayName) {
    return { ok: false, error: "Missing memberDid or displayName", code: "INVALID_FORMAT" };
  }

  const space = ctx.stores.spaces.getById(spaceId);
  if (!space) {
    return { ok: false, error: "Space not found", code: "NOT_FOUND" };
  }

  // Check if already a member
  const existing = ctx.stores.spaceMembers.getById(`${spaceId}:${body.memberDid}`);
  if (existing) {
    return { ok: false, error: "Already a member", code: "DUPLICATE" };
  }

  // Check membership policy
  if (space.membershipPolicy === "invite_only") {
    return { ok: false, error: "Space is invite-only", code: "FORBIDDEN" };
  }

  // Check max members
  if (space.maxMembers > 0) {
    const currentMembers = ctx.stores.spaceMembers.filter((m) => m.spaceId === spaceId);
    if (currentMembers.length >= space.maxMembers) {
      return { ok: false, error: "Space is full", code: "SPACE_FULL" };
    }
  }

  const now = new Date().toISOString();
  const membership: SpaceMembershipEntry = {
    id: `${spaceId}:${body.memberDid}`,
    spaceId,
    memberDid: body.memberDid,
    displayName: body.displayName,
    role: "member",
    joinedAt: now,
  };

  ctx.stores.spaceMembers.add(membership);
  return { ok: true, data: { membership } };
}

// ── Post to Space ───────────────────────────────────────────────

export function processPostToSpace(
  ctx: NodeContext,
  spaceId: string,
  body: { from: string; text: string; replyTo?: string; signature: string }
): { ok: boolean; data?: { message: SpaceMessage }; error?: string; code?: string } {
  if (!body.from || !body.text) {
    return { ok: false, error: "Missing from or text", code: "INVALID_FORMAT" };
  }

  const space = ctx.stores.spaces.getById(spaceId);
  if (!space) {
    return { ok: false, error: "Space not found", code: "NOT_FOUND" };
  }

  // Verify membership
  const membership = ctx.stores.spaceMembers.getById(`${spaceId}:${body.from}`);
  if (!membership) {
    return { ok: false, error: "Not a member of this space", code: "FORBIDDEN" };
  }

  const now = new Date().toISOString();
  const message: SpaceMessageEntry = {
    id: uuid(),
    spaceId,
    from: body.from,
    text: body.text,
    timestamp: now,
    replyTo: body.replyTo,
    signature: body.signature,
  };

  ctx.stores.spaceMessages.add(message);
  return { ok: true, data: { message } };
}

// ── Get Space Messages ──────────────────────────────────────────

export function processGetSpaceMessages(
  ctx: NodeContext,
  spaceId: string,
  query: { limit?: number; after?: string }
): { ok: boolean; data?: { messages: SpaceMessage[] }; error?: string; code?: string } {
  const space = ctx.stores.spaces.getById(spaceId);
  if (!space) {
    return { ok: false, error: "Space not found", code: "NOT_FOUND" };
  }

  let messages = ctx.stores.spaceMessages.filter((m) => m.spaceId === spaceId);

  // Filter by timestamp if `after` is provided
  if (query.after) {
    messages = messages.filter((m) => m.timestamp > query.after!);
  }

  // Sort by timestamp ascending
  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Apply limit
  const limit = query.limit ?? 50;
  messages = messages.slice(0, limit);

  return { ok: true, data: { messages } };
}
