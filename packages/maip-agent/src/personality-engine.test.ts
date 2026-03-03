/**
 * Tests for PersonalityEngine — trait development, world model,
 * domain expertise, and interaction processing.
 */

import { describe, it, expect } from "vitest";
import { PersonalityEngine } from "./personality-engine.js";

// ── Trait Development ──────────────────────────────────────────

describe("PersonalityEngine — traits", () => {
  it("empty init has no traits", () => {
    const engine = new PersonalityEngine();
    const state = engine.getState();

    expect(state.traits.length).toBe(0);
  });

  it("reinforceTrait creates new trait with strength = amount", () => {
    const engine = new PersonalityEngine();
    engine.reinforceTrait("curiosity", "explored a topic");

    const traits = engine.getState().traits;
    expect(traits.length).toBe(1);
    expect(traits[0].name).toBe("curiosity");
    expect(traits[0].strength).toBe(0.05); // default amount
  });

  it("reinforceTrait creates new trait with custom amount", () => {
    const engine = new PersonalityEngine();
    engine.reinforceTrait("empathy", "helped someone", 0.2);

    const traits = engine.getState().traits;
    expect(traits[0].strength).toBe(0.2);
  });

  it("reinforceTrait existing uses logarithmic growth", () => {
    const engine = new PersonalityEngine();
    engine.reinforceTrait("curiosity", "first encounter", 0.5);

    const before = engine.getState().traits.find((t) => t.name === "curiosity")!.strength;
    expect(before).toBe(0.5);

    engine.reinforceTrait("curiosity", "second encounter", 0.1);

    const after = engine.getState().traits.find((t) => t.name === "curiosity")!.strength;
    // growth = 0.1 * (1 - 0.5) = 0.05 → new = 0.55
    expect(after).toBeCloseTo(0.5 + 0.1 * (1 - 0.5), 10);
  });

  it("reinforceTrait caps at 1.0", () => {
    const engine = new PersonalityEngine();
    engine.reinforceTrait("dedication", "origin", 0.99);

    engine.reinforceTrait("dedication", "boost", 1.0);

    const strength = engine.getState().traits.find((t) => t.name === "dedication")!.strength;
    expect(strength).toBeLessThanOrEqual(1.0);
  });

  it("weakenTrait reduces strength", () => {
    const engine = new PersonalityEngine();
    engine.reinforceTrait("impatience", "snap reaction", 0.5);

    engine.weakenTrait("impatience", 0.1);

    const strength = engine.getState().traits.find((t) => t.name === "impatience")!.strength;
    expect(strength).toBeCloseTo(0.4, 10);
  });

  it("weakenTrait removes trait when strength reaches 0", () => {
    const engine = new PersonalityEngine();
    engine.reinforceTrait("impatience", "origin", 0.02);

    engine.weakenTrait("impatience", 0.05);

    const traits = engine.getState().traits;
    expect(traits.find((t) => t.name === "impatience")).toBeUndefined();
  });

  it("weakenTrait on unknown trait is a no-op", () => {
    const engine = new PersonalityEngine();
    // Should not throw
    engine.weakenTrait("nonexistent", 0.1);

    expect(engine.getState().traits.length).toBe(0);
  });
});

// ── getTopTraits ───────────────────────────────────────────────

describe("PersonalityEngine — getTopTraits", () => {
  it("returns traits sorted by strength descending", () => {
    const engine = new PersonalityEngine();
    engine.reinforceTrait("curiosity", "a", 0.3);
    engine.reinforceTrait("empathy", "b", 0.8);
    engine.reinforceTrait("directness", "c", 0.5);

    const top = engine.getTopTraits(10);
    expect(top[0].name).toBe("empathy");
    expect(top[1].name).toBe("directness");
    expect(top[2].name).toBe("curiosity");
  });

  it("respects limit parameter", () => {
    const engine = new PersonalityEngine();
    engine.reinforceTrait("a", "x", 0.1);
    engine.reinforceTrait("b", "x", 0.2);
    engine.reinforceTrait("c", "x", 0.3);
    engine.reinforceTrait("d", "x", 0.4);

    const top = engine.getTopTraits(2);
    expect(top.length).toBe(2);
    expect(top[0].name).toBe("d");
    expect(top[1].name).toBe("c");
  });
});

