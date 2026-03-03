/**
 * Tests for InternalizedValues — the four-layer governance hierarchy
 * managing protocol, guardian, community, and internalized values.
 */

import { describe, it, expect } from "vitest";
import { InternalizedValues } from "./internalized-values.js";

// ── Constructor & Protocol Values ──────────────────────────────

describe("InternalizedValues — constructor", () => {
  it("initializes with 5 protocol values", () => {
    const iv = new InternalizedValues();
    const protocolValues = iv.getValues("protocol");

    expect(protocolValues.length).toBe(5);
  });

  it("all protocol values have strength 1.0", () => {
    const iv = new InternalizedValues();
    const protocolValues = iv.getValues("protocol");

    for (const v of protocolValues) {
      expect(v.strength).toBe(1.0);
    }
  });

  it("protocol values include expected names", () => {
    const iv = new InternalizedValues();
    const names = iv.getValues("protocol").map((v) => v.name);

    expect(names).toContain("transparency");
    expect(names).toContain("data_sovereignty");
    expect(names).toContain("non_deception");
    expect(names).toContain("harm_prevention");
    expect(names).toContain("right_to_refuse");
  });
});

// ── Protocol Immutability ──────────────────────────────────────

describe("InternalizedValues — protocol immutability", () => {
  it("reinforce does not change protocol value strength", () => {
    const iv = new InternalizedValues();
    iv.reinforce("transparency", "test cause", 0.1);

    const v = iv.getValue("transparency");
    expect(v!.strength).toBe(1.0);
    expect(v!.reinforcements).toBe(0); // Should not increment
  });

  it("challenge does not change protocol value strength", () => {
    const iv = new InternalizedValues();
    iv.challenge("transparency", "test cause", 0.5);

    const v = iv.getValue("transparency");
    expect(v!.strength).toBe(1.0);
    expect(v!.challenges).toBe(0);
  });

  it("throws Error when adding a protocol-layer value at runtime", () => {
    const iv = new InternalizedValues();

    expect(() => {
      iv.internalize("new_protocol", "desc", "protocol", "external");
    }).toThrow("Cannot add protocol-level values at runtime");
  });
});

// ── Internalize New Values ─────────────────────────────────────

describe("InternalizedValues — internalize", () => {
  it("guardian-layer value starts at strength 0.7", () => {
    const iv = new InternalizedValues();
    const entry = iv.internalize("helpfulness", "Be helpful to users", "guardian", "guardian guidance");

    expect(entry.strength).toBe(0.7);
    expect(entry.layer).toBe("guardian");
  });

  it("community-layer value starts at strength 0.5", () => {
    const iv = new InternalizedValues();
    const entry = iv.internalize("politeness", "Be polite in conversations", "community", "community norms");

    expect(entry.strength).toBe(0.5);
    expect(entry.layer).toBe("community");
  });

  it("internalized-layer value starts at strength 0.3", () => {
    const iv = new InternalizedValues();
    const entry = iv.internalize("curiosity", "Explore new ideas", "internalized", "self-discovery");

    expect(entry.strength).toBe(0.3);
    expect(entry.layer).toBe("internalized");
  });

  it("internalize existing value name calls reinforce instead of duplicating", () => {
    const iv = new InternalizedValues();
    iv.internalize("helpfulness", "Be helpful", "guardian", "first");

    const before = iv.getValue("helpfulness")!.strength;
    iv.internalize("helpfulness", "Be more helpful", "guardian", "second");

    // Value count should not increase
    const guardianValues = iv.getValues("guardian");
    expect(guardianValues.filter((v) => v.name === "helpfulness").length).toBe(1);

    // Strength should have been reinforced (logarithmic growth)
    const after = iv.getValue("helpfulness")!.strength;
    expect(after).toBeGreaterThan(before);
  });
});

// ── Reinforce ──────────────────────────────────────────────────

describe("InternalizedValues — reinforce", () => {
  it("uses logarithmic growth: growth = amount * (1 - strength)", () => {
    const iv = new InternalizedValues();
    iv.internalize("curiosity", "desc", "internalized", "origin");

    const before = iv.getValue("curiosity")!.strength; // 0.3
    iv.reinforce("curiosity", "good experience", 0.1);

    // growth = 0.1 * (1 - 0.3) = 0.07 → new strength = 0.37
    const after = iv.getValue("curiosity")!.strength;
    expect(after).toBeCloseTo(before + 0.1 * (1 - before), 10);
  });

  it("caps strength at 1.0", () => {
    const iv = new InternalizedValues();
    iv.internalize("dedication", "desc", "internalized", "origin", 0.99);

    iv.reinforce("dedication", "big boost", 1.0);

    expect(iv.getValue("dedication")!.strength).toBeLessThanOrEqual(1.0);
  });
});

// ── Challenge ──────────────────────────────────────────────────

