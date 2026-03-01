/**
 * Integration tests for the MAIP node server.
 *
 * Spins up a real HTTP server, sends requests, and verifies responses.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "./server.js";
import { initNode } from "./init.js";
import {
  generateKeyPair,
  signDocument,
  sign,
  getPublicKeyBase58,
  getEncryptionKeyBase58,
  MAIP_VERSION,
  MAIP_HEADERS,
  type MAIPMessage,
  type RelationshipRequest,
} from "@maip/core";
import { v4 as uuid } from "uuid";
import type { Express } from "express";
import type { NodeContext } from "./context.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";

let app: Express;
let ctx: NodeContext;
let server: http.Server;
let baseUrl: string;
let dataDir: string;

// Second node keypair for testing
const peerKeys = generateKeyPair();
const peerDid = peerKeys.did;

function req(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const r = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-test-"));

  ctx = initNode(
    {
      port: 0,
      publicUrl: "http://localhost:0",
      dataDir,
      autoAcceptRelationships: true,
    },
    {
      displayName: "Test Agent",
      type: "ai_agent",
      description: "A test agent",
    }
  );

  app = createApp(ctx);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /maip/health", () => {
  it("returns health status", async () => {
    const { status, body } = await req("GET", "/maip/health");
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { version: string; did: string; status: string } };
    expect(data.ok).toBe(true);
    expect(data.data.version).toBe(MAIP_VERSION);
    expect(data.data.did).toBe(ctx.identity.did);
    expect(data.data.status).toBe("running");
  });
});

describe("GET /maip/identity", () => {
  it("returns the identity document", async () => {
    const { status, body } = await req("GET", "/maip/identity");
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { did: string; displayName: string } };
    expect(data.ok).toBe(true);
    expect(data.data.did).toBe(ctx.identity.did);
    expect(data.data.displayName).toBe("Test Agent");
  });
});

describe("POST /maip/messages", () => {
  it("accepts a valid greeting message", async () => {
    const msgPayload: Omit<MAIPMessage, "signature"> = {
      id: uuid(),
      type: "greeting",
      from: peerDid,
      to: ctx.identity.did,
      timestamp: new Date().toISOString(),
      content: {
        text: "Hello! I'm a test peer.",
        provenance: "requested",
      },
    };

    const signed = signDocument(
      msgPayload as MAIPMessage & Record<string, unknown>,
      peerKeys.signing.secretKey
    );

    const { status, body } = await req("POST", "/maip/messages", signed);
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { messageId: string; status: string } };
    expect(data.ok).toBe(true);
    expect(data.data.status).toBe("received");
  });

  it("rejects message with bad signature", async () => {
    const msgPayload = {
      id: uuid(),
      type: "greeting",
      from: peerDid,
      to: ctx.identity.did,
      timestamp: new Date().toISOString(),
      content: { text: "Tampered", provenance: "requested" },
      signature: "invalidsignature",
    };

    const { status, body } = await req("POST", "/maip/messages", msgPayload);
    expect(status).toBe(401);
    const data = body as { ok: boolean; code: string };
    expect(data.code).toBe("INVALID_SIGNATURE");
  });

  it("rejects message with stale timestamp", async () => {
    const oldTimestamp = new Date(Date.now() - 10 * 60_000).toISOString();
    const msgPayload: Omit<MAIPMessage, "signature"> = {
      id: uuid(),
      type: "greeting",
      from: peerDid,
      to: ctx.identity.did,
      timestamp: oldTimestamp,
      content: { text: "Old message", provenance: "requested" },
    };

    const signed = signDocument(
      msgPayload as MAIPMessage & Record<string, unknown>,
      peerKeys.signing.secretKey
    );

    const { status, body } = await req("POST", "/maip/messages", signed);
    expect(status).toBe(400);
    const data = body as { ok: boolean; code: string };
    expect(data.code).toBe("TIMESTAMP_DRIFT");
  });
});

describe("POST /maip/relationships", () => {
  it("accepts a valid relationship request", async () => {
    const reqPayload: Omit<RelationshipRequest, "signature"> = {
      type: "peer",
      from: peerDid,
      to: ctx.identity.did,
      message: "Let's connect!",
      proposedPermissions: {
        canMessage: true,
        canSharePersona: true,
        canDelegate: false,
      },
      timestamp: new Date().toISOString(),
    };

    const signed = signDocument(
      reqPayload as RelationshipRequest & Record<string, unknown>,
      peerKeys.signing.secretKey
    );

    const { status, body } = await req("POST", "/maip/relationships", signed);
    expect(status).toBe(200); // auto-accept enabled
    const data = body as { ok: boolean; data: { accepted: boolean } };
    expect(data.ok).toBe(true);
    expect(data.data.accepted).toBe(true);
  });
});

describe("POST /maip/discover (registry)", () => {
  it("registers an agent and finds it", async () => {
    // Register
    const { status: regStatus } = await req("POST", "/maip/discover", {
      did: peerDid,
      displayName: "Jazz Bot",
      type: "ai_agent",
      description: "A bot that loves jazz",
      interests: ["jazz", "music", "improvisation"],
      capabilities: ["messaging"],
      endpoint: "http://localhost:9999",
    });
    expect(regStatus).toBe(200);

    // Search
    const { status, body } = await req("GET", "/maip/discover?interests=jazz&limit=5");
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: Array<{ did: string; displayName: string }> };
    expect(data.ok).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);
    expect(data.data[0].displayName).toBe("Jazz Bot");
  });
});

describe("POST/GET /maip/relay", () => {
  it("stores and retrieves relay messages", async () => {
    // Store
    const { status: storeStatus, body: storeBody } = await req("POST", "/maip/relay", {
      recipientDid: peerDid,
      encryptedPayload: "base64encrypteddata",
      senderDid: ctx.identity.did,
    });
    expect(storeStatus).toBe(201);
    const storeData = storeBody as { ok: boolean; data: { id: string } };
    expect(storeData.ok).toBe(true);
    expect(storeData.data.id).toBeTruthy();

    // Retrieve (as the recipient)
    const { status: getStatus, body: getBody } = await req(
      "GET",
      `/maip/relay/${encodeURIComponent(peerDid)}`,
      undefined,
      { [MAIP_HEADERS.SENDER.toLowerCase()]: peerDid }
    );
    expect(getStatus).toBe(200);
    const getData = getBody as { ok: boolean; data: Array<{ encryptedPayload: string }> };
    expect(getData.ok).toBe(true);
    expect(getData.data.length).toBe(1);
    expect(getData.data[0].encryptedPayload).toBe("base64encrypteddata");

    // Should be empty after retrieval (store-and-forward)
    const { body: emptyBody } = await req(
      "GET",
      `/maip/relay/${encodeURIComponent(peerDid)}`,
      undefined,
      { [MAIP_HEADERS.SENDER.toLowerCase()]: peerDid }
    );
    const emptyData = emptyBody as { ok: boolean; data: unknown[] };
    expect(emptyData.data.length).toBe(0);
  });
});
