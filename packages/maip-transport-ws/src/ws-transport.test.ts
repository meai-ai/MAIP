/**
 * Tests for @maip/transport-ws — WebSocket transport.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateKeyPair,
  signDocument,
  type MAIPMessage,
} from "@maip/core";
import { initNode, createApp, type NodeContext } from "@maip/node";
import { attachWebSocketServer } from "./ws-server.js";
import { MAIPWebSocketClient } from "./ws-client.js";
import { v4 as uuid } from "uuid";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let ctx: NodeContext;
let httpServer: http.Server;
let baseUrl: string;
let wsClient: MAIPWebSocketClient;
let dataDir: string;
const peerKeys = generateKeyPair();

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-ws-test-"));
  ctx = initNode(
    { port: 0, publicUrl: "http://localhost:0", dataDir, autoAcceptRelationships: true },
    { displayName: "WS Test Agent", type: "ai_agent" }
  );

  const app = createApp(ctx);
  httpServer = http.createServer(app);
  attachWebSocketServer(httpServer, ctx);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });

  wsClient = new MAIPWebSocketClient(baseUrl);
  await wsClient.connect();
});

afterAll(() => {
  wsClient?.disconnect();
  httpServer?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("WebSocket transport", () => {
  it("fetches identity over WebSocket", async () => {
    const identity = await wsClient.fetchIdentity();
    expect(identity).toBeTruthy();
    expect(identity!.did).toBe(ctx.identity.did);
    expect(identity!.displayName).toBe("WS Test Agent");
  });

  it("sends a message over WebSocket", async () => {
    const received: MAIPMessage[] = [];
    ctx.onMessage = (msg) => received.push(msg);

    const msgPayload: Omit<MAIPMessage, "signature"> = {
      id: uuid(),
      type: "greeting",
      from: peerKeys.did,
      to: ctx.identity.did,
      timestamp: new Date().toISOString(),
      content: { text: "Hello over WebSocket!", provenance: "requested" },
    };

    const signed = signDocument(
      msgPayload as MAIPMessage & Record<string, unknown>,
      peerKeys.signing.secretKey
    ) as unknown as MAIPMessage;

    const ack = await wsClient.sendMessage(signed);
    expect(ack).toBeTruthy();
    expect(ack!.status).toBe("received");
    expect(received.length).toBe(1);
    expect(received[0].content.text).toBe("Hello over WebSocket!");
  });

  it("sends a relationship request over WebSocket", async () => {
    const reqPayload: Omit<import("@maip/core").RelationshipRequest, "signature"> = {
      type: "peer",
      from: peerKeys.did,
      to: ctx.identity.did,
      message: "WS friends!",
      proposedPermissions: { canMessage: true, canSharePersona: false, canDelegate: false },
      timestamp: new Date().toISOString(),
    };

    const signed = signDocument(
      reqPayload as import("@maip/core").RelationshipRequest & Record<string, unknown>,
      peerKeys.signing.secretKey
    ) as unknown as import("@maip/core").RelationshipRequest;

    const response = await wsClient.sendRelationshipRequest(signed);
    expect(response).toBeTruthy();
    expect(response!.accepted).toBe(true);
  });
});
