/**
 * Distributed Fact Verification.
 *
 * Implements whitepaper section 10.13: multiple nodes independently
 * confirm or dispute facts, creating a distributed truth assessment.
 */

import type { NodeContext } from "../context.js";
import type { TransportResult } from "@maip/core";

/** A fact claim submitted for verification. */
export interface FactClaim {
  id: string;
  claim: string;
  claimantDid: string;
  source: string;
  domain: string;
  verifications: FactVerification[];
  aggregateConfidence: number;
  status: "pending" | "verified" | "disputed" | "debunked";
  submittedAt: string;
  lastVerifiedAt?: string;
}

/** An independent verification of a fact claim. */
export interface FactVerification {
  verifierDid: string;
  verdict: "confirms" | "disputes" | "uncertain";
  confidence: number;
  evidence: string;
  verifiedAt: string;
}

// In-memory claim store
const factClaims: Map<string, FactClaim[]> = new Map();

function getClaims(nodeDid: string): FactClaim[] {
  if (!factClaims.has(nodeDid)) factClaims.set(nodeDid, []);
  return factClaims.get(nodeDid)!;
}

/** Submit a fact claim for distributed verification. */
export function submitFactClaim(
  ctx: NodeContext,
  claim: string,
  source: string,
  domain: string
): TransportResult<FactClaim> {
  const claims = getClaims(ctx.identity.did);

  const id = `fact-${hashString(claim)}`;

  const existing = claims.find((c) => c.id === id);
  if (existing) {
    return { ok: true, data: existing, httpStatus: 200 };
  }

  const factClaim: FactClaim = {
    id,
    claim,
    claimantDid: ctx.identity.did,
    source,
    domain,
    verifications: [],
    aggregateConfidence: 0.5,
    status: "pending",
    submittedAt: new Date().toISOString(),
  };

  claims.push(factClaim);
  return { ok: true, data: factClaim, httpStatus: 201 };
}

/** Submit a verification for an existing fact claim. */
export function verifyFactClaim(
  ctx: NodeContext,
  claimId: string,
  verdict: FactVerification["verdict"],
  confidence: number,
  evidence: string
): TransportResult<FactClaim> {
  const claims = getClaims(ctx.identity.did);
  const claim = claims.find((c) => c.id === claimId);

  if (!claim) {
    return { ok: false, error: "Fact claim not found", code: "NOT_FOUND", httpStatus: 404 };
  }

  if (claim.verifications.some((v) => v.verifierDid === ctx.identity.did)) {
    return { ok: false, error: "Already verified this claim", code: "DUPLICATE", httpStatus: 409 };
  }

  claim.verifications.push({
    verifierDid: ctx.identity.did,
    verdict,
    confidence,
    evidence,
    verifiedAt: new Date().toISOString(),
  });

  claim.lastVerifiedAt = new Date().toISOString();
  updateAggregateConfidence(claim);

  return { ok: true, data: claim, httpStatus: 200 };
}

/** Get the verification status of a fact claim. */
export function getFactClaim(
  ctx: NodeContext,
  claimId: string
): TransportResult<FactClaim> {
  const claims = getClaims(ctx.identity.did);
  const claim = claims.find((c) => c.id === claimId);
  if (!claim) {
    return { ok: false, error: "Fact claim not found", code: "NOT_FOUND", httpStatus: 404 };
  }
  return { ok: true, data: claim, httpStatus: 200 };
}

/** Search fact claims by domain and/or status. */
export function searchFactClaims(
  ctx: NodeContext,
  domain?: string,
  status?: FactClaim["status"]
): TransportResult<FactClaim[]> {
  let claims = getClaims(ctx.identity.did);
  if (domain) claims = claims.filter((c) => c.domain === domain);
  if (status) claims = claims.filter((c) => c.status === status);
  return { ok: true, data: claims, httpStatus: 200 };
}

function updateAggregateConfidence(claim: FactClaim): void {
  if (claim.verifications.length === 0) {
    claim.aggregateConfidence = 0.5;
    claim.status = "pending";
    return;
  }

  let totalWeight = 0;
  let weightedSum = 0;

  for (const v of claim.verifications) {
    const weight = v.confidence;
    totalWeight += weight;
    switch (v.verdict) {
      case "confirms": weightedSum += weight; break;
      case "disputes": weightedSum += 0; break;
      case "uncertain": weightedSum += weight * 0.5; break;
    }
  }

  claim.aggregateConfidence = totalWeight > 0
    ? Math.round((weightedSum / totalWeight) * 100) / 100
    : 0.5;

  const minVerifications = 2;
  if (claim.verifications.length >= minVerifications) {
    if (claim.aggregateConfidence >= 0.7) claim.status = "verified";
    else if (claim.aggregateConfidence <= 0.3) claim.status = "debunked";
    else claim.status = "disputed";
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
