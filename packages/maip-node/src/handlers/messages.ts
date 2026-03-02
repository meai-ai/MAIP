/**
 * POST /maip/messages — Receive and process incoming messages.
 */

import type { Request, Response } from "express";
import {
  MAIPMessageSchema,
  verifyWithDid,
  type MAIPMessage,
  type MessageAck,
  sign,
} from "@maip/core";
import type { NodeContext } from "../context.js";
import { trackAndDetect } from "../behavior.js";

/** Rate limit tracker: DID → { count, windowStart } */
const rateLimits = new Map<string, { count: number; windowStart: number }>();

const MAX_PER_MINUTE = 30;
const WINDOW_MS = 60_000;
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60_000; // 5 minutes

function checkRateLimit(did: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(did);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateLimits.set(did, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX_PER_MINUTE) {
    return false;
  }

  entry.count++;
  return true;
}

export function messagesHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const body = req.body;

    // Validate message schema
    const parsed = MAIPMessageSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "Invalid message format",
        code: "INVALID_FORMAT",
      });
      return;
    }

    const message: MAIPMessage = parsed.data;

    // Check recipient
    if (message.to !== ctx.identity.did) {
      res.status(404).json({
        ok: false,
        error: "Message not addressed to this node",
        code: "WRONG_RECIPIENT",
      });
      return;
    }

    // Replay protection — check timestamp drift
    const msgTime = new Date(message.timestamp).getTime();
    const drift = Math.abs(Date.now() - msgTime);
    if (drift > MAX_TIMESTAMP_DRIFT_MS) {
      res.status(400).json({
        ok: false,
        error: "Message timestamp too far from current time",
        code: "TIMESTAMP_DRIFT",
      });
      return;
    }

    // Verify signature
    const { signature, ...withoutSig } = message;
    if (!verifyWithDid(withoutSig, signature, message.from)) {
      res.status(401).json({
        ok: false,
        error: "Invalid message signature",
        code: "INVALID_SIGNATURE",
      });
      return;
    }

    // Network isolation check — reject messages from isolated DIDs
    const isolated = ctx.stores.isolations.filter(
      (r) => r.did === message.from && r.status === "active"
    );
    if (isolated.length > 0) {
      res.status(403).json({
        ok: false,
        error: "Sender is network-isolated",
        code: "ISOLATED",
      });
      return;
    }

    // Behavioral anomaly detection
    const anomalies = trackAndDetect(ctx.stores, message);
    if (anomalies.length > 0) {
      const severe = anomalies.filter((a) => a.severity > 0.7);
      if (severe.length > 0) {
        console.warn(
          `[maip-node] Behavioral anomaly detected from ${message.from}: ` +
            severe.map((a) => a.description).join("; ")
        );
      }
    }

    // Rate limiting
    if (!checkRateLimit(message.from)) {
      const ack = createAck(ctx, message.id, "rejected", "Rate limit exceeded");
      res.status(429).json({ ok: false, data: ack, error: "Rate limit exceeded", code: "RATE_LIMITED" });
      return;
    }

    // Check relationship permissions (except greetings which don't require existing relationship)
    if (message.type !== "greeting") {
      const rel = ctx.stores.relationships.filter(
        (r) =>
          r.status === "active" &&
          r.participants.includes(message.from) &&
          r.participants.includes(ctx.identity.did) &&
          r.permissions.canMessage
      );
      if (rel.length === 0) {
        const ack = createAck(ctx, message.id, "rejected", "No active relationship with messaging permission");
        res.status(403).json({ ok: false, data: ack, error: "No relationship", code: "NO_RELATIONSHIP" });
        return;
      }
    }

    // Store message
    ctx.stores.messages.add(message);

    // Notify message handler if registered
    if (ctx.onMessage) {
      ctx.onMessage(message);
    }

    // Send ack
    const ack = createAck(ctx, message.id, "received");
    res.json({ ok: true, data: ack });
  };
}

function createAck(
  ctx: NodeContext,
  messageId: string,
  status: "received" | "read" | "rejected",
  reason?: string
): MessageAck {
  const ackPayload = {
    messageId,
    from: ctx.identity.did,
    timestamp: new Date().toISOString(),
    status,
    ...(reason ? { reason } : {}),
  };

  const sig = sign(ackPayload, ctx.keyPair.signing.secretKey);

  return { ...ackPayload, signature: sig };
}
