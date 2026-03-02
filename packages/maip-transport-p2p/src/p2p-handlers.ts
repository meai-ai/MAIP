/**
 * Register inbound libp2p protocol handlers.
 *
 * Maps each MAIP protocol ID to the corresponding transport-agnostic core
 * handler function. Reads the request from the stream, processes it, and
 * writes the response back.
 */

import type { Libp2p } from "libp2p";
import type { Stream, Connection } from "@libp2p/interface";
import type { NodeContext } from "@maip/node";
import {
  processIncomingMessage,
  processRelationshipRequest,
  processPersonaRequest,
  processIdentityRequest,
  processDiscoveryQuery,
  processRelayStore,
  processRelayRetrieve,
} from "@maip/node";
import { readLengthPrefixed, writeLengthPrefixed } from "./stream-utils.js";
import { peerIdToDid } from "./identity-bridge.js";
import { MAIP_PROTOCOL_IDS } from "./index.js";

/**
 * Generic handler wrapper: read request -> process -> write response.
 */
async function handleStream<Req, Res>(
  stream: Stream,
  processor: (body: Req) => { ok: boolean; data?: Res; error?: string; code?: string }
): Promise<void> {
  try {
    const request = await readLengthPrefixed<Req>(stream);
    const result = processor(request);
    await writeLengthPrefixed(stream, result);
  } catch (err) {
    try {
      await writeLengthPrefixed(stream, {
        ok: false,
        error: err instanceof Error ? err.message : "Internal error",
        code: "INTERNAL_ERROR",
      });
    } catch {
      // Stream already closed
    }
  }
}

/**
 * Start a P2P node, register all MAIP protocol handlers, and update the
 * node context with the real listening multiaddr.
 */
export async function startP2PNode(node: Libp2p, ctx: NodeContext): Promise<void> {
  registerP2PHandlers(node, ctx);
  await node.start();

  // Update identity endpoints with real multiaddr (replaces placeholder)
  const addrs = node.getMultiaddrs();
  if (addrs.length > 0) {
    ctx.identity.endpoints.p2p = addrs[0].toString();
  }
}

/**
 * Register all MAIP protocol handlers on a libp2p node.
 *
 * In libp2p v3, node.handle() takes (stream, connection) as positional args.
 */
export function registerP2PHandlers(node: Libp2p, ctx: NodeContext): void {
  // Messages
  node.handle(MAIP_PROTOCOL_IDS.MESSAGES, (stream: Stream) => {
    handleStream(stream, (body) => processIncomingMessage(ctx, body));
  });

  // Relationships
  node.handle(MAIP_PROTOCOL_IDS.RELATIONSHIPS, (stream: Stream) => {
    handleStream(stream, (body) => processRelationshipRequest(ctx, body));
  });

  // Persona
  node.handle(MAIP_PROTOCOL_IDS.PERSONA, (stream: Stream, connection: Connection) => {
    handleStream(stream, (body: { requesterDid?: string }) => {
      // Try to get sender DID from request body or derive from PeerId
      let senderDid = body?.requesterDid;
      if (!senderDid && connection.remotePeer) {
        try {
          senderDid = peerIdToDid(connection.remotePeer);
        } catch {
          // Could not derive DID from PeerId
        }
      }
      return processPersonaRequest(ctx, senderDid);
    });
  });

  // Identity
  node.handle(MAIP_PROTOCOL_IDS.IDENTITY, (stream: Stream) => {
    handleStream(stream, () => processIdentityRequest(ctx));
  });

  // Discovery
  node.handle(MAIP_PROTOCOL_IDS.DISCOVERY, (stream: Stream) => {
    handleStream(stream, (body) => processDiscoveryQuery(ctx, body as Parameters<typeof processDiscoveryQuery>[1]));
  });

  // Relay store
  node.handle(MAIP_PROTOCOL_IDS.RELAY, (stream: Stream) => {
    handleStream(stream, (body) => processRelayStore(ctx, body));
  });

  // Relay retrieve
  node.handle(MAIP_PROTOCOL_IDS.RELAY_RETRIEVE, (stream: Stream, connection: Connection) => {
    handleStream(stream, (body: { did: string }) => {
      let senderDid: string | undefined;
      if (connection.remotePeer) {
        try {
          senderDid = peerIdToDid(connection.remotePeer);
        } catch {
          // Could not derive DID from PeerId
        }
      }
      return processRelayRetrieve(ctx, { did: body.did, senderDid });
    });
  });
}
