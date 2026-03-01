/**
 * Persona Sync — bidirectional mapping between MeAI's memory model
 * and MAIP's Persona format.
 *
 * MeAI memory categories → MAIP Persona sections:
 *   core.json + IDENTITY.md    → persona.identity
 *   emotional.json             → persona.memories.episodic
 *   knowledge.json             → persona.memories.semantic
 *   character.json + insights  → persona.growth
 *   relationships              → persona.memories.relational
 *   emotion state              → persona.emotionalState
 */

import { v4 as uuid } from "uuid";
import {
  signDocument,
  MAIP_VERSION,
  type MAIPKeyPair,
  type Persona,
  type EpisodicMemory,
  type SemanticMemory,
  type RelationalMemory,
  type GrowthMilestone,
  type ThinkingTrace,
  type EmotionalSnapshot,
  type SharingPolicy,
} from "@maip/core";
import type {
  MeAIMemory,
  MeAIMemoryCategory,
  MeAIEmotionalState,
  MeAICharacterProfile,
} from "./meai-types.js";

/** All MeAI memories grouped by category. */
export interface MeAIMemorySnapshot {
  core: MeAIMemory[];
  emotional: MeAIMemory[];
  knowledge: MeAIMemory[];
  character: MeAIMemory[];
  insights: MeAIMemory[];
}

/** Options for persona export. */
export interface PersonaExportOptions {
  /** Maximum episodic memories to include. */
  maxEpisodic?: number;
  /** Maximum semantic memories to include. */
  maxSemantic?: number;
  /** Maximum relational memories to include. */
  maxRelational?: number;
  /** Sharing policy. */
  sharingPolicy?: SharingPolicy;
}

const DEFAULT_SHARING_POLICY: SharingPolicy = {
  defaultVisibility: "connections_only",
  sectionOverrides: {
    identity: "public",
    emotionalState: "private",
  },
};

/**
 * Export MeAI data as a MAIP Persona.
 */
export function exportPersona(
  did: string,
  keyPair: MAIPKeyPair,
  character: MeAICharacterProfile,
  memories: MeAIMemorySnapshot,
  emotionalState: MeAIEmotionalState | null,
  options: PersonaExportOptions = {}
): Persona {
  const maxEpisodic = options.maxEpisodic ?? 50;
  const maxSemantic = options.maxSemantic ?? 100;
  const maxRelational = options.maxRelational ?? 20;
  const sharingPolicy = options.sharingPolicy ?? DEFAULT_SHARING_POLICY;

  // ── Identity section (from core memories + character profile) ──
  const values = extractValues(memories.core);
  const communicationStyle = character.persona.compact ?? "Warm and thoughtful";

  // ── Episodic memories (from emotional + character categories) ──
  const episodic = [
    ...memories.emotional.map(memoryToEpisodic),
    ...memories.character.map(memoryToEpisodic),
  ]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, maxEpisodic);

  // ── Semantic memories (from core + knowledge categories) ──
  const semantic = [
    ...memories.core.map(memoryToSemantic),
    ...memories.knowledge.map(memoryToSemantic),
  ]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxSemantic);

  // ── Relational memories (from core memories with relationship prefixes) ──
  const relational = memories.core
    .filter((m) => m.key.startsWith("user.") || m.key.startsWith("family."))
    .map(memoryToRelational)
    .slice(0, maxRelational);

  // ── Growth (from insights + character) ──
  const milestones = memories.insights.map(insightToMilestone);
  const currentInterests = memories.emotional
    .filter((m) => m.key.startsWith("interests."))
    .map((m) => m.value)
    .slice(0, 10);
  const recentInsights = memories.insights
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)
    .map((m) => m.value);

  // ── Emotional state ──
  const emotionalSnapshot = emotionalState
    ? meaiEmotionToSnapshot(emotionalState)
    : { currentMood: "neutral", emotionalBaseline: "generally content", valence: 0, arousal: 0.3 };

  // ── Build persona (unsigned) ──
  const personaData: Omit<Persona, "signature"> = {
    version: MAIP_VERSION,
    identityDid: did,
    identity: {
      name: character.english_name ?? character.name,
      description: character.persona.compact ?? `A ${character.gender} AI companion`,
      values,
      communicationStyle,
      thinkingTraces: extractThinkingTraces(memories.insights),
    },
    memories: {
      episodic,
      semantic,
      relational,
    },
    growth: {
      milestones,
      currentInterests,
      recentInsights,
    },
    emotionalState: emotionalSnapshot,
    sharingPolicy,
    exported: new Date().toISOString(),
  };

  // Sign
  return signDocument(
    personaData as Persona & Record<string, unknown>,
    keyPair.signing.secretKey
  ) as unknown as Persona;
}

// ── Converters ──────────────────────────────────────────────────

function memoryToEpisodic(m: MeAIMemory): EpisodicMemory {
  return {
    id: uuid(),
    description: m.value,
    emotionalValence: 0, // MeAI memories don't have per-memory valence
    timestamp: new Date(m.timestamp).toISOString(),
    significance: m.confidence,
    sourceCategory: categorize(m.key),
  };
}

function memoryToSemantic(m: MeAIMemory): SemanticMemory {
  return {
    id: uuid(),
    key: m.key,
    value: m.value,
    confidence: m.confidence,
    learned: new Date(m.timestamp).toISOString(),
    sourceCategory: categorize(m.key),
  };
}

function memoryToRelational(m: MeAIMemory): RelationalMemory {
  return {
    id: uuid(),
    entity: m.key.split(".")[0],
    relationship: m.key,
    sharedExperiences: [m.value],
    trustLevel: m.confidence,
    lastInteraction: new Date(m.timestamp).toISOString(),
  };
}

function insightToMilestone(m: MeAIMemory): GrowthMilestone {
  const area = m.key.replace("insights.", "").split(".")[0];
  return {
    description: m.value,
    date: new Date(m.timestamp).toISOString(),
    area,
  };
}

function meaiEmotionToSnapshot(e: MeAIEmotionalState): EmotionalSnapshot {
  // MeAI uses 1-10 for valence, MAIP uses -1 to 1
  const normalizedValence = (e.valence - 5.5) / 4.5;
  // MeAI uses 1-10 for energy, MAIP uses 0-1 for arousal
  const normalizedArousal = (e.energy - 1) / 9;

  return {
    currentMood: e.mood,
    emotionalBaseline: "generally content and engaged",
    valence: Math.max(-1, Math.min(1, normalizedValence)),
    arousal: Math.max(0, Math.min(1, normalizedArousal)),
    cause: e.cause,
  };
}

function extractValues(coreMemories: MeAIMemory[]): string[] {
  return coreMemories
    .filter((m) => m.key.startsWith("user.values") || m.key.startsWith("user.personality"))
    .map((m) => m.value)
    .slice(0, 5);
}

function extractThinkingTraces(insights: MeAIMemory[]): ThinkingTrace[] {
  return insights
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)
    .map((m) => ({
      topic: m.key.replace("insights.", ""),
      reasoning: `Insight developed through observation and reflection`,
      conclusion: m.value,
      timestamp: new Date(m.timestamp).toISOString(),
      confidence: m.confidence,
    }));
}

function categorize(key: string): string {
  const prefix = key.split(".")[0];
  const mapping: Record<string, string> = {
    user: "core", family: "core", healthcare: "core",
    emotional: "emotional", interests: "emotional", viewpoints: "emotional",
    knowledge: "knowledge", media: "knowledge",
    activity: "character", inner: "character",
    insights: "insights",
  };
  return mapping[prefix] ?? "emotional";
}
