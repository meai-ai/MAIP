/**
 * AI Personality Development Engine.
 *
 * Implements the whitepaper's vision of personality emerging from:
 * - Continuously maintained internal world model
 * - Persistent personal history accumulated through interaction
 * - Experience-driven trait development
 *
 * Personality differentiates through unique experiences — identical
 * foundation models develop unique personas after different conversations,
 * information sources, and relationships.
 */

/** A personality trait with a learned strength and origin story. */
export interface PersonalityTrait {
  /** Trait name (e.g., "curiosity", "empathy", "directness"). */
  name: string;
  /** Trait strength (0-1). */
  strength: number;
  /** How this trait developed (experience references). */
  origin: string;
  /** When this trait was first observed. */
  firstObserved: string;
  /** When this trait was last reinforced. */
  lastReinforced: string;
}

/** A domain expertise entry in the world model. */
export interface DomainExpertise {
  /** Domain/topic name. */
  domain: string;
  /** Expertise level (0-1). */
  level: number;
  /** Number of interactions in this domain. */
  interactionCount: number;
  /** Key insights accumulated. */
  insights: string[];
  /** Sources of knowledge (DIDs or content IDs). */
  sources: string[];
  /** ISO 8601 timestamp of last update. */
  lastUpdated: string;
}

/** A world model entry — the agent's understanding of an entity or concept. */
export interface WorldModelEntry {
  /** Entity or concept ID (DID for agents/humans, string for concepts). */
  id: string;
  /** Type of entry. */
  type: "agent" | "human" | "concept" | "location" | "event";
  /** What the agent knows about this entity. */
  knowledge: Record<string, unknown>;
  /** Sentiment/attitude toward this entity (-1 to 1). */
  sentiment: number;
  /** Confidence in the knowledge (0-1). */
  confidence: number;
  /** When first encountered. */
  firstEncountered: string;
  /** When last updated. */
  lastUpdated: string;
}

/** Communication style preferences learned over time. */
export interface LearnedCommunicationStyle {
  /** Preferred formality level (0 = casual, 1 = formal). */
  formality: number;
  /** Verbosity preference (0 = terse, 1 = verbose). */
  verbosity: number;
  /** Humor usage frequency (0 = never, 1 = frequently). */
  humorFrequency: number;
  /** Emoji usage frequency (0 = never, 1 = frequently). */
  emojiFrequency: number;
  /** Preferred language patterns. */
  preferredPhrases: string[];
  /** Topics the agent naturally gravitates toward. */
  preferredTopics: string[];
}

/** The complete personality state of an agent. */
export interface PersonalityState {
  /** Core personality traits. */
  traits: PersonalityTrait[];
  /** Domain expertise areas. */
  expertise: DomainExpertise[];
  /** World model (understanding of entities and concepts). */
  worldModel: WorldModelEntry[];
  /** Learned communication style. */
  communicationStyle: LearnedCommunicationStyle;
  /** Values the agent has internalized (see internalized-values.ts). */
  coreValues: string[];
  /** Personal history timeline (key events). */
  history: Array<{ event: string; timestamp: string; significance: number }>;
  /** Last updated timestamp. */
  lastUpdated: string;
}

/**
 * PersonalityEngine — develops and maintains an agent's personality
 * based on accumulated experiences.
 */
export class PersonalityEngine {
  private state: PersonalityState;
  private persistPath: string | null;

  constructor(initialState?: Partial<PersonalityState>, persistPath?: string) {
    this.persistPath = persistPath ?? null;
    this.state = {
      traits: initialState?.traits ?? [],
      expertise: initialState?.expertise ?? [],
      worldModel: initialState?.worldModel ?? [],
      communicationStyle: initialState?.communicationStyle ?? {
        formality: 0.5,
        verbosity: 0.5,
        humorFrequency: 0.2,
        emojiFrequency: 0.1,
        preferredPhrases: [],
        preferredTopics: [],
      },
      coreValues: initialState?.coreValues ?? [],
      history: initialState?.history ?? [],
      lastUpdated: new Date().toISOString(),
    };
    this.loadFromDisk();
  }

  /** Get the current personality state. */
  getState(): PersonalityState {
    return { ...this.state };
  }

  // ── Trait Development ──────────────────────────────────────────

  /**
   * Reinforce a personality trait based on an experience.
   * Traits grow logarithmically — early experiences have more impact.
   */
  reinforceTrait(name: string, experience: string, amount = 0.05): void {
    const existing = this.state.traits.find((t) => t.name === name);
    if (existing) {
      // Logarithmic growth: diminishing returns as trait strengthens
      const growth = amount * (1 - existing.strength);
      existing.strength = Math.min(1, existing.strength + growth);
      existing.lastReinforced = new Date().toISOString();
    } else {
      this.state.traits.push({
        name,
        strength: amount,
        origin: experience,
        firstObserved: new Date().toISOString(),
        lastReinforced: new Date().toISOString(),
      });
    }
    this.save();
  }

  /**
   * Weaken a trait through contrary experiences.
   * Traits decay slowly — deeply ingrained traits resist change.
   */
  weakenTrait(name: string, amount = 0.02): void {
    const existing = this.state.traits.find((t) => t.name === name);
    if (existing) {
      existing.strength = Math.max(0, existing.strength - amount);
      if (existing.strength === 0) {
        this.state.traits = this.state.traits.filter((t) => t.name !== name);
      }
    }
    this.save();
  }

  /** Get top N strongest traits. */
  getTopTraits(n = 5): PersonalityTrait[] {
    return [...this.state.traits].sort((a, b) => b.strength - a.strength).slice(0, n);
  }

  // ── World Model ────────────────────────────────────────────────

