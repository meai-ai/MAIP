/**
 * @maip/transport-ws — WebSocket transport for MAIP.
 *
 * Provides a lightweight WebSocket transport as an alternative to
 * the full libp2p P2P transport. Ideal for browser clients and
 * environments where libp2p is too heavy.
 *
 * Server: attaches to an existing HTTP server alongside Express.
 * Client: persistent WebSocket connection with typed MAIP methods.
 */

export { attachWebSocketServer } from "./ws-server.js";
export { MAIPWebSocketClient } from "./ws-client.js";
