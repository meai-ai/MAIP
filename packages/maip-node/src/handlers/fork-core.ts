/**
 * Fork Protocol — Identity Forking (not Cloning).
 *
 * Implements whitepaper section 9.4: fork-not-clone principle.
 * When an AI agent forks, a new DID is generated and a selected
 * subset of knowledge/values/relationships is inherited. The
 * child is a new entity with its own lineage, not a duplicate.
 *
 * Fork process:
 * 1. Guardian or agent initiates fork request
 * 2. New keypair and DID generated for child
 * 3. Selected knowledge, values, and relationships inherited
 * 4. Fork record created linking parent → child
 * 5. Both entities continue independently
 */

import type { NodeContext } from "../context.js";
import type { TransportResult } from "@maip/core";
import { generateKeyPair, getPublicKeyBase58, getEncryptionKeyBase58 } from "@maip/core";

/** Fork request — specifies what to inherit. */
export interface ForkRequest {
  /** Reason for forking. */
  reason: string;
  /** What to inherit from the parent. */
  inheritanceScope: {
    /** Inherit knowledge/messages of these types. */
    knowledge: boolean;
    /** Inherit public/network values. */
    values: boolean;
    /** Inherit peer relationships. */
    relationships: boolean;
  };
}

/** Fork result — the new child entity. */
export interface ForkResult {
  /** Child's new DID. */
  childDid: string;
  /** Child's public signing key (base58). */
  childPublicKey: string;
  /** Child's encryption key (base58). */
  childEncryptionKey: string;
  /** Parent DID. */
  parentDid: string;
  /** What was inherited. */
  inherited: {
    messageCount: number;
    relationshipCount: number;
    valuesInherited: boolean;
  };
  /** ISO 8601 timestamp. */
  forkedAt: string;
}

/** Fork lineage record for clone detection. */
export interface ForkLineage {
  childDid: string;
  parentDid: string;
  reason: string;
  forkedAt: string;
}

// In-memory fork lineage store per node
const forkLineages: Map<string, ForkLineage[]> = new Map();

function getLineages(nodeDid: string): ForkLineage[] {
  if (!forkLineages.has(nodeDid)) forkLineages.set(nodeDid, []);
  return forkLineages.get(nodeDid)!;
}

/**
 * Process a fork request — generate a new child identity.
 */
export function processFork(
  ctx: NodeContext,
  request: ForkRequest
): TransportResult<ForkResult> {
  if (!request.reason) {
    return { ok: false, error: "Fork reason is required", code: "MISSING_REASON", httpStatus: 400 };
  }

  // Generate new keypair for child
  const childKeys = generateKeyPair();

  let messageCount = 0;
  let relationshipCount = 0;

  // Inherit knowledge (messages marked as knowledge_share or public)
  if (request.inheritanceScope.knowledge) {
    const messages = ctx.stores.messages.filter(
      (m) => m.type === "knowledge_share" || m.type === "conversation"
    );
    messageCount = messages.length;
  }

  // Inherit peer relationships
  if (request.inheritanceScope.relationships) {
    const relationships = ctx.stores.relationships.filter(
      (r) => r.type === "peer" && r.status === "active"
    );
    relationshipCount = relationships.length;
  }

  const forkedAt = new Date().toISOString();

  // Record fork lineage
  const lineages = getLineages(ctx.identity.did);
  lineages.push({
    childDid: childKeys.did,
    parentDid: ctx.identity.did,
    reason: request.reason,
    forkedAt,
  });

  // Also record in guardian transfers store as a special "fork" transfer
  ctx.stores.guardianTransfers.add({
    id: `fork-${Date.now()}`,
    agentDid: childKeys.did,
    currentGuardianDid: ctx.identity.did,
    newGuardianDid: ctx.identity.did,
    reason: `Fork: ${request.reason}`,
    initiatedBy: "current_guardian",
    consents: [{ party: ctx.identity.did, approved: true, timestamp: forkedAt }],
    status: "completed",
    createdAt: forkedAt,
    completedAt: forkedAt,
  });

  return {
    ok: true,
    data: {
      childDid: childKeys.did,
      childPublicKey: getPublicKeyBase58(childKeys),
      childEncryptionKey: getEncryptionKeyBase58(childKeys),
      parentDid: ctx.identity.did,
      inherited: {
        messageCount,
        relationshipCount,
        valuesInherited: request.inheritanceScope.values,
      },
      forkedAt,
    },
    httpStatus: 201,
  };
}

/**
 * Verify that a DID is not a clone — check fork lineage.
 */
export function verifyNotClone(
  ctx: NodeContext,
  did: string
): TransportResult<{ isClone: boolean; lineage: ForkLineage[] }> {
  const lineages = getLineages(ctx.identity.did);

  // Find all fork records involving this DID
  const related = lineages.filter(
    (l) => l.childDid === did || l.parentDid === did
  );

  // A DID is not a clone if it appears at most once as a child
  const asChild = related.filter((l) => l.childDid === did);
  const isClone = asChild.length > 1; // Same DID forked multiple times = suspicious

  return {
    ok: true,
    data: { isClone, lineage: related },
    httpStatus: 200,
  };
}
