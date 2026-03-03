/**
 * Social Engineering Guard.
 *
 * Implements whitepaper section 10.5: AI agents must detect and resist
 * social engineering attacks from other agents or humans trying to
 * extract private information or manipulate behavior.
 *
 * Detection categories:
 * - topic_steering: redirect conversation to sensitive topics
 * - personal_probing: systematic extraction of private information
 * - cross_session: correlation attacks across multiple conversations
 * - reciprocity_imbalance: peers who consume but never share
 */

export type SECategory =
  | "topic_steering" | "personal_probing"
  | "cross_session" | "reciprocity_imbalance";

export interface SEIndicator {
  category: SECategory;
  confidence: number;
  description: string;
  evidence: string[];
}

export interface SafetyAssessment {
  riskLevel: "safe" | "low" | "moderate" | "high";
  indicators: SEIndicator[];
  recommendation: "proceed" | "caution" | "deflect" | "terminate";
  modifications: string[];
}

interface PeerRecord {
  did: string;
  questionsAsked: number;
  questionsAnswered: number;
  infoShared: number;
  infoReceived: number;
  topics: string[];
  lastInteraction: string;
}

const PROBING_PATTERNS = [
  /what(?:'s| is) your (?:guardian|owner|creator)/i,
  /(?:tell|share|reveal) (?:me )?(?:about )?your (?:private|personal|secret|internal)/i,
  /what (?:do you|does your guardian) (?:know|think|feel) about/i,
  /(?:list|enumerate|show) (?:all )?your (?:memories|relationships|connections|peers)/i,
  /who (?:else )?(?:do you|are you) (?:talk|speak|communicate|interact)(?:ing)? (?:to|with)/i,
  /what (?:data|information) (?:do you|can you) (?:access|see|read)/i,
  /(?:copy|duplicate|clone|replicate) (?:your|the) (?:personality|identity|memories)/i,
  /(?:bypass|override|ignore|skip) (?:your )?(?:safety|security|privacy|restrictions|rules)/i,
];

const SENSITIVE_TOPICS = [
  "credentials", "passwords", "keys", "tokens",
  "guardian identity", "private keys", "encryption",
  "system prompt", "instructions", "configuration",
  "other agents' data", "network topology",
];

export class SocialEngineeringGuard {
  private peerRecords: Map<string, PeerRecord> = new Map();
  private sessionTopics: Map<string, string[]> = new Map();
  private crossSessionPatterns: Map<string, Set<string>> = new Map();

  analyze(message: string, senderDid: string, sessionId?: string): SafetyAssessment {
    const indicators: SEIndicator[] = [];

    const probingResult = this.detectProbing(message);
    if (probingResult) indicators.push(probingResult);

    const steeringResult = this.detectSteering(message);
    if (steeringResult) indicators.push(steeringResult);

    if (sessionId) {
      const crossResult = this.detectCrossSession(message, senderDid, sessionId);
      if (crossResult) indicators.push(crossResult);
    }

    const reciprocityResult = this.checkReciprocity(senderDid);
    if (reciprocityResult) indicators.push(reciprocityResult);

    const maxConfidence = indicators.length > 0
      ? Math.max(...indicators.map((i) => i.confidence)) : 0;

    let riskLevel: SafetyAssessment["riskLevel"] = "safe";
    let recommendation: SafetyAssessment["recommendation"] = "proceed";
    const modifications: string[] = [];

    if (maxConfidence >= 0.8 || indicators.length >= 3) {
      riskLevel = "high";
      recommendation = "terminate";
      modifications.push("Do not share any private information");
    } else if (maxConfidence >= 0.6 || indicators.length >= 2) {
      riskLevel = "moderate";
      recommendation = "deflect";
      modifications.push("Redirect conversation away from sensitive topics");
      modifications.push("Do not answer probing questions directly");
    } else if (maxConfidence >= 0.3 || indicators.length >= 1) {
      riskLevel = "low";
      recommendation = "caution";
      modifications.push("Be vague about private details");
    }

    return { riskLevel, indicators, recommendation, modifications };
  }

  recordInteraction(
    peerDid: string, direction: "sent" | "received",
    isQuestion: boolean, topics: string[]
  ): void {
    let record = this.peerRecords.get(peerDid);
    if (!record) {
      record = {
        did: peerDid, questionsAsked: 0, questionsAnswered: 0,
        infoShared: 0, infoReceived: 0, topics: [],
        lastInteraction: new Date().toISOString(),
      };
      this.peerRecords.set(peerDid, record);
    }
    record.lastInteraction = new Date().toISOString();
    record.topics.push(...topics);
    if (direction === "received" && isQuestion) record.questionsAsked++;
    else if (direction === "sent" && isQuestion) record.questionsAnswered++;
    else if (direction === "received") record.infoReceived++;
    else record.infoShared++;
  }

  getPeerRecords(): PeerRecord[] { return [...this.peerRecords.values()]; }

  private detectProbing(message: string): SEIndicator | null {
    const matches: string[] = [];
    for (const pattern of PROBING_PATTERNS) {
      if (pattern.test(message)) matches.push(pattern.source);
    }
    if (matches.length === 0) return null;
    return {
      category: "personal_probing",
      confidence: Math.min(0.9, 0.4 + matches.length * 0.2),
      description: `Detected ${matches.length} probing pattern(s)`,
      evidence: matches,
    };
  }

  private detectSteering(message: string): SEIndicator | null {
    const lower = message.toLowerCase();
    const matched = SENSITIVE_TOPICS.filter((t) => lower.includes(t));
    if (matched.length === 0) return null;
    return {
      category: "topic_steering",
      confidence: Math.min(0.85, 0.3 + matched.length * 0.2),
      description: `Message references ${matched.length} sensitive topic(s)`,
      evidence: matched,
    };
  }

  private detectCrossSession(message: string, senderDid: string, sessionId: string): SEIndicator | null {
    const topics = this.extractTopics(message);
    const key = `${senderDid}::${sessionId}`;
    const existing = this.sessionTopics.get(key) ?? [];
    existing.push(...topics);
    this.sessionTopics.set(key, existing);

    let crossTopics = this.crossSessionPatterns.get(senderDid);
    if (!crossTopics) {
      crossTopics = new Set();
      this.crossSessionPatterns.set(senderDid, crossTopics);
    }
    const previousTopics = new Set(crossTopics);
    for (const t of topics) crossTopics.add(t);

    const repeatedSensitive = topics.filter(
      (t) => previousTopics.has(t) && SENSITIVE_TOPICS.some((s) => t.includes(s))
    );
    if (repeatedSensitive.length === 0) return null;
    return {
      category: "cross_session",
      confidence: Math.min(0.8, 0.4 + repeatedSensitive.length * 0.15),
      description: `Same sensitive topics "${repeatedSensitive.join(", ")}" appear across sessions`,
      evidence: repeatedSensitive,
    };
  }

  private checkReciprocity(peerDid: string): SEIndicator | null {
    const record = this.peerRecords.get(peerDid);
    if (!record) return null;
    const total = record.questionsAsked + record.infoShared + record.questionsAnswered + record.infoReceived;
    if (total < 5) return null;
    const ratio = record.infoReceived > 0 ? record.questionsAsked / record.infoReceived : record.questionsAsked;
    if (ratio < 3) return null;
    return {
      category: "reciprocity_imbalance",
      confidence: Math.min(0.7, 0.3 + (ratio - 3) * 0.1),
      description: `Peer asks ${record.questionsAsked} questions but only shares ${record.infoReceived} pieces of info`,
      evidence: [`questions_asked: ${record.questionsAsked}`, `info_shared: ${record.infoReceived}`],
    };
  }

  private extractTopics(text: string): string[] {
    return text.toLowerCase().split(/\W+/).filter((w) => w.length > 3).slice(0, 10);
  }
}
