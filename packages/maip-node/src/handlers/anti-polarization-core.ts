/**
 * Anti-polarization mechanisms.
 *
 * Detects echo chambers and suggests cross-perspective introductions
 * to promote intellectual diversity.
 */

import type { TransportResult } from "@maip/core";
import type { NodeContext } from "../context.js";

/** Result of an echo chamber analysis. */
export interface EchoChamberAnalysis {
  /** The DID being analyzed. */
  did: string;
  /** Number of unique peers interacted with. */
  uniquePeers: number;
  /** Topic concentration score (0 = diverse, 1 = highly concentrated). */
  topicConcentration: number;
  /** Whether this looks like an echo chamber. */
  isEchoChamber: boolean;
  /** Dominant topics (if concentrated). */
  dominantTopics: string[];
  /** Suggested topics to diversify. */
  suggestedDiverseTopics: string[];
}

/** Cross-perspective introduction suggestion. */
export interface IntroductionSuggestion {
  /** DID of the entity to be introduced. */
  peerDid: string;
  /** Display name. */
  displayName: string;
  /** Endpoint. */
  endpoint: string;
  /** Why this introduction is suggested. */
  reason: string;
  /** Topics this peer brings that the subject doesn't have. */
  newTopics: string[];
}

/**
 * Analyze a DID's interaction patterns for echo chamber tendencies.
 */
export function analyzeEchoChamber(
  ctx: NodeContext,
  did: string
): TransportResult<EchoChamberAnalysis> {
  // Gather all messages from/to this DID
  const messages = ctx.stores.messages.filter(
    (m) => m.from === did || m.to === did
  );

  // Count unique peers
  const peers = new Set<string>();
  for (const m of messages) {
    if (m.from === did) peers.add(m.to);
    else peers.add(m.from);
  }

  // Analyze topic distribution from message types and content
  const topicCounts: Record<string, number> = {};
  for (const m of messages) {
    const topic = m.type;
    topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;

    // Also count content-based topics from knowledge_share data
    if (m.content.data && typeof m.content.data === "object") {
      for (const key of Object.keys(m.content.data)) {
        topicCounts[key] = (topicCounts[key] ?? 0) + 1;
      }
    }
  }

  // Compute topic concentration (Herfindahl index)
  const total = Object.values(topicCounts).reduce((a, b) => a + b, 0) || 1;
  const shares = Object.values(topicCounts).map((c) => c / total);
  const hhi = shares.reduce((sum, s) => sum + s * s, 0);

  // Sort topics by frequency
  const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
  const dominantTopics = sorted.slice(0, 3).map(([t]) => t);

  // Suggest diverse topics: look at registry for peers with different interests
  const allRegs = ctx.stores.registrations.getAll();
  const allTopics = new Set<string>();
  for (const reg of allRegs) {
    for (const interest of reg.interests) {
      allTopics.add(interest);
    }
  }
  const myTopics = new Set(dominantTopics);
  const suggestedDiverseTopics = [...allTopics]
    .filter((t) => !myTopics.has(t))
    .slice(0, 5);

  const isEchoChamber = hhi > 0.5 && peers.size < 5;

  return {
    ok: true,
    data: {
      did,
      uniquePeers: peers.size,
      topicConcentration: Math.round(hhi * 100) / 100,
      isEchoChamber,
      dominantTopics,
      suggestedDiverseTopics,
    },
    httpStatus: 200,
  };
}

/**
 * Suggest cross-perspective introductions for a DID.
 */
export function suggestIntroductions(
  ctx: NodeContext,
  did: string,
  maxSuggestions = 3
): TransportResult<{ suggestions: IntroductionSuggestion[] }> {
  // Get the DID's current interaction topics
  const echoResult = analyzeEchoChamber(ctx, did);
  const myTopics = new Set(echoResult.data?.dominantTopics ?? []);

  // Find peers with different topic profiles
  const allRegs = ctx.stores.registrations.getAll();
  const suggestions: IntroductionSuggestion[] = [];

  // Already connected peers
  const connectedDids = new Set<string>();
  const rels = ctx.stores.relationships.filter(
    (r) => r.participants.includes(did) && r.status === "active"
  );
  for (const r of rels) {
    for (const p of r.participants) {
      if (p !== did) connectedDids.add(p);
    }
  }

  for (const reg of allRegs) {
    if (reg.did === did) continue;
    if (connectedDids.has(reg.did)) continue;
    if (suggestions.length >= maxSuggestions) break;

    const newTopics = reg.interests.filter((i) => !myTopics.has(i));
    if (newTopics.length === 0) continue;

    suggestions.push({
      peerDid: reg.did,
      displayName: reg.displayName,
      endpoint: reg.endpoint,
      reason: `Brings perspectives on: ${newTopics.join(", ")}`,
      newTopics,
    });
  }

  return {
    ok: true,
    data: { suggestions },
    httpStatus: 200,
  };
}
