/**
 * Guardian transfer protocol — transport-agnostic core logic.
 *
 * Implements the multi-step consent flow from spec section 9.5:
 * - All 3 parties (agent, current guardian, new guardian) must consent
 * - Transfer auto-completes when all consent
 * - 90-day timeout for unresponsive guardians
 */

import { v4 as uuid } from "uuid";
import type { GuardianTransferStatus } from "@maip/core";
import type { NodeContext } from "../context.js";

/** 90-day expiry for unresponsive transfers (per spec 9.5). */
const TRANSFER_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

export interface TransferEntry extends GuardianTransferStatus {
  id: string;
}

/** Initiate a guardian transfer. */
export function processInitiateTransfer(
  ctx: NodeContext,
  body: {
    agentDid: string;
    currentGuardianDid: string;
    newGuardianDid: string;
    reason: string;
    initiatedBy: "agent" | "current_guardian" | "new_guardian";
    signature: string;
  }
): { ok: boolean; data?: { transferId: string }; error?: string; code?: string } {
  if (!body.agentDid || !body.currentGuardianDid || !body.newGuardianDid || !body.reason || !body.initiatedBy) {
    return { ok: false, error: "Missing required fields", code: "INVALID_FORMAT" };
  }

  // Check for existing pending transfer for the same agent
  const existing = ctx.stores.guardianTransfers.filter(
    (t) => t.agentDid === body.agentDid && (t.status === "pending" || t.status === "approved")
  );
  if (existing.length > 0) {
    return { ok: false, error: "A transfer is already pending for this agent", code: "TRANSFER_EXISTS" };
  }

  const now = new Date().toISOString();

  // The initiator automatically consents
  let initiatorDid: string;
  if (body.initiatedBy === "agent") initiatorDid = body.agentDid;
  else if (body.initiatedBy === "current_guardian") initiatorDid = body.currentGuardianDid;
  else initiatorDid = body.newGuardianDid;

  const transfer: TransferEntry = {
    id: uuid(),
    agentDid: body.agentDid,
    currentGuardianDid: body.currentGuardianDid,
    newGuardianDid: body.newGuardianDid,
    reason: body.reason,
    initiatedBy: body.initiatedBy,
    consents: [{ party: initiatorDid, approved: true, timestamp: now }],
    status: "pending",
    createdAt: now,
  };

  ctx.stores.guardianTransfers.add(transfer);
  return { ok: true, data: { transferId: transfer.id } };
}

/** Submit consent for a guardian transfer. */
export function processTransferConsent(
  ctx: NodeContext,
  transferId: string,
  body: {
    consentingParty: string;
    approved: boolean;
    signature: string;
  }
): { ok: boolean; data?: { transfer: GuardianTransferStatus }; error?: string; code?: string } {
  if (!body.consentingParty || body.approved === undefined) {
    return { ok: false, error: "Missing required fields", code: "INVALID_FORMAT" };
  }

  const transfer = ctx.stores.guardianTransfers.getById(transferId) as TransferEntry | undefined;
  if (!transfer) {
    return { ok: false, error: "Transfer not found", code: "NOT_FOUND" };
  }

  if (transfer.status !== "pending") {
    return { ok: false, error: `Transfer is ${transfer.status}, not pending`, code: "INVALID_STATE" };
  }

  // Check expiry
  const elapsed = Date.now() - new Date(transfer.createdAt).getTime();
  if (elapsed > TRANSFER_EXPIRY_MS) {
    transfer.status = "expired";
    ctx.stores.guardianTransfers.add(transfer);
    return { ok: false, error: "Transfer has expired (90-day timeout)", code: "EXPIRED" };
  }

  // Verify the consenting party is one of the 3 involved parties
  const validParties = [transfer.agentDid, transfer.currentGuardianDid, transfer.newGuardianDid];
  if (!validParties.includes(body.consentingParty)) {
    return { ok: false, error: "Consenting party is not involved in this transfer", code: "UNAUTHORIZED" };
  }

  // Check if this party has already consented
  const alreadyConsented = transfer.consents.find((c) => c.party === body.consentingParty);
  if (alreadyConsented) {
    return { ok: false, error: "Party has already submitted consent", code: "DUPLICATE_CONSENT" };
  }

  // Record consent
  const now = new Date().toISOString();
  transfer.consents.push({
    party: body.consentingParty,
    approved: body.approved,
    timestamp: now,
  });

  // If any party rejects, the transfer is rejected
  if (!body.approved) {
    transfer.status = "rejected";
    ctx.stores.guardianTransfers.add(transfer);
    return { ok: true, data: { transfer } };
  }

  // Check if all 3 parties have consented
  const consentedParties = new Set(transfer.consents.filter((c) => c.approved).map((c) => c.party));
  const allConsented =
    consentedParties.has(transfer.agentDid) &&
    consentedParties.has(transfer.currentGuardianDid) &&
    consentedParties.has(transfer.newGuardianDid);

  if (allConsented) {
    transfer.status = "completed";
    transfer.completedAt = now;
  }

  ctx.stores.guardianTransfers.add(transfer);
  return { ok: true, data: { transfer } };
}

/** Get transfer status. */
export function processGetTransferStatus(
  ctx: NodeContext,
  transferId: string
): { ok: boolean; data?: { transfer: GuardianTransferStatus }; error?: string; code?: string } {
  const transfer = ctx.stores.guardianTransfers.getById(transferId);
  if (!transfer) {
    return { ok: false, error: "Transfer not found", code: "NOT_FOUND" };
  }

  // Check expiry for pending transfers
  if (transfer.status === "pending") {
    const elapsed = Date.now() - new Date(transfer.createdAt).getTime();
    if (elapsed > TRANSFER_EXPIRY_MS) {
      (transfer as TransferEntry).status = "expired";
      ctx.stores.guardianTransfers.add(transfer as TransferEntry);
    }
  }

  return { ok: true, data: { transfer } };
}
