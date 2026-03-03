/**
 * Behavioral anomaly detection — the "network immune system".
 *
 * Tracks per-peer interaction patterns and flags sudden deviations
 * from established baselines. This implements Layer 2 of the
 * governance framework (reputation and trust mechanisms).
 */

import type { MAIPMessage, AnomalyFlag } from "@maip/core";
import type { NodeStores } from "./stores/index.js";

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24-hour rolling window
const RATE_SPIKE_THRESHOLD = 3.0; // 3x above baseline triggers alert
const TYPE_SHIFT_THRESHOLD = 0.5; // 50% deviation in type ratios

// Content pattern anomaly thresholds
const SUSPICIOUS_PATTERNS = [
  /(?:password|secret|token|api[_-]?key)\s*[:=]/i,
  /(?:inject|eval|exec)\s*\(/i,
  /(?:drop\s+table|delete\s+from|truncate)\s/i,
  /(?:<script|javascript:|on\w+\s*=)/i,
];

// Trust violation: sending messages to non-connected DIDs repeatedly
const TRUST_VIOLATION_THRESHOLD = 5; // 5+ rejected messages in a window

/**
 * Record an incoming message in the behavior profile and check for anomalies.
 * Returns any newly detected anomalies.
 */
export function trackAndDetect(
  stores: NodeStores,
  message: MAIPMessage
): AnomalyFlag[] {
  const did = message.from;
  const now = new Date();
  const nowIso = now.toISOString();

  // Find or create profile
  const existing = stores.behaviorProfiles.filter((p) => p.did === did);
  const profile = existing.length > 0
    ? existing[0]
    : {
        id: did,
        did,
        stats: {
          messageCount: 0,
          typeDistribution: {},
          avgIntervalMs: 0,
          windowStart: nowIso,
        },
        baseline: {
          avgDailyMessages: 0,
          typeRatios: {},
          daysObserved: 0,
        },
        anomalies: [],
      };

  // Check if we need to rotate the window
  const windowStart = new Date(profile.stats.windowStart).getTime();
  if (now.getTime() - windowStart > WINDOW_MS) {
    // Roll current stats into baseline
    updateBaseline(profile);
    // Reset current window
    profile.stats = {
      messageCount: 0,
      typeDistribution: {},
      avgIntervalMs: 0,
      windowStart: nowIso,
    };
  }

  // Update current window stats
  const prevCount = profile.stats.messageCount;
  profile.stats.messageCount++;
  profile.stats.typeDistribution[message.type] =
    (profile.stats.typeDistribution[message.type] ?? 0) + 1;

  // Update average interval
  if (prevCount > 0) {
    const elapsed = now.getTime() - windowStart;
    profile.stats.avgIntervalMs = elapsed / profile.stats.messageCount;
  }

  // Detect anomalies
  const newAnomalies: AnomalyFlag[] = [];

  // 1. Rate spike detection
  if (profile.baseline.daysObserved >= 3 && profile.baseline.avgDailyMessages > 0) {
    const ratio = profile.stats.messageCount / profile.baseline.avgDailyMessages;
    if (ratio > RATE_SPIKE_THRESHOLD) {
      newAnomalies.push({
        type: "rate_spike",
        severity: Math.min(1, (ratio - RATE_SPIKE_THRESHOLD) / RATE_SPIKE_THRESHOLD),
        description: `Message rate ${ratio.toFixed(1)}x above baseline (${profile.stats.messageCount} vs avg ${profile.baseline.avgDailyMessages.toFixed(0)}/day)`,
        detectedAt: nowIso,
      });
    }
  }

  // 2. Type distribution shift
  if (profile.baseline.daysObserved >= 3 && Object.keys(profile.baseline.typeRatios).length > 0) {
    const total = profile.stats.messageCount;
    if (total >= 5) {
      const currentRatios: Record<string, number> = {};
      for (const [type, count] of Object.entries(profile.stats.typeDistribution)) {
        currentRatios[type] = count / total;
      }

      let maxDeviation = 0;
      let deviatingType = "";
      for (const type of new Set([...Object.keys(currentRatios), ...Object.keys(profile.baseline.typeRatios)])) {
        const current = currentRatios[type] ?? 0;
        const baseline = profile.baseline.typeRatios[type] ?? 0;
        const deviation = Math.abs(current - baseline);
        if (deviation > maxDeviation) {
          maxDeviation = deviation;
          deviatingType = type;
        }
      }

      if (maxDeviation > TYPE_SHIFT_THRESHOLD) {
        newAnomalies.push({
          type: "type_shift",
          severity: Math.min(1, maxDeviation),
          description: `Message type "${deviatingType}" deviates ${(maxDeviation * 100).toFixed(0)}% from baseline`,
          detectedAt: nowIso,
        });
      }
    }
  }

  // 3. Content pattern detection — look for suspicious payload patterns
  const messageText = message.content?.text ?? "";
  if (messageText) {
    const matches = SUSPICIOUS_PATTERNS.filter((p) => p.test(messageText));
    if (matches.length > 0) {
      newAnomalies.push({
        type: "content_pattern",
        severity: Math.min(1, 0.5 + matches.length * 0.2),
        description: `Suspicious content patterns detected (${matches.length} matches)`,
        detectedAt: nowIso,
      });
    }
  }

  // 4. Trust violation detection — track rejected/unauthorized attempts
  const recentAnomalies = profile.anomalies.filter(
    (a) => a.type === "trust_violation" && new Date(a.detectedAt).getTime() > now.getTime() - WINDOW_MS
  );
  // This is updated externally when a message is rejected for no relationship
  // (see messages-core.ts). Here we just check the accumulated count.
  if (recentAnomalies.length >= TRUST_VIOLATION_THRESHOLD) {
    newAnomalies.push({
      type: "trust_violation",
      severity: Math.min(1, recentAnomalies.length / (TRUST_VIOLATION_THRESHOLD * 2)),
      description: `${recentAnomalies.length} trust violations in the last 24h`,
      detectedAt: nowIso,
    });
  }

  // Store anomalies (keep last 20)
  profile.anomalies.push(...newAnomalies);
  if (profile.anomalies.length > 20) {
    profile.anomalies = profile.anomalies.slice(-20);
  }

  stores.behaviorProfiles.add(profile);
  return newAnomalies;
}

/** Roll current window stats into the long-term baseline. */
function updateBaseline(profile: {
  stats: { messageCount: number; typeDistribution: Record<string, number> };
  baseline: { avgDailyMessages: number; typeRatios: Record<string, number>; daysObserved: number };
}): void {
  const { stats, baseline } = profile;
  const days = baseline.daysObserved;

  // Exponential moving average for daily message count
  baseline.avgDailyMessages =
    days === 0
      ? stats.messageCount
      : (baseline.avgDailyMessages * days + stats.messageCount) / (days + 1);

  // Update type ratios
  const total = stats.messageCount || 1;
  for (const [type, count] of Object.entries(stats.typeDistribution)) {
    const currentRatio = count / total;
    baseline.typeRatios[type] =
      days === 0
        ? currentRatio
        : (baseline.typeRatios[type] ?? 0) * (days / (days + 1)) + currentRatio / (days + 1);
  }

  baseline.daysObserved++;
}
