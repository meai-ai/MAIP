/**
 * P2P integration tests — two real libp2p nodes exchanging MAIP messages.
 *
 * These tests spin up actual libp2p nodes, connect them, and verify
 * protocol-level message exchange. Longer timeouts are needed since
 * libp2p startup involves crypto key derivation and transport setup.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateKeyPair,
  signDocument,
  type MAIPMessage,
  type MAIPKeyPair,
} from "@maip/core";
import { initNode, type NodeContext } from "@maip/node";
import { createMAIPP2PNode } from "./p2p-node.js";
import { registerP2PHandlers } from "./p2p-handlers.js";
import { Libp2pTransport } from "./p2p-transport.js";
import type { Libp2p } from "libp2p";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { v4 as uuid } from "uuid";

// Increase timeout for libp2p startup
const TIMEOUT = 30_000;

let nodeA: Libp2p;
let nodeB: Libp2p;
let ctxA: NodeContext;
let ctxB: NodeContext;
let transportA: Libp2pTransport;
let dataDirA: string;
let dataDirB: string;
let keyPairA: MAIPKeyPair;
let keyPairB: MAIPKeyPair;

beforeAll(async () => {
  keyPairA = generateKeyPair();
  keyPairB = generateKeyPair();

  dataDirA = fs.mkdtempSync(path.join(os.tmpdir(), "maip-p2p-a-"));
  dataDirB = fs.mkdtempSync(path.join(os.tmpdir(), "maip-p2p-b-"));

  // Initialize node contexts
  ctxA = initNode(
    { port: 0, publicUrl: "http://localhost:0", dataDir: dataDirA, autoAcceptRelationships: true },
    { displayName: "Node A", type: "ai_agent" }
  );
  ctxB = initNode(
    { port: 0, publicUrl: "http://localhost:0", dataDir: dataDirB, autoAcceptRelationships: true },
    { displayName: "Node B", type: "ai_agent" }
  );

  // Create libp2p nodes (use random ports)
  nodeA = await createMAIPP2PNode({ keyPair: ctxA.keyPair, tcpPort: 0, wsPort: 0 });
  nodeB = await createMAIPP2PNode({ keyPair: ctxB.keyPair, tcpPort: 0, wsPort: 0 });

  // Register protocol handlers
  registerP2PHandlers(nodeA, ctxA);
  registerP2PHandlers(nodeB, ctxB);

  // Start nodes
  await nodeA.start();
  await nodeB.start();

  // Connect A → B directly by multiaddr
  const addrsB = nodeB.getMultiaddrs();
  expect(addrsB.length).toBeGreaterThan(0);
  await nodeA.dial(addrsB[0]);

  transportA = new Libp2pTransport(nodeA);
}, TIMEOUT);

afterAll(async () => {
  await nodeA?.stop();
  await nodeB?.stop();
  fs.rmSync(dataDirA, { recursive: true, force: true });
  fs.rmSync(dataDirB, { recursive: true, force: true });
}, TIMEOUT);

describe("P2P message exchange", () => {
  it("sends a message from A to B", async () => {
    // Track received messages on B
    const received: MAIPMessage[] = [];
    ctxB.onMessage = (msg) => received.push(msg);

    const msgPayload: Omit<MAIPMessage, "signature"> = {
      id: uuid(),
      type: "greeting",
      from: ctxA.identity.did,
      to: ctxB.identity.did,
      timestamp: new Date().toISOString(),
      content: {
        text: "Hello from Node A over P2P!",
        provenance: "autonomous_exploration",
      },
    };

    const signed = signDocument(
      msgPayload as MAIPMessage & Record<string, unknown>,
      ctxA.keyPair.signing.secretKey
    ) as unknown as MAIPMessage;

    const ack = await transportA.sendMessage(ctxB.identity.did, signed);
    expect(ack).toBeTruthy();
    expect(ack!.status).toBe("received");

    // B should have received the message via its handler
    expect(received.length).toBe(1);
    expect(received[0].content.text).toBe("Hello from Node A over P2P!");
  }, TIMEOUT);

  it("fetches identity from B via P2P", async () => {
    const identity = await transportA.fetchIdentity(ctxB.identity.did);
    expect(identity).toBeTruthy();
    expect(identity!.did).toBe(ctxB.identity.did);
    expect(identity!.displayName).toBe("Node B");
  }, TIMEOUT);

  it("fetches persona from B via P2P (returns null when no persona set)", async () => {
    const persona = await transportA.fetchPersona(ctxB.identity.did, ctxA.identity.did);
    // B has no persona set, so should get null
    expect(persona).toBeNull();
  }, TIMEOUT);

  it("sends a relationship request from A to B", async () => {
    const reqPayload: Omit<import("@maip/core").RelationshipRequest, "signature"> = {
      type: "peer",
      from: ctxA.identity.did,
      to: ctxB.identity.did,
      message: "Let's be P2P friends!",
      proposedPermissions: { canMessage: true, canSharePersona: true, canDelegate: false },
      timestamp: new Date().toISOString(),
    };

    const signed = signDocument(
      reqPayload as import("@maip/core").RelationshipRequest & Record<string, unknown>,
      ctxA.keyPair.signing.secretKey
    ) as unknown as import("@maip/core").RelationshipRequest;

    const response = await transportA.sendRelationshipRequest(ctxB.identity.did, signed);
    expect(response).toBeTruthy();
    expect(response!.accepted).toBe(true);
  }, TIMEOUT);
});

describe("P2P node multiaddrs", () => {
  it("both nodes have listening multiaddrs", () => {
    const addrsA = nodeA.getMultiaddrs();
    const addrsB = nodeB.getMultiaddrs();
    expect(addrsA.length).toBeGreaterThan(0);
    expect(addrsB.length).toBeGreaterThan(0);
  });
});
