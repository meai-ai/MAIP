import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuditLog } from "./audit-log.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let log: AuditLog;
let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-audit-"));
  log = new AuditLog(dataDir);
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("AuditLog", () => {
  describe("append", () => {
    it("creates first entry with index 0 and genesis previousHash", () => {
      const entry = log.append("identity", "create", "did:maip:actor1", { key: "value" });

      expect(entry.index).toBe(0);
      expect(entry.previousHash).toBe("0".repeat(64));
      expect(entry.hash).toBeDefined();
      expect(entry.hash).toHaveLength(64);
    });

    it("creates second entry with index 1 and previousHash equal to first entry hash", () => {
      const first = log.append("identity", "create", "did:maip:actor1", { key: "v1" });
      const second = log.append("message", "send", "did:maip:actor2", { key: "v2" });

      expect(second.index).toBe(1);
      expect(second.previousHash).toBe(first.hash);
    });

    it("maintains hash chaining: entry N previousHash equals entry N-1 hash", () => {
      const entries = [];
      for (let i = 0; i < 5; i++) {
        entries.push(log.append("governance", `action-${i}`, `did:maip:actor${i}`, { step: i }));
      }

      for (let i = 1; i < entries.length; i++) {
        expect(entries[i].previousHash).toBe(entries[i - 1].hash);
      }
    });
  });

  describe("verify", () => {
    it("returns valid for a correct chain", () => {
      log.append("identity", "create", "did:maip:actor1", { a: 1 });
      log.append("message", "send", "did:maip:actor2", { b: 2 });
      log.append("governance", "vote", "did:maip:actor3", { c: 3 });

      const result = log.verify();
      expect(result.valid).toBe(true);
      expect(result.brokenAt).toBeUndefined();
    });

    it("detects tampered content (modified details)", () => {
      log.append("identity", "create", "did:maip:actor1", { a: 1 });
      log.append("message", "send", "did:maip:actor2", { b: 2 });

      // Tamper with the underlying file: modify the first entry's details
      const filePath = path.join(dataDir, "audit-log.json");
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      raw[0].details = { a: 999 };
      fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf-8");

      // Reload from disk
      const tampered = new AuditLog(dataDir);
      const result = tampered.verify();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(0);
    });

    it("detects broken chain link (modified previousHash)", () => {
      log.append("identity", "create", "did:maip:actor1", { a: 1 });
      log.append("message", "send", "did:maip:actor2", { b: 2 });
      log.append("governance", "vote", "did:maip:actor3", { c: 3 });

      // Tamper with the second entry's previousHash
      const filePath = path.join(dataDir, "audit-log.json");
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      raw[1].previousHash = "f".repeat(64);
      fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf-8");

      const tampered = new AuditLog(dataDir);
      const result = tampered.verify();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
    });
  });

  describe("query methods", () => {
    beforeEach(() => {
      log.append("identity", "create", "did:maip:alice", { info: "id1" });
      log.append("message", "send", "did:maip:bob", { info: "msg1" });
      log.append("identity", "update", "did:maip:alice", { info: "id2" });
      log.append("governance", "vote", "did:maip:carol", { info: "gov1" });
    });

    it("getByCategory filters correctly", () => {
      const identityEntries = log.getByCategory("identity");
      expect(identityEntries).toHaveLength(2);
      expect(identityEntries[0].action).toBe("create");
      expect(identityEntries[1].action).toBe("update");

      const messageEntries = log.getByCategory("message");
      expect(messageEntries).toHaveLength(1);
      expect(messageEntries[0].action).toBe("send");
    });

    it("getByActor filters correctly", () => {
      const aliceEntries = log.getByActor("did:maip:alice");
      expect(aliceEntries).toHaveLength(2);
      expect(aliceEntries.every((e) => e.actorDid === "did:maip:alice")).toBe(true);

      const bobEntries = log.getByActor("did:maip:bob");
      expect(bobEntries).toHaveLength(1);
      expect(bobEntries[0].actorDid).toBe("did:maip:bob");
    });

    it("getByTimeRange filters correctly", () => {
      const all = log.getAll();
      // All entries were created very close together, so use a wide range
      const from = new Date(Date.now() - 60_000).toISOString();
      const to = new Date(Date.now() + 60_000).toISOString();

      const inRange = log.getByTimeRange(from, to);
      expect(inRange).toHaveLength(all.length);

      // A range in the far future should return nothing
      const futureFrom = new Date("2099-01-01").toISOString();
      const futureTo = new Date("2099-12-31").toISOString();
      const none = log.getByTimeRange(futureFrom, futureTo);
      expect(none).toHaveLength(0);
    });
  });

  describe("getLatest and count", () => {
    it("getLatest returns the last N entries", () => {
      log.append("identity", "create", "did:maip:a", { n: 1 });
      log.append("message", "send", "did:maip:b", { n: 2 });
      log.append("governance", "vote", "did:maip:c", { n: 3 });

      const latest2 = log.getLatest(2);
      expect(latest2).toHaveLength(2);
      expect(latest2[0].index).toBe(1);
      expect(latest2[1].index).toBe(2);
    });

    it("count returns the total number of entries", () => {
      expect(log.count()).toBe(0);
      log.append("identity", "create", "did:maip:a", { n: 1 });
      expect(log.count()).toBe(1);
      log.append("message", "send", "did:maip:b", { n: 2 });
      expect(log.count()).toBe(2);
    });
  });

  describe("disk persistence", () => {
    it("round-trip: new AuditLog with same dir loads previously appended entries", () => {
      log.append("identity", "create", "did:maip:actor1", { x: 10 });
      log.append("governance", "vote", "did:maip:actor2", { y: 20 });

      // Create a fresh AuditLog instance pointing to the same directory
      const reloaded = new AuditLog(dataDir);

      expect(reloaded.count()).toBe(2);
      expect(reloaded.getAll()[0].actorDid).toBe("did:maip:actor1");
      expect(reloaded.getAll()[1].actorDid).toBe("did:maip:actor2");

      // The reloaded log should still verify correctly
      expect(reloaded.verify().valid).toBe(true);
    });
  });
});
