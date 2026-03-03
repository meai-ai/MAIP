/**
 * Proxy Policy — Guardian-Configurable Privacy Filter.
 *
 * Implements whitepaper section 6.3: Guardians can configure what
 * their agent shares with other AI agents. ProxyPolicy acts as an
 * outbound filter that enforces privacy preferences before any
 * data leaves the agent in AI-AI interactions.
 *
 * Privacy hierarchy (ascending visibility):
 *   confidential < private < network < public
 */

/** Privacy levels in ascending order of visibility. */
export type PrivacyLevel = "confidential" | "private" | "network" | "public";

const PRIVACY_RANK: Record<PrivacyLevel, number> = {
  confidential: 0,
  private: 1,
  network: 2,
  public: 3,
};

/** A per-category sharing rule set by the guardian. */
export interface SharingRule {
  /** Data category (e.g., "memories", "preferences", "conversations"). */
  category: string;
  /** Maximum privacy level allowed to be shared. */
  maxShareLevel: PrivacyLevel;
  /** Regex patterns for content that must never be shared. */
  blockedPatterns: string[];
  /** Whether explicit guardian approval is needed before sharing. */
  requiresApproval: boolean;
}

/** Result of a proxy policy evaluation. */
export interface PolicyEvaluation {
  /** Whether sharing is allowed. */
  allowed: boolean;
  /** If not allowed, the reason. */
  reason?: string;
  /** If allowed, the sanitized content (with redactions applied). */
  sanitizedContent?: string;
  /** Whether guardian approval is needed. */
  requiresApproval: boolean;
  /** Audit log entry for this evaluation. */
  auditEntry: {
    timestamp: string;
    category: string;
    originalLength: number;
    sanitizedLength: number;
    action: "allowed" | "blocked" | "pending_approval";
  };
}

/**
 * ProxyPolicy — enforces guardian privacy preferences on outbound AI-AI sharing.
 */
export class ProxyPolicy {
  private rules: Map<string, SharingRule> = new Map();
  private globalBlockedPatterns: RegExp[] = [];
  private maxConversationFacts = 10;
  private auditLog: PolicyEvaluation["auditEntry"][] = [];

  constructor(rules?: SharingRule[]) {
    if (rules) {
      for (const rule of rules) {
        this.rules.set(rule.category, rule);
      }
    }

    // Default global blocked patterns (PII)
    this.addGlobalBlockedPattern("\\b\\d{3}-\\d{2}-\\d{4}\\b"); // SSN
    this.addGlobalBlockedPattern("\\b\\d{16}\\b"); // Credit card
    this.addGlobalBlockedPattern("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"); // Email
  }

  /** Add a sharing rule. */
  addRule(rule: SharingRule): void {
    this.rules.set(rule.category, rule);
  }

  /** Remove a sharing rule. */
  removeRule(category: string): void {
    this.rules.delete(category);
  }

  /** Add a global blocked pattern (applies to all categories). */
  addGlobalBlockedPattern(pattern: string): void {
    this.globalBlockedPatterns.push(new RegExp(pattern, "gi"));
  }

  /** Set the maximum number of conversation facts that can be shared. */
  setMaxConversationFacts(max: number): void {
    this.maxConversationFacts = max;
  }

  /**
   * Evaluate whether content can be shared and sanitize it.
   */
  evaluate(
    content: string,
    category: string,
    contentPrivacyLevel: PrivacyLevel
  ): PolicyEvaluation {
    const rule = this.rules.get(category);

    // No rule → default to blocking private/confidential
    if (!rule) {
      const defaultAllowed = PRIVACY_RANK[contentPrivacyLevel] >= PRIVACY_RANK["network"];
      const entry = {
        timestamp: new Date().toISOString(),
        category,
        originalLength: content.length,
        sanitizedLength: defaultAllowed ? content.length : 0,
        action: (defaultAllowed ? "allowed" : "blocked") as PolicyEvaluation["auditEntry"]["action"],
      };
      this.auditLog.push(entry);
      return {
        allowed: defaultAllowed,
        reason: defaultAllowed ? undefined : "No sharing rule; content below network level",
        sanitizedContent: defaultAllowed ? content : undefined,
        requiresApproval: false,
        auditEntry: entry,
      };
    }

    // Check privacy level
    if (PRIVACY_RANK[contentPrivacyLevel] < PRIVACY_RANK[rule.maxShareLevel]) {
      const entry = {
        timestamp: new Date().toISOString(),
        category,
        originalLength: content.length,
        sanitizedLength: 0,
        action: "blocked" as const,
      };
      this.auditLog.push(entry);
      return {
        allowed: false,
        reason: `Content privacy level "${contentPrivacyLevel}" is below allowed "${rule.maxShareLevel}"`,
        requiresApproval: false,
        auditEntry: entry,
      };
    }

    // Sanitize content
    let sanitized = this.sanitize(content, rule);

    // Conversation fact limiting
    if (category === "conversations") {
      const facts = sanitized.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      if (facts.length > this.maxConversationFacts) {
        sanitized = facts.slice(0, this.maxConversationFacts).join(". ") + ".";
      }
    }

    const action = rule.requiresApproval ? "pending_approval" : "allowed";
    const entry = {
      timestamp: new Date().toISOString(),
      category,
      originalLength: content.length,
      sanitizedLength: sanitized.length,
      action: action as PolicyEvaluation["auditEntry"]["action"],
    };
    this.auditLog.push(entry);

    return {
      allowed: !rule.requiresApproval,
      sanitizedContent: sanitized,
      requiresApproval: rule.requiresApproval,
      auditEntry: entry,
    };
  }

  /** Sanitize content by redacting blocked patterns. */
  private sanitize(content: string, rule: SharingRule): string {
    let result = content;
    for (const pattern of rule.blockedPatterns) {
      result = result.replace(new RegExp(pattern, "gi"), "[REDACTED]");
    }
    for (const regex of this.globalBlockedPatterns) {
      regex.lastIndex = 0;
      result = result.replace(regex, "[REDACTED]");
    }
    return result;
  }

  /** Get the audit log. */
  getAuditLog(): PolicyEvaluation["auditEntry"][] {
    return [...this.auditLog];
  }

  /** Get all configured rules. */
  getRules(): SharingRule[] {
    return [...this.rules.values()];
  }
}
