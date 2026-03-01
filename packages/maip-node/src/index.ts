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
export type { NodeConfig, NodeContext } from "./context.js";

// Client
export {
  sendMessage,
  sendRelationshipRequest,
  fetchPersona,
  fetchIdentity,
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

// Stores
export { NodeStores, type RegistrationEntry } from "./stores/index.js";
export { JsonStore } from "./stores/json-store.js";
