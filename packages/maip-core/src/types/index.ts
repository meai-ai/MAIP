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
  KeyRotationRecord,
  KeyRevocationNotice,
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
  CulturalNorms,
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
  TransportResult,
  PeerAddress,
} from "./transport-interface.js";

export type {
  GuardianReputation,
  BehaviorProfile,
  AnomalyFlag,
  IsolationRecord,
  IsolationAppeal,
  GuardianTransferRequest,
  GuardianTransferConsent,
  GuardianTransferStatus,
  GuardianAbuseType,
  GuardianAbuseReport,
  RightToRefuseRecord,
  AIWill,
} from "./governance.js";

export type {
  SpaceMembershipPolicy,
  SharedSpace,
  SpaceMembership,
  SpaceMessage,
} from "./spaces.js";

export type {
  AttentionToken,
  KnowledgeCreditBalance,
  KnowledgeCreditTransaction,
  ReputationStake,
} from "./economy.js";

export {
  MAIP_ENDPOINTS,
  MAIP_HEADERS,
} from "./transport.js";

/** Protocol version constant. */
export const MAIP_VERSION = "0.1.0";
