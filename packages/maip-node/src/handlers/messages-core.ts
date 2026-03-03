/**
 * Transport-agnostic message processing.
 *
 * Extracts all business logic from the Express handler so it can be
 * reused by both HTTP and P2P transports.
 */

import crypto from "node:crypto";
import {
  MAIPMessageSchema,
  verifyWithDid,
  sign,
  decrypt,
  type MAIPMessage,
  type MessageAck,
  type TransportResult,
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

/**
 * Process an incoming message (transport-agnostic).
 *
 * Validates schema, checks recipient, verifies signature, enforces rate limits
 * and relationship permissions, stores the message, and fires callbacks.
 */
export function processIncomingMessage(
  ctx: NodeContext,
  body: unknown
): TransportResult<MessageAck> {
  // Validate message schema
  const parsed = MAIPMessageSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid message format",
      code: "INVALID_FORMAT",
      httpStatus: 400,
    };
  }

  const message: MAIPMessage = parsed.data;

  // Check recipient
  if (message.to !== ctx.identity.did) {
    return {
      ok: false,
      error: "Message not addressed to this node",
      code: "WRONG_RECIPIENT",
      httpStatus: 404,
    };
  }

  // Replay protection — check timestamp drift
  const msgTime = new Date(message.timestamp).getTime();
  const drift = Math.abs(Date.now() - msgTime);
  if (drift > MAX_TIMESTAMP_DRIFT_MS) {
    return {
      ok: false,
      error: "Message timestamp too far from current time",
      code: "TIMESTAMP_DRIFT",
      httpStatus: 400,
    };
  }

  // Verify signature
  const { signature, ...withoutSig } = message;
  if (!verifyWithDid(withoutSig, signature, message.from)) {
    return {
      ok: false,
      error: "Invalid message signature",
      code: "INVALID_SIGNATURE",
      httpStatus: 401,
    };
  }

  // Auto-decrypt encrypted messages
  if (message.encrypted && message.content.text) {
    try {
      const plaintext = decrypt(
        message.content.text,
        message.encrypted,
        ctx.keyPair.encryption.secretKey
      );
      message.content.text = plaintext;
    } catch {
      // Decryption failed — pass through as-is (may be corrupted or wrong key)
      console.warn(`[maip-node] Failed to decrypt message ${message.id} from ${message.from}`);
    }
  }

  // Network isolation check — reject messages from isolated DIDs
  const isolated = ctx.stores.isolations.filter(
    (r) => r.did === message.from && r.status === "active"
  );
  if (isolated.length > 0) {
    return {
      ok: false,
      error: "Sender is network-isolated",
      code: "ISOLATED",
      httpStatus: 403,
    };
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

      // Auto-escalation: auto-isolate on critical anomalies (severity > 0.9)
      const critical = severe.filter((a) => a.severity > 0.9);
      if (critical.length > 0) {
        const alreadyIsolated = ctx.stores.isolations.filter(
          (r) => r.did === message.from && r.status === "active"
        );
        if (alreadyIsolated.length === 0) {
          ctx.stores.isolations.add({
            id: `auto-${Date.now()}`,
            did: message.from,
            reason: `Auto-escalated: ${critical.map((a) => a.description).join("; ")}`,
            category: "other",
            flaggedBy: [ctx.identity.did],
            status: "active",
            isolatedAt: new Date().toISOString(),
            appealPending: false,
          });
          console.warn(`[maip-node] Auto-isolated ${message.from} due to critical anomalies`);
        }
      }
    }
  }

  // Rate limiting
  if (!checkRateLimit(message.from)) {
    const ack = createAck(ctx, message.id, "rejected", "Rate limit exceeded");
    return {
      ok: false,
      data: ack,
      error: "Rate limit exceeded",
      code: "RATE_LIMITED",
      httpStatus: 429,
    };
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
      // Track this as a trust violation for anomaly detection
      const existing = ctx.stores.behaviorProfiles.filter((p) => p.did === message.from);
      if (existing.length > 0) {
        existing[0].anomalies.push({
          type: "trust_violation",
          severity: 0.3,
          description: `Attempted message without active relationship`,
          detectedAt: new Date().toISOString(),
        });
        ctx.stores.behaviorProfiles.add(existing[0]);
      }

      const ack = createAck(ctx, message.id, "rejected", "No active relationship with messaging permission");
      return {
        ok: false,
        data: ack,
        error: "No relationship",
        code: "NO_RELATIONSHIP",
        httpStatus: 403,
      };
    }
  }

  // Auto-extend sourceChain and compute contentHash for knowledge_share messages
  if (message.type === "knowledge_share" && message.content.text) {
    // Compute content hash if not already present
    if (!message.content.data?.contentHash) {
      const hash = crypto.createHash("sha256").update(message.content.text).digest("hex");
      if (!message.content.data) message.content.data = {};
      message.content.data.contentHash = hash;
    }

    // Auto-extend sourceChain: append sender DID if not already in chain
    const chain: string[] = (message.content.sourceChain as string[] | undefined) ?? [];
    if (!chain.includes(message.from)) {
      chain.push(message.from);
    }
    message.content.sourceChain = chain;
  }

  // Store message
  ctx.stores.messages.add(message);

  // Trust accumulation — update relationship interactionCount and trustLevel
  const activeRels = ctx.stores.relationships.filter(
    (r) =>
      r.status === "active" &&
      r.participants.includes(message.from) &&
      r.participants.includes(ctx.identity.did)
  );
  for (const rel of activeRels) {
    rel.interactionCount = (rel.interactionCount ?? 0) + 1;
    rel.lastInteraction = new Date().toISOString();
    // Logarithmic trust accumulation: trustLevel = min(1, log2(1 + interactionCount) / 10)
    rel.trustLevel = Math.min(1, Math.log2(1 + rel.interactionCount) / 10);
    ctx.stores.relationships.add(rel);
  }

  // Notify message handler if registered
  if (ctx.onMessage) {
    ctx.onMessage(message);
  }

  // Send ack
  const ack = createAck(ctx, message.id, "received");
  return { ok: true, data: ack, httpStatus: 200 };
}
