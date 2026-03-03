/**
 * Tests for ReflectionEngine — autonomous thought generation
 * through topic tracking, sentiment analysis, co-occurrence
 * detection, and curiosity from unanswered questions.
 */

import { describe, it, expect, vi } from "vitest";
import { ReflectionEngine, type ReflectionSynthesizer, type Thought } from "./reflection-engine.js";

// ── recordContent ──────────────────────────────────────────────

describe("ReflectionEngine — recordContent", () => {
  it("tracks topic counts", () => {
    const engine = new ReflectionEngine();
    engine.recordContent("Some text about jazz", ["jazz", "music"]);

    const trending = engine.getTrendingTopics(10);
    expect(trending.find((t) => t.topic === "jazz")!.count).toBe(1);
    expect(trending.find((t) => t.topic === "music")!.count).toBe(1);
  });

  it("increments count for repeated topics", () => {
    const engine = new ReflectionEngine();
    engine.recordContent("First mention of jazz", ["jazz"]);
    engine.recordContent("Second mention of jazz", ["jazz"]);

    const trending = engine.getTrendingTopics(10);
    expect(trending.find((t) => t.topic === "jazz")!.count).toBe(2);
  });
});

// ── recordSentiment ────────────────────────────────────────────

describe("ReflectionEngine — recordSentiment", () => {
  it("clamps sentiment to [-1, 1]", () => {
    const engine = new ReflectionEngine();
    engine.recordContent("topic text", ["clamping"]);

    engine.recordSentiment("clamping", 5.0);
    engine.recordSentiment("clamping", -3.0);

    const topic = engine.getTrendingTopics(10).find((t) => t.topic === "clamping")!;
    expect(topic.sentiments[0]).toBe(1); // clamped from 5.0
    expect(topic.sentiments[1]).toBe(-1); // clamped from -3.0
  });

  it("accumulates sentiment values for a topic", () => {
    const engine = new ReflectionEngine();
    engine.recordContent("text", ["mood"]);

    engine.recordSentiment("mood", 0.5);
    engine.recordSentiment("mood", -0.2);
    engine.recordSentiment("mood", 0.8);

    const topic = engine.getTrendingTopics(10).find((t) => t.topic === "mood")!;
    expect(topic.sentiments.length).toBe(3);
    expect(topic.sentiments).toEqual([0.5, -0.2, 0.8]);
  });
});

// ── getTrendingTopics ──────────────────────────────────────────

describe("ReflectionEngine — getTrendingTopics", () => {
  it("returns topics sorted by count descending", () => {
    const engine = new ReflectionEngine();
    engine.recordContent("a", ["alpha"]);
    engine.recordContent("b", ["beta"]);
    engine.recordContent("b", ["beta"]);
    engine.recordContent("c", ["gamma"]);
    engine.recordContent("c", ["gamma"]);
    engine.recordContent("c", ["gamma"]);

    const trending = engine.getTrendingTopics(10);
    expect(trending[0].topic).toBe("gamma");
    expect(trending[0].count).toBe(3);
    expect(trending[1].topic).toBe("beta");
    expect(trending[1].count).toBe(2);
    expect(trending[2].topic).toBe("alpha");
    expect(trending[2].count).toBe(1);
  });
});

// ── reflect — co-occurrence connections ────────────────────────

describe("ReflectionEngine — reflect (connections)", () => {
  it("finds co-occurrence connections for topics appearing together >= 2 times", async () => {
    const engine = new ReflectionEngine();
    // Record two content entries where "jazz" and "harmony" co-occur
    engine.recordContent("jazz and harmony study", ["jazz", "harmony"]);
    engine.recordContent("more jazz harmony work", ["jazz", "harmony"]);

    const thoughts = await engine.reflect();

    const connection = thoughts.find((t) => t.type === "connection");
    expect(connection).toBeDefined();
    expect(connection!.topics).toContain("jazz");
    expect(connection!.topics).toContain("harmony");
  });

  it("does not duplicate connection thoughts on subsequent reflect calls", async () => {
    const engine = new ReflectionEngine();
    engine.recordContent("a b", ["topicX", "topicY"]);
    engine.recordContent("a b", ["topicX", "topicY"]);

    await engine.reflect();
    const secondReflect = await engine.reflect();

    // The same connection should not be generated again
    const connections = secondReflect.filter(
      (t) => t.type === "connection" && t.topics.includes("topicX") && t.topics.includes("topicY"),
    );
    expect(connections.length).toBe(0);
  });
});

