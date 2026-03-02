/**
 * MAIP WebSocket server — runs alongside Express for browser-friendly transport.
 *
 * Wire format: same length-prefixed JSON as P2P transport:
 *   [4-byte uint32 BE length][JSON UTF-8 payload]
 *
 * Clients connect to ws://host:port/maip and send MAIP requests.
 * Each WebSocket message is a complete request-response exchange.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "node:http";
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

/** A MAIP WebSocket request envelope. */
interface WSRequest {
  /** The MAIP operation to perform. */
  action: "message" | "relationship" | "persona" | "identity" | "discover" | "relay_store" | "relay_retrieve";
  /** The request payload (varies by action). */
  payload: unknown;
  /** Optional request ID for correlating responses. */
  requestId?: string;
}

/** A MAIP WebSocket response envelope. */
interface WSResponse {
  /** Echoed request ID (if provided). */
  requestId?: string;
  /** Standard MAIP response. */
  ok: boolean;
  data?: unknown;
  error?: string;
  code?: string;
}

const MAX_MESSAGE_SIZE = 1024 * 1024; // 1 MB

/**
 * Attach a MAIP WebSocket server to an existing HTTP server.
 *
 * The WS server listens on the `/maip` path, keeping it separate from
 * other potential WebSocket endpoints on the same server.
 */
export function attachWebSocketServer(
  httpServer: HttpServer,
  ctx: NodeContext
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/maip" });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      handleWSMessage(ws, ctx, raw);
    });
  });

  return wss;
}

function handleWSMessage(ws: WebSocket, ctx: NodeContext, raw: Buffer | ArrayBuffer | Buffer[]): void {
  try {
    // Parse the incoming message
    const data = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);

    if (data.length > MAX_MESSAGE_SIZE) {
      sendResponse(ws, { ok: false, error: "Message too large", code: "PAYLOAD_TOO_LARGE" });
      return;
    }

    const request: WSRequest = JSON.parse(data.toString("utf-8"));
    if (!request.action) {
      sendResponse(ws, { ok: false, error: "Missing action field", code: "INVALID_FORMAT", requestId: request.requestId });
      return;
    }

    const result = routeAction(ctx, request.action, request.payload);
    sendResponse(ws, { ...result, requestId: request.requestId });
  } catch (err) {
    sendResponse(ws, {
      ok: false,
      error: err instanceof Error ? err.message : "Internal error",
      code: "INTERNAL_ERROR",
    });
  }
}

function routeAction(
  ctx: NodeContext,
  action: string,
  payload: unknown
): { ok: boolean; data?: unknown; error?: string; code?: string } {
  switch (action) {
    case "message":
      return processIncomingMessage(ctx, payload);
    case "relationship":
      return processRelationshipRequest(ctx, payload);
    case "persona": {
      const p = payload as { requesterDid?: string } | undefined;
      return processPersonaRequest(ctx, p?.requesterDid);
    }
    case "identity":
      return processIdentityRequest(ctx);
    case "discover":
      return processDiscoveryQuery(ctx, payload as Parameters<typeof processDiscoveryQuery>[1]);
    case "relay_store":
      return processRelayStore(ctx, payload);
    case "relay_retrieve": {
      const r = payload as { did: string; senderDid?: string };
      return processRelayRetrieve(ctx, { did: r.did, senderDid: r.senderDid });
    }
    default:
      return { ok: false, error: `Unknown action: ${action}`, code: "UNKNOWN_ACTION" };
  }
}

function sendResponse(ws: WebSocket, response: WSResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}
