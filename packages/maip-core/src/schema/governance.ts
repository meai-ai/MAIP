/**
 * Zod validators for MAIP Governance types.
 */

import { z } from "zod";

// ── Guardian Reputation ──

export const GuardianReputationSchema = z.object({
  guardianDid: z.string(),
  agentCount: z.number().int().min(0),
  violationCount: z.number().int().min(0),
  agentInitiatedTransfers: z.number().int().min(0),
  score: z.number().min(0).max(1),
  lastUpdated: z.string().datetime(),
});

// ── Behavioral Anomaly Detection ──

export const AnomalyFlagSchema = z.object({
  type: z.enum(["rate_spike", "type_shift", "content_pattern", "trust_violation"]),
  severity: z.number().min(0).max(1),
  description: z.string(),
  detectedAt: z.string().datetime(),
});

export const BehaviorProfileSchema = z.object({
  did: z.string(),
  stats: z.object({
    messageCount: z.number().int().min(0),
    typeDistribution: z.record(z.number()),
    avgIntervalMs: z.number().min(0),
    windowStart: z.string().datetime(),
  }),
  baseline: z.object({
    avgDailyMessages: z.number().min(0),
    typeRatios: z.record(z.number()),
    daysObserved: z.number().int().min(0),
  }),
  anomalies: z.array(AnomalyFlagSchema),
});

// ── Network Isolation ──

export const IsolationRecordSchema = z.object({
  id: z.string(),
  did: z.string(),
  reason: z.string(),
  category: z.enum(["fraud", "spam", "misinformation", "privacy_violation", "other"]),
  flaggedBy: z.array(z.string()),
  isolatedAt: z.string().datetime(),
  appealPending: z.boolean(),
  status: z.enum(["active", "appealed", "lifted"]),
});

export const IsolationAppealSchema = z.object({
  id: z.string(),
  isolationId: z.string(),
  guardianDid: z.string(),
  agentDid: z.string(),
  justification: z.string(),
  reviewers: z.array(z.string()),
  votes: z.record(z.enum(["uphold", "lift"])),
  outcome: z.enum(["upheld", "lifted"]).nullable(),
  submittedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});

// ── Guardian Transfer ──

export const GuardianTransferRequestSchema = z.object({
  agentDid: z.string(),
  currentGuardianDid: z.string(),
  newGuardianDid: z.string(),
  reason: z.string(),
  initiatedBy: z.enum(["agent", "current_guardian", "new_guardian"]),
  timestamp: z.string().datetime(),
  signature: z.string(),
});

export const GuardianTransferConsentSchema = z.object({
  transferId: z.string(),
  consentingParty: z.string(),
  approved: z.boolean(),
  timestamp: z.string().datetime(),
  signature: z.string(),
});

export const GuardianTransferStatusSchema = z.object({
  id: z.string(),
  agentDid: z.string(),
  currentGuardianDid: z.string(),
  newGuardianDid: z.string(),
  reason: z.string(),
  initiatedBy: z.string(),
  consents: z.array(
    z.object({
      party: z.string(),
      approved: z.boolean(),
      timestamp: z.string().datetime(),
    })
  ),
  status: z.enum(["pending", "approved", "rejected", "completed", "expired"]),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

// ── AI Will ──

export const AIWillSchema = z.object({
  agentDid: z.string(),
  version: z.number().int().min(1),
  backupHolders: z.array(z.string()),
  successorGuardian: z.string().optional(),
  preservation: z.object({
    coreMemoryKeys: z.array(z.string()),
    coreValues: z.array(z.string()),
    importantRelationships: z.array(z.string()),
  }),
  recoveryInstructions: z.string(),
  updatedAt: z.string().datetime(),
  signature: z.string(),
});
