/**
 * Transport-agnostic relay processing.
 */

import { v4 as uuid } from "uuid";
import type { RelayMessage, TransportResult } from "@maip/core";
import type { NodeContext } from "../context.js";

const DEFAULT_TTL_DAYS = 7;
const MAX_RELAY_PER_DID = 100;

/** Input for storing a relay message. */
export interface RelayStoreInput {
  recipientDid: string;
  encryptedPayload: string;
  senderDid: string;
}

/** Input for retrieving relay messages. */
export interface RelayRetrieveInput {
  /** The DID whose messages to retrieve. */
  did: string;
  /** The DID of the sender making the request (for authorization). */
  senderDid: string | undefined;
}

/**
 * Process a relay store request (transport-agnostic).
 *
 * Stores an encrypted message for offline delivery.
 */
export function processRelayStore(
  ctx: NodeContext,
  body: unknown
): TransportResult<{ id: string; expiresAt: string }> {
  const input = body as Record<string, unknown>;
  const { recipientDid, encryptedPayload, senderDid } = input;

  if (!recipientDid || !encryptedPayload || !senderDid) {
    return {
      ok: false,
      error: "Missing required fields: recipientDid, encryptedPayload, senderDid",
      code: "INVALID_FORMAT",
      httpStatus: 400,
    };
  }

  // Check storage limit for recipient
  const existing = ctx.stores.relay.filter((m) => m.recipientDid === recipientDid);
  if (existing.length >= MAX_RELAY_PER_DID) {
    return {
      ok: false,
      error: "Relay mailbox full for this recipient",
      code: "MAILBOX_FULL",
      httpStatus: 507,
    };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_TTL_DAYS * 86_400_000);

  const relayMessage = {
    id: uuid(),
    recipientDid: recipientDid as string,
    encryptedPayload: encryptedPayload as string,
    senderDid: senderDid as string,
    storedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  ctx.stores.relay.add(relayMessage);

  return {
    ok: true,
    data: {
      id: relayMessage.id,
      expiresAt: relayMessage.expiresAt,
    },
    httpStatus: 201,
  };
}

/**
 * Process a relay retrieve request (transport-agnostic).
 *
 * Returns and deletes stored messages for the given DID (store-and-forward).
 */
export function processRelayRetrieve(
  ctx: NodeContext,
  input: RelayRetrieveInput
): TransportResult<RelayMessage[]> {
  const { did, senderDid } = input;

  // Only the recipient can retrieve their messages
  if (!senderDid || senderDid !== did) {
    return {
      ok: false,
      error: "Only the recipient can retrieve relay messages",
      code: "ACCESS_DENIED",
      httpStatus: 403,
    };
  }

  // Purge expired messages first
  ctx.stores.purgeExpiredRelay();

  // Get messages for this DID
  const messages = ctx.stores.relay.filter((m) => m.recipientDid === did);

  // Remove retrieved messages (store-and-forward)
  for (const m of messages) {
    ctx.stores.relay.remove(m.id);
  }

  return {
    ok: true,
    data: messages,
    httpStatus: 200,
  };
}
