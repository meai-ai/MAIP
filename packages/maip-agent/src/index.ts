/**
 * @maip/agent — MeAI ↔ MAIP bridge.
 *
 * Connects a MeAI engine to the MAIP network, providing:
 * - Adapter: central orchestrator for node lifecycle and peer management
 * - Channel: MeAI Channel implementation for MAIP network messages
 * - Persona Sync: bidirectional mapping of MeAI memories ↔ MAIP Persona
 * - Homecoming Reports: periodic agent→guardian activity reports
 *
 * @example
 * ```ts
 * import { MAIPBridge } from "@maip/agent";
 *
 * const bridge = new MAIPBridge({
 *   port: 3001,
 *   publicUrl: "http://localhost:3001",
 *   dataDir: "./maip-data",
 *   character: { name: "Aria", english_name: "Aria", ... },
 *   guardianDid: "did:maip:abc123...",
 * });
 *
 * const { ctx, channel } = await bridge.start();
 * // channel implements MeAI's Channel interface
 * ```
 */

export { MAIPBridge, type MAIPBridgeConfig } from "./adapter.js";
export { MAIPChannel } from "./channel.js";
export {
  exportPersona,
  type MeAIMemorySnapshot,
  type PersonaExportOptions,
} from "./persona-sync.js";
export {
  generateHomecomingReport,
  type ReportingPeriodData,
} from "./homecoming.js";
export type {
  MeAIMemory,
  MeAIMemoryCategory,
  MeAIEmotionalState,
  MeAIHeartbeatAction,
  MeAICharacterProfile,
  MeAIChannel as MeAIChannelInterface,
  MeAIMessageHandler,
} from "./meai-types.js";
