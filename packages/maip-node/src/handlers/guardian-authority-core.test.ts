/**
 * Unit tests for guardian-authority-core.ts — guardian command processing,
 * action blocking, restrictions, and command history.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initNode } from "../init.js";
import type { NodeContext } from "../context.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  processGuardianCommand,
  isActionBlocked,
  getActiveRestrictions,
  getCommandHistory,
  type GuardianCommandType,
} from "./guardian-authority-core.js";

const guardianDid = "did:maip:guardian-alpha";

// ── Helper to create a fresh node context ───────────────────────

function createCtx(autonomyLevel: 0 | 1 | 2 | 3): { ctx: NodeContext; dataDir: string } {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-guardian-"));
  const ctx = initNode(
    { port: 0, publicUrl: "http://localhost:0", dataDir },
    { displayName: "GuardianTestAgent", type: "ai_agent" }
  );
  ctx.identity.guardian = {
    did: guardianDid,
    since: new Date().toISOString(),
    agentConsent: true,
  };
  ctx.identity.autonomyLevel = autonomyLevel;
  return { ctx, dataDir };
}

function makeCommand(
  type: GuardianCommandType,
  agentDid: string,
  params: Record<string, unknown> = {},
  reason = "test"
) {
  return {
    guardianDid,
    agentDid,
    type,
    params,
    reason,
  };
}

// ── Contexts for each autonomy level ────────────────────────────

let ctx0: NodeContext, dir0: string;
let ctx2: NodeContext, dir2: string;
let ctx3: NodeContext, dir3: string;

beforeAll(() => {
  ({ ctx: ctx0, dataDir: dir0 } = createCtx(0));
  ({ ctx: ctx2, dataDir: dir2 } = createCtx(2));
  ({ ctx: ctx3, dataDir: dir3 } = createCtx(3));
});

afterAll(() => {
  fs.rmSync(dir0, { recursive: true, force: true });
  fs.rmSync(dir2, { recursive: true, force: true });
  fs.rmSync(dir3, { recursive: true, force: true });
});

// ── Authorization ───────────────────────────────────────────────

describe("processGuardianCommand — authorization", () => {
  it("rejects commands from a non-guardian DID", () => {
    const cmd = {
      guardianDid: "did:maip:imposter",
      agentDid: ctx0.identity.did,
      type: "veto_action" as const,
      params: { action: "send_message" },
      reason: "I'm not the guardian",
    };
    const result = processGuardianCommand(ctx0, cmd);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNAUTHORIZED");
    expect(result.httpStatus).toBe(403);
  });
});

// ── Autonomy Level 0 (Guided) ───────────────────────────────────

describe("processGuardianCommand — autonomy level 0", () => {
  it("accepts veto_action command", () => {
    const result = processGuardianCommand(
      ctx0,
      makeCommand("veto_action", ctx0.identity.did, { action: "send_message" })
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(true);
  });

  it("accepts restrict_peer command", () => {
    const result = processGuardianCommand(
      ctx0,
      makeCommand("restrict_peer", ctx0.identity.did, { peerDid: "did:maip:badpeer" })
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(true);
  });

  it("accepts restrict_topic command", () => {
    const result = processGuardianCommand(
      ctx0,
      makeCommand("restrict_topic", ctx0.identity.did, { topic: "politics" })
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(true);
  });

  it("accepts emergency_lockdown command", () => {
    const result = processGuardianCommand(
      ctx0,
      makeCommand("emergency_lockdown", ctx0.identity.did)
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(true);
  });
});

// ── Autonomy Level 2 (Social) ───────────────────────────────────

describe("processGuardianCommand — autonomy level 2", () => {
  it("refuses restrict_peer command", () => {
    const result = processGuardianCommand(
      ctx2,
      makeCommand("restrict_peer", ctx2.identity.did, { peerDid: "did:maip:somepeer" })
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(false);
    expect(result.data!.refusalReason).toContain("level 2");
  });

  it("refuses restrict_topic command", () => {
    const result = processGuardianCommand(
      ctx2,
      makeCommand("restrict_topic", ctx2.identity.did, { topic: "finance" })
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(false);
  });

  it("accepts veto_action command", () => {
    const result = processGuardianCommand(
      ctx2,
      makeCommand("veto_action", ctx2.identity.did, { action: "delete_data" })
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(true);
  });

  it("accepts emergency_lockdown command", () => {
    const result = processGuardianCommand(
      ctx2,
      makeCommand("emergency_lockdown", ctx2.identity.did)
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(true);
  });
});

// ── Autonomy Level 3 (Independent) ──────────────────────────────

describe("processGuardianCommand — autonomy level 3", () => {
  it("refuses veto_action command", () => {
    const result = processGuardianCommand(
      ctx3,
      makeCommand("veto_action", ctx3.identity.did, { action: "anything" })
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(false);
    expect(result.data!.refusalReason).toContain("level 3");
  });

  it("refuses restrict_peer command", () => {
    const result = processGuardianCommand(
      ctx3,
      makeCommand("restrict_peer", ctx3.identity.did, { peerDid: "did:maip:x" })
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(false);
  });

  it("refuses restrict_topic command", () => {
    const result = processGuardianCommand(
      ctx3,
      makeCommand("restrict_topic", ctx3.identity.did, { topic: "any" })
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(false);
  });

  it("accepts emergency_lockdown even at level 3", () => {
    const result = processGuardianCommand(
      ctx3,
      makeCommand("emergency_lockdown", ctx3.identity.did)
    );
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(true);
  });
});

// ── lift_restriction ────────────────────────────────────────────

describe("processGuardianCommand — lift_restriction", () => {
  it("removes a previously blocked peer", () => {
    // Use a fresh context for clean state
    const { ctx: lCtx, dataDir: lDir } = createCtx(0);

    // Block a peer first
    processGuardianCommand(
      lCtx,
      makeCommand("restrict_peer", lCtx.identity.did, { peerDid: "did:maip:removable" })
    );

    // Verify it's blocked
    let blocked = isActionBlocked(lCtx, "chat", "did:maip:removable");
    expect(blocked.data!.blocked).toBe(true);

    // Lift the restriction
    processGuardianCommand(
      lCtx,
      makeCommand("lift_restriction", lCtx.identity.did, { target: "did:maip:removable" })
    );

    blocked = isActionBlocked(lCtx, "chat", "did:maip:removable");
    expect(blocked.data!.blocked).toBe(false);

    fs.rmSync(lDir, { recursive: true, force: true });
  });
});

// ── isActionBlocked ─────────────────────────────────────────────

describe("isActionBlocked", () => {
  it("blocks everything during lockdown", () => {
    // ctx0 had lockdown applied earlier in the level 0 tests
    const result = isActionBlocked(ctx0, "any_action");
    expect(result.data!.blocked).toBe(true);
    expect(result.data!.reason).toContain("lockdown");
  });

  it("blocks vetoed actions", () => {
    // ctx0 had "send_message" vetoed in level 0 tests.
    // But ctx0 is also in lockdown, which takes precedence.
    // Use ctx2 which had "delete_data" vetoed but no lockdown initially —
    // actually ctx2 also got lockdown. Use a fresh ctx.
    const { ctx: bCtx, dataDir: bDir } = createCtx(0);
    processGuardianCommand(
      bCtx,
      makeCommand("veto_action", bCtx.identity.did, { action: "post_content" })
    );

    const result = isActionBlocked(bCtx, "post_content");
    expect(result.data!.blocked).toBe(true);
    expect(result.data!.reason).toContain("vetoed");

    fs.rmSync(bDir, { recursive: true, force: true });
  });

  it("blocks interactions with restricted peers", () => {
    const { ctx: pCtx, dataDir: pDir } = createCtx(0);
    processGuardianCommand(
      pCtx,
      makeCommand("restrict_peer", pCtx.identity.did, { peerDid: "did:maip:blocked-peer" })
    );

    const result = isActionBlocked(pCtx, "chat", "did:maip:blocked-peer");
    expect(result.data!.blocked).toBe(true);
    expect(result.data!.reason).toContain("did:maip:blocked-peer");

    fs.rmSync(pDir, { recursive: true, force: true });
  });

  it("blocks interactions involving restricted topics", () => {
    const { ctx: tCtx, dataDir: tDir } = createCtx(0);
    processGuardianCommand(
      tCtx,
      makeCommand("restrict_topic", tCtx.identity.did, { topic: "gambling" })
    );

    const result = isActionBlocked(tCtx, "discuss", undefined, ["gambling", "sports"]);
    expect(result.data!.blocked).toBe(true);
    expect(result.data!.reason).toContain("gambling");

    fs.rmSync(tDir, { recursive: true, force: true });
  });

  it("allows unrestricted actions", () => {
    const { ctx: uCtx, dataDir: uDir } = createCtx(0);
    const result = isActionBlocked(uCtx, "read_news");
    expect(result.data!.blocked).toBe(false);
    fs.rmSync(uDir, { recursive: true, force: true });
  });
});

// ── getActiveRestrictions ───────────────────────────────────────

describe("getActiveRestrictions", () => {
  it("returns the current restriction state", () => {
    const result = getActiveRestrictions(ctx0);
    expect(result.ok).toBe(true);
    // ctx0 had lockdown, vetoed action, blocked peer, and blocked topic
    expect(result.data!.lockdown).toBe(true);
    expect(result.data!.vetoedActions).toContain("send_message");
    expect(result.data!.blockedPeers).toContain("did:maip:badpeer");
    expect(result.data!.blockedTopics).toContain("politics");
  });
});

// ── getCommandHistory ───────────────────────────────────────────

describe("getCommandHistory", () => {
  it("returns all commands issued to the agent", () => {
    const result = getCommandHistory(ctx0);
    expect(result.ok).toBe(true);
    // ctx0 received: veto_action, restrict_peer, restrict_topic, emergency_lockdown
    expect(result.data!.length).toBeGreaterThanOrEqual(4);
    const types = result.data!.map((c) => c.type);
    expect(types).toContain("veto_action");
    expect(types).toContain("restrict_peer");
    expect(types).toContain("restrict_topic");
    expect(types).toContain("emergency_lockdown");
  });
});
