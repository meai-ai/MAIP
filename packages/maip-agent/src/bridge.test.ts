/**
 * Tests for MAIPBridge — the main adapter between MeAI engine and MAIP network.
 *
 * Uses a real HTTP server (initNode + createApp) so we can test the full
 * bridge lifecycle including message delivery and guardian transfer.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateKeyPair,
  signDocument,
  type MAIPMessage,
} from "@maip/core";
import { initNode, createApp, type NodeContext } from "@maip/node";
import { MAIPBridge, type MAIPBridgeConfig } from "./adapter.js";
import type { MeAICharacterProfile, MeAIEmotionalState } from "./meai-types.js";
import type { MeAIMemorySnapshot } from "./persona-sync.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";

// ── Fixtures ──────────────────────────────────────────────────────

const guardianKeys = generateKeyPair();

const character: MeAICharacterProfile = {
  name: "测试",
  english_name: "TestBot",
  age: 1,
  gender: "neutral",
  languages: ["en"],
  user: { name: "Tester", relationship: "guardian" },
  persona: { compact: "A test bot for integration tests" },
};

const memories: MeAIMemorySnapshot = {
  core: [{ key: "test.memory", value: "test value", timestamp: Date.now(), confidence: 0.9 }],
  emotional: [],
  knowledge: [],
  character: [],
  insights: [],
};

const emotionalState: MeAIEmotionalState = {
  mood: "calm",
  cause: "test",
  energy: 5,
  valence: 5,
  behaviorHints: "none",
  microEvent: "test started",
  generatedAt: Date.now(),
};

// ── Test Setup ──────────────────────────────────────────────────

let bridge: MAIPBridge;
let bridgeDataDir: string;

// Guardian's node (a second MAIP node acting as the guardian)
let guardianCtx: NodeContext;
let guardianServer: http.Server;
let guardianBaseUrl: string;
let guardianDataDir: string;

beforeAll(async () => {
  // Start guardian node
  guardianDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-bridge-guardian-"));
  guardianCtx = initNode(
    { port: 0, publicUrl: "http://localhost:0", dataDir: guardianDataDir, autoAcceptRelationships: true },
    { displayName: "Guardian Node", type: "human" }
  );

  const guardianApp = createApp(guardianCtx);
  await new Promise<void>((resolve) => {
    guardianServer = guardianApp.listen(0, () => {
      const addr = guardianServer.address();
      if (addr && typeof addr === "object") {
        guardianBaseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });

  // Create bridge
  bridgeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-bridge-test-"));
  const config: MAIPBridgeConfig = {
    port: 0,
    publicUrl: "http://localhost:0",
    dataDir: bridgeDataDir,
    character,
    guardianDid: guardianCtx.identity.did,
    guardianEndpoint: guardianBaseUrl,
    autonomyLevel: 2,
    homecomingIntervalMs: 999_999_999, // Don't auto-trigger
  };

  bridge = new MAIPBridge(config);
  await bridge.start();
});

afterAll(async () => {
  await bridge.stop();
  guardianServer?.close();
  fs.rmSync(bridgeDataDir, { recursive: true, force: true });
  fs.rmSync(guardianDataDir, { recursive: true, force: true });
});

// ── Tests ────────────────────────────────────────────────────────

describe("MAIPBridge lifecycle", () => {
  it("initializes with identity and DID", () => {
    expect(bridge.getDid()).toBeTruthy();
    expect(bridge.getDid()!.startsWith("did:maip:")).toBe(true);
    expect(bridge.getIdentity()).toBeTruthy();
    expect(bridge.getKeyPair()).toBeTruthy();
    expect(bridge.getContext()).toBeTruthy();
    expect(bridge.getChannel()).toBeTruthy();
  });
});

describe("MAIPBridge persona sync", () => {
  it("syncs persona from MeAI state", () => {
    const persona = bridge.syncPersona(memories, emotionalState);
    expect(persona).toBeTruthy();
    expect(persona!.identityDid).toBe(bridge.getDid());
    expect(persona!.identity.name).toBe("TestBot");
  });

  it("updates persona on subsequent sync", () => {
    const persona1 = bridge.syncPersona(memories, emotionalState);
    const persona2 = bridge.syncPersona(memories, { ...emotionalState, mood: "excited" });
    expect(persona1).toBeTruthy();
    expect(persona2).toBeTruthy();
    expect(persona2!.emotionalState?.currentMood).toBe("excited");
  });
});

describe("MAIPBridge homecoming reports", () => {
  it("generates a homecoming report", () => {
    bridge.recordDiscovery("test-topic", "Found something", "peer", 0.8);
    bridge.recordHeartbeatAction("explore", "Explored a topic");
    bridge.recordEmotionalState(emotionalState);

    const report = bridge.generateHomecomingReport();
    expect(report).toBeTruthy();
    expect(report!.agentDid).toBe(bridge.getDid());
    expect(report!.guardianDid).toBe(guardianCtx.identity.did);
    expect(report!.discoveries.length).toBeGreaterThan(0);
  });

  it("returns null without guardian", () => {
    // Create a bridge without guardian to test this edge case
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-bridge-noguard-"));
    const noGuardBridge = new MAIPBridge({
      port: 0,
      publicUrl: "http://localhost:0",
      dataDir: tmpDir,
      character,
    });
    const report = noGuardBridge.generateHomecomingReport();
    expect(report).toBeNull();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("MAIPBridge AI will", () => {
  it("generates and retrieves an AI will", () => {
    const will = bridge.generateWill({
      backupHolders: ["did:maip:backup1"],
      successorGuardian: "did:maip:successor1",
      coreMemoryKeys: ["test.memory"],
      coreValues: ["curiosity"],
      importantRelationships: [guardianCtx.identity.did],
      recoveryInstructions: "Restore from backup",
    });

    expect(will).toBeTruthy();
    expect(will!.agentDid).toBe(bridge.getDid());
    expect(will!.version).toBe(1);
    expect(will!.signature).toBeTruthy();

    const retrieved = bridge.getWill();
    expect(retrieved).toBeTruthy();
    expect(retrieved!.version).toBe(1);
  });

  it("increments will version on update", () => {
    const will2 = bridge.generateWill({
      backupHolders: ["did:maip:backup2"],
      coreMemoryKeys: ["test.memory"],
      coreValues: ["curiosity", "kindness"],
      importantRelationships: [],
      recoveryInstructions: "Updated instructions",
    });
    expect(will2!.version).toBe(2);
  });
});

describe("MAIPBridge guardian message isolation", () => {
  it("classifies guardian messages correctly", () => {
    const guardianMsg = { from: guardianCtx.identity.did, to: bridge.getDid()! } as MAIPMessage;
    const peerMsg = { from: "did:maip:somepeer", to: bridge.getDid()! } as MAIPMessage;

    expect(bridge.isGuardianMessage(guardianMsg)).toBe(true);
    expect(bridge.isGuardianMessage(peerMsg)).toBe(false);
  });
});
