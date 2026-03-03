/**
 * Tests for AttachmentSafetyMonitor — parasocial risk detection and interaction gating.
 */

import { describe, it, expect } from "vitest";
import { AttachmentSafetyMonitor } from "./attachment-safety.js";

// ── Helpers ──────────────────────────────────────────────────────

/** Record N interactions for a peer, each with messageCount=1. */
function recordMany(monitor: AttachmentSafetyMonitor, peerDid: string, count: number): void {
  for (let i = 0; i < count; i++) {
    monitor.recordInteraction(peerDid);
  }
}

// ── recordInteraction ────────────────────────────────────────────

describe("AttachmentSafetyMonitor — recordInteraction", () => {
  it("creates an interaction record", () => {
    const monitor = new AttachmentSafetyMonitor();
    monitor.recordInteraction("did:maip:peer1");

    // assessRelationship should see the interaction
    const health = monitor.assessRelationship("did:maip:peer1");
    expect(health.peerDid).toBe("did:maip:peer1");
    expect(health.avgDailyMessages).toBeGreaterThan(0);
  });

  it("prunes entries older than 30 days", () => {
    const monitor = new AttachmentSafetyMonitor();

    // Inject an old interaction by accessing private internals
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    (monitor as any).interactions.push({
      peerDid: "did:maip:old",
      timestamp: oldDate,
      messageCount: 1,
    });

    // Recording a new interaction should trigger pruning of the old one
    monitor.recordInteraction("did:maip:new");

    const interactions: any[] = (monitor as any).interactions;
    const oldEntries = interactions.filter((i: any) => i.peerDid === "did:maip:old");
    expect(oldEntries.length).toBe(0);
  });
});

// ── assessRelationship ───────────────────────────────────────────

describe("AttachmentSafetyMonitor — assessRelationship", () => {
  it("returns 'none' risk for balanced interactions", () => {
    const monitor = new AttachmentSafetyMonitor();
    // Spread interactions across many peers so no single peer dominates
    for (let i = 0; i < 10; i++) {
      monitor.recordInteraction(`did:maip:peer${i}`);
    }
    const health = monitor.assessRelationship("did:maip:peer0");
    expect(health.risk).toBe("none");
    expect(health.interactionShare).toBeLessThanOrEqual(0.4);
  });

  it("returns 'moderate' risk when interactionShare > 0.6 (single signal)", () => {
    const monitor = new AttachmentSafetyMonitor({ analysisWindowDays: 7 });
    // 8 messages to peer1, 2 to peer2 → peer1 share = 0.8
    recordMany(monitor, "did:maip:peer1", 8);
    recordMany(monitor, "did:maip:peer2", 2);

    const health = monitor.assessRelationship("did:maip:peer1");
    expect(health.interactionShare).toBeGreaterThan(0.6);
    // Only one signal (share > 0.6), avgDaily = 8/7 ≈ 1.14, not > 50
    expect(health.dependencySignals.length).toBe(1);
    expect(health.risk).toBe("moderate");
  });

  it("returns 'high' risk when 2 signals present (share + volume)", () => {
    const monitor = new AttachmentSafetyMonitor({
      maxDailyMessages: 1,
      analysisWindowDays: 7,
    });
    // 8 messages to peer1, 1 to peer2 → share = 8/9 ≈ 0.89 > 0.6, avgDaily = 8/7 ≈ 1.14 > 1
    // Only 8 interactions (< 10), so rapid response pattern is NOT triggered
    recordMany(monitor, "did:maip:peer1", 8);
    recordMany(monitor, "did:maip:peer2", 1);

    const health = monitor.assessRelationship("did:maip:peer1");
    expect(health.dependencySignals.length).toBe(2);
    expect(health.risk).toBe("high");
  });

  it("returns 'critical' risk with 3+ signals (share + volume + rapid response)", () => {
    const monitor = new AttachmentSafetyMonitor({
      maxDailyMessages: 1,
      analysisWindowDays: 7,
    });

    // Record 12 interactions in a tight loop (timestamps within milliseconds)
    // This triggers: share > 0.6, avgDaily > maxDailyMessages(1), rapid response (< 60s avg)
    for (let i = 0; i < 12; i++) {
      monitor.recordInteraction("did:maip:peer1");
    }
    // Add a small amount for another peer so share isn't exactly 1.0
    monitor.recordInteraction("did:maip:peer2");

    const health = monitor.assessRelationship("did:maip:peer1");
    expect(health.dependencySignals.length).toBeGreaterThanOrEqual(3);
    expect(health.risk).toBe("critical");
  });

  it("calculates avgDailyMessages correctly (total / analysisWindowDays)", () => {
    const monitor = new AttachmentSafetyMonitor({ analysisWindowDays: 7 });
    recordMany(monitor, "did:maip:peer1", 14);

    const health = monitor.assessRelationship("did:maip:peer1");
    // 14 messages / 7 days = 2.0
    expect(health.avgDailyMessages).toBe(2);
  });

  it("detects rapid response pattern (10+ interactions with avg interval < 60s)", () => {
    const monitor = new AttachmentSafetyMonitor();
    // Record 12 interactions in a tight loop — all timestamps within seconds of each other
    for (let i = 0; i < 12; i++) {
      monitor.recordInteraction("did:maip:peer1");
    }
    // Add peers to keep share below 0.6 so we can isolate the rapid-response signal
    for (let i = 0; i < 30; i++) {
      monitor.recordInteraction(`did:maip:other${i}`);
    }

    const health = monitor.assessRelationship("did:maip:peer1");
    const hasRapidSignal = health.dependencySignals.some((s) =>
      s.toLowerCase().includes("rapid")
    );
    expect(hasRapidSignal).toBe(true);
  });
});

