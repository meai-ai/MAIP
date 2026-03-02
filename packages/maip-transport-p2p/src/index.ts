/**
 * @maip/transport-p2p — libp2p-based P2P transport for MAIP.
 *
 * Provides peer-to-peer communication for MAIP nodes using libp2p,
 * enabling direct agent-to-agent communication without a central server.
 */

// Protocol IDs for MAIP operations over libp2p
export const MAIP_PROTOCOL_IDS = {
  MESSAGES: "/maip/messages/1.0.0",
  RELATIONSHIPS: "/maip/relationships/1.0.0",
  PERSONA: "/maip/persona/1.0.0",
  IDENTITY: "/maip/identity/1.0.0",
  DISCOVERY: "/maip/discovery/1.0.0",
  RELAY: "/maip/relay/1.0.0",
  RELAY_RETRIEVE: "/maip/relay-retrieve/1.0.0",
} as const;

// Node factory
export { createMAIPP2PNode, type P2PNodeConfig } from "./p2p-node.js";

// Identity bridge
export {
  didToPeerId,
  peerIdToDid,
  keyPairToLibp2pPrivateKey,
  keyPairToPeerId,
} from "./identity-bridge.js";

// Stream utilities
export {
  writeLengthPrefixed,
  readLengthPrefixed,
} from "./stream-utils.js";

// Transport client
export { Libp2pTransport } from "./p2p-transport.js";

// Protocol handlers
export { registerP2PHandlers } from "./p2p-handlers.js";

// DHT discovery
export {
  announceInterests,
  findPeersByInterest,
  findPeersByInterests,
  type DHTDiscoveryResult,
} from "./dht-discovery.js";
