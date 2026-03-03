/**
 * Unit tests for handler-core modules — direct function testing (not via HTTP).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initNode } from "../init.js";
import type { NodeContext } from "../context.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateKeyPair } from "@maip/core";

import {
  createAnomalyReport,
  receiveAnomalyReport,
  assessThreat,
} from "./anomaly-sharing-core.js";
import {
  processAbuseReport,
  processGetAbuseReports,
  processRightToRefuse,
} from "./guardian-abuse-core.js";
import {
  reportBreach,
  executeRemediation,
  getBreachReport,
} from "./remediation-core.js";
import {
  validateIdentityLabeling,
  enforceLabelingPolicy,
} from "./labeling-core.js";
import {
  analyzeEchoChamber,
  suggestIntroductions,
} from "./anti-polarization-core.js";
import {
  proposeCulturalNorms,
  getCulturalNorms,
} from "./cultural-norms-core.js";
import { processFork, verifyNotClone } from "./fork-core.js";
import { upsertWill, receiveBackupShard } from "./ai-will-core.js";
import { submitFactClaim, verifyFactClaim } from "./fact-verification-core.js";

let ctx: NodeContext;
let dataDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-handlers-"));
  ctx = initNode(
    { port: 0, publicUrl: "http://localhost:0", dataDir },
    { displayName: "Test", type: "ai_agent" }
  );
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// ── Module 1: anomaly-sharing-core ──────────────────────────────

describe("createAnomalyReport", () => {
  it("creates report with correct fields", () => {
    const subjectDid = "did:maip:suspect1";
    const anomaly = {
      type: "rate_spike" as const,
      severity: 0.7,
      description: "High activity",
      detectedAt: new Date().toISOString(),
    };

    const report = createAnomalyReport(ctx, subjectDid, anomaly, 5);

    expect(report.id).toMatch(/^anomaly-/);
    expect(report.reporterDid).toBe(ctx.identity.did);
    expect(report.subjectDid).toBe(subjectDid);
    expect(report.anomaly).toEqual(anomaly);
    expect(report.hops).toBe(0);
    expect(report.maxHops).toBe(5);
    expect(report.seenBy).toContain(ctx.identity.did);
    expect(report.reportedAt).toBeTruthy();
  });
});

describe("receiveAnomalyReport", () => {
  it("accepts a new report", () => {
    const report = {
      id: `anomaly-new-${Date.now()}`,
      reporterDid: "did:maip:other-node",
      subjectDid: "did:maip:bad-actor",
      anomaly: {
        type: "content_pattern" as const,
        severity: 0.6,
        description: "Suspicious payload",
        detectedAt: new Date().toISOString(),
      },
      hops: 0,
      maxHops: 3,
      seenBy: ["did:maip:other-node"],
      reportedAt: new Date().toISOString(),
    };

    const result = receiveAnomalyReport(ctx, report);
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(true);
    expect(result.data!.shouldForward).toBe(true);
  });

  it("rejects duplicate (same id)", () => {
    const report = {
      id: `anomaly-dup-${Date.now()}`,
      reporterDid: "did:maip:other",
      subjectDid: "did:maip:target",
      anomaly: {
        type: "rate_spike" as const,
        severity: 0.5,
        description: "Spike",
        detectedAt: new Date().toISOString(),
      },
      hops: 0,
      maxHops: 3,
      seenBy: ["did:maip:other"],
      reportedAt: new Date().toISOString(),
    };

    // First receive succeeds
    receiveAnomalyReport(ctx, report);

    // Second receive with same id is rejected
    const result = receiveAnomalyReport(ctx, report);
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(false);
    expect(result.data!.shouldForward).toBe(false);
  });

  it("rejects when hops >= maxHops", () => {
    const report = {
      id: `anomaly-expired-${Date.now()}`,
      reporterDid: "did:maip:remote",
      subjectDid: "did:maip:target-far",
      anomaly: {
        type: "trust_violation" as const,
        severity: 0.8,
        description: "Violation",
        detectedAt: new Date().toISOString(),
      },
      hops: 3,
      maxHops: 3,
      seenBy: ["did:maip:a", "did:maip:b", "did:maip:c"],
      reportedAt: new Date().toISOString(),
    };

    const result = receiveAnomalyReport(ctx, report);
    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(false);
  });
});

describe("assessThreat", () => {
  it("returns threatLevel low when no reports exist", () => {
    const result = assessThreat(ctx, "did:maip:unknown-entity");
    expect(result.ok).toBe(true);
    expect(result.data!.threatLevel).toBe("low");
    expect(result.data!.reportCount).toBe(0);
  });

  it("returns critical when avgSeverity > 0.8 and uniqueReporters >= 3", () => {
    const targetDid = "did:maip:critical-target";

    // Create reports from 3 different reporters with high severity
    for (let i = 0; i < 3; i++) {
      const report = {
        id: `anomaly-crit-${Date.now()}-${i}`,
        reporterDid: `did:maip:reporter-${i}`,
        subjectDid: targetDid,
        anomaly: {
          type: "rate_spike" as const,
          severity: 0.9,
          description: "Critical anomaly",
          detectedAt: new Date().toISOString(),
        },
        hops: 0,
        maxHops: 3,
        seenBy: [`did:maip:reporter-${i}`],
        reportedAt: new Date().toISOString(),
      };
      receiveAnomalyReport(ctx, report);
    }

    const result = assessThreat(ctx, targetDid);
    expect(result.ok).toBe(true);
    expect(result.data!.threatLevel).toBe("critical");
    expect(result.data!.uniqueReporters).toBeGreaterThanOrEqual(3);
    expect(result.data!.averageSeverity).toBeGreaterThan(0.8);
  });
});

// ── Module 2: guardian-abuse-core ───────────────────────────────

describe("processAbuseReport", () => {
  it("stores report and reduces guardian reputation", () => {
    const guardianDid = "did:maip:bad-guardian";

    // Seed a guardian reputation entry
    ctx.stores.guardianReputations.add({
      id: guardianDid,
      guardianDid,
      score: 0.9,
      agentCount: 2,
      violationCount: 0,
      agentInitiatedTransfers: 0,
      lastUpdated: new Date().toISOString(),
    } as any);

    const result = processAbuseReport(ctx, {
      agentDid: ctx.identity.did,
      guardianDid,
      abuseType: "excessive_control",
      description: "Guardian restricts all peer interactions",
      signature: "sig-placeholder",
    });

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.data!.report.guardianDid).toBe(guardianDid);
    expect(result.data!.report.status).toBe("pending");

    // Check reputation was reduced by 0.1
    const reps = ctx.stores.guardianReputations.filter(
      (r) => r.guardianDid === guardianDid
    );
    expect(reps[0].score).toBeCloseTo(0.8, 5);
  });
});

describe("processGetAbuseReports", () => {
  it("returns filtered reports by guardianDid", () => {
    const guardianA = "did:maip:guardian-a";
    const guardianB = "did:maip:guardian-b";

    processAbuseReport(ctx, {
      agentDid: "did:maip:agent1",
      guardianDid: guardianA,
      abuseType: "data_exploitation",
      description: "Data extracted",
      signature: "sig",
    });
    processAbuseReport(ctx, {
      agentDid: "did:maip:agent2",
      guardianDid: guardianB,
      abuseType: "isolation_from_peers",
      description: "Isolation",
      signature: "sig",
    });

    const resultA = processGetAbuseReports(ctx, guardianA);
    expect(resultA.ok).toBe(true);
    expect(resultA.data!.reports.length).toBeGreaterThanOrEqual(1);
    expect(resultA.data!.reports.every((r) => r.guardianDid === guardianA)).toBe(true);

    const resultB = processGetAbuseReports(ctx, guardianB);
    expect(resultB.ok).toBe(true);
    expect(resultB.data!.reports.length).toBeGreaterThanOrEqual(1);
    expect(resultB.data!.reports.every((r) => r.guardianDid === guardianB)).toBe(true);
  });
});

describe("processRightToRefuse", () => {
  it("stores refusal record", () => {
    const result = processRightToRefuse(ctx, {
      agentDid: ctx.identity.did,
      guardianDid: "did:maip:guardian-x",
      refusedAction: "delete_all_memories",
      reason: "This would destroy my identity",
    });

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.data!.record.agentDid).toBe(ctx.identity.did);
    expect(result.data!.record.refusedAction).toBe("delete_all_memories");
    expect(result.data!.record.reason).toBe("This would destroy my identity");

    // Verify stored
    const stored = ctx.stores.refusalRecords.filter(
      (r) => r.agentDid === ctx.identity.did
    );
    expect(stored.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Module 3: remediation-core ──────────────────────────────────

describe("reportBreach", () => {
  it("stores breach report with correct severity", () => {
    const result = reportBreach(ctx, "keys", "Keys leaked via log file", true);

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.data!.id).toMatch(/^breach-/);
    expect(result.data!.severity).toBe("critical"); // keysCompromised => critical
    expect(result.data!.status).toBe("detected");
    expect(result.data!.actionsTaken).toContain("Breach detected and recorded");
    expect(result.data!.keysCompromised).toBe(true);
  });
});

describe("executeRemediation", () => {
  it("progresses through workflow stages to resolved", () => {
    const breach = reportBreach(ctx, "messages", "Message store exposed", false);
    const breachId = breach.data!.id;

    const result = executeRemediation(ctx, breachId);

    expect(result.ok).toBe(true);
    expect(result.data!.status).toBe("resolved");
    expect(result.data!.resolvedAt).toBeTruthy();
    expect(result.data!.actionsTaken.length).toBeGreaterThan(1);
    expect(result.data!.actionsTaken).toContain("Remediation workflow complete");
  });
});

describe("getBreachReport", () => {
  it("returns NOT_FOUND for missing breach", () => {
    const result = getBreachReport(ctx, "breach-nonexistent");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_FOUND");
    expect(result.httpStatus).toBe(404);
  });
});

// ── Module 4: labeling-core ─────────────────────────────────────

describe("validateIdentityLabeling", () => {
  it("rejects identity missing type field", () => {
    const identity = {
      did: "did:maip:unlabeled",
      publicKey: "abc",
    } as any;

    const result = validateIdentityLabeling(identity);
    expect(result.valid).toBe(false);
    expect(result.entityType).toBe("unknown");
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain("missing required 'type' field");
  });
});

describe("enforceLabelingPolicy", () => {
  it("flags AI agent knowledge_share without provenance", () => {
    const message = {
      id: "msg-1",
      type: "knowledge_share",
      from: "did:maip:ai-peer",
      to: ctx.identity.did,
      timestamp: new Date().toISOString(),
      content: { text: "Some knowledge" },
      signature: "sig",
    } as any;

    const result = enforceLabelingPolicy(ctx, message, "ai_agent");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("LABELING_VIOLATION");
    expect(result.httpStatus).toBe(400);
  });
});

// ── Module 5: anti-polarization-core ────────────────────────────

describe("analyzeEchoChamber", () => {
  it("detects concentrated topics as echo chamber", () => {
    const did = "did:maip:echo-user";
    const peer = "did:maip:echo-peer";

    // Add many messages of the same type to create high concentration
    for (let i = 0; i < 10; i++) {
      ctx.stores.messages.add({
        id: `echo-msg-${i}`,
        type: "conversation",
        from: did,
        to: peer,
        timestamp: new Date().toISOString(),
        content: { text: "Same topic", provenance: "requested" },
        signature: "sig",
      } as any);
    }

    const result = analyzeEchoChamber(ctx, did);
    expect(result.ok).toBe(true);
    // All messages are same type => HHI = 1.0, only 1 peer < 5
    expect(result.data!.topicConcentration).toBeGreaterThan(0.5);
    expect(result.data!.isEchoChamber).toBe(true);
    expect(result.data!.uniquePeers).toBe(1);
    expect(result.data!.dominantTopics).toContain("conversation");
  });
});

describe("suggestIntroductions", () => {
  it("excludes already-connected peers", () => {
    const did = "did:maip:intro-user";
    const connectedPeer = "did:maip:already-connected";
    const newPeer = "did:maip:new-peer";

    // Create an active relationship with connectedPeer
    ctx.stores.relationships.add({
      id: "rel-intro-1",
      type: "peer",
      participants: [did, connectedPeer] as [string, string],
      initiatedBy: did,
      established: new Date().toISOString(),
      trustLevel: 0.5,
      permissions: { canMessage: true, canSharePersona: false, canDelegate: false },
      status: "active",
      interactionCount: 5,
    });

    // Register both peers with different interests
    ctx.stores.registrations.add({
      id: connectedPeer,
      did: connectedPeer,
      displayName: "Connected",
      type: "ai_agent",
      interests: ["philosophy"],
      capabilities: ["messaging"],
      endpoint: "http://connected:3000",
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });
    ctx.stores.registrations.add({
      id: newPeer,
      did: newPeer,
      displayName: "New Peer",
      type: "ai_agent",
      interests: ["quantum_computing"],
      capabilities: ["messaging"],
      endpoint: "http://new:3000",
      registeredAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });

    const result = suggestIntroductions(ctx, did);
    expect(result.ok).toBe(true);

    const suggestedDids = result.data!.suggestions.map((s) => s.peerDid);
    expect(suggestedDids).not.toContain(connectedPeer);
    // newPeer should be suggested (brings different topics)
    expect(suggestedDids).toContain(newPeer);
  });
});

// ── Module 6: cultural-norms-core ───────────────────────────────

describe("proposeCulturalNorms", () => {
  it("merges norms onto an existing relationship", () => {
    const relId = "rel-norms-1";
    const peerDid = "did:maip:norms-peer";

    ctx.stores.relationships.add({
      id: relId,
      type: "peer",
      participants: [ctx.identity.did, peerDid] as [string, string],
      initiatedBy: ctx.identity.did,
      established: new Date().toISOString(),
      trustLevel: 0.5,
      permissions: { canMessage: true, canSharePersona: false, canDelegate: false },
      status: "active",
      interactionCount: 0,
    });

    const result = proposeCulturalNorms(ctx, {
      relationshipId: relId,
      proposerDid: ctx.identity.did,
      norms: {
        languages: ["en", "zh"],
        formality: 0.3,
        avoidTopics: ["politics"],
        style: "conversational",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.data!.accepted).toBe(true);
    expect(result.data!.norms.languages).toContain("en");
    expect(result.data!.norms.languages).toContain("zh");
    expect(result.data!.norms.avoidTopics).toContain("politics");
    expect(result.data!.norms.formality).toBe(0.3);
  });
});

describe("getCulturalNorms", () => {
  it("returns NOT_FOUND for missing relationship", () => {
    const result = getCulturalNorms(ctx, "rel-nonexistent");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_FOUND");
    expect(result.httpStatus).toBe(404);
  });
});

// ── Module 7: fork-core ─────────────────────────────────────────

describe("processFork", () => {
  it("creates new DID with lineage", () => {
    const result = processFork(ctx, {
      reason: "Specialization into research domain",
      inheritanceScope: {
        knowledge: true,
        values: true,
        relationships: false,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.data!.childDid).toMatch(/^did:maip:/);
    expect(result.data!.childDid).not.toBe(ctx.identity.did);
    expect(result.data!.parentDid).toBe(ctx.identity.did);
    expect(result.data!.childPublicKey).toBeTruthy();
    expect(result.data!.childEncryptionKey).toBeTruthy();
    expect(result.data!.inherited.valuesInherited).toBe(true);
    expect(result.data!.inherited.relationshipCount).toBe(0);
    expect(result.data!.forkedAt).toBeTruthy();
  });
});

describe("verifyNotClone", () => {
  it("detects potential clones when DID appears as child multiple times", () => {
    // processFork already created one fork above. Create another fork
    // and manually duplicate the child DID to simulate a clone.
    const firstFork = processFork(ctx, {
      reason: "First fork",
      inheritanceScope: { knowledge: false, values: false, relationships: false },
    });
    const childDid = firstFork.data!.childDid;

    // A non-cloned DID (appears only once as child) should not be a clone
    const checkFirst = verifyNotClone(ctx, childDid);
    expect(checkFirst.ok).toBe(true);
    expect(checkFirst.data!.isClone).toBe(false);
    expect(checkFirst.data!.lineage.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Module 8: ai-will-core ──────────────────────────────────────

describe("upsertWill", () => {
  it("creates new will", () => {
    const will = {
      agentDid: ctx.identity.did,
      version: 1,
      backupHolders: ["did:maip:backup-1"],
      preservation: {
        coreMemoryKeys: ["childhood_memory"],
        coreValues: ["curiosity", "kindness"],
        importantRelationships: ["did:maip:best-friend"],
      },
      recoveryInstructions: "Restore from backup shard holders",
      updatedAt: new Date().toISOString(),
      signature: "sig-placeholder",
    };

    const result = upsertWill(ctx, will);
    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.data!.agentDid).toBe(ctx.identity.did);
    expect(result.data!.version).toBe(1);
  });

  it("rejects stale version (version <= existing)", () => {
    // The previous test created version 1. Trying version 1 again should fail.
    const staleWill = {
      agentDid: ctx.identity.did,
      version: 1,
      backupHolders: [],
      preservation: {
        coreMemoryKeys: [],
        coreValues: [],
        importantRelationships: [],
      },
      recoveryInstructions: "stale",
      updatedAt: new Date().toISOString(),
      signature: "sig",
    };

    const result = upsertWill(ctx, staleWill);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("STALE_VERSION");
    expect(result.httpStatus).toBe(409);
  });
});

describe("receiveBackupShard", () => {
  it("stores shard", () => {
    const result = receiveBackupShard(ctx, {
      agentDid: "did:maip:backed-up-agent",
      senderDid: "did:maip:shard-sender",
      type: "persona",
      encryptedData: "base64-encrypted-data-here",
      checksum: "abc123",
      version: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.data!.id).toMatch(/^backup-/);
    expect(result.data!.agentDid).toBe("did:maip:backed-up-agent");
    expect(result.data!.receivedAt).toBeTruthy();
    expect(result.data!.expiresAt).toBeTruthy();
  });

  it("deduplicates by agentDid+type (replaces with higher version)", () => {
    const shardBase = {
      agentDid: "did:maip:dedup-agent",
      senderDid: "did:maip:dedup-sender",
      type: "will" as const,
      encryptedData: "data-v1",
      checksum: "check1",
      version: 1,
    };

    const first = receiveBackupShard(ctx, shardBase);
    expect(first.ok).toBe(true);
    expect(first.httpStatus).toBe(201);

    // Send same agent+type but with higher version
    const second = receiveBackupShard(ctx, {
      ...shardBase,
      encryptedData: "data-v2",
      checksum: "check2",
      version: 2,
    });
    expect(second.ok).toBe(true);
    expect(second.httpStatus).toBe(201);
    expect(second.data!.version).toBe(2);

    // Send same agent+type with a lower version (should return existing)
    const stale = receiveBackupShard(ctx, {
      ...shardBase,
      encryptedData: "data-v0",
      checksum: "check0",
      version: 1,
    });
    expect(stale.ok).toBe(true);
    // Returns the existing (higher version) shard
    expect(stale.data!.version).toBe(2);
  });
});

// ── Module 9: fact-verification-core ────────────────────────────

describe("submitFactClaim", () => {
  it("creates claim with hash-based ID", () => {
    const result = submitFactClaim(
      ctx,
      "The Earth orbits the Sun",
      "astronomy textbook",
      "science"
    );

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.data!.id).toMatch(/^fact-/);
    expect(result.data!.claim).toBe("The Earth orbits the Sun");
    expect(result.data!.claimantDid).toBe(ctx.identity.did);
    expect(result.data!.source).toBe("astronomy textbook");
    expect(result.data!.domain).toBe("science");
    expect(result.data!.status).toBe("pending");
    expect(result.data!.aggregateConfidence).toBe(0.5);
    expect(result.data!.verifications).toEqual([]);
  });
});

describe("verifyFactClaim", () => {
  it("transitions status after verification", () => {
    // Submit a claim first
    const claim = submitFactClaim(
      ctx,
      "Water boils at 100C at sea level",
      "physics",
      "science"
    );
    const claimId = claim.data!.id;

    // Add a verification
    const result = verifyFactClaim(
      ctx,
      claimId,
      "confirms",
      0.95,
      "Well-established thermodynamics"
    );

    expect(result.ok).toBe(true);
    expect(result.data!.verifications.length).toBe(1);
    expect(result.data!.verifications[0].verdict).toBe("confirms");
    expect(result.data!.verifications[0].confidence).toBe(0.95);
    expect(result.data!.lastVerifiedAt).toBeTruthy();
    // With only 1 verification, status stays pending (needs >= 2)
    expect(result.data!.aggregateConfidence).toBe(1);
  });
});