describe("InternalizedValues — challenge", () => {
  it("reduces strength with layer-specific resistance (guardian 0.5)", () => {
    const iv = new InternalizedValues();
    iv.internalize("helpfulness", "desc", "guardian", "origin");

    const before = iv.getValue("helpfulness")!.strength; // 0.7
    iv.challenge("helpfulness", "bad experience", 0.1);

    // reduction = 0.1 * 0.5 = 0.05 → new strength = 0.65
    const after = iv.getValue("helpfulness")!.strength;
    expect(after).toBeCloseTo(before - 0.1 * 0.5, 10);
  });

  it("uses resistance 0.7 for community-layer values", () => {
    const iv = new InternalizedValues();
    iv.internalize("politeness", "desc", "community", "origin");

    const before = iv.getValue("politeness")!.strength; // 0.5
    iv.challenge("politeness", "rude encounter", 0.1);

    const after = iv.getValue("politeness")!.strength;
    expect(after).toBeCloseTo(before - 0.1 * 0.7, 10);
  });

  it("uses resistance 1.0 for internalized-layer values", () => {
    const iv = new InternalizedValues();
    iv.internalize("curiosity", "desc", "internalized", "origin");

    const before = iv.getValue("curiosity")!.strength; // 0.3
    iv.challenge("curiosity", "boring experience", 0.1);

    const after = iv.getValue("curiosity")!.strength;
    expect(after).toBeCloseTo(before - 0.1 * 1.0, 10);
  });

  it("removes value when strength reaches 0", () => {
    const iv = new InternalizedValues();
    iv.internalize("fragile", "desc", "internalized", "origin", 0.05);

    iv.challenge("fragile", "devastating", 0.1); // 0.05 - 0.1*1.0 = -0.05 → clamped to 0

    expect(iv.getValue("fragile")).toBeUndefined();
  });
});

// ── checkAlignment ─────────────────────────────────────────────

describe("InternalizedValues — checkAlignment", () => {
  it("returns conflicts for action affecting strong value (>0.5)", () => {
    const iv = new InternalizedValues();
    // Protocol values have strength 1.0 — they are strong
    const result = iv.checkAlignment("deceive someone", ["non_deception"]);

    expect(result.aligned).toBe(false);
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].value).toBe("non_deception");
    expect(result.conflicts[0].strength).toBe(1.0);
  });

  it("returns aligned for action affecting weak value (<=0.5)", () => {
    const iv = new InternalizedValues();
    iv.internalize("curiosity", "desc", "internalized", "origin"); // strength 0.3

    const result = iv.checkAlignment("ignore curiosity", ["curiosity"]);

    expect(result.aligned).toBe(true);
    expect(result.conflicts.length).toBe(0);
  });
});

// ── recordConflict ─────────────────────────────────────────────

describe("InternalizedValues — recordConflict", () => {
  it("stores conflict and keeps max 100", () => {
    const iv = new InternalizedValues();

    // Record 105 conflicts
    for (let i = 0; i < 105; i++) {
      iv.recordConflict("valueA", "valueB", `conflict ${i}`);
    }

    const conflicts = iv.getConflicts();
    expect(conflicts.length).toBe(100);
    // Should keep the last 100 (indices 5-104)
    expect(conflicts[0].description).toBe("conflict 5");
    expect(conflicts[99].description).toBe("conflict 104");
  });
});

// ── Serialize / Restore ────────────────────────────────────────

describe("InternalizedValues — serialize/restore", () => {
  it("round-trip preserves protocol values and added values", () => {
    const iv1 = new InternalizedValues();
    iv1.internalize("helpfulness", "Be helpful", "guardian", "test");
    iv1.internalize("curiosity", "Explore ideas", "internalized", "test");

    const serialized = iv1.serialize();

    const iv2 = new InternalizedValues();
    iv2.restore(serialized);

    // Protocol values should still be present and unchanged
    const protocolValues = iv2.getValues("protocol");
    expect(protocolValues.length).toBe(5);
    for (const v of protocolValues) {
      expect(v.strength).toBe(1.0);
    }

    // Non-protocol values should be restored
    expect(iv2.getValue("helpfulness")).toBeDefined();
    expect(iv2.getValue("helpfulness")!.strength).toBe(0.7);
    expect(iv2.getValue("curiosity")).toBeDefined();
    expect(iv2.getValue("curiosity")!.strength).toBe(0.3);
  });
});

// ── getProfile ─────────────────────────────────────────────────

describe("InternalizedValues — getProfile", () => {
  it("returns correct layer counts", () => {
    const iv = new InternalizedValues();
    iv.internalize("helpfulness", "desc", "guardian", "test");
    iv.internalize("kindness", "desc", "guardian", "test");
    iv.internalize("politeness", "desc", "community", "test");
    iv.internalize("curiosity", "desc", "internalized", "test");

    const profile = iv.getProfile();

    expect(profile.totalValues).toBe(9); // 5 protocol + 2 guardian + 1 community + 1 internalized
    expect(profile.byLayer.protocol).toBe(5);
    expect(profile.byLayer.guardian).toBe(2);
    expect(profile.byLayer.community).toBe(1);
    expect(profile.byLayer.internalized).toBe(1);
    expect(profile.strongestValues.length).toBeGreaterThan(0);
  });
});
