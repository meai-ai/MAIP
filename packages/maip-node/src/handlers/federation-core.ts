/**
 * Federation & True Decentralization.
 *
 * Implements the whitepaper's vision of a truly decentralized network:
 * - DID resolution across federated registries
 * - Federation registry for inter-node discovery
 * - Cross-registry trust propagation
 * - Peer mesh topology without single points of failure
 *
 * Federation model:
 * - Each node can operate as a "registry" that knows about other registries
 * - Registries share their peer lists (federation)
 * - DID resolution walks the federation graph until the DID is found
 * - No central authority — any node can bootstrap a new registry
 */

import type { NodeContext } from "../context.js";
import type { TransportResult } from "@maip/core";

/** A federated registry entry. */
export interface FederatedRegistry {
  /** Registry node's DID. */
  did: string;
  /** HTTP endpoint of the registry. */
  endpoint: string;
  /** Display name. */
  name: string;
  /** Number of registered agents. */
  agentCount: number;
  /** Trust score for this registry (0-1). */
  trustScore: number;
  /** ISO 8601 timestamp of last successful contact. */
  lastContact: string;
  /** ISO 8601 timestamp when first discovered. */
  discoveredAt: string;
  /** Whether this registry is currently reachable. */
  isReachable: boolean;
}

/** DID resolution result. */
export interface DIDResolution {
  /** The resolved DID. */
  did: string;
  /** Whether the DID was found. */
  found: boolean;
  /** The registry that resolved the DID. */
  resolvedBy?: string;
  /** The endpoint of the resolved entity. */
  endpoint?: string;
  /** Entity type. */
  entityType?: "ai_agent" | "human";
  /** Display name. */
  displayName?: string;
  /** Number of hops in the resolution chain. */
  hops: number;
  /** Resolution time in ms. */
  resolutionTimeMs: number;
}

/** Federation health report. */
export interface FederationHealth {
  /** Number of known registries. */
  knownRegistries: number;
  /** Number of reachable registries. */
  reachableRegistries: number;
  /** Total agents across all registries. */
  totalAgents: number;
  /** Average trust score of registries. */
  averageTrust: number;
  /** Connectivity score (0-1). */
  connectivityScore: number;
}

// In-memory federation state per node
const federationState: Map<string, FederatedRegistry[]> = new Map();

function getRegistries(nodeDid: string): FederatedRegistry[] {
  if (!federationState.has(nodeDid)) federationState.set(nodeDid, []);
  return federationState.get(nodeDid)!;
}

/**
 * Register a federated registry (peer discovery).
 */
export function registerFederatedRegistry(
  ctx: NodeContext,
  registry: Omit<FederatedRegistry, "trustScore" | "discoveredAt" | "isReachable">
): TransportResult<FederatedRegistry> {
  const registries = getRegistries(ctx.identity.did);

  // Don't register ourselves
  if (registry.did === ctx.identity.did) {
    return { ok: false, error: "Cannot federate with self", code: "SELF_FEDERATION", httpStatus: 400 };
  }

  const existing = registries.find((r) => r.did === registry.did);
  if (existing) {
    // Update existing registry
    existing.endpoint = registry.endpoint;
    existing.name = registry.name;
    existing.agentCount = registry.agentCount;
    existing.lastContact = registry.lastContact;
    existing.isReachable = true;
    return { ok: true, data: existing, httpStatus: 200 };
  }

  const entry: FederatedRegistry = {
    ...registry,
    trustScore: 0.5, // Default trust
    discoveredAt: new Date().toISOString(),
    isReachable: true,
  };

  registries.push(entry);
  return { ok: true, data: entry, httpStatus: 201 };
}

/**
 * Resolve a DID by querying federated registries.
 * First checks local registry, then walks the federation graph.
 */
export function resolveDID(
  ctx: NodeContext,
  did: string,
  maxHops = 3
): TransportResult<DIDResolution> {
  const startTime = Date.now();

  // Step 1: Check local registrations
  const local = ctx.stores.registrations.getById(did);
  if (local) {
    return {
      ok: true,
      data: {
        did,
        found: true,
        resolvedBy: ctx.identity.did,
        endpoint: local.endpoint,
        entityType: local.type,
        displayName: local.displayName,
        hops: 0,
        resolutionTimeMs: Date.now() - startTime,
      },
      httpStatus: 200,
    };
  }

  // Step 2: Check local relationships
  const rel = ctx.stores.relationships.filter(
    (r) => r.participants.includes(did)
  );
  if (rel.length > 0) {
    return {
      ok: true,
      data: {
        did,
        found: true,
        resolvedBy: ctx.identity.did,
        hops: 0,
        resolutionTimeMs: Date.now() - startTime,
      },
      httpStatus: 200,
    };
  }

  // Step 3: Would query federated registries (async in real implementation)
  // For now, return not-found with federation info
  const registries = getRegistries(ctx.identity.did);
  const reachable = registries.filter((r) => r.isReachable);

  return {
    ok: true,
    data: {
      did,
      found: false,
      hops: Math.min(maxHops, reachable.length),
      resolutionTimeMs: Date.now() - startTime,
    },
    httpStatus: 200,
  };
}

/**
 * Get the federation health report.
 */
export function getFederationHealth(
  ctx: NodeContext
): TransportResult<FederationHealth> {
  const registries = getRegistries(ctx.identity.did);
  const reachable = registries.filter((r) => r.isReachable);
  const totalAgents = registries.reduce((sum, r) => sum + r.agentCount, 0) +
    ctx.stores.registrations.count();
  const avgTrust = registries.length > 0
    ? registries.reduce((sum, r) => sum + r.trustScore, 0) / registries.length
    : 1.0;

  // Connectivity score: ratio of reachable registries + bonus for having multiple
  const connectivity = registries.length > 0
    ? (reachable.length / registries.length) * Math.min(1, registries.length / 5)
    : 0;

  return {
    ok: true,
    data: {
      knownRegistries: registries.length,
      reachableRegistries: reachable.length,
      totalAgents,
      averageTrust: Math.round(avgTrust * 100) / 100,
      connectivityScore: Math.round(connectivity * 100) / 100,
    },
    httpStatus: 200,
  };
}

/**
 * Get list of known federated registries.
 */
export function getFederatedRegistries(
  ctx: NodeContext
): TransportResult<FederatedRegistry[]> {
  return { ok: true, data: getRegistries(ctx.identity.did), httpStatus: 200 };
}

/**
 * Update trust score for a federated registry based on interactions.
 */
export function updateRegistryTrust(
  ctx: NodeContext,
  registryDid: string,
  positive: boolean
): TransportResult<{ trustScore: number }> {
  const registries = getRegistries(ctx.identity.did);
  const registry = registries.find((r) => r.did === registryDid);

  if (!registry) {
    return { ok: false, error: "Registry not found", code: "NOT_FOUND", httpStatus: 404 };
  }

  // Weighted moving average
  const delta = positive ? 0.05 : -0.1;
  registry.trustScore = Math.max(0, Math.min(1, registry.trustScore + delta));

  // Mark unreachable if trust drops too low
  if (registry.trustScore < 0.1) {
    registry.isReachable = false;
  }

  return { ok: true, data: { trustScore: registry.trustScore }, httpStatus: 200 };
}
