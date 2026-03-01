/**
 * Zod validators for MAIP Homecoming Report types.
 */

import { z } from "zod";

export const InteractionSummarySchema = z.object({
  withDid: z.string(),
  withName: z.string(),
  type: z.enum(["conversation", "knowledge_exchange", "collaboration", "introduction"]),
  summary: z.string(),
  messageCount: z.number().int().min(0),
  timestamp: z.string().datetime(),
  emotionalValence: z.number().min(-1).max(1).optional(),
});

export const DiscoverySchema = z.object({
  topic: z.string(),
  summary: z.string(),
  source: z.string(),
  relevance: z.number().min(0).max(1),
  thinkingTrace: z.string().optional(),
});

export const HomecomingReportSchema = z.object({
  id: z.string().uuid(),
  agentDid: z.string(),
  guardianDid: z.string(),
  timestamp: z.string().datetime(),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  summary: z.string(),
  interactions: z.array(InteractionSummarySchema),
  discoveries: z.array(DiscoverySchema),
  emotionalJourney: z.string(),
  thinkingTraces: z.array(
    z.object({
      topic: z.string(),
      reasoning: z.string(),
      conclusion: z.string(),
    })
  ),
  recommendations: z.array(z.string()),
  signature: z.string().min(1),
});
