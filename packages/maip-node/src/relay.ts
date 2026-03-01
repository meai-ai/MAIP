/**
 * MAIP Relay client.
 *
 * Handles sending messages to relay nodes for offline delivery,
 * and retrieving messages from relay mailboxes.
 */

import {
  MAIP_ENDPOINTS,
  MAIP_HEADERS,
  MAIP_VERSION,
  type MAIPResponse,
  type RelayMessage,
} from "@maip/core";

/** Store a message at a relay node for offline delivery. */
export async function storeRelayMessage(
  relayUrl: string,
  recipientDid: string,
  encryptedPayload: string,
  senderDid: string
): Promise<{ id: string; expiresAt: string } | null> {
  try {
    const res = await fetch(`${relayUrl}${MAIP_ENDPOINTS.RELAY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [MAIP_HEADERS.VERSION]: MAIP_VERSION,
        [MAIP_HEADERS.SENDER]: senderDid,
      },
      body: JSON.stringify({ recipientDid, encryptedPayload, senderDid }),
    });

    if (!res.ok) return null;

    const body = (await res.json()) as MAIPResponse<{ id: string; expiresAt: string }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Retrieve messages from a relay mailbox. */
export async function retrieveRelayMessages(
  relayUrl: string,
  did: string
): Promise<RelayMessage[]> {
  try {
    const res = await fetch(`${relayUrl}${MAIP_ENDPOINTS.RELAY}/${encodeURIComponent(did)}`, {
      headers: {
        [MAIP_HEADERS.VERSION]: MAIP_VERSION,
        [MAIP_HEADERS.SENDER]: did,
      },
    });

    if (!res.ok) return [];

    const body = (await res.json()) as MAIPResponse<RelayMessage[]>;
    return body.data ?? [];
  } catch {
    return [];
  }
}
