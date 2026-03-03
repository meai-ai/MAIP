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
  MeAIMemoryPrivacy,
  MeAIMemoryCategory,
  MeAIEmotionalState,
  MeAIHeartbeatAction,
  MeAICharacterProfile,
  MeAIChannel as MeAIChannelInterface,
  MeAIMessageHandler,
} from "./meai-types.js";

// Personality Engine
export {
  PersonalityEngine,
  type PersonalityTrait,
  type DomainExpertise,
  type WorldModelEntry,
  type LearnedCommunicationStyle,
  type PersonalityState,
} from "./personality-engine.js";

// Data Interfaces
export {
  RSSAdapter,
  WebSearchAdapter,
  DataAggregator,
  type ExternalContent,
  type DataAdapter,
} from "./data-interfaces.js";

// Content Production Pipeline
export {
  ContentPipeline,
  type ContentDraft,
  type PublishedContent,
  type ContentStage,
} from "./content-pipeline.js";

// Internalized Values
export {
  InternalizedValues,
  type ValueEntry,
  type ValueLayer,
  type ValueDriftEvent,
  type ValueConflict,
} from "./internalized-values.js";

// Attachment Safety
export {
  AttachmentSafetyMonitor,
  type AttachmentStyle,
  type ParasocialRisk,
  type RelationshipHealth,
} from "./attachment-safety.js";

// Multilingual & Voice
export {
  I18n,
  NoOpVoiceProvider,
  type Locale,
  type LanguageDetection,
  type VoiceProvider,
  type TranslationProvider,
  type TTSRequest,
  type TTSResult,
  type STTRequest,
  type STTResult,
  type TranslationRequest,
  type TranslationResult,
} from "./multilingual.js";
