/**
 * Tests for ContentPipeline — gather, synthesize, review, and publish stages.
 */

import { describe, it, expect } from "vitest";
import { ContentPipeline } from "./content-pipeline.js";
import type { DataAdapter, ExternalContent } from "./data-interfaces.js";

// ── Mock Adapters ────────────────────────────────────────────────

const mockAdapter: DataAdapter = {
  name: "mock",
  isAvailable: () => true,
  fetch: async (interests, _limit) => [
    {
      source: "https://example.com/1",
      title: "Article 1",
      text: "Content about " + interests[0],
      relevance: 0.9,
      topics: interests,
      publishedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    },
    {
      source: "https://other.com/2",
      title: "Article 2",
      text: "More content",
      relevance: 0.7,
      topics: interests,
      publishedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    },
  ],
};

const unavailableAdapter: DataAdapter = {
  name: "unavailable",
  isAvailable: () => false,
  fetch: async () => {
    throw new Error("Should not be called");
  },
};

const duplicateAdapter: DataAdapter = {
  name: "duplicate",
  isAvailable: () => true,
  fetch: async (interests, _limit) => [
    {
      source: "https://example.com/1", // Same URL as mockAdapter
      title: "Duplicate Article",
      text: "Duplicate content",
      relevance: 0.5,
      topics: interests,
      publishedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    },
    {
      source: "https://third.com/3",
      title: "Third Article",
      text: "Third content",
      relevance: 0.6,
      topics: interests,
      publishedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    },
  ],
};

const AUTHOR_DID = "did:maip:test-author";

// ── Helper: create a well-formed draft ready for review ──────────

async function createSynthesizedDraft(
  pipeline: ContentPipeline,
  textLength = 250
): Promise<string> {
  const draft = await pipeline.gather("AI safety", [mockAdapter], ["ethics"]);
  await pipeline.synthesize(draft.id, async (_sources, _topic) => ({
    text: "A".repeat(textLength) + " synthesized content about AI safety",
    analysis: "This is the agent's original analysis of the topic.",
  }));
  return draft.id;
}

// ── gather ───────────────────────────────────────────────────────

describe("ContentPipeline — gather", () => {
  it("collects content from available adapters", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID);
    const draft = await pipeline.gather("AI", [mockAdapter], ["safety"]);

    expect(draft.sources.length).toBe(2);
    expect(draft.topic).toBe("AI");
    expect(draft.stage).toBe("gathering");
    expect(draft.id).toMatch(/^draft-/);
  });

  it("skips unavailable adapters", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID);
    const draft = await pipeline.gather("AI", [unavailableAdapter, mockAdapter], ["safety"]);

    // Only mockAdapter results should be present
    expect(draft.sources.length).toBe(2);
    expect(draft.sources[0].source).toBe("https://example.com/1");
  });

  it("deduplicates by source URL", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID);
    const draft = await pipeline.gather("AI", [mockAdapter, duplicateAdapter], ["safety"]);

    // mockAdapter: 2 sources, duplicateAdapter: 2 sources (1 duplicate)
    // After dedup: 3 unique sources
    expect(draft.sources.length).toBe(3);
    const urls = draft.sources.map((s) => s.source);
    expect(new Set(urls).size).toBe(3);
  });

  it("sorts by relevance descending", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID);
    const draft = await pipeline.gather("AI", [mockAdapter, duplicateAdapter], ["safety"]);

    for (let i = 1; i < draft.sources.length; i++) {
      expect(draft.sources[i - 1].relevance).toBeGreaterThanOrEqual(draft.sources[i].relevance);
    }
  });
});

// ── synthesize ───────────────────────────────────────────────────

describe("ContentPipeline — synthesize", () => {
  it("updates draft text and analysis", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID);
    const draft = await pipeline.gather("AI", [mockAdapter], ["safety"]);

    const updated = await pipeline.synthesize(draft.id, async (sources, topic) => ({
      text: `Synthesis of ${sources.length} sources on ${topic}`,
      analysis: "My analysis is that AI safety is important",
    }));

    expect(updated.synthesizedText).toContain("Synthesis of 2 sources");
    expect(updated.agentAnalysis).toContain("AI safety is important");
    expect(updated.stage).toBe("synthesizing");
  });
});