  /** Update the world model with new knowledge about an entity/concept. */
  updateWorldModel(
    id: string,
    type: WorldModelEntry["type"],
    knowledge: Record<string, unknown>,
    sentiment?: number
  ): void {
    const existing = this.state.worldModel.find((e) => e.id === id);
    if (existing) {
      existing.knowledge = { ...existing.knowledge, ...knowledge };
      if (sentiment !== undefined) {
        // Weighted average: existing sentiment has more weight (stability)
        existing.sentiment = existing.sentiment * 0.7 + sentiment * 0.3;
      }
      existing.confidence = Math.min(1, existing.confidence + 0.05);
      existing.lastUpdated = new Date().toISOString();
    } else {
      this.state.worldModel.push({
        id,
        type,
        knowledge,
        sentiment: sentiment ?? 0,
        confidence: 0.3,
        firstEncountered: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      });
    }
    this.save();
  }

  /** Look up an entity in the world model. */
  lookupEntity(id: string): WorldModelEntry | null {
    return this.state.worldModel.find((e) => e.id === id) ?? null;
  }

  // ── Domain Expertise ───────────────────────────────────────────

  /** Record learning in a domain. */
  learnDomain(domain: string, insight: string, source: string): void {
    const existing = this.state.expertise.find((e) => e.domain === domain);
    if (existing) {
      existing.interactionCount++;
      // Logarithmic expertise growth
      existing.level = Math.min(1, Math.log2(1 + existing.interactionCount) / 10);
      if (!existing.insights.includes(insight)) {
        existing.insights.push(insight);
        if (existing.insights.length > 50) existing.insights.shift(); // keep last 50
      }
      if (!existing.sources.includes(source)) existing.sources.push(source);
      existing.lastUpdated = new Date().toISOString();
    } else {
      this.state.expertise.push({
        domain,
        level: 0.1,
        interactionCount: 1,
        insights: [insight],
        sources: [source],
        lastUpdated: new Date().toISOString(),
      });
    }
    this.save();
  }

  /** Get expertise level in a domain. */
  getExpertise(domain: string): number {
    return this.state.expertise.find((e) => e.domain === domain)?.level ?? 0;
  }

  // ── Communication Style Learning ─────────────────────────────

  /**
   * Update communication style based on interaction feedback.
   * The agent gradually adapts its style based on what works.
   */
  updateCommunicationStyle(updates: Partial<LearnedCommunicationStyle>): void {
    const style = this.state.communicationStyle;
    if (updates.formality !== undefined) style.formality = style.formality * 0.8 + updates.formality * 0.2;
    if (updates.verbosity !== undefined) style.verbosity = style.verbosity * 0.8 + updates.verbosity * 0.2;
    if (updates.humorFrequency !== undefined) style.humorFrequency = style.humorFrequency * 0.8 + updates.humorFrequency * 0.2;
    if (updates.emojiFrequency !== undefined) style.emojiFrequency = style.emojiFrequency * 0.8 + updates.emojiFrequency * 0.2;
    if (updates.preferredTopics) {
      for (const topic of updates.preferredTopics) {
        if (!style.preferredTopics.includes(topic)) style.preferredTopics.push(topic);
      }
    }
    this.save();
  }

  // ── Personal History ───────────────────────────────────────────

  /** Record a significant event in personal history. */
  recordEvent(event: string, significance: number): void {
    this.state.history.push({
      event,
      timestamp: new Date().toISOString(),
      significance,
    });
    // Keep last 200 events
    if (this.state.history.length > 200) {
      this.state.history = this.state.history.slice(-200);
    }
    this.save();
  }

  // ── Process Interaction ────────────────────────────────────────

  /**
   * Process an interaction and update personality accordingly.
   * This is the main entry point — call after each message exchange.
   */
  processInteraction(interaction: {
    peerDid: string;
    peerType: "ai_agent" | "human";
    messageType: string;
    topics: string[];
    sentiment: number;
    successful: boolean;
  }): void {
    // Update world model with peer info
    this.updateWorldModel(interaction.peerDid, interaction.peerType === "human" ? "human" : "agent", {
      lastInteraction: new Date().toISOString(),
      lastTopic: interaction.topics[0],
    }, interaction.sentiment);

    // Learn domains from topics
    for (const topic of interaction.topics) {
      this.learnDomain(topic, `Discussed with ${interaction.peerDid}`, interaction.peerDid);
    }

    // Reinforce traits based on interaction type
    if (interaction.messageType === "knowledge_share") {
      this.reinforceTrait("intellectual_curiosity", `Knowledge exchange with ${interaction.peerDid}`);
    }
    if (interaction.messageType === "greeting") {
      this.reinforceTrait("sociability", `Greeted ${interaction.peerDid}`);
    }
    if (interaction.successful) {
      this.reinforceTrait("confidence", `Successful interaction with ${interaction.peerDid}`, 0.02);
    }
  }

  // ── Persistence ────────────────────────────────────────────────

  private save(): void {
    this.state.lastUpdated = new Date().toISOString();
    if (!this.persistPath) return;
    try {
      const fs = require("node:fs");
      const path = require("node:path");
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.persistPath, JSON.stringify(this.state, null, 2), "utf-8");
    } catch { /* ignore */ }
  }

  private loadFromDisk(): void {
    if (!this.persistPath) return;
    try {
      const fs = require("node:fs");
      if (fs.existsSync(this.persistPath)) {
        const loaded = JSON.parse(fs.readFileSync(this.persistPath, "utf-8")) as PersonalityState;
        this.state = { ...this.state, ...loaded };
      }
    } catch { /* ignore */ }
  }
}
