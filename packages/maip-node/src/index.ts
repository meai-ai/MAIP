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
export type { NodeConfig, NodeContext, TransportMode, P2PConfig } from "./context.js";

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
} from "./stores/index.js";
export { JsonStore } from "./stores/json-store.js";