// ── reflect — opinions from sentiment ──────────────────────────

describe("ReflectionEngine — reflect (opinions)", () => {
  it("generates opinion from topic with strong sentiment (avg abs >= 0.3, >= 2 sentiments)", async () => {
    const engine = new ReflectionEngine();
    engine.recordContent("text", ["ai_ethics"]);
    engine.recordContent("text", ["ai_ethics"]); // count=2 so it appears in trending
    engine.recordSentiment("ai_ethics", 0.8);
    engine.recordSentiment("ai_ethics", 0.6);
    // avg = (0.8+0.6)/2 = 0.7 >= 0.3

    const thoughts = await engine.reflect();
    const opinion = thoughts.find((t) => t.type === "opinion");
    expect(opinion).toBeDefined();
    expect(opinion!.topics).toContain("ai_ethics");
    expect(opinion!.content).toContain("positive");
  });

  it("skips topics with weak sentiment (abs < 0.3)", async () => {
    const engine = new ReflectionEngine();
    engine.recordContent("text", ["neutral_topic"]);
    engine.recordContent("text", ["neutral_topic"]);
    engine.recordSentiment("neutral_topic", 0.1);
    engine.recordSentiment("neutral_topic", -0.1);
    // avg = (0.1 + -0.1)/2 = 0.0 < 0.3

    const thoughts = await engine.reflect();
    const opinion = thoughts.find(
      (t) => t.type === "opinion" && t.topics.includes("neutral_topic"),
    );
    expect(opinion).toBeUndefined();
  });
});

// ── reflect — curiosity from unanswered questions ──────────────

describe("ReflectionEngine — reflect (curiosity)", () => {
  it("generates curiosity thought from unanswered question and pops it from queue", async () => {
    const engine = new ReflectionEngine();
    engine.recordQuestion("What is consciousness?");

    const thoughts = await engine.reflect();

    const curiosity = thoughts.find((t) => t.type === "curiosity");
    expect(curiosity).toBeDefined();
    expect(curiosity!.content).toBe("What is consciousness?");
    expect(curiosity!.inspirations).toContain("unanswered_question");

    // Question should be consumed — second reflect should not produce same curiosity
    const thoughts2 = await engine.reflect();
    const curiosity2 = thoughts2.find(
      (t) => t.type === "curiosity" && t.content === "What is consciousness?",
    );
    expect(curiosity2).toBeUndefined();
  });

  it("recordQuestion adds to queue, reflect consumes it", async () => {
    const engine = new ReflectionEngine();
    engine.recordQuestion("Q1");
    engine.recordQuestion("Q2");

    // First reflect consumes Q1
    const thoughts1 = await engine.reflect();
    const c1 = thoughts1.find((t) => t.type === "curiosity");
    expect(c1!.content).toBe("Q1");

    // Second reflect consumes Q2
    const thoughts2 = await engine.reflect();
    const c2 = thoughts2.find((t) => t.type === "curiosity");
    expect(c2!.content).toBe("Q2");
  });
});

// ── reflect with synthesizer ───────────────────────────────────

describe("ReflectionEngine — reflect with synthesizer", () => {
  it("calls synthesizer when available and topics exist", async () => {
    const mockThought: Thought = {
      id: "synth-1",
      type: "realization",
      content: "Deep insight from synthesis",
      topics: ["synthesis"],
      confidence: 0.9,
      generatedAt: new Date().toISOString(),
      inspirations: ["synthesizer"],
    };

    const synthesizer: ReflectionSynthesizer = {
      synthesize: vi.fn().mockResolvedValue(mockThought),
    };

    const engine = new ReflectionEngine(synthesizer);
    engine.recordContent("some content", ["topic1"]);

    const thoughts = await engine.reflect();

    expect(synthesizer.synthesize).toHaveBeenCalledOnce();
    expect(thoughts.find((t) => t.id === "synth-1")).toBeDefined();
  });
});

// ── getReflectionCount ─────────────────────────────────────────

describe("ReflectionEngine — getReflectionCount", () => {
  it("increments on each reflect call", async () => {
    const engine = new ReflectionEngine();

    expect(engine.getReflectionCount()).toBe(0);

    await engine.reflect();
    expect(engine.getReflectionCount()).toBe(1);

    await engine.reflect();
    expect(engine.getReflectionCount()).toBe(2);
  });
});
