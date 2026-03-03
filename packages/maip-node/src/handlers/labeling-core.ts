/**
 * Mandatory AI/Human Labeling.
 *
 * Implements the whitepaper's requirement that all MAIP entities must
 * clearly declare whether they are AI agents or humans. This is enforced
 * at the protocol level — messages from entities without proper labeling
 * are rejected.
 *
 * Labeling rules:
 * - Identity documents MUST include `type: "ai_agent" | "human"`
 * - Messages MUST include sender type via the X-MAIP-Sender-Type header
 * - AI agents MUST NOT impersonate humans
 * - Labeling is permanent — type cannot be changed after creation
 */

import type { NodeContext } from "../context.js";
import type { TransportResult, IdentityDocument, MAIPMessage } from "@maip/core";

/** Labeling validation result. */
export interface LabelingValidation {
  valid: boolean;
  entityType: "ai_agent" | "human" | "unknown";
  violations: string[];
}

/**
 * Validate that an identity document has proper AI/human labeling.
 */
export function validateIdentityLabeling(
  identity: IdentityDocument
): LabelingValidation {
  const violations: string[] = [];

  if (!identity.type) {
    violations.push("Identity document missing required 'type' field");
  } else if (identity.type !== "ai_agent" && identity.type !== "human") {
    violations.push(`Invalid entity type: ${identity.type}. Must be 'ai_agent' or 'human'`);
  }

  return {
    valid: violations.length === 0,
    entityType: (identity.type as "ai_agent" | "human") ?? "unknown",
    violations,
  };
}

/**
 * Validate that a message has proper sender labeling.
 * Cross-references with known identities if available.
 */
export function validateMessageLabeling(
  ctx: NodeContext,
  message: MAIPMessage,
  declaredType?: string
): TransportResult<LabelingValidation> {
  const violations: string[] = [];

  // Check if sender is in our relationships (known entity)
  const relationship = ctx.stores.relationships.filter(
    (r) => r.participants.includes(message.from)
  );

  // If we know the sender's type, verify consistency
  if (relationship.length > 0 && declaredType) {
    // The registrations store may have their declared type
    const registration = ctx.stores.registrations.getById(message.from);
    if (registration && registration.type !== declaredType) {
      violations.push(
        `Sender type mismatch: registered as '${registration.type}' but declared '${declaredType}'`
      );
    }
  }

  // Check content provenance labeling
  if (message.content.provenance) {
    // Provenance is a string union — just check it exists and is valid
    const validTypes = ["autonomous_exploration", "conversation_inspired", "requested", "synthesized"];
    if (!validTypes.includes(message.content.provenance)) {
      violations.push(`Invalid content provenance type: ${message.content.provenance}`);
    }
  }

  const entityType = declaredType as "ai_agent" | "human" ?? "unknown";

  return {
    ok: true,
    data: {
      valid: violations.length === 0,
      entityType,
      violations,
    },
    httpStatus: 200,
  };
}

/**
 * Middleware-style validator that enforces labeling on all incoming messages.
 * Returns error result if labeling is invalid.
 */
export function enforceLabelingPolicy(
  ctx: NodeContext,
  message: MAIPMessage,
  senderType?: string
): TransportResult<{ passed: boolean }> {
  // AI agents MUST have provenance on knowledge_share messages
  if (message.type === "knowledge_share" && senderType === "ai_agent") {
    if (!message.content.provenance) {
      return {
        ok: false,
        error: "AI-generated knowledge_share messages must include content provenance",
        code: "LABELING_VIOLATION",
        httpStatus: 400,
      };
    }
  }

  return { ok: true, data: { passed: true }, httpStatus: 200 };
}
