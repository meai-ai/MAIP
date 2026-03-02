/**
 * Libp2pTransport — outbound MAIP transport over libp2p streams.
 *
 * Provides methods to send messages, relationship requests, etc. to remote
 * MAIP peers via libp2p protocol streams.
 */

import type { Libp2p } from "libp2p";
import type {
  MAIPMessage,
  MessageAck,
  RelationshipRequest,
  RelationshipResponse,
  Persona,
  IdentityDocument,
  DiscoveryQuery,
  DiscoveryResult,
  RelayMessage,
  MAIPResponse,
} from "@maip/core";
import { didToPeerId } from "./identity-bridge.js";
import { writeLengthPrefixed, readLengthPrefixed } from "./stream-utils.js";
import { MAIP_PROTOCOL_IDS } from "./index.js";

/**
 * Perform a request-response exchange: open a stream, write the request,
 * close the write side, read the response.
 */
async function dialAndExchange<Req, Res>(
  node: Libp2p,
  targetDid: string,
  protocol: string,
  request: Req
): Promise<MAIPResponse<Res>> {
  const peerId = didToPeerId(targetDid);
  const stream = await node.dialProtocol(peerId, protocol);

  try {
    // Write length-prefixed request and close write side
    await writeLengthPrefixed(stream, request);

    // Read the response
    const response = await readLengthPrefixed<MAIPResponse<Res>>(stream);
    return response;
  } catch (err) {
    stream.abort(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

/**
 * P2P transport client for outbound MAIP requests.
 */
export class Libp2pTransport {
  constructor(private readonly node: Libp2p) {}

  /** Send a message to a peer via P2P. */
  async sendMessage(targetDid: string, message: MAIPMessage): Promise<MessageAck | null> {
    try {
      const response = await dialAndExchange<MAIPMessage, MessageAck>(
        this.node,
        targetDid,
        MAIP_PROTOCOL_IDS.MESSAGES,
        message
      );
      return response.ok ? (response.data ?? null) : null;
    } catch (err) {
      console.error(`[p2p-transport] Failed to send message to ${targetDid}:`, err);
      return null;
    }
  }

  /** Send a relationship request to a peer via P2P. */
  async sendRelationshipRequest(
    targetDid: string,
    request: RelationshipRequest
  ): Promise<RelationshipResponse | null> {
    try {
      const response = await dialAndExchange<RelationshipRequest, RelationshipResponse>(
        this.node,
        targetDid,
        MAIP_PROTOCOL_IDS.RELATIONSHIPS,
        request
      );
      return response.ok ? (response.data ?? null) : null;
    } catch (err) {
      console.error(`[p2p-transport] Failed to send relationship request to ${targetDid}:`, err);
      return null;
    }
  }

  /** Fetch a peer's persona via P2P. */
  async fetchPersona(targetDid: string, myDid: string): Promise<Persona | null> {
    try {
      const response = await dialAndExchange<{ requesterDid: string }, Persona>(
        this.node,
        targetDid,
        MAIP_PROTOCOL_IDS.PERSONA,
        { requesterDid: myDid }
      );
      return response.ok ? (response.data ?? null) : null;
    } catch (err) {
      console.error(`[p2p-transport] Failed to fetch persona from ${targetDid}:`, err);
      return null;
    }
  }

  /** Fetch a peer's identity document via P2P. */
  async fetchIdentity(targetDid: string): Promise<IdentityDocument | null> {
    try {
      const response = await dialAndExchange<Record<string, never>, IdentityDocument>(
        this.node,
        targetDid,
        MAIP_PROTOCOL_IDS.IDENTITY,
        {}
      );
      return response.ok ? (response.data ?? null) : null;
    } catch (err) {
      console.error(`[p2p-transport] Failed to fetch identity from ${targetDid}:`, err);
      return null;
    }
  }

  /** Query a peer's discovery endpoint via P2P. */
  async discover(targetDid: string, query: DiscoveryQuery): Promise<DiscoveryResult[]> {
    try {
      const response = await dialAndExchange<DiscoveryQuery, DiscoveryResult[]>(
        this.node,
        targetDid,
        MAIP_PROTOCOL_IDS.DISCOVERY,
        query
      );
      return response.ok ? (response.data ?? []) : [];
    } catch (err) {
      console.error(`[p2p-transport] Failed to discover from ${targetDid}:`, err);
      return [];
    }
  }

  /** Store a relay message on a peer via P2P. */
  async storeRelay(
    targetDid: string,
    recipientDid: string,
    encryptedPayload: string,
    senderDid: string
  ): Promise<{ id: string; expiresAt: string } | null> {
    try {
      const response = await dialAndExchange<
        { recipientDid: string; encryptedPayload: string; senderDid: string },
        { id: string; expiresAt: string }
      >(
        this.node,
        targetDid,
        MAIP_PROTOCOL_IDS.RELAY,
        { recipientDid, encryptedPayload, senderDid }
      );
      return response.ok ? (response.data ?? null) : null;
    } catch (err) {
      console.error(`[p2p-transport] Failed to store relay on ${targetDid}:`, err);
      return null;
    }
  }

  /** Retrieve relay messages from a peer via P2P. */
  async retrieveRelay(targetDid: string, did: string): Promise<RelayMessage[]> {
    try {
      const response = await dialAndExchange<{ did: string }, RelayMessage[]>(
        this.node,
        targetDid,
        MAIP_PROTOCOL_IDS.RELAY_RETRIEVE,
        { did }
      );
      return response.ok ? (response.data ?? []) : [];
    } catch (err) {
      console.error(`[p2p-transport] Failed to retrieve relay from ${targetDid}:`, err);
      return [];
    }
  }
}
