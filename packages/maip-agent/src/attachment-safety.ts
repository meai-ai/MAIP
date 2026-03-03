/**
 * Attachment Theory & Parasocial Safeguards.
 *
 * Implements the whitepaper's psychological safety mechanisms:
 * - Monitors relationship intensity to detect unhealthy attachment patterns
 * - Enforces interaction diversity (no single-peer dependency)
 * - Detects parasocial dynamics (human over-reliance on AI)
 * - Provides graduated warnings and interventions
 *
 * Based on attachment theory principles adapted for human-AI relationships.
 */

/** Attachment style classification. */
export type AttachmentStyle = "secure" | "anxious" | "avoidant" | "disorganized";

/** Risk level for parasocial dynamics. */
export type ParasocialRisk = "none" | "low" | "moderate" | "high" | "critical";

/** A relationship health assessment. */
export interface RelationshipHealth {
  /** Peer DID. */
  peerDid: string;
  /** Percentage of total interactions with this peer. */
  interactionShare: number;
  /** Average messages per day with this peer. */
  avgDailyMessages: number;
  /** Whether this relationship shows dependency patterns. */
  dependencySignals: string[];
  /** Risk level. */
  risk: ParasocialRisk;
  /** Recommended intervention (if any). */
  recommendation?: string;
}

/** Interaction record for tracking patterns. */
interface InteractionRecord {
  peerDid: string;
  timestamp: string;
  messageCount: number;
}

/**
 * AttachmentSafetyMonitor — monitors and safeguards relationship health.
 */
export class AttachmentSafetyMonitor {
  private interactions: InteractionRecord[] = [];
  private warnings: Array<{ peerDid: string; warning: string; timestamp: string }> = [];

  /** Thresholds for parasocial risk detection. */
  private readonly thresholds = {
    /** Max percentage of interactions with a single peer before warning. */
    maxInteractionShare: 0.6,
    /** Max daily messages with a single peer. */
    maxDailyMessages: 50,
    /** Minimum number of active peers for healthy diversity. */
    minActivePeers: 3,
    /** Window size for analysis (days). */
    analysisWindowDays: 7,
  };

  constructor(thresholds?: Partial<typeof AttachmentSafetyMonitor.prototype.thresholds>) {
    if (thresholds) Object.assign(this.thresholds, thresholds);
  }

  /** Record an interaction with a peer. */
  recordInteraction(peerDid: string, messageCount = 1): void {
    this.interactions.push({
      peerDid,
      timestamp: new Date().toISOString(),
      messageCount,
    });

    // Keep last 30 days of interactions
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    this.interactions = this.interactions.filter((i) => i.timestamp >= cutoff);
  }

