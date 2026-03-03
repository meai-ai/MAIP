/**
 * Tests for ProxyPolicy — guardian-configurable privacy filter.
 */

import { describe, it, expect } from "vitest";
import { ProxyPolicy, type SharingRule } from "./proxy-policy.js";

// ── Default PII Redaction ────────────────────────────────────────

describe("ProxyPolicy — default PII redaction", () => {
  it("redacts SSN pattern", () => {
    const policy = new ProxyPolicy([
      { category: "general", maxShareLevel: "public", blockedPatterns: [], requiresApproval: false },
    ]);
    const result = policy.evaluate("My SSN is 123-45-6789", "general", "public");
    expect(result.allowed).toBe(true);
    expect(result.sanitizedContent).toContain("[REDACTED]");
    expect(result.sanitizedContent).not.toContain("123-45-6789");
  });

  it("redacts credit card number (16 digits)", () => {
    const policy = new ProxyPolicy([
      { category: "general", maxShareLevel: "public", blockedPatterns: [], requiresApproval: false },
    ]);
    const result = policy.evaluate("Card: 1234567890123456", "general", "public");
    expect(result.sanitizedContent).toContain("[REDACTED]");
    expect(result.sanitizedContent).not.toContain("1234567890123456");
  });

  it("redacts email addresses", () => {
    const policy = new ProxyPolicy([
      { category: "general", maxShareLevel: "public", blockedPatterns: [], requiresApproval: false },
    ]);
    const result = policy.evaluate("Contact me at user@example.com please", "general", "public");
    expect(result.sanitizedContent).toContain("[REDACTED]");
    expect(result.sanitizedContent).not.toContain("user@example.com");
  });
});

// ── evaluate without rule ────────────────────────────────────────

describe("ProxyPolicy — evaluate without rule", () => {
  it("allows network-level content", () => {
    const policy = new ProxyPolicy();
    const result = policy.evaluate("Public knowledge", "unknown_category", "network");
    expect(result.allowed).toBe(true);
    expect(result.sanitizedContent).toBe("Public knowledge");
  });

  it("blocks private-level content", () => {
    const policy = new ProxyPolicy();
    const result = policy.evaluate("Secret diary entry", "unknown_category", "private");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("below network level");
    expect(result.sanitizedContent).toBeUndefined();
  });
});

// ── evaluate with rule ───────────────────────────────────────────

describe("ProxyPolicy — evaluate with rule", () => {
  it("blocks content below maxShareLevel", () => {
    const rule: SharingRule = {
      category: "memories",
      maxShareLevel: "network",
      blockedPatterns: [],
      requiresApproval: false,
    };
    const policy = new ProxyPolicy([rule]);
    // private (rank 1) < network (rank 2) → blocked
    const result = policy.evaluate("Private memory", "memories", "private");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('"private"');
    expect(result.reason).toContain('"network"');
  });

  it("allows content at or above maxShareLevel", () => {
    const rule: SharingRule = {
      category: "memories",
      maxShareLevel: "private",
      blockedPatterns: [],
      requiresApproval: false,
    };
    const policy = new ProxyPolicy([rule]);
    // network (rank 2) >= private (rank 1) → allowed
    const result = policy.evaluate("Shareable memory", "memories", "network");
    expect(result.allowed).toBe(true);
    expect(result.sanitizedContent).toBe("Shareable memory");
  });

  it("redacts custom blocked patterns from rule", () => {
    const rule: SharingRule = {
      category: "notes",
      maxShareLevel: "public",
      blockedPatterns: ["secret-project-\\w+"],
      requiresApproval: false,
    };
    const policy = new ProxyPolicy([rule]);
    const result = policy.evaluate(
      "Working on secret-project-alpha and other things",
      "notes",
      "public"
    );
    expect(result.allowed).toBe(true);
    expect(result.sanitizedContent).toContain("[REDACTED]");
    expect(result.sanitizedContent).not.toContain("secret-project-alpha");
  });

  it("returns pending_approval when requiresApproval is true", () => {
    const rule: SharingRule = {
      category: "sensitive",
      maxShareLevel: "public",
      blockedPatterns: [],
      requiresApproval: true,
    };
    const policy = new ProxyPolicy([rule]);
    const result = policy.evaluate("Needs guardian approval", "sensitive", "public");
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.auditEntry.action).toBe("pending_approval");
  });
});

// ── Conversation fact limiting ───────────────────────────────────

describe("ProxyPolicy — conversation fact limiting", () => {
  it("truncates conversation facts to maxConversationFacts", () => {
    const rule: SharingRule = {
      category: "conversations",
      maxShareLevel: "public",
      blockedPatterns: [],
      requiresApproval: false,
    };
    const policy = new ProxyPolicy([rule]);
    policy.setMaxConversationFacts(3);

    // 5 sentences separated by periods
    const content = "Fact one. Fact two. Fact three. Fact four. Fact five.";
    const result = policy.evaluate(content, "conversations", "public");
    expect(result.allowed).toBe(true);
    // After splitting on [.!?]+ and truncating to 3, the result should have 3 facts
    const facts = result.sanitizedContent!.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    expect(facts.length).toBeLessThanOrEqual(3);
  });
});

// ── Audit log ────────────────────────────────────────────────────

describe("ProxyPolicy — audit log", () => {
  it("records entries in the audit log", () => {
    const policy = new ProxyPolicy();
    policy.evaluate("Test content 1", "cat1", "public");
    policy.evaluate("Test content 2", "cat2", "network");

    const log = policy.getAuditLog();
    expect(log.length).toBe(2);
    expect(log[0].category).toBe("cat1");
    expect(log[1].category).toBe("cat2");
    expect(log[0].timestamp).toBeDefined();
    expect(log[0].originalLength).toBe("Test content 1".length);
  });
});

// ── getRules ─────────────────────────────────────────────────────

describe("ProxyPolicy — getRules", () => {
  it("returns all configured rules", () => {
    const rules: SharingRule[] = [
      { category: "memories", maxShareLevel: "network", blockedPatterns: [], requiresApproval: false },
      { category: "preferences", maxShareLevel: "public", blockedPatterns: [], requiresApproval: true },
    ];
    const policy = new ProxyPolicy(rules);
    const result = policy.getRules();
    expect(result.length).toBe(2);
    expect(result.map((r) => r.category).sort()).toEqual(["memories", "preferences"]);
  });
});
