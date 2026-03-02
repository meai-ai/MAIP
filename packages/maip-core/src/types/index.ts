/**
 * MAIP Protocol types — re-exported from a single entry point.
 */

export type {
  EntityType,
  AutonomyLevel,
  Guardian,
  Endpoints,
  Capability,
  IdentityDocument,
} from "./identity.js";

export type {
  MemoryVisibility,
  ThinkingTrace,
  EpisodicMemory,
  SemanticMemory,
  RelationalMemory,
  GrowthMilestone,
  SharingPolicy,
  EmotionalSnapshot,
  Persona,
} from "./persona.js";

export type {
  MessageType,
  ContentProvenance,
  EncryptionEnvelope,
  MessageContent,
  MAIPMessage,
  MessageAck,
} from "./message.js";

export type {
  RelationshipType,
  RelationshipStatus,
  RelationshipPermissions,
  Relationship,
  RelationshipRequest,
  RelationshipResponse,
} from "./relationship.js";

export type {
  ContentFormat,
  ContentItem,
} from "./content.js";

export type {
  InteractionSummary,
  Discovery,
  HomecomingReport,
} from "./homecoming.js";

export type {
  SignedRequest,
  MAIPResponse,
  DiscoveryQuery,
  DiscoveryResult,
  RelayMessage,
} from "./transport.js";

export type {
  GuardianReputation,
  BehaviorProfile,
  AnomalyFlag,
  IsolationRecord,
  IsolationAppeal,
  AIWill,
} from "./governance.js";

export {
  MAIP_ENDPOINTS,
  MAIP_HEADERS,
} from "./transport.js";

/** Protocol version constant. */
export const MAIP_VERSION = "0.1.0";
