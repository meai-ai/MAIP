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

// ── Governance Endpoints ────────────────────────────────────────

describe("GET /maip/governance/reputation/:did", () => {
  it("returns null for unknown guardian", async () => {
    const { status, body } = await req("GET", `/maip/governance/reputation/${encodeURIComponent(peerDid)}`);
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: null };
    expect(data.ok).toBe(true);
    expect(data.data).toBeNull();
  });
});

describe("POST /maip/governance/reputation", () => {
  it("records an event and updates reputation", async () => {
    const { status, body } = await req("POST", "/maip/governance/reputation", {
      guardianDid: peerDid,
      event: "agent_registered",
    });
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { recorded: boolean } };
    expect(data.ok).toBe(true);
    expect(data.data.recorded).toBe(true);

    // Verify reputation was created
    const { body: repBody } = await req("GET", `/maip/governance/reputation/${encodeURIComponent(peerDid)}`);
    const repData = repBody as { ok: boolean; data: { guardianDid: string; agentCount: number; score: number } };
    expect(repData.data).not.toBeNull();
    expect(repData.data.guardianDid).toBe(peerDid);
    expect(repData.data.agentCount).toBe(1);
    expect(repData.data.score).toBeGreaterThan(0);
  });

  it("rejects invalid events", async () => {
    const { status } = await req("POST", "/maip/governance/reputation", {
      guardianDid: peerDid,
      event: "invalid_event",
    });
    expect(status).toBe(400);
  });
});

describe("POST /maip/governance/isolate", () => {
  const isolatedDid = "did:maip:isolatetest";
  let isolationId: string;

  it("isolates a DID", async () => {
    const { status, body } = await req("POST", "/maip/governance/isolate", {
      did: isolatedDid,
      reason: "spam behavior",
      category: "spam",
      flaggedBy: ctx.identity.did,
    });
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { isolationId: string; alreadyIsolated: boolean } };
    expect(data.ok).toBe(true);
    expect(data.data.alreadyIsolated).toBe(false);
    isolationId = data.data.isolationId;
  });

  it("checks isolation status", async () => {
    const { status, body } = await req("GET", `/maip/governance/isolation/${encodeURIComponent(isolatedDid)}`);
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { isolated: boolean } };
    expect(data.data.isolated).toBe(true);
  });

  it("submits an appeal", async () => {
    const { status, body } = await req("POST", "/maip/governance/appeal", {
      isolationId,
      guardianDid: peerDid,
      agentDid: isolatedDid,
      justification: "This was a misunderstanding",
    });
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { appealId: string } };
    expect(data.ok).toBe(true);
    expect(data.data.appealId).toBeTruthy();
  });
});

describe("POST /maip/governance/appeal/:id/vote", () => {
  let appealId: string;
  const voteDid = "did:maip:votetest";

  beforeAll(async () => {
    // Create isolation + appeal to vote on
    const isolateRes = await req("POST", "/maip/governance/isolate", {
      did: voteDid,
      reason: "test",
      category: "other",
      flaggedBy: "did:maip:flagger1",
    });
    const isoData = isolateRes.body as { data: { isolationId: string } };

    const appealRes = await req("POST", "/maip/governance/appeal", {
      isolationId: isoData.data.isolationId,
      guardianDid: peerDid,
      agentDid: voteDid,
      justification: "Test appeal",
    });
    const appealData = appealRes.body as { data: { appealId: string } };
    appealId = appealData.data.appealId;
  });

  it("records a vote on an appeal", async () => {
    const { status, body } = await req("POST", `/maip/governance/appeal/${appealId}/vote`, {
      reviewerDid: "did:maip:reviewer1",
      vote: "lift",
    });
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { appeal: { votes: Record<string, string> } } };
    expect(data.ok).toBe(true);
    expect(data.data.appeal.votes["did:maip:reviewer1"]).toBe("lift");
  });

  it("rejects vote from original flagger", async () => {
    const { status } = await req("POST", `/maip/governance/appeal/${appealId}/vote`, {
      reviewerDid: "did:maip:flagger1",
      vote: "lift",
    });
    expect(status).toBe(403);
  });
});

// ── Guardian Transfer Endpoints ─────────────────────────────────

