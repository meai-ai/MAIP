/**
 * @maip/core — MAIP Protocol core library.
 *
 * Provides TypeScript types, cryptographic utilities, and Zod validators
 * for the MeAI Interweave Protocol (MAIP).
 *
 * @example
 * ```ts
 * import { generateKeyPair, sign, verify, MAIPMessageSchema } from "@maip/core";
 *
 * // Generate a new identity keypair
 * const keys = generateKeyPair();
 * console.log(keys.did); // did:maip:5Hq3...
 *
 * // Sign a message
 * const sig = sign({ hello: "world" }, keys.signing.secretKey);
 *
 * // Validate a message with Zod
 * const result = MAIPMessageSchema.safeParse(messageData);
 * ```
 */

// ── Types ──────────────────────────────────────────────────────────
export * from "./types/index.js";

// ── Crypto ─────────────────────────────────────────────────────────
export * from "./crypto/index.js";

// ── Validators ─────────────────────────────────────────────────────
export * from "./schema/index.js";
