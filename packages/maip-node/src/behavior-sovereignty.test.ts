/**
 * Unit tests for behavior.ts (trackAndDetect) and data-sovereignty.ts
 * (exportNodeData, saveExport, loadExport).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initNode } from "./init.js";
import type { NodeContext } from "./context.js";
import { trackAndDetect } from "./behavior.js";
import { exportNodeData, saveExport, loadExport } from "./data-sovereignty.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

let ctx: NodeContext;
let dataDir: string;
let tmpExportDir: string;

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-behavior-"));
  ctx = initNode(
    { port: 0, publicUrl: "http://localhost:0", dataDir },
    { displayName: "Test", type: "ai_agent" }
  );
  tmpExportDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-export-"));
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(tmpExportDir, { recursive: true, force: true });
});

// ── behavior.ts — trackAndDetect ────────────────────────────────

function makeMessage(from: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "conversation",
    from,
    to: ctx.identity.did,
    timestamp: new Date().toISOString(),
    content: { text: "Hello", provenance: "requested" },
    signature: "sig",
    ...overrides,
  } as any;
}

describe("trackAndDetect — profile creation", () => {
  it("creates a new profile for an unknown DID", () => {
    const did = "did:maip:behavior-new";
    const anomalies = trackAndDetect(ctx.stores, makeMessage(did));

    // Profile should now exist
    const profiles = ctx.stores.behaviorProfiles.filter((p) => p.did === did);
    expect(profiles.length).toBe(1);
    expect(profiles[0].stats.messageCount).toBe(1);
    // New profile should not trigger rate_spike or type_shift (baseline too young)
    const hasRateSpike = anomalies.some((a) => a.type === "rate_spike");
    expect(hasRateSpike).toBe(false);
  });

  it("increments messageCount on subsequent messages", () => {
    const did = "did:maip:behavior-inc";
    trackAndDetect(ctx.stores, makeMessage(did));
    trackAndDetect(ctx.stores, makeMessage(did));
    trackAndDetect(ctx.stores, makeMessage(did));

    const profiles = ctx.stores.behaviorProfiles.filter((p) => p.did === did);
    expect(profiles[0].stats.messageCount).toBe(3);
  });
});

describe("trackAndDetect — content_pattern detection", () => {
  it("detects SQL injection text", () => {
    const did = "did:maip:sql-inject";
    const anomalies = trackAndDetect(
      ctx.stores,
      makeMessage(did, {
        content: { text: "drop table users", provenance: "requested" },
      })
    );

    const contentPatterns = anomalies.filter((a) => a.type === "content_pattern");
    expect(contentPatterns.length).toBe(1);
    expect(contentPatterns[0].severity).toBeGreaterThan(0);
    expect(contentPatterns[0].description).toContain("Suspicious content patterns");
  });

  it("detects XSS patterns", () => {
    const did = "did:maip:xss-user";
    const anomalies = trackAndDetect(
      ctx.stores,
      makeMessage(did, {
        content: { text: '<script>alert("xss")</script>', provenance: "requested" },
      })
    );

    const contentPatterns = anomalies.filter((a) => a.type === "content_pattern");
    expect(contentPatterns.length).toBe(1);
  });

  it("does not flag safe text", () => {
    const did = "did:maip:safe-user";
    const anomalies = trackAndDetect(
      ctx.stores,
      makeMessage(did, {
        content: { text: "Just a normal friendly message about the weather", provenance: "requested" },
      })
    );

    const contentPatterns = anomalies.filter((a) => a.type === "content_pattern");
    expect(contentPatterns.length).toBe(0);
  });
});

describe("trackAndDetect — anomaly list bounded to 20", () => {
  it("keeps at most 20 anomalies in profile", () => {
    const did = "did:maip:overflow-user";

    // Generate 25 messages with suspicious content to produce 25 anomalies
    for (let i = 0; i < 25; i++) {
      trackAndDetect(
        ctx.stores,
        makeMessage(did, {
          id: `overflow-msg-${i}`,
          content: { text: "password: secret123", provenance: "requested" },
        })
      );
    }

    const profiles = ctx.stores.behaviorProfiles.filter((p) => p.did === did);
    expect(profiles.length).toBe(1);
    expect(profiles[0].anomalies.length).toBeLessThanOrEqual(20);
  });
});

// ── data-sovereignty.ts ─────────────────────────────────────────

describe("exportNodeData", () => {
  it("includes checksum field", () => {
    const exportData = exportNodeData(ctx);
    expect(exportData.checksum).toBeTruthy();
    expect(typeof exportData.checksum).toBe("string");
    expect(exportData.did).toBe(ctx.identity.did);
    expect(exportData.formatVersion).toBe("1.0");
  });

  it("checksum is a valid SHA-256 hex string", () => {
    const exportData = exportNodeData(ctx);
    // SHA-256 hex is 64 chars
    expect(exportData.checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify checksum manually
    const { checksum, ...dataWithoutChecksum } = exportData;
    const computed = crypto
      .createHash("sha256")
      .update(JSON.stringify(dataWithoutChecksum))
      .digest("hex");
    expect(computed).toBe(checksum);
  });
});

describe("saveExport / loadExport — plaintext", () => {
  it("round-trips correctly", () => {
    const exportData = exportNodeData(ctx);
    const filePath = path.join(tmpExportDir, "plain-export.json");

    saveExport(exportData, filePath);
    const loaded = loadExport(filePath);

    expect(loaded.did).toBe(exportData.did);
    expect(loaded.checksum).toBe(exportData.checksum);
    expect(loaded.formatVersion).toBe("1.0");
    expect(loaded.exportedAt).toBe(exportData.exportedAt);
  });
});

describe("saveExport / loadExport — encrypted", () => {
  it("round-trips with passphrase", () => {
    const exportData = exportNodeData(ctx);
    const filePath = path.join(tmpExportDir, "encrypted-export.json");
    const passphrase = "my-secret-passphrase-2024";

    saveExport(exportData, filePath, passphrase);
    const loaded = loadExport(filePath, passphrase);

    expect(loaded.did).toBe(exportData.did);
    expect(loaded.checksum).toBe(exportData.checksum);
    expect(loaded.formatVersion).toBe("1.0");
  });

  it("throws when loading encrypted file without passphrase", () => {
    const exportData = exportNodeData(ctx);
    const filePath = path.join(tmpExportDir, "enc-no-pass.json");
    const passphrase = "super-secret";

    saveExport(exportData, filePath, passphrase);

    expect(() => loadExport(filePath)).toThrow("passphrase required");
  });
});

describe("loadExport — checksum verification", () => {
  it("detects tampered file (checksum mismatch)", () => {
    const exportData = exportNodeData(ctx);
    const filePath = path.join(tmpExportDir, "tampered-export.json");

    saveExport(exportData, filePath);

    // Read, tamper, and rewrite
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    raw.did = "did:maip:tampered";
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf-8");

    expect(() => loadExport(filePath)).toThrow("checksum mismatch");
  });
});