// ── review ───────────────────────────────────────────────────────

describe("ContentPipeline — review", () => {
  it("marks draft as reviewing when all criteria met", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID);
    const draftId = await createSynthesizedDraft(pipeline, 250);

    const reviewed = pipeline.review(draftId);
    // 2 sources >= 2 (minSources) ✓
    // text length >= 200 ✓
    // analysis present ✓
    // 2 unique domains (example.com, other.com) >= 2 ✓
    // score = 4/4 = 1.0 >= 0.6
    expect(reviewed.qualityScore).toBeGreaterThanOrEqual(0.6);
    expect(reviewed.stage).toBe("reviewing");
  });

  it("rejects draft below quality threshold", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID, { minSources: 10, minLength: 10000 });
    const draftId = await createSynthesizedDraft(pipeline, 50);

    const reviewed = pipeline.review(draftId);
    // minSources=10 fails (only 2), minLength=10000 fails
    // score will be low
    expect(reviewed.qualityScore).toBeLessThan(0.6);
    expect(reviewed.stage).toBe("rejected");
  });

  it("checks source diversity (unique domains >= 2 adds to score)", async () => {
    // Create a single-domain adapter
    const singleDomainAdapter: DataAdapter = {
      name: "single",
      isAvailable: () => true,
      fetch: async (interests) => [
        { source: "https://example.com/a", title: "A", text: "A".repeat(250), relevance: 0.9, topics: interests, publishedAt: new Date().toISOString(), fetchedAt: new Date().toISOString() },
        { source: "https://example.com/b", title: "B", text: "B content", relevance: 0.8, topics: interests, publishedAt: new Date().toISOString(), fetchedAt: new Date().toISOString() },
      ],
    };

    const pipeline = new ContentPipeline(AUTHOR_DID);
    const draft = await pipeline.gather("AI", [singleDomainAdapter], ["safety"]);
    await pipeline.synthesize(draft.id, async () => ({
      text: "X".repeat(250),
      analysis: "Analysis here",
    }));
    const reviewed = pipeline.review(draft.id);

    // sources >=2 ✓, length >=200 ✓, analysis ✓, but unique domains = 1 ✗
    // score = 3/4 = 0.75
    expect(reviewed.qualityScore).toBe(0.75);
  });
});

// ── publish ──────────────────────────────────────────────────────

describe("ContentPipeline — publish", () => {
  it("produces PublishedContent from an approved draft", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID);
    const draftId = await createSynthesizedDraft(pipeline);
    pipeline.review(draftId);

    const published = pipeline.publish(draftId);
    expect(published).not.toBeNull();
    expect(published!.authorDid).toBe(AUTHOR_DID);
    expect(published!.title).toContain("AI safety");
    expect(published!.sourceUrls.length).toBe(2);
    expect(published!.publishedAt).toBeDefined();
    expect(published!.contentType).toBe("research_synthesis");
  });

  it("returns null for a rejected draft", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID, { minSources: 100 });
    const draftId = await createSynthesizedDraft(pipeline, 50);
    pipeline.review(draftId);

    const published = pipeline.publish(draftId);
    expect(published).toBeNull();
  });
});

// ── getPublished ─────────────────────────────────────────────────

describe("ContentPipeline — getPublished", () => {
  it("returns all published items", async () => {
    const pipeline = new ContentPipeline(AUTHOR_DID);

    // Publish two items
    const id1 = await createSynthesizedDraft(pipeline);
    pipeline.review(id1);
    pipeline.publish(id1);

    const id2 = await createSynthesizedDraft(pipeline);
    pipeline.review(id2);
    pipeline.publish(id2);

    const all = pipeline.getPublished();
    expect(all.length).toBe(2);
    expect(all[0].authorDid).toBe(AUTHOR_DID);
    expect(all[1].authorDid).toBe(AUTHOR_DID);
  });
});
