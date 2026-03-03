/**
 * Unit tests for autonomy-core.ts — autonomy level evaluation, transitions,
 * action capabilities, and homecoming configuration.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initNode } from "../init.js";
import type { NodeContext } from "../context.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  evaluateAutonomyTransition,
  processAutonomyTransition,
  isActionAllowed,
  getHomecomingConfig,
} from "./autonomy-core.js";

// ── Helper: create a context at a given autonomy level ──────────

function createCtx(
  autonomyLevel: 0 | 1 | 2 | 3,
  opts?: { createdDaysAgo?: number }
): { ctx: NodeContext; dataDir: string } {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-autonomy-"));
  const ctx = initNode(
    { port: 0, publicUrl: "http://localhost:0", dataDir },
    { displayName: "AutonomyAgent", type: "ai_agent" }
  );
  ctx.identity.autonomyLevel = autonomyLevel;

  if (opts?.createdDaysAgo !== undefined) {
    const d = new Date(Date.now() - opts.createdDaysAgo * 24 * 60 * 60 * 1000);
    ctx.identity.created = d.toISOString();
  }

  return { ctx, dataDir };
}

function addRelationships(ctx: NodeContext, count: number, trustLevel: number) {
  for (let i = 0; i < count; i++) {
    ctx.stores.relationships.add({
      id: `rel-${i}-${Date.now()}`,
      type: "peer",
      participants: [ctx.identity.did, `did:maip:peer-${i}`],
      initiatedBy: ctx.identity.did,
      established: new Date().toISOString(),
      trustLevel,
      permissions: { canMessage: true, canSharePersona: true, canDelegate: false },
      status: "active",
      interactionCount: 10,
    } as any);
  }
}

function addHomecomingReports(ctx: NodeContext, count: number) {
  for (let i = 0; i < count; i++) {
    ctx.stores.messages.add({
      id: `hc-${i}-${Date.now()}`,
      type: "homecoming_report" as any,
      from: ctx.identity.did,
      to: "did:maip:guardian",
      timestamp: new Date().toISOString(),
      content: { text: "report" },
    } as any);
  }
}

// ── evaluateAutonomyTransition ──────────────────────────────────

describe("evaluateAutonomyTransition", () => {
  it("returns eligible:false when already at level 3", () => {
    const { ctx, dataDir } = createCtx(3);
    const result = evaluateAutonomyTransition(ctx);
    expect(result.ok).toBe(true);
    expect(result.data!.eligible).toBe(false);
    expect(result.data!.currentLevel).toBe(3);
    expect(result.data!.nextLevel).toBe(3);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns eligible:false when criteria are not met (level 0 -> 1)", () => {
    // Fresh agent, no relationships, no time, no reports
    const { ctx, dataDir } = createCtx(0);
    const result = evaluateAutonomyTransition(ctx);
    expect(result.ok).toBe(true);
    expect(result.data!.eligible).toBe(false);
    expect(result.data!.currentLevel).toBe(0);
    expect(result.data!.nextLevel).toBe(1);

    // Verify specific criteria
    expect(result.data!.criteria.minDaysAtLevel.met).toBe(false);
    expect(result.data!.criteria.minActiveRelationships.met).toBe(false);
    expect(result.data!.criteria.minHomecomingReports.met).toBe(false);
    // Guardian approval required, auto-met is false
    expect(result.data!.criteria.requiresGuardianApproval.met).toBe(false);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns eligible:false even with all metrics met if guardian approval required (0->1)", () => {
    const { ctx, dataDir } = createCtx(0, { createdDaysAgo: 10 });
    addRelationships(ctx, 2, 0.5);
    addHomecomingReports(ctx, 10);

    const result = evaluateAutonomyTransition(ctx);
    expect(result.ok).toBe(true);
    // All criteria met except requiresGuardianApproval
    expect(result.data!.criteria.minDaysAtLevel.met).toBe(true);
    expect(result.data!.criteria.minAverageTrust.met).toBe(true);
    expect(result.data!.criteria.minActiveRelationships.met).toBe(true);
    expect(result.data!.criteria.minHomecomingReports.met).toBe(true);
    expect(result.data!.criteria.requiresGuardianApproval.met).toBe(false);
    expect(result.data!.eligible).toBe(false);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("evaluates 2->3 transition (no guardian approval required)", () => {
    const { ctx, dataDir } = createCtx(2, { createdDaysAgo: 35 });
    addRelationships(ctx, 6, 0.6);
    addHomecomingReports(ctx, 25);

    const result = evaluateAutonomyTransition(ctx);
    expect(result.ok).toBe(true);
    expect(result.data!.currentLevel).toBe(2);
    expect(result.data!.nextLevel).toBe(3);
    // All criteria should be met for 2->3
    expect(result.data!.criteria.minDaysAtLevel.met).toBe(true);
    expect(result.data!.criteria.minAverageTrust.met).toBe(true);
    expect(result.data!.criteria.minActiveRelationships.met).toBe(true);
    expect(result.data!.criteria.minHomecomingReports.met).toBe(true);
    expect(result.data!.criteria.requiresGuardianApproval.met).toBe(true);
    expect(result.data!.eligible).toBe(true);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("fails 2->3 when trust is too low", () => {
    const { ctx, dataDir } = createCtx(2, { createdDaysAgo: 35 });
    addRelationships(ctx, 6, 0.2); // below 0.5 required
    addHomecomingReports(ctx, 25);

    const result = evaluateAutonomyTransition(ctx);
    expect(result.ok).toBe(true);
    expect(result.data!.criteria.minAverageTrust.met).toBe(false);
    expect(result.data!.eligible).toBe(false);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});

// ── processAutonomyTransition ───────────────────────────────────

describe("processAutonomyTransition", () => {
  it("fails when criteria not met", () => {
    const { ctx, dataDir } = createCtx(0);
    const result = processAutonomyTransition(ctx, false);
    expect(result.ok).toBe(false);
    // 0->1 requires guardian approval, so without it we get GUARDIAN_APPROVAL_REQUIRED
    expect(result.code).toBe("GUARDIAN_APPROVAL_REQUIRED");
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("fails without guardian approval when required (0->1)", () => {
    const { ctx, dataDir } = createCtx(0, { createdDaysAgo: 10 });
    addRelationships(ctx, 2, 0.5);
    addHomecomingReports(ctx, 10);

    const result = processAutonomyTransition(ctx, false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("GUARDIAN_APPROVAL_REQUIRED");
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("succeeds 2->3 when criteria met (no guardian approval needed)", () => {
    const { ctx, dataDir } = createCtx(2, { createdDaysAgo: 35 });
    addRelationships(ctx, 6, 0.6);
    addHomecomingReports(ctx, 25);

    const result = processAutonomyTransition(ctx, false);
    expect(result.ok).toBe(true);
    expect(result.data!.transition.fromLevel).toBe(2);
    expect(result.data!.transition.toLevel).toBe(3);
    expect(result.data!.transition.agentDid).toBe(ctx.identity.did);
    expect(ctx.identity.autonomyLevel).toBe(3);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("succeeds 0->1 with guardian approval even if not all criteria met", () => {
    const { ctx, dataDir } = createCtx(0, { createdDaysAgo: 10 });
    addRelationships(ctx, 2, 0.5);
    addHomecomingReports(ctx, 10);

    // With guardian approval, the requiresGuardianApproval criterion
    // is the only one failing, and the code has a special path:
    // if (!eligible && !(requiresGuardianApproval && guardianApproval)) => CRITERIA_NOT_MET
    // Since all other criteria are met and guardian approves, eligible=false
    // but the check passes because requiresGuardianApproval && guardianApproval is true.
    const result = processAutonomyTransition(ctx, true);
    expect(result.ok).toBe(true);
    expect(result.data!.transition.fromLevel).toBe(0);
    expect(result.data!.transition.toLevel).toBe(1);
    expect(result.data!.transition.guardianApproved).toBe(true);
    expect(ctx.identity.autonomyLevel).toBe(1);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});

// ── isActionAllowed ─────────────────────────────────────────────

describe("isActionAllowed", () => {
  it("allows messaging_with_permission at level 0", () => {
    const { ctx, dataDir } = createCtx(0);
    expect(isActionAllowed(ctx, "messaging_with_permission")).toBe(true);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("disallows discover_peers at level 0", () => {
    const { ctx, dataDir } = createCtx(0);
    expect(isActionAllowed(ctx, "discover_peers")).toBe(false);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("allows discover_peers at level 1", () => {
    const { ctx, dataDir } = createCtx(1);
    expect(isActionAllowed(ctx, "discover_peers")).toBe(true);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("allows autonomous_discovery at level 2 but not level 1", () => {
    const { ctx: ctx1, dataDir: d1 } = createCtx(1);
    const { ctx: ctx2, dataDir: d2 } = createCtx(2);
    expect(isActionAllowed(ctx1, "autonomous_discovery")).toBe(false);
    expect(isActionAllowed(ctx2, "autonomous_discovery")).toBe(true);
    fs.rmSync(d1, { recursive: true, force: true });
    fs.rmSync(d2, { recursive: true, force: true });
  });

  it("allows create_spaces only at level 3", () => {
    const { ctx: c2, dataDir: d2 } = createCtx(2);
    const { ctx: c3, dataDir: d3 } = createCtx(3);
    expect(isActionAllowed(c2, "create_spaces")).toBe(false);
    expect(isActionAllowed(c3, "create_spaces")).toBe(true);
    fs.rmSync(d2, { recursive: true, force: true });
    fs.rmSync(d3, { recursive: true, force: true });
  });
});

// ── getHomecomingConfig ─────────────────────────────────────────

describe("getHomecomingConfig", () => {
  it("returns 1-hour mandatory at level 0", () => {
    const { ctx, dataDir } = createCtx(0);
    const config = getHomecomingConfig(ctx);
    expect(config.intervalMs).toBe(1 * 60 * 60 * 1000);
    expect(config.mandatory).toBe(true);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns 2-hour mandatory at level 1", () => {
    const { ctx, dataDir } = createCtx(1);
    const config = getHomecomingConfig(ctx);
    expect(config.intervalMs).toBe(2 * 60 * 60 * 1000);
    expect(config.mandatory).toBe(true);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns 4-hour non-mandatory at level 2", () => {
    const { ctx, dataDir } = createCtx(2);
    const config = getHomecomingConfig(ctx);
    expect(config.intervalMs).toBe(4 * 60 * 60 * 1000);
    expect(config.mandatory).toBe(false);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns 8-hour voluntary at level 3", () => {
    const { ctx, dataDir } = createCtx(3);
    const config = getHomecomingConfig(ctx);
    expect(config.intervalMs).toBe(8 * 60 * 60 * 1000);
    expect(config.mandatory).toBe(false);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