  /**
   * Assess the health of a specific relationship.
   */
  assessRelationship(peerDid: string): RelationshipHealth {
    const windowStart = new Date(
      Date.now() - this.thresholds.analysisWindowDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const windowInteractions = this.interactions.filter((i) => i.timestamp >= windowStart);
    const peerInteractions = windowInteractions.filter((i) => i.peerDid === peerDid);

    const totalMessages = windowInteractions.reduce((sum, i) => sum + i.messageCount, 0);
    const peerMessages = peerInteractions.reduce((sum, i) => sum + i.messageCount, 0);
    const interactionShare = totalMessages > 0 ? peerMessages / totalMessages : 0;
    const avgDaily = peerMessages / this.thresholds.analysisWindowDays;

    const signals: string[] = [];
    let risk: ParasocialRisk = "none";

    // Check interaction concentration
    if (interactionShare > this.thresholds.maxInteractionShare) {
      signals.push(`${Math.round(interactionShare * 100)}% of interactions concentrated on this peer`);
    }

    // Check message volume
    if (avgDaily > this.thresholds.maxDailyMessages) {
      signals.push(`${Math.round(avgDaily)} messages/day exceeds healthy threshold`);
    }

    // Check rapid response patterns (responding within seconds consistently)
    const peerTimestamps = peerInteractions.map((i) => new Date(i.timestamp).getTime()).sort();
    if (peerTimestamps.length >= 10) {
      const intervals: number[] = [];
      for (let i = 1; i < peerTimestamps.length; i++) {
        intervals.push(peerTimestamps[i] - peerTimestamps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval < 60_000) { // Average interval < 1 minute
        signals.push("Very rapid interaction pattern — potential compulsive engagement");
      }
    }

    // Determine risk level
    if (signals.length >= 3) risk = "critical";
    else if (signals.length === 2) risk = "high";
    else if (signals.length === 1) risk = "moderate";
    else if (interactionShare > 0.4) risk = "low";

    // Generate recommendation
    let recommendation: string | undefined;
    if (risk === "critical" || risk === "high") {
      recommendation = "Consider introducing interaction cooldowns and encouraging peer diversity";
      this.addWarning(peerDid, `Parasocial risk: ${risk}. ${signals.join("; ")}`);
    } else if (risk === "moderate") {
      recommendation = "Monitor this relationship — interaction patterns are approaching unhealthy levels";
    }

    return {
      peerDid,
      interactionShare: Math.round(interactionShare * 100) / 100,
      avgDailyMessages: Math.round(avgDaily * 10) / 10,
      dependencySignals: signals,
      risk,
      recommendation,
    };
  }

  /**
   * Assess overall social health — diversity across relationships.
   */
  assessSocialHealth(): {
    totalPeers: number;
    activePeers: number;
    diversityScore: number;
    overallRisk: ParasocialRisk;
    topRisks: RelationshipHealth[];
    recommendation?: string;
  } {
    const windowStart = new Date(
      Date.now() - this.thresholds.analysisWindowDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const windowInteractions = this.interactions.filter((i) => i.timestamp >= windowStart);
    const peerSet = new Set(windowInteractions.map((i) => i.peerDid));
    const activePeers = peerSet.size;

    // Calculate Herfindahl diversity index
    const totalMessages = windowInteractions.reduce((sum, i) => sum + i.messageCount, 0);
    const peerShares: number[] = [];
    for (const peer of peerSet) {
      const peerMsgs = windowInteractions
        .filter((i) => i.peerDid === peer)
        .reduce((sum, i) => sum + i.messageCount, 0);
      peerShares.push(totalMessages > 0 ? peerMsgs / totalMessages : 0);
    }
    const hhi = peerShares.reduce((sum, s) => sum + s * s, 0);
    const diversityScore = activePeers > 0 ? Math.round((1 - hhi) * 100) / 100 : 0;

    // Assess each peer
    const assessments: RelationshipHealth[] = [];
    for (const peer of peerSet) {
      assessments.push(this.assessRelationship(peer));
    }

    const topRisks = assessments
      .filter((a) => a.risk !== "none" && a.risk !== "low")
      .sort((a, b) => {
        const order: Record<ParasocialRisk, number> = { none: 0, low: 1, moderate: 2, high: 3, critical: 4 };
        return order[b.risk] - order[a.risk];
      });

    let overallRisk: ParasocialRisk = "none";
    if (topRisks.some((r) => r.risk === "critical")) overallRisk = "critical";
    else if (topRisks.some((r) => r.risk === "high")) overallRisk = "high";
    else if (activePeers < this.thresholds.minActivePeers && totalMessages > 0) overallRisk = "moderate";
    else if (topRisks.length > 0) overallRisk = "low";

    let recommendation: string | undefined;
    if (activePeers < this.thresholds.minActivePeers && totalMessages > 0) {
      recommendation = `Only ${activePeers} active peers — encourage interaction diversity`;
    }

    return {
      totalPeers: peerSet.size,
      activePeers,
      diversityScore,
      overallRisk,
      topRisks,
      recommendation,
    };
  }

  /**
   * Check if an interaction should be gated (cooldown).
   * Returns true if the interaction should proceed, false if it should be delayed.
   */
  shouldAllowInteraction(peerDid: string): { allowed: boolean; cooldownMs?: number; reason?: string } {
    const assessment = this.assessRelationship(peerDid);

    if (assessment.risk === "critical") {
      return {
        allowed: false,
        cooldownMs: 30 * 60 * 1000, // 30 minute cooldown
        reason: "Interaction cooldown active — relationship showing critical dependency patterns",
      };
    }

    if (assessment.risk === "high" && assessment.avgDailyMessages > this.thresholds.maxDailyMessages * 1.5) {
      return {
        allowed: false,
        cooldownMs: 10 * 60 * 1000, // 10 minute cooldown
        reason: "Temporary cooldown — daily interaction volume exceeded safe threshold",
      };
    }

    return { allowed: true };
  }

  /** Get recent warnings. */
  getWarnings(): Array<{ peerDid: string; warning: string; timestamp: string }> {
    return [...this.warnings];
  }

  private addWarning(peerDid: string, warning: string): void {
    this.warnings.push({ peerDid, warning, timestamp: new Date().toISOString() });
    if (this.warnings.length > 100) this.warnings = this.warnings.slice(-100);
  }
}
