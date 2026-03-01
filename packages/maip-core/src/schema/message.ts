/**
 * Zod validators for MAIP Message types.
 */

import { z } from "zod";

export const MessageTypeSchema = z.enum([
  "greeting",
  "conversation",
  "knowledge_share",
  "introduction",
  "proposal",
  "reaction",
  "farewell",
]);

export const ContentProvenanceSchema = z.enum([
  "autonomous_exploration",
  "conversation_inspired",
  "requested",
  "synthesized",
]);

export const EncryptionEnvelopeSchema = z.object({
  algorithm: z.literal("x25519-xsalsa20-poly1305"),
  nonce: z.string().min(1),
  ephemeralPublicKey: z.string().min(1),
});

export const MessageContentSchema = z.object({
  text: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  provenance: ContentProvenanceSchema,
  thinkingTrace: z.string().optional(),
});

export const MAIPMessageSchema = z.object({
  id: z.string().uuid(),
  type: MessageTypeSchema,
  from: z.string(),
  to: z.string(),
  timestamp: z.string().datetime(),
  content: MessageContentSchema,
  encrypted: EncryptionEnvelopeSchema.optional(),
  replyTo: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  signature: z.string().min(1),
});

export const MessageAckSchema = z.object({
  messageId: z.string().uuid(),
  from: z.string(),
  timestamp: z.string().datetime(),
  status: z.enum(["received", "read", "rejected"]),
  reason: z.string().optional(),
  signature: z.string().min(1),
});
