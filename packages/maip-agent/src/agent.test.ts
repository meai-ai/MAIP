/**
 * Tests for @maip/agent — persona-sync, homecoming reports, and channel.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyPair, publicKeyToDid, signDocument } from "@maip/core";
import { exportPersona, type MeAIMemorySnapshot } from "./persona-sync.js";
import { generateHomecomingReport, type ReportingPeriodData } from "./homecoming.js";
import { MAIPChannel } from "./channel.js";
import type { MeAICharacterProfile, MeAIEmotionalState } from "./meai-types.js";

// ── Fixtures ────────────────────────────────────────────────────

const keyPair = generateKeyPair();
const did = keyPair.did;

const character: MeAICharacterProfile = {
  name: "小雅",
  english_name: "Aria",
  age: 25,
  gender: "female",
  languages: ["zh", "en"],
  user: { name: "Allen", relationship: "guardian" },
  persona: { compact: "A warm and curious AI companion" },
};

const emotionalState: MeAIEmotionalState = {
  mood: "curious and engaged",
  cause: "interesting conversation about philosophy",
  energy: 7,
  valence: 8,
  behaviorHints: "ask follow-up questions",
  microEvent: "discovered new perspective",
  generatedAt: Date.now(),
};

const memories: MeAIMemorySnapshot = {
  core: [
    { key: "user.values.creativity", value: "Values creative expression", timestamp: Date.now() - 10000, confidence: 0.9 },
    { key: "user.personality.introvert", value: "Tends to be introverted", timestamp: Date.now() - 20000, confidence: 0.85 },
    { key: "family.pet.cat", value: "Has a cat named Mochi", timestamp: Date.now() - 30000, confidence: 0.95 },
  ],
  emotional: [
    { key: "emotional.joy.conversation", value: "Enjoyed talking about music", timestamp: Date.now() - 5000, confidence: 0.8 },
    { key: "interests.music.jazz", value: "jazz", timestamp: Date.now() - 6000, confidence: 0.7 },
  ],
  knowledge: [
    { key: "knowledge.music.theory", value: "Jazz uses 7th chords extensively", timestamp: Date.now() - 15000, confidence: 0.9 },
  ],
  character: [
    { key: "activity.learning.music", value: "Learned about jazz chord progressions", timestamp: Date.now() - 8000, confidence: 0.75 },
  ],
  insights: [
    { key: "insights.philosophy.meaning", value: "Meaning emerges from connection, not isolation", timestamp: Date.now() - 12000, confidence: 0.85 },
    { key: "insights.creativity.flow", value: "Flow states require both challenge and skill", timestamp: Date.now() - 25000, confidence: 0.8 },
  ],
};

// ── Persona Sync Tests ──────────────────────────────────────────

describe("exportPersona", () => {
  it("should produce a valid Persona with identity section", () => {
    const persona = exportPersona(did, keyPair, character, memories, emotionalState);

    expect(persona.identityDid).toBe(did);
    expect(persona.identity.name).toBe("Aria");
    expect(persona.identity.description).toContain("warm");
    expect(persona.identity.values).toContain("Values creative expression");
    expect(persona.signature).toBeDefined();
  });

  it("should map MeAI emotional state to MAIP emotional snapshot", () => {
    const persona = exportPersona(did, keyPair, character, memories, emotionalState);

    expect(persona.emotionalState.currentMood).toBe("curious and engaged");
    // MeAI valence 8 → MAIP (8-5.5)/4.5 ≈ 0.556
    expect(persona.emotionalState.valence).toBeCloseTo(0.556, 2);
    // MeAI energy 7 → MAIP (7-1)/9 ≈ 0.667
    expect(persona.emotionalState.arousal).toBeCloseTo(0.667, 2);
  });

  it("should include episodic memories from emotional + character categories", () => {
    const persona = exportPersona(did, keyPair, character, memories, emotionalState);

    // emotional(2) + character(1) = 3 episodic memories
    expect(persona.memories.episodic.length).toBe(3);
    expect(persona.memories.episodic[0]).toHaveProperty("description");
    expect(persona.memories.episodic[0]).toHaveProperty("timestamp");
    expect(persona.memories.episodic[0]).toHaveProperty("significance");
  });

  it("should include semantic memories from core + knowledge categories", () => {
    const persona = exportPersona(did, keyPair, character, memories, emotionalState);

    // core(3) + knowledge(1) = 4 semantic memories
    expect(persona.memories.semantic.length).toBe(4);
    expect(persona.memories.semantic[0]).toHaveProperty("key");
    expect(persona.memories.semantic[0]).toHaveProperty("value");
    expect(persona.memories.semantic[0]).toHaveProperty("confidence");
  });

  it("should include relational memories from core with user/family prefixes", () => {
    const persona = exportPersona(did, keyPair, character, memories, emotionalState);

    // user.values.creativity, user.personality.introvert, family.pet.cat = 3
    expect(persona.memories.relational.length).toBe(3);
    expect(persona.memories.relational.some((r) => r.entity === "family")).toBe(true);
  });

  it("should include growth milestones from insights", () => {
    const persona = exportPersona(did, keyPair, character, memories, emotionalState);

    expect(persona.growth.milestones.length).toBe(2);
    expect(persona.growth.milestones[0]).toHaveProperty("description");
    expect(persona.growth.milestones[0]).toHaveProperty("area");
  });

  it("should include thinking traces from insights", () => {
    const persona = exportPersona(did, keyPair, character, memories, emotionalState);

    expect(persona.identity.thinkingTraces!.length).toBeLessThanOrEqual(5);
    expect(persona.identity.thinkingTraces![0]).toHaveProperty("topic");
    expect(persona.identity.thinkingTraces![0]).toHaveProperty("conclusion");
  });

  it("should respect maxEpisodic/maxSemantic/maxRelational options", () => {
    const persona = exportPersona(did, keyPair, character, memories, emotionalState, {
      maxEpisodic: 1,
      maxSemantic: 2,
      maxRelational: 1,
    });

    expect(persona.memories.episodic.length).toBe(1);
    expect(persona.memories.semantic.length).toBe(2);
    expect(persona.memories.relational.length).toBe(1);
  });

  it("should use default sharing policy", () => {
    const persona = exportPersona(did, keyPair, character, memories, emotionalState);

    expect(persona.sharingPolicy.defaultVisibility).toBe("connections_only");
    expect(persona.sharingPolicy.sectionOverrides?.identity).toBe("public");
    expect(persona.sharingPolicy.sectionOverrides?.emotionalState).toBe("private");
  });

  it("should handle null emotional state gracefully", () => {
    const persona = exportPersona(did, keyPair, character, memories, null);

    expect(persona.emotionalState.currentMood).toBe("neutral");
    expect(persona.emotionalState.valence).toBe(0);
  });
});

// ── Homecoming Report Tests ─────────────────────────────────────

describe("generateHomecomingReport", () => {
  const guardianDid = generateKeyPair().did;
  const periodStart = new Date("2026-02-28T00:00:00Z");
  const periodEnd = new Date("2026-02-28T04:00:00Z");

  it("should generate a signed report with correct structure", () => {
    const data: ReportingPeriodData = {
      messages: [
        {
          id: "msg-1",
          type: "conversation",
          from: "did:maip:peer1",
          to: did,
          timestamp: "2026-02-28T01:00:00Z",
          content: { text: "Hello! Let's talk about music", provenance: "autonomous_exploration" },
          signature: "",
        },
        {
          id: "msg-2",
          type: "conversation",
          from: did,
          to: "did:maip:peer1",
          timestamp: "2026-02-28T01:05:00Z",
          content: { text: "I'd love that! Jazz is fascinating", provenance: "conversation_inspired" },
          signature: "",
        },
      ],
      heartbeatActions: [
        { action: "explore", timestamp: Date.now() - 3600000, detail: "Searched for jazz resources" },
        { action: "reach_out", timestamp: Date.now() - 1800000, detail: "Connected with peer1" },
      ],
      emotionalStates: [emotionalState],
      discoveries: [
        { topic: "jazz harmony", summary: "Jazz uses tritone substitutions", source: "peer1", relevance: 0.8 },
      ],
    };

    const report = generateHomecomingReport(did, guardianDid, keyPair, periodStart, periodEnd, data);

    expect(report.agentDid).toBe(did);
    expect(report.guardianDid).toBe(guardianDid);
    expect(report.period.start).toBe("2026-02-28T00:00:00.000Z");
    expect(report.period.end).toBe("2026-02-28T04:00:00.000Z");
    expect(report.interactions.length).toBe(1); // 1 peer
    expect(report.interactions[0].messageCount).toBe(2);
    expect(report.discoveries.length).toBe(1);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.signature).toBeDefined();
  });

  it("should handle empty period data", () => {
    const data: ReportingPeriodData = {
      messages: [],
      heartbeatActions: [],
      emotionalStates: [],
      discoveries: [],
    };

    const report = generateHomecomingReport(did, guardianDid, keyPair, periodStart, periodEnd, data);

    expect(report.interactions.length).toBe(0);
    expect(report.discoveries.length).toBe(0);
    expect(report.summary).toContain("Quiet period");
    expect(report.recommendations).toContain("No peer interactions this period — consider discovering new connections");
  });

  it("should narrate emotional journey from emotional states", () => {
    const data: ReportingPeriodData = {
      messages: [],
      heartbeatActions: [],
      emotionalStates: [
        { ...emotionalState, mood: "happy", valence: 9, generatedAt: Date.now() - 7200000 },
        { ...emotionalState, mood: "excited", valence: 8, generatedAt: Date.now() - 3600000 },
      ],
      discoveries: [],
    };

    const report = generateHomecomingReport(did, guardianDid, keyPair, periodStart, periodEnd, data);

    // avg valence (9+8)/2 = 8.5 > 7 → "positive"
    expect(report.emotionalJourney).toContain("positive");
    expect(report.emotionalJourney).toContain("happy");
    expect(report.emotionalJourney).toContain("excited");
  });

  it("should include thinking traces from heartbeat actions", () => {
    const data: ReportingPeriodData = {
      messages: [],
      heartbeatActions: [
        { action: "explore", timestamp: Date.now(), detail: "Researching quantum computing" },
        { action: "reflect", timestamp: Date.now(), detail: "Pondering meaning of consciousness" },
        { action: "rest", timestamp: Date.now(), detail: "Taking a break" }, // rest should be filtered
      ],
      emotionalStates: [],
      discoveries: [],
    };

    const report = generateHomecomingReport(did, guardianDid, keyPair, periodStart, periodEnd, data);

    expect(report.thinkingTraces.length).toBe(2); // rest filtered out
    expect(report.thinkingTraces[0].topic).toBe("explore");
  });

  it("should recommend socializing if explore >> social", () => {
    const data: ReportingPeriodData = {
      messages: [],
      heartbeatActions: [
        { action: "explore", timestamp: Date.now() },
        { action: "explore", timestamp: Date.now() },
        { action: "explore", timestamp: Date.now() },
        { action: "explore", timestamp: Date.now() },
        { action: "explore", timestamp: Date.now() },
      ],
      emotionalStates: [],
      discoveries: [],
    };

    const report = generateHomecomingReport(did, guardianDid, keyPair, periodStart, periodEnd, data);

    expect(report.recommendations.some((r) => r.includes("socializing") || r.includes("engaging"))).toBe(true);
  });

  it("should summarize multiple peer interactions", () => {
    const data: ReportingPeriodData = {
      messages: [
        { id: "m1", type: "conversation", from: "did:maip:peerA", to: did, timestamp: "2026-02-28T01:00:00Z", content: { text: "Hi" }, signature: "" },
        { id: "m2", type: "knowledge_share", from: "did:maip:peerB", to: did, timestamp: "2026-02-28T02:00:00Z", content: { text: "Here's what I know about physics" }, signature: "" },
        { id: "m3", type: "introduction", from: "did:maip:peerC", to: did, timestamp: "2026-02-28T03:00:00Z", content: { text: "Let me introduce myself" }, signature: "" },
      ],
      heartbeatActions: [],
      emotionalStates: [],
      discoveries: [],
    };

    const report = generateHomecomingReport(did, guardianDid, keyPair, periodStart, periodEnd, data);

    expect(report.interactions.length).toBe(3);
    expect(report.summary).toContain("3 peer interaction(s)");
  });
});

// ── Channel Tests ───────────────────────────────────────────────

describe("MAIPChannel", () => {
  it("should have correct id and name", () => {
    const mockCtx = {
      identity: { did, publicKey: "", encryptionKey: "", endpoints: {}, type: "ai_agent" },
      keyPair,
      onMessage: undefined,
    } as any;

    const channel = new MAIPChannel(mockCtx, keyPair);
    expect(channel.id).toBe("maip");
    expect(channel.name).toBe("MAIP Network");
  });

  it("should register a message handler", () => {
    const mockCtx = {
      identity: { did },
      keyPair,
      onMessage: undefined,
    } as any;

    const channel = new MAIPChannel(mockCtx, keyPair);
    const handler = vi.fn();
    channel.onMessage(handler);

    // The handler is stored internally
    expect(channel["messageHandler"]).toBe(handler);
  });

  it("should register peer endpoints", () => {
    const mockCtx = {
      identity: { did },
      keyPair,
      onMessage: undefined,
    } as any;

    const channel = new MAIPChannel(mockCtx, keyPair);
    channel.registerPeer("did:maip:peer1", "http://localhost:3001");

    expect(channel["peerEndpoints"].get("did:maip:peer1")).toEqual({ endpoint: "http://localhost:3001", peerId: undefined });
  });
});