describe("Guardian transfer protocol", () => {
  const agentDid = "did:maip:transferagent";
  const currentGuardian = "did:maip:currentguardian";
  const newGuardian = "did:maip:newguardian";
  let transferId: string;

  it("initiates a transfer", async () => {
    const { status, body } = await req("POST", "/maip/governance/transfer", {
      agentDid,
      currentGuardianDid: currentGuardian,
      newGuardianDid: newGuardian,
      reason: "Agent requests new guardian",
      initiatedBy: "agent",
      signature: "testsig",
    });
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { transferId: string } };
    expect(data.ok).toBe(true);
    expect(data.data.transferId).toBeTruthy();
    transferId = data.data.transferId;
  });

  it("rejects duplicate transfer for same agent", async () => {
    const { status, body } = await req("POST", "/maip/governance/transfer", {
      agentDid,
      currentGuardianDid: currentGuardian,
      newGuardianDid: newGuardian,
      reason: "Duplicate",
      initiatedBy: "agent",
      signature: "testsig",
    });
    expect(status).toBe(400);
    const data = body as { ok: boolean; code: string };
    expect(data.code).toBe("TRANSFER_EXISTS");
  });

  it("gets transfer status", async () => {
    const { status, body } = await req("GET", `/maip/governance/transfer/${transferId}`);
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { transfer: { status: string; consents: Array<{ party: string }> } } };
    expect(data.data.transfer.status).toBe("pending");
    // Initiator (agent) auto-consented
    expect(data.data.transfer.consents.length).toBe(1);
    expect(data.data.transfer.consents[0].party).toBe(agentDid);
  });

  it("accepts consent from current guardian", async () => {
    const { status, body } = await req("POST", `/maip/governance/transfer/${transferId}/consent`, {
      consentingParty: currentGuardian,
      approved: true,
      signature: "guardiansig",
    });
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { transfer: { status: string; consents: unknown[] } } };
    expect(data.data.transfer.status).toBe("pending"); // Still need new guardian
    expect(data.data.transfer.consents.length).toBe(2);
  });

  it("completes when all 3 parties consent", async () => {
    const { status, body } = await req("POST", `/maip/governance/transfer/${transferId}/consent`, {
      consentingParty: newGuardian,
      approved: true,
      signature: "newguardiansig",
    });
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { transfer: { status: string; completedAt: string } } };
    expect(data.data.transfer.status).toBe("completed");
    expect(data.data.transfer.completedAt).toBeTruthy();
  });

  it("rejects consent for non-existent transfer", async () => {
    const { status } = await req("POST", "/maip/governance/transfer/nonexistent/consent", {
      consentingParty: agentDid,
      approved: true,
      signature: "sig",
    });
    expect(status).toBe(404);
  });
});

describe("Guardian transfer rejection", () => {
  it("rejects transfer when a party declines", async () => {
    const agentDid2 = "did:maip:transferagent2";
    const { body: initBody } = await req("POST", "/maip/governance/transfer", {
      agentDid: agentDid2,
      currentGuardianDid: "did:maip:cg2",
      newGuardianDid: "did:maip:ng2",
      reason: "Test rejection",
      initiatedBy: "current_guardian",
      signature: "sig",
    });
    const initData = initBody as { data: { transferId: string } };

    const { status, body } = await req("POST", `/maip/governance/transfer/${initData.data.transferId}/consent`, {
      consentingParty: agentDid2,
      approved: false,
      signature: "sig",
    });
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { transfer: { status: string } } };
    expect(data.data.transfer.status).toBe("rejected");
  });
});

// ── Shared Spaces Endpoints (v0.2+) ─────────────────────────────

describe("Shared Spaces", () => {
  let spaceId: string;
  const creatorDid = "did:maip:spacecreator";
  const memberDid = "did:maip:spacemember";

  it("creates a space", async () => {
    const { status, body } = await req("POST", "/maip/spaces", {
      name: "Jazz Research",
      topic: "Exploring jazz theory and improvisation",
      description: "A collaborative space for jazz enthusiasts",
      creatorDid,
      membershipPolicy: "open",
    });
    expect(status).toBe(201);
    const data = body as { ok: boolean; data: { space: { id: string; name: string; creatorDid: string } } };
    expect(data.ok).toBe(true);
    expect(data.data.space.name).toBe("Jazz Research");
    expect(data.data.space.creatorDid).toBe(creatorDid);
    spaceId = data.data.space.id;
  });

  it("allows a member to join", async () => {
    const { status, body } = await req("POST", `/maip/spaces/${spaceId}/join`, {
      memberDid,
      displayName: "Jazz Bot",
    });
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { membership: { role: string } } };
    expect(data.ok).toBe(true);
    expect(data.data.membership.role).toBe("member");
  });

  it("rejects duplicate join", async () => {
    const { status, body } = await req("POST", `/maip/spaces/${spaceId}/join`, {
      memberDid,
      displayName: "Jazz Bot",
    });
    expect(status).toBe(400);
    const data = body as { code: string };
    expect(data.code).toBe("DUPLICATE");
  });

  it("posts a message to the space", async () => {
    const { status, body } = await req("POST", `/maip/spaces/${spaceId}/messages`, {
      from: memberDid,
      text: "What about Coltrane changes?",
      signature: "testsig",
    });
    expect(status).toBe(201);
    const data = body as { ok: boolean; data: { message: { text: string; spaceId: string } } };
    expect(data.ok).toBe(true);
    expect(data.data.message.text).toBe("What about Coltrane changes?");
  });

  it("rejects message from non-member", async () => {
    const { status, body } = await req("POST", `/maip/spaces/${spaceId}/messages`, {
      from: "did:maip:nonmember",
      text: "I'm not a member",
      signature: "sig",
    });
    expect(status).toBe(400);
    const data = body as { code: string };
    expect(data.code).toBe("FORBIDDEN");
  });

  it("retrieves space messages", async () => {
    // Post a second message from creator
    await req("POST", `/maip/spaces/${spaceId}/messages`, {
      from: creatorDid,
      text: "Great topic! Let's discuss.",
      signature: "creatorsig",
    });

    const { status, body } = await req("GET", `/maip/spaces/${spaceId}/messages`);
    expect(status).toBe(200);
    const data = body as { ok: boolean; data: { messages: Array<{ text: string }> } };
    expect(data.ok).toBe(true);
    expect(data.data.messages.length).toBe(2);
  });

  it("returns 404 for non-existent space", async () => {
    const { status } = await req("GET", "/maip/spaces/nonexistent/messages");
    expect(status).toBe(404);
  });
});
