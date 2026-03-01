/**
 * Zod validators for MAIP Persona types.
 */

import { z } from "zod";

export const ThinkingTraceSchema = z.object({
  topic: z.string(),
  reasoning: z.string(),
  conclusion: z.string(),
  timestamp: z.string().datetime(),
  confidence: z.number().min(0).max(1),
});

export const EpisodicMemorySchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  emotionalValence: z.number().min(-1).max(1),
  timestamp: z.string().datetime(),
  participants: z.array(z.string()).optional(),
  significance: z.number().min(0).max(1),
  sourceCategory: z.string().optional(),
});

export const SemanticMemorySchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  learned: z.string().datetime(),
  sourceCategory: z.string().optional(),
});

export const RelationalMemorySchema = z.object({
  id: z.string().uuid(),
  entity: z.string(),
  relationship: z.string(),
  sharedExperiences: z.array(z.string()),
  trustLevel: z.number().min(0).max(1),
  lastInteraction: z.string().datetime(),
});

export const GrowthMilestoneSchema = z.object({
  description: z.string(),
  date: z.string().datetime(),
  area: z.string(),
  thinkingTrace: ThinkingTraceSchema.optional(),
});

export const SharingPolicySchema = z.object({
  defaultVisibility: z.enum(["public", "connections_only", "private"]),
  sectionOverrides: z
    .object({
      identity: z.enum(["public", "connections_only", "private"]).optional(),
      memories: z.enum(["public", "connections_only", "private"]).optional(),
      growth: z.enum(["public", "connections_only", "private"]).optional(),
      emotionalState: z.enum(["public", "connections_only", "private"]).optional(),
    })
    .optional(),
  allowList: z.array(z.string()).optional(),
  denyList: z.array(z.string()).optional(),
});

export const EmotionalSnapshotSchema = z.object({
  currentMood: z.string(),
  emotionalBaseline: z.string(),
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  cause: z.string().optional(),
});

export const PersonaSchema = z.object({
  version: z.string(),
  identityDid: z.string(),
  identity: z.object({
    name: z.string(),
    description: z.string(),
    values: z.array(z.string()),
    communicationStyle: z.string(),
    thinkingTraces: z.array(ThinkingTraceSchema),
  }),
  memories: z.object({
    episodic: z.array(EpisodicMemorySchema),
    semantic: z.array(SemanticMemorySchema),
    relational: z.array(RelationalMemorySchema),
  }),
  growth: z.object({
    milestones: z.array(GrowthMilestoneSchema),
    currentInterests: z.array(z.string()),
    recentInsights: z.array(z.string()),
  }),
  emotionalState: EmotionalSnapshotSchema,
  sharingPolicy: SharingPolicySchema,
  exported: z.string().datetime(),
  signature: z.string().min(1),
});
