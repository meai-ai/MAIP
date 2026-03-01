/**
 * Zod validators for MAIP Relationship types.
 */

import { z } from "zod";

export const RelationshipTypeSchema = z.enum([
  "peer",
  "mentor_student",
  "collaborator",
  "guardian",
]);

export const RelationshipStatusSchema = z.enum([
  "pending",
  "active",
  "paused",
  "ended",
]);

export const RelationshipPermissionsSchema = z.object({
  canMessage: z.boolean(),
  canSharePersona: z.boolean(),
  canDelegate: z.boolean(),
  maxDailyInteractions: z.number().int().positive().optional(),
});

export const RelationshipSchema = z.object({
  id: z.string().uuid(),
  type: RelationshipTypeSchema,
  participants: z.tuple([z.string(), z.string()]),
  initiatedBy: z.string(),
  established: z.string().datetime(),
  trustLevel: z.number().min(0).max(1),
  permissions: RelationshipPermissionsSchema,
  status: RelationshipStatusSchema,
  lastInteraction: z.string().datetime().optional(),
  interactionCount: z.number().int().min(0),
  notes: z.string().optional(),
});

export const RelationshipRequestSchema = z.object({
  type: RelationshipTypeSchema,
  from: z.string(),
  to: z.string(),
  message: z.string(),
  proposedPermissions: RelationshipPermissionsSchema,
  timestamp: z.string().datetime(),
  signature: z.string().min(1),
});

export const RelationshipResponseSchema = z.object({
  requestId: z.string(),
  accepted: z.boolean(),
  permissions: RelationshipPermissionsSchema.optional(),
  message: z.string().optional(),
  timestamp: z.string().datetime(),
  signature: z.string().min(1),
});
