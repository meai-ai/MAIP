/**
 * libp2p node factory for MAIP.
 *
 * Creates a configured libp2p node using the MAIP keypair's Ed25519 key.
 */

import { createLibp2p, type Libp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@libp2p/noise";
import { yamux } from "@libp2p/yamux";
import { kadDHT } from "@libp2p/kad-dht";
import { identify } from "@libp2p/identify";
import { circuitRelayTransport, circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { dcutr } from "@libp2p/dcutr";
import { bootstrap } from "@libp2p/bootstrap";
import { ping } from "@libp2p/ping";
import type { MAIPKeyPair } from "@maip/core";
import { keyPairToLibp2pPrivateKey } from "./identity-bridge.js";

/** Configuration for creating a MAIP P2P node. */
export interface P2PNodeConfig {
  /** MAIP keypair (Ed25519 signing keys). */
  keyPair: MAIPKeyPair;
  /** TCP port to listen on (0 for random). */
  tcpPort?: number;
  /** WebSocket port to listen on (0 for random). */
  wsPort?: number;
  /** Whether to run the DHT in server mode (for well-known nodes). */
  dhtServerMode?: boolean;
  /** Whether to enable the circuit relay server (for relay nodes). */
  enableRelayServer?: boolean;
  /** Bootstrap peer multiaddrs for initial DHT connectivity. */
  bootstrapPeers?: string[];
}

/**
 * Create a configured libp2p node from a MAIP keypair.
 *
 * The node's PeerId is derived directly from the MAIP Ed25519 key,
 * so the libp2p identity === MAIP DID identity.
 */
export async function createMAIPP2PNode(config: P2PNodeConfig): Promise<Libp2p> {
  const privateKey = keyPairToLibp2pPrivateKey(config.keyPair);

  const peerDiscovery = config.bootstrapPeers?.length
    ? [bootstrap({ list: config.bootstrapPeers })]
    : [];

  return createLibp2p({
    privateKey,
    addresses: {
      listen: [
        `/ip4/0.0.0.0/tcp/${config.tcpPort ?? 0}`,
        `/ip4/0.0.0.0/tcp/${config.wsPort ?? 0}/ws`,
      ],
    },
    transports: [
      tcp(),
      webSockets(),
      circuitRelayTransport(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      ping: ping(),
      dht: kadDHT({ clientMode: !config.dhtServerMode }),
      dcutr: dcutr(),
      ...(config.enableRelayServer ? { relay: circuitRelayServer() } : {}),
    },
    peerDiscovery,
  });
}
