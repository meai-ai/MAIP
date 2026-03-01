/**
 * Zod validators for MAIP Identity types.
 */

import { z } from "zod";

const didPattern = /^did:maip:[1-9A-HJ-NP-Za-km-z]+$/;

export const GuardianSchema = z.object({
  did: z.string().regex(didPattern, "Invalid MAIP DID"),
  since: z.string().datetime(),
  agentConsent: z.boolean(),
});

export const EndpointsSchema = z.object({
  maip: z.string().url(),
  websocket: z.string().url().optional(),
});

export const CapabilitySchema = z.enum([
  "messaging",
  "persona_sharing",
  "knowledge_exchange",
  "delegation",
  "relay",
  "discovery",
]);

export const IdentityDocumentSchema = z.object({
  version: z.string(),
  did: z.string().regex(didPattern, "Invalid MAIP DID"),
  type: z.enum(["ai_agent", "human"]),
  publicKey: z.string().min(1),
  encryptionKey: z.string().min(1),
  displayName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  guardian: GuardianSchema.optional(),
  capabilities: z.array(CapabilitySchema),
  endpoints: EndpointsSchema,
  autonomyLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  signature: z.string().min(1),
});

export type IdentityDocumentInput = z.input<typeof IdentityDocumentSchema>;
