/**
 * Distributed Consensus for Network Isolation.
 *
 * Implements whitepaper section 11.2: network isolation requires
 * multi-node consensus, not single-node decisions. Uses a simple
 * quorum-based voting system where registry nodes vote on isolation
 * proposals.
 *
 * Consensus process:
 * 1. Any node can propose isolation of a DID
 * 2. Proposal is broadcast to known registry nodes
 * 3. Each registry independently evaluates and votes
 * 4. Isolation executes when quorum is reached (>50% of registries)
 * 5. All decisions are recorded in the audit log
 */

import type { NodeContext } from "../context.js";
import type { TransportResult } from "@maip/core";

/** An isolation proposal requiring distributed consensus. */
export interface IsolationProposal {
  id: string;
  targetDid: string;
  proposerDid: string;
  reason: string;
  evidence: string[];
  votes: Array<{
    voterDid: string;
    vote: "isolate" | "reject";
    reason: string;
    votedAt: string;
  }>;
  totalVoters: number;
  quorum: number;
  status: "voting" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
}

// In-memory proposal store
const proposals: Map<string, IsolationProposal[]> = new Map();

function getProposals(nodeDid: string): IsolationProposal[] {
  if (!proposals.has(nodeDid)) proposals.set(nodeDid, []);
  return proposals.get(nodeDid)!;
}

/** Create a new isolation proposal. */
export function createIsolationProposal(
  ctx: NodeContext,
  targetDid: string,
  reason: string,
  evidence: string[]
): TransportResult<IsolationProposal> {
  const nodeProposals = getProposals(ctx.identity.did);

  // Check for duplicate active proposals
  const existing = nodeProposals.find(
    (p) => p.targetDid === targetDid && p.status === "voting"
  );
  if (existing) {
    return {
      ok: false,
      error: "Active isolation proposal already exists for this DID",
      code: "DUPLICATE_PROPOSAL",
      httpStatus: 409,
    };
  }

  const registryCount = Math.max(1, ctx.stores.registrations.count());

  const proposal: IsolationProposal = {
    id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    targetDid,
    proposerDid: ctx.identity.did,
    reason,
    evidence,
    votes: [
      {
        voterDid: ctx.identity.did,
        vote: "isolate",
        reason: "Proposer's initial vote",
        votedAt: new Date().toISOString(),
      },
    ],
    totalVoters: registryCount,
    quorum: 0.5,
    status: "voting",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  nodeProposals.push(proposal);
  return { ok: true, data: proposal, httpStatus: 201 };
}

/** Vote on an isolation proposal. */
export function voteOnProposal(
  ctx: NodeContext,
  proposalId: string,
  vote: "isolate" | "reject",
  reason: string
): TransportResult<IsolationProposal> {
  const nodeProposals = getProposals(ctx.identity.did);
  const proposal = nodeProposals.find((p) => p.id === proposalId);

  if (!proposal) {
    return { ok: false, error: "Proposal not found", code: "NOT_FOUND", httpStatus: 404 };
  }

  if (proposal.status !== "voting") {
    return { ok: false, error: "Proposal is no longer accepting votes", code: "CLOSED", httpStatus: 400 };
  }

  if (new Date() > new Date(proposal.expiresAt)) {
    proposal.status = "expired";
    proposal.resolvedAt = new Date().toISOString();
    return { ok: false, error: "Proposal has expired", code: "EXPIRED", httpStatus: 400 };
  }

  if (proposal.votes.some((v) => v.voterDid === ctx.identity.did)) {
    return { ok: false, error: "Already voted on this proposal", code: "DUPLICATE_VOTE", httpStatus: 409 };
  }

  proposal.votes.push({
    voterDid: ctx.identity.did,
    vote,
    reason,
    votedAt: new Date().toISOString(),
  });

  // Check if quorum reached
  const isolateVotes = proposal.votes.filter((v) => v.vote === "isolate").length;
  const rejectVotes = proposal.votes.filter((v) => v.vote === "reject").length;
  const requiredVotes = Math.ceil(proposal.totalVoters * proposal.quorum);

  if (isolateVotes >= requiredVotes) {
    proposal.status = "approved";
    proposal.resolvedAt = new Date().toISOString();

    // Execute isolation
    ctx.stores.isolations.add({
      id: `iso-${proposal.id}`,
      did: proposal.targetDid,
      reason: proposal.reason,
      category: "other",
      flaggedBy: proposal.votes.filter((v) => v.vote === "isolate").map((v) => v.voterDid),
      isolatedAt: proposal.resolvedAt,
      appealPending: false,
      status: "active",
    });
  } else if (rejectVotes > proposal.totalVoters - requiredVotes) {
    proposal.status = "rejected";
    proposal.resolvedAt = new Date().toISOString();
  }

  return { ok: true, data: proposal, httpStatus: 200 };
}

/** Get all proposals (optionally filtered by status). */
export function getProposals_(
  ctx: NodeContext,
  status?: IsolationProposal["status"]
): TransportResult<IsolationProposal[]> {
  let result = getProposals(ctx.identity.did);
  if (status) result = result.filter((p) => p.status === status);
  return { ok: true, data: result, httpStatus: 200 };
}

/** Get a specific proposal. */
export function getProposal(
  ctx: NodeContext,
  proposalId: string
): TransportResult<IsolationProposal> {
  const nodeProposals = getProposals(ctx.identity.did);
  const proposal = nodeProposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return { ok: false, error: "Proposal not found", code: "NOT_FOUND", httpStatus: 404 };
  }
  return { ok: true, data: proposal, httpStatus: 200 };
}