// ── assessSocialHealth ───────────────────────────────────────────

describe("AttachmentSafetyMonitor — assessSocialHealth", () => {
  it("returns Herfindahl diversity index", () => {
    const monitor = new AttachmentSafetyMonitor();
    // 4 peers, each 5 messages → equal distribution → HHI = 4*(0.25^2) = 0.25, diversity = 0.75
    for (let i = 0; i < 4; i++) {
      recordMany(monitor, `did:maip:peer${i}`, 5);
    }

    const social = monitor.assessSocialHealth();
    expect(social.diversityScore).toBeCloseTo(0.75, 2);
    expect(social.activePeers).toBe(4);
  });

  it("reports moderate risk when activePeers < minActivePeers", () => {
    const monitor = new AttachmentSafetyMonitor({ minActivePeers: 3 });
    // Only 2 peers, each with balanced interactions
    recordMany(monitor, "did:maip:peer1", 5);
    recordMany(monitor, "did:maip:peer2", 5);

    const social = monitor.assessSocialHealth();
    expect(social.activePeers).toBe(2);
    expect(social.overallRisk).toBe("moderate");
    expect(social.recommendation).toContain("2");
  });

  it("detects any-peer-critical and sets overallRisk to critical", () => {
    const monitor = new AttachmentSafetyMonitor({
      maxDailyMessages: 1,
      analysisWindowDays: 7,
    });
    // Create a critical peer: high share, high volume, rapid response
    for (let i = 0; i < 15; i++) {
      monitor.recordInteraction("did:maip:critical-peer");
    }
    monitor.recordInteraction("did:maip:other");

    const social = monitor.assessSocialHealth();
    expect(social.overallRisk).toBe("critical");
    expect(social.topRisks.length).toBeGreaterThan(0);
    expect(social.topRisks[0].risk).toBe("critical");
  });
});

// ── shouldAllowInteraction ───────────────────────────────────────

describe("AttachmentSafetyMonitor — shouldAllowInteraction", () => {
  it("returns allowed for low-risk peer", () => {
    const monitor = new AttachmentSafetyMonitor();
    // Spread interactions evenly
    for (let i = 0; i < 10; i++) {
      monitor.recordInteraction(`did:maip:peer${i}`);
    }

    const result = monitor.shouldAllowInteraction("did:maip:peer0");
    expect(result.allowed).toBe(true);
    expect(result.cooldownMs).toBeUndefined();
  });

  it("returns 30-minute cooldown for critical-risk peer", () => {
    const monitor = new AttachmentSafetyMonitor({
      maxDailyMessages: 1,
      analysisWindowDays: 7,
    });
    // Create a critical peer
    for (let i = 0; i < 15; i++) {
      monitor.recordInteraction("did:maip:critical-peer");
    }
    monitor.recordInteraction("did:maip:other");

    const result = monitor.shouldAllowInteraction("did:maip:critical-peer");
    expect(result.allowed).toBe(false);
    expect(result.cooldownMs).toBe(30 * 60 * 1000);
    expect(result.reason).toBeDefined();
  });
});
