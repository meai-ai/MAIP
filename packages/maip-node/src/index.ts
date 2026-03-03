/**
 * @maip/node — Standalone MAIP node.
 *
 * Exports the server, initialization, client, discovery, and relay
 * modules for building MAIP-enabled applications.
 *
 * @example
 * ```ts
 * import { initNode, startServer } from "@maip/node";
 *
 * const ctx = initNode(
 *   { port: 3000, publicUrl: "http://localhost:3000", dataDir: "./data" },
 *   { displayName: "My Agent", type: "ai_agent" }
 * );
 *
 * ctx.onMessage = (msg) => console.log("Received:", msg.content.text);
 *
 * startServer(ctx);
 * ```
 */

// Server
export { createApp, startServer } from "./server.js";

// Initialization
export { initNode, updateIdentity, type InitOptions } from "./init.js";

// Context
export type { NodeConfig, NodeContext, TransportMode, P2PConfig, TLSConfig } from "./context.js";

// Client
export {
  sendMessage,
  sendRelationshipRequest,
  fetchPersona,
  fetchIdentity,
  fetchGuardianReputation,
  reportGuardianEvent,
  isolateDid,
  checkIsolation,
  submitAppeal,
  voteOnAppeal,
  initiateGuardianTransfer,
  submitTransferConsent,
  getTransferStatus,
  createSpace,
  joinSpace,
  postToSpace,
  getSpaceMessages,
  upsertAIWill,
  getAIWill,
  sendBackupShard,
  getBackupShards,
  type SendMessageOptions,
} from "./client.js";

// Discovery
export {
  registerWithRegistry,
  discoverPeers,
  fetchRemoteIdentity,
} from "./discovery.js";

// Relay
export {
  storeRelayMessage,
  retrieveRelayMessages,
} from "./relay.js";

// Handler cores (transport-agnostic)
export { processIncomingMessage } from "./handlers/messages-core.js";
export { processRelationshipRequest } from "./handlers/relationships-core.js";
export { processPersonaRequest } from "./handlers/persona-core.js";
export { processIdentityRequest } from "./handlers/identity-core.js";
export { processDiscoveryQuery, computeDiversityScore } from "./handlers/discover-core.js";
export { processRelayStore, processRelayRetrieve } from "./handlers/relay-core.js";
export {
  processInitiateTransfer,
  processTransferConsent,
  processGetTransferStatus,
} from "./handlers/guardian-transfer-core.js";
export {
  processCreateSpace,
  processJoinSpace,
  processPostToSpace,
  processGetSpaceMessages,
} from "./handlers/spaces-core.js";
export {
  processKeyRotation,
  verifyKeyRotation,
  processKeyRevocation,
} from "./handlers/key-rotation-core.js";
export {
  processAbuseReport,
  processGetAbuseReports,
  processRightToRefuse,
} from "./handlers/guardian-abuse-core.js";
export {
  analyzeEchoChamber,
  suggestIntroductions,
} from "./handlers/anti-polarization-core.js";
export {
  proposeCulturalNorms,
  getCulturalNorms,
} from "./handlers/cultural-norms-core.js";
export {
  issueAttentionTokens,
  getAttentionBalance,
  spendAttentionTokens,
  getKnowledgeCreditBalance,
  transferKnowledgeCredits,
  awardKnowledgeCredits,
  createReputationStake,
  resolveReputationStake,
  getReputationStakes,
} from "./handlers/economy-core.js";

// Stores
export {
  NodeStores,
  type RegistrationEntry,
  type GuardianReputationEntry,
  type IsolationRecordEntry,
  type IsolationAppealEntry,
  type BehaviorProfileEntry,
  type GuardianTransferEntry,
  type SharedSpaceEntry,
  type SpaceMembershipEntry,
  type SpaceMessageEntry,
  type GuardianAbuseReportEntry,
  type RightToRefuseEntry,
  type AttentionTokenEntry,
  type KnowledgeCreditBalanceEntry,
  type KnowledgeCreditTransactionEntry,
  type ReputationStakeEntry,
} from "./stores/index.js";
export { JsonStore } from "./stores/json-store.js";

// Accessibility
export {
  type VoiceAdapter,
  NoOpVoiceAdapter,
  toMinimalPayload,
  OfflineQueue,
} from "./accessibility.js";

// Autonomy State Machine
export {
  evaluateAutonomyTransition,
  processAutonomyTransition,
  isActionAllowed,
  getHomecomingConfig,
} from "./handlers/autonomy-core.js";

// Data Sovereignty
export {
  exportNodeData,
  saveExport,
  loadExport,
  importNodeData,
  type NodeDataExport,
} from "./data-sovereignty.js";

// Encrypted Store
export { EncryptedJsonStore } from "./stores/encrypted-store.js";

// Audit Log (tamper-proof records)
export { AuditLog, type AuditLogEntry } from "./stores/audit-log.js";

// Cross-Node Anomaly Sharing
export {
  receiveAnomalyReport,
  createAnomalyReport,
  assessThreat,
  getPendingForwards,
  type SharedAnomalyReport,
  type ThreatAssessment,
} from "./handlers/anomaly-sharing-core.js";

// Labeling Enforcement
export {
  validateIdentityLabeling,
  validateMessageLabeling,
  enforceLabelingPolicy,
  type LabelingValidation,
} from "./handlers/labeling-core.js";

// Post-Leak Remediation
export {
  reportBreach,
  executeRemediation,
  getBreachReports,
  getBreachReport,
  type BreachReport,
  type BreachSeverity,
} from "./handlers/remediation-core.js";

// Guardian Authority Enforcement
export {
  processGuardianCommand,
  isActionBlocked,
  getActiveRestrictions,
  getCommandHistory,
  type GuardianCommand,
  type GuardianCommandType,
  type ActiveRestrictions,
} from "./handlers/guardian-authority-core.js";

// Federation
export {
  registerFederatedRegistry,
  resolveDID,
  getFederationHealth,
  getFederatedRegistries,
  updateRegistryTrust,
  type FederatedRegistry,
  type DIDResolution,
  type FederationHealth,
} from "./handlers/federation-core.js";

// Fork Protocol
export {
  processFork,
  verifyNotClone,
  type ForkRequest,
  type ForkResult,
  type ForkLineage,
} from "./handlers/fork-core.js";

// Distributed Consensus
export {
  createIsolationProposal,
  voteOnProposal,
  getProposals_,
  getProposal,
  type IsolationProposal,
} from "./handlers/consensus-core.js";

// Distributed Fact Verification
export {
  submitFactClaim,
  verifyFactClaim,
  getFactClaim,
  searchFactClaims,
  type FactClaim,
  type FactVerification,
} from "./handlers/fact-verification-core.js";

// AI Will & Distributed Backup
export {
  upsertWill,
  getWill,
  deleteWill,
  receiveBackupShard,
  getBackupShards as getBackupShardsForAgent,
  pruneExpiredBackups,
  type BackupShard,
} from "./handlers/ai-will-core.js";
