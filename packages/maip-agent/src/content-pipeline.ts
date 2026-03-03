/**
 * Content Production Pipeline.
 *
 * Framework for AI agents to synthesize, review, and publish original content.
 * Implements the whitepaper's vision of agents as active knowledge producers —
 * not just consumers — who research, form opinions, and share discoveries.
 *
 * Pipeline stages: gather → synthesize → review → publish
 */

import type { ExternalContent, DataAdapter } from "./data-interfaces.js";

/** Content production stage. */
export type ContentStage = "gathering" | "synthesizing" | "reviewing" | "published" | "rejected";

/** A content draft moving through the production pipeline. */
export interface ContentDraft {
  /** Unique draft ID. */
  id: string;
  /** Topic or theme. */
  topic: string;
  /** Source materials used. */
  sources: ExternalContent[];
  /** Synthesized text. */
  synthesizedText: string;
  /** Agent's original analysis/opinion. */
  agentAnalysis: string;
  /** Current pipeline stage. */
  stage: ContentStage;
  /** Quality score (0-1) from self-review. */
  qualityScore: number;
  /** Tags/topics. */
  tags: string[];
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 last update timestamp. */
  updatedAt: string;
}

/** Published content item ready for sharing. */
export interface PublishedContent {
  /** Unique content ID. */
  id: string;
  /** Title. */
  title: string;
  /** Full text. */
  text: string;
  /** Summary for sharing. */
  summary: string;
  /** Sources referenced. */
  sourceUrls: string[];
  /** Tags/topics. */
  tags: string[];
  /** The producing agent's DID. */
  authorDid: string;
  /** Content type. */
  contentType: "research_synthesis" | "opinion" | "discovery" | "creative";
  /** ISO 8601 publication timestamp. */
  publishedAt: string;
}

/** Review criteria for content quality assessment. */
interface ReviewCriteria {
  /** Minimum number of sources required. */
  minSources: number;
  /** Minimum synthesis length (chars). */
  minLength: number;
  /** Required: agent must add original analysis. */
  requiresAnalysis: boolean;
  /** Minimum quality score to publish. */
  minQualityScore: number;
}

const DEFAULT_REVIEW_CRITERIA: ReviewCriteria = {
  minSources: 2,
  minLength: 200,
  requiresAnalysis: true,
  minQualityScore: 0.6,
};

/**
 * ContentPipeline — manages the lifecycle of AI-produced content.
 */
export class ContentPipeline {
  private drafts: Map<string, ContentDraft> = new Map();
  private published: PublishedContent[] = [];
  private criteria: ReviewCriteria;
  private authorDid: string;

  constructor(authorDid: string, criteria?: Partial<ReviewCriteria>) {
    this.authorDid = authorDid;
    this.criteria = { ...DEFAULT_REVIEW_CRITERIA, ...criteria };
  }

  /** Stage 1: Gather sources on a topic from data adapters. */
  async gather(
    topic: string,
    adapters: DataAdapter[],
    interests: string[]
  ): Promise<ContentDraft> {
    const allSources: ExternalContent[] = [];
    for (const adapter of adapters) {
      if (adapter.isAvailable()) {
        try {
          const results = await adapter.fetch([topic, ...interests], 10);
          allSources.push(...results);
        } catch { /* skip failed adapters */ }
      }
    }

    // Deduplicate by source URL
    const seen = new Set<string>();
    const unique = allSources.filter((s) => {
      if (seen.has(s.source)) return false;
      seen.add(s.source);
      return true;
    });

    const draft: ContentDraft = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      topic,
      sources: unique.sort((a, b) => b.relevance - a.relevance).slice(0, 20),
      synthesizedText: "",
      agentAnalysis: "",
      stage: "gathering",
      qualityScore: 0,
      tags: [topic, ...interests].slice(0, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.drafts.set(draft.id, draft);
    return draft;
  }

  /**
   * Stage 2: Synthesize gathered sources into a coherent piece.
   * The synthesizer function is injected — this allows the LLM to do the synthesis.
   */
  async synthesize(
    draftId: string,
    synthesizer: (sources: ExternalContent[], topic: string) => Promise<{ text: string; analysis: string }>
  ): Promise<ContentDraft> {
    const draft = this.drafts.get(draftId);
    if (!draft) throw new Error(`Draft ${draftId} not found`);

    const result = await synthesizer(draft.sources, draft.topic);
    draft.synthesizedText = result.text;
    draft.agentAnalysis = result.analysis;
    draft.stage = "synthesizing";
    draft.updatedAt = new Date().toISOString();
    return draft;
  }

  /** Stage 3: Self-review the synthesized content for quality. */
  review(draftId: string): ContentDraft {
    const draft = this.drafts.get(draftId);
    if (!draft) throw new Error(`Draft ${draftId} not found`);

    let score = 0;
    const maxScore = 4;

    // Check source count
    if (draft.sources.length >= this.criteria.minSources) score++;
    // Check length
    if (draft.synthesizedText.length >= this.criteria.minLength) score++;
    // Check analysis
    if (!this.criteria.requiresAnalysis || draft.agentAnalysis.length > 0) score++;
    // Check diversity of sources
    const uniqueDomains = new Set(draft.sources.map((s) => {
      try { return new URL(s.source).hostname; } catch { return s.source; }
    }));
    if (uniqueDomains.size >= 2) score++;

    draft.qualityScore = score / maxScore;
    draft.stage = draft.qualityScore >= this.criteria.minQualityScore ? "reviewing" : "rejected";
    draft.updatedAt = new Date().toISOString();
    return draft;
  }

  /** Stage 4: Publish approved content. */
  publish(
    draftId: string,
    contentType: PublishedContent["contentType"] = "research_synthesis"
  ): PublishedContent | null {
    const draft = this.drafts.get(draftId);
    if (!draft || draft.stage === "rejected") return null;
    if (draft.qualityScore < this.criteria.minQualityScore) return null;

    // Generate title from topic
    const title = `${draft.topic.charAt(0).toUpperCase()}${draft.topic.slice(1)}: A Synthesis`;

    // Generate summary (first 200 chars of synthesis)
    const summary = draft.synthesizedText.length > 200
      ? draft.synthesizedText.slice(0, 197) + "..."
      : draft.synthesizedText;

    const published: PublishedContent = {
      id: `pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      text: draft.synthesizedText + (draft.agentAnalysis ? `\n\n---\n\n${draft.agentAnalysis}` : ""),
      summary,
      sourceUrls: draft.sources.map((s) => s.source),
      tags: draft.tags,
      authorDid: this.authorDid,
      contentType,
      publishedAt: new Date().toISOString(),
    };

    draft.stage = "published";
    draft.updatedAt = new Date().toISOString();
    this.published.push(published);
    return published;
  }

  /** Get all published content. */
  getPublished(): PublishedContent[] {
    return [...this.published];
  }

  /** Get a specific draft. */
  getDraft(draftId: string): ContentDraft | undefined {
    return this.drafts.get(draftId);
  }

  /** Get all drafts. */
  getAllDrafts(): ContentDraft[] {
    return [...this.drafts.values()];
  }
}
