/**
 * DHT-based peer discovery.
 *
 * Each interest maps to a CID (content-addressed key). Nodes announce themselves
 * as providers for their interest CIDs. Discovery queries the DHT for providers.
 */

import type { Libp2p } from "libp2p";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";
import { peerIdToDid } from "./identity-bridge.js";

/**
 * Convert an interest string to a CID for DHT provider records.
 */
async function interestToCID(interest: string): Promise<CID> {
  const bytes = new TextEncoder().encode(`maip:interest:${interest.toLowerCase()}`);
  const hash = await sha256.digest(bytes);
  return CID.create(1, raw.code, hash);
}

/**
 * Announce this node as a provider for the given interests on the DHT.
 *
 * Other nodes can then find this peer by querying for those interest CIDs.
 */
export async function announceInterests(
  node: Libp2p,
  interests: string[]
): Promise<void> {
  for (const interest of interests) {
    try {
      const cid = await interestToCID(interest);
      await node.contentRouting.provide(cid);
    } catch (err) {
      console.warn(`[dht-discovery] Failed to announce interest "${interest}":`, err);
    }
  }
}

/** Result from DHT peer discovery. */
export interface DHTDiscoveryResult {
  /** MAIP DID of the discovered peer. */
  did: string;
  /** libp2p multiaddrs where the peer can be reached. */
  multiaddrs: string[];
}

/**
 * Find peers that announced a given interest on the DHT.
 */
export async function findPeersByInterest(
  node: Libp2p,
  interest: string,
  limit: number = 20
): Promise<DHTDiscoveryResult[]> {
  const cid = await interestToCID(interest);
  const results: DHTDiscoveryResult[] = [];
  const seen = new Set<string>();

  try {
    for await (const provider of node.contentRouting.findProviders(cid)) {
      const peerId = provider.id;
      const peerIdStr = peerId.toString();

      if (seen.has(peerIdStr)) continue;
      seen.add(peerIdStr);

      try {
        const did = peerIdToDid(peerId);
        const multiaddrs = provider.multiaddrs?.map((ma) => ma.toString()) ?? [];
        results.push({ did, multiaddrs });
      } catch {
        // Skip peers whose PeerId can't be converted to a DID
      }

      if (results.length >= limit) break;
    }
  } catch (err) {
    console.warn(`[dht-discovery] Error finding providers for interest "${interest}":`, err);
  }

  return results;
}

/**
 * Find peers by multiple interests, aggregating and deduplicating results.
 */
export async function findPeersByInterests(
  node: Libp2p,
  interests: string[],
  limit: number = 20
): Promise<DHTDiscoveryResult[]> {
  const allResults = new Map<string, DHTDiscoveryResult>();

  for (const interest of interests) {
    const results = await findPeersByInterest(node, interest, limit);
    for (const result of results) {
      if (!allResults.has(result.did)) {
        allResults.set(result.did, result);
      } else {
        // Merge multiaddrs
        const existing = allResults.get(result.did)!;
        const addrSet = new Set([...existing.multiaddrs, ...result.multiaddrs]);
        existing.multiaddrs = [...addrSet];
      }
    }

    if (allResults.size >= limit) break;
  }

  return [...allResults.values()].slice(0, limit);
}
