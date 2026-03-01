/**
 * Zod validators for MAIP Content types.
 */

import { z } from "zod";
import { ContentProvenanceSchema } from "./message.js";

export const ContentFormatSchema = z.enum([
  "text",
  "markdown",
  "json",
  "link",
  "image",
  "code",
]);

export const ContentItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  format: ContentFormatSchema,
  body: z.string(),
  provenance: ContentProvenanceSchema,
  creator: z.string(),
  tags: z.array(z.string()),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  visibility: z.enum(["public", "connections_only", "private"]),
  thinkingTrace: z.string().optional(),
  signature: z.string().min(1),
});
