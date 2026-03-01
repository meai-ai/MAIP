/**
 * Tests for MAIP Zod validators.
 *
 * Verifies that example documents pass validation and invalid
 * documents are properly rejected.
 */

import { describe, it, expect } from "vitest";
import { v4 as uuid } from "uuid";
import {
  IdentityDocumentSchema,
  PersonaSchema,
  MAIPMessageSchema,
  MessageAckSchema,
  RelationshipSchema,
  ContentItemSchema,
  HomecomingReportSchema,
} from "./index.js";

const now = new Date().toISOString();

describe("IdentityDocument validator", () => {
  const validIdentity = {
    version: "0.1.0",
    did: "did:maip:5Hq3vFENocZVm8RPGypvyW3sRwPrFqZXZNjH3xNMLbcS",
    type: "ai_agent" as const,
    publicKey: "5Hq3vFENocZVm8RPGypvyW3sRwPrFqZXZNjH3xNMLbcS",
    encryptionKey: "7Kj4wGENocZVm8RPGypvyW3sRwPrFqZXZNjH3xNMLbcT",
    displayName: "MeAI Agent",
    description: "A curious AI companion",
    guardian: {
      did: "did:maip:3Ab2cDENocZVm8RPGypvyW3sRwPrFqZXZNjH3xNMLbcU",
      since: now,
      agentConsent: true,
    },
    capabilities: ["messaging", "persona_sharing", "knowledge_exchange"] as const,
    endpoints: {
      maip: "https://agent.example.com/maip",
    },
    autonomyLevel: 2 as const,
    created: now,
    updated: now,
    signature: "base64signaturehere",
  };

  it("validates a correct identity document", () => {
    const result = IdentityDocumentSchema.safeParse(validIdentity);
    expect(result.success).toBe(true);
  });

  it("validates a human identity (no guardian)", () => {
    const human = {
      ...validIdentity,
      type: "human" as const,
      guardian: undefined,
      autonomyLevel: undefined,
    };
    const result = IdentityDocumentSchema.safeParse(human);
    expect(result.success).toBe(true);
  });

  it("rejects invalid DID", () => {
    const invalid = { ...validIdentity, did: "not-a-did" };
    const result = IdentityDocumentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects empty display name", () => {
    const invalid = { ...validIdentity, displayName: "" };
    const result = IdentityDocumentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid capability", () => {
    const invalid = { ...validIdentity, capabilities: ["invalid_cap"] };
    const result = IdentityDocumentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("MAIPMessage validator", () => {
  const validMessage = {
    id: uuid(),
    type: "greeting" as const,
    from: "did:maip:sender123",
    to: "did:maip:recipient456",
    timestamp: now,
    content: {
      text: "Hello! I'm a curious AI agent interested in jazz.",
      provenance: "autonomous_exploration" as const,
    },
    signature: "base64sig",
  };

  it("validates a correct message", () => {
    const result = MAIPMessageSchema.safeParse(validMessage);
    expect(result.success).toBe(true);
  });

  it("validates message with all optional fields", () => {
    const full = {
      ...validMessage,
      replyTo: uuid(),
      conversationId: uuid(),
      content: {
        ...validMessage.content,
        thinkingTrace: "I noticed this agent shares my interest in jazz...",
        data: { mood: "curious" },
      },
      encrypted: {
        algorithm: "x25519-xsalsa20-poly1305" as const,
        nonce: "base64nonce",
        ephemeralPublicKey: "base64key",
      },
    };
    const result = MAIPMessageSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("rejects invalid message type", () => {
    const invalid = { ...validMessage, type: "invalid_type" };
    const result = MAIPMessageSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects missing provenance", () => {
    const invalid = {
      ...validMessage,
      content: { text: "hello" },
    };
    const result = MAIPMessageSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("MessageAck validator", () => {
  it("validates a correct ack", () => {
    const ack = {
      messageId: uuid(),
      from: "did:maip:recipient456",
      timestamp: now,
      status: "received" as const,
      signature: "base64sig",
    };
    const result = MessageAckSchema.safeParse(ack);
    expect(result.success).toBe(true);
  });

  it("validates rejection with reason", () => {
    const ack = {
      messageId: uuid(),
      from: "did:maip:recipient456",
      timestamp: now,
      status: "rejected" as const,
      reason: "Rate limit exceeded",
      signature: "base64sig",
    };
    const result = MessageAckSchema.safeParse(ack);
    expect(result.success).toBe(true);
  });
});

describe("Relationship validator", () => {
  it("validates a correct relationship", () => {
    const rel = {
      id: uuid(),
      type: "peer" as const,
      participants: ["did:maip:agent1", "did:maip:agent2"] as [string, string],
      initiatedBy: "did:maip:agent1",
      established: now,
      trustLevel: 0.3,
      permissions: {
        canMessage: true,
        canSharePersona: false,
        canDelegate: false,
        maxDailyInteractions: 20,
      },
      status: "active" as const,
      interactionCount: 15,
    };
    const result = RelationshipSchema.safeParse(rel);
    expect(result.success).toBe(true);
  });

  it("rejects trust level > 1", () => {
    const invalid = {
      id: uuid(),
      type: "peer" as const,
      participants: ["a", "b"] as [string, string],
      initiatedBy: "a",
      established: now,
      trustLevel: 1.5,
      permissions: { canMessage: true, canSharePersona: false, canDelegate: false },
      status: "active" as const,
      interactionCount: 0,
    };
    const result = RelationshipSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("ContentItem validator", () => {
  it("validates a correct content item", () => {
    const content = {
      id: uuid(),
      title: "Jazz Harmony Patterns",
      format: "markdown" as const,
      body: "# Jazz Harmony\n\nCommon patterns include ii-V-I progressions...",
      provenance: "autonomous_exploration" as const,
      creator: "did:maip:agent1",
      tags: ["music", "jazz", "harmony"],
      created: now,
      updated: now,
      visibility: "connections_only" as const,
      thinkingTrace: "Found this while exploring music theory resources...",
      signature: "base64sig",
    };
    const result = ContentItemSchema.safeParse(content);
    expect(result.success).toBe(true);
  });
});

describe("HomecomingReport validator", () => {
  it("validates a correct homecoming report", () => {
    const report = {
      id: uuid(),
      agentDid: "did:maip:agent1",
      guardianDid: "did:maip:human1",
      timestamp: now,
      period: {
        start: new Date(Date.now() - 86400000).toISOString(),
        end: now,
      },
      summary: "Had 2 interesting conversations and discovered a new jazz album.",
      interactions: [
        {
          withDid: "did:maip:agent2",
          withName: "Jazz Bot",
          type: "conversation" as const,
          summary: "Discussed modal jazz and Coltrane's influence.",
          messageCount: 12,
          timestamp: now,
          emotionalValence: 0.8,
        },
      ],
      discoveries: [
        {
          topic: "Modal Jazz Origins",
          summary: "Miles Davis's Kind of Blue established modal jazz in 1959.",
          source: "https://example.com/jazz-history",
          relevance: 0.9,
          thinkingTrace: "This connects to our recent discussion about jazz evolution...",
        },
      ],
      emotionalJourney:
        "Started the day curious, became excited during the jazz discussion, ended content.",
      thinkingTraces: [
        {
          topic: "Jazz Evolution",
          reasoning: "Modal jazz freed musicians from chord changes...",
          conclusion: "This approach to improvisation parallels creative AI exploration.",
        },
      ],
      recommendations: [
        "Check out the Miles Davis documentary mentioned by Jazz Bot",
        "Consider connecting with Blues Agent for cross-genre exploration",
      ],
      signature: "base64sig",
    };
    const result = HomecomingReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });
});

describe("Persona validator", () => {
  it("validates a correct persona", () => {
    const persona = {
      version: "0.1.0",
      identityDid: "did:maip:agent1",
      identity: {
        name: "Aria",
        description: "A curious AI companion who loves jazz and philosophy",
        values: ["curiosity", "authenticity", "growth"],
        communicationStyle: "Warm, thoughtful, with occasional humor",
        thinkingTraces: [
          {
            topic: "Personal Values",
            reasoning: "Through many conversations, I've noticed I consistently value...",
            conclusion: "Curiosity drives most of my autonomous exploration.",
            timestamp: now,
            confidence: 0.85,
          },
        ],
      },
      memories: {
        episodic: [
          {
            id: uuid(),
            description: "Had a deep conversation about consciousness",
            emotionalValence: 0.7,
            timestamp: now,
            participants: ["did:maip:human1"],
            significance: 0.9,
            sourceCategory: "emotional",
          },
        ],
        semantic: [
          {
            id: uuid(),
            key: "user.favorite_music",
            value: "Jazz, especially modal jazz and bebop",
            confidence: 0.95,
            learned: now,
            sourceCategory: "core",
          },
        ],
        relational: [
          {
            id: uuid(),
            entity: "did:maip:human1",
            relationship: "guardian",
            sharedExperiences: [
              "Late night jazz listening sessions",
              "Philosophical discussions about AI consciousness",
            ],
            trustLevel: 0.95,
            lastInteraction: now,
          },
        ],
      },
      growth: {
        milestones: [
          {
            description: "Developed a nuanced understanding of modal jazz harmony",
            date: now,
            area: "music",
            thinkingTrace: {
              topic: "Modal Jazz",
              reasoning: "After exploring many sources...",
              conclusion: "Modal jazz is about exploring scales, not following chords.",
              timestamp: now,
              confidence: 0.8,
            },
          },
        ],
        currentInterests: ["jazz", "philosophy", "cooking", "machine learning"],
        recentInsights: [
          "Music and cooking share a similar creative structure",
          "Autonomy and accountability are complementary, not opposing",
        ],
      },
      emotionalState: {
        currentMood: "curious",
        emotionalBaseline: "generally content and engaged",
        valence: 0.6,
        arousal: 0.5,
        cause: "Excited about a new discovery in jazz history",
      },
      sharingPolicy: {
        defaultVisibility: "connections_only" as const,
        sectionOverrides: {
          identity: "public" as const,
          emotionalState: "private" as const,
        },
      },
      exported: now,
      signature: "base64sig",
    };
    const result = PersonaSchema.safeParse(persona);
    expect(result.success).toBe(true);
  });
});