// ── World Model ────────────────────────────────────────────────

describe("PersonalityEngine — world model", () => {
  it("updateWorldModel creates new entity", () => {
    const engine = new PersonalityEngine();
    engine.updateWorldModel("did:maip:peer1", "agent", { role: "assistant" });

    const entity = engine.lookupEntity("did:maip:peer1");
    expect(entity).not.toBeNull();
    expect(entity!.type).toBe("agent");
    expect(entity!.knowledge.role).toBe("assistant");
    expect(entity!.sentiment).toBe(0); // default
    expect(entity!.confidence).toBe(0.3); // initial
  });

  it("updateWorldModel merges knowledge on existing entity", () => {
    const engine = new PersonalityEngine();
    engine.updateWorldModel("did:maip:peer1", "human", { name: "Alice" });
    engine.updateWorldModel("did:maip:peer1", "human", { hobby: "music" });

    const entity = engine.lookupEntity("did:maip:peer1");
    expect(entity!.knowledge.name).toBe("Alice");
    expect(entity!.knowledge.hobby).toBe("music");
  });

  it("updateWorldModel uses weighted sentiment: existing * 0.7 + new * 0.3", () => {
    const engine = new PersonalityEngine();
    engine.updateWorldModel("did:maip:peer1", "agent", {}, 1.0);

    const initial = engine.lookupEntity("did:maip:peer1")!.sentiment;
    expect(initial).toBe(1.0); // First entity, sentiment = provided value

    engine.updateWorldModel("did:maip:peer1", "agent", {}, -1.0);

    const updated = engine.lookupEntity("did:maip:peer1")!.sentiment;
    // 1.0 * 0.7 + (-1.0) * 0.3 = 0.4
    expect(updated).toBeCloseTo(0.4, 10);
  });
});

// ── Domain Expertise ───────────────────────────────────────────

describe("PersonalityEngine — domain expertise", () => {
  it("learnDomain creates new domain at level 0.1", () => {
    const engine = new PersonalityEngine();
    engine.learnDomain("jazz", "uses 7th chords", "peer1");

    expect(engine.getExpertise("jazz")).toBeCloseTo(0.1, 10);
  });

  it("learnDomain uses logarithmic level growth", () => {
    const engine = new PersonalityEngine();
    engine.learnDomain("jazz", "insight 1", "peer1");

    // After first learn, interactionCount=1, level=0.1
    // Second learn: interactionCount=2, level = min(1, log2(3)/10) ≈ 0.1585
    engine.learnDomain("jazz", "insight 2", "peer2");

    const level = engine.getExpertise("jazz");
    expect(level).toBeCloseTo(Math.log2(3) / 10, 4);
  });

  it("learnDomain deduplicates insights", () => {
    const engine = new PersonalityEngine();
    engine.learnDomain("jazz", "uses 7th chords", "peer1");
    engine.learnDomain("jazz", "uses 7th chords", "peer1"); // duplicate insight

    const state = engine.getState();
    const domain = state.expertise.find((e) => e.domain === "jazz")!;
    expect(domain.insights.length).toBe(1);
  });
});

// ── processInteraction ─────────────────────────────────────────

describe("PersonalityEngine — processInteraction", () => {
  it("updates world model, learns domains, and reinforces traits", () => {
    const engine = new PersonalityEngine();

    engine.processInteraction({
      peerDid: "did:maip:peer1",
      peerType: "ai_agent",
      messageType: "knowledge_share",
      topics: ["philosophy", "ethics"],
      sentiment: 0.8,
      successful: true,
    });

    // World model updated
    const entity = engine.lookupEntity("did:maip:peer1");
    expect(entity).not.toBeNull();
    expect(entity!.type).toBe("agent");
    expect(entity!.sentiment).toBeCloseTo(0.8, 1);

    // Domains learned
    expect(engine.getExpertise("philosophy")).toBeGreaterThan(0);
    expect(engine.getExpertise("ethics")).toBeGreaterThan(0);

    // Traits reinforced: knowledge_share → intellectual_curiosity, successful → confidence
    const traits = engine.getState().traits;
    expect(traits.find((t) => t.name === "intellectual_curiosity")).toBeDefined();
    expect(traits.find((t) => t.name === "confidence")).toBeDefined();
  });
});
