import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EncryptedJsonStore } from "./encrypted-store.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

interface TestItem {
  id: string;
  name: string;
  value: number;
}

let store: EncryptedJsonStore<TestItem>;
let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "maip-enc-"));
  store = new EncryptedJsonStore<TestItem>(dataDir, "test.enc.json", "test-passphrase");
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("EncryptedJsonStore", () => {
  describe("add and getAll", () => {
    it("returns added items via getAll", () => {
      store.add({ id: "a", name: "Alice", value: 10 });
      store.add({ id: "b", name: "Bob", value: 20 });

      const all = store.getAll();
      expect(all).toHaveLength(2);
      expect(all).toEqual([
        { id: "a", name: "Alice", value: 10 },
        { id: "b", name: "Bob", value: 20 },
      ]);
    });
  });

  describe("getById", () => {
    it("returns the correct item by id", () => {
      store.add({ id: "x", name: "Xander", value: 42 });
      store.add({ id: "y", name: "Yara", value: 99 });

      const item = store.getById("x");
      expect(item).toEqual({ id: "x", name: "Xander", value: 42 });

      expect(store.getById("nonexistent")).toBeUndefined();
    });
  });

  describe("upsert behavior", () => {
    it("add with existing id replaces the item", () => {
      store.add({ id: "a", name: "Alice", value: 10 });
      store.add({ id: "a", name: "Alice Updated", value: 50 });

      expect(store.count()).toBe(1);
      const item = store.getById("a");
      expect(item).toEqual({ id: "a", name: "Alice Updated", value: 50 });
    });
  });

  describe("remove", () => {
    it("removes an existing item and returns true", () => {
      store.add({ id: "a", name: "Alice", value: 10 });
      store.add({ id: "b", name: "Bob", value: 20 });

      const removed = store.remove("a");
      expect(removed).toBe(true);
      expect(store.count()).toBe(1);
      expect(store.getById("a")).toBeUndefined();
    });

    it("returns false when removing an unknown id", () => {
      store.add({ id: "a", name: "Alice", value: 10 });

      const removed = store.remove("nonexistent");
      expect(removed).toBe(false);
      expect(store.count()).toBe(1);
    });
  });

  describe("filter and count", () => {
    it("filter returns items matching predicate", () => {
      store.add({ id: "a", name: "Alice", value: 10 });
      store.add({ id: "b", name: "Bob", value: 20 });
      store.add({ id: "c", name: "Carol", value: 30 });

      const highValue = store.filter((item) => item.value > 15);
      expect(highValue).toHaveLength(2);
      expect(highValue.map((i) => i.id)).toEqual(["b", "c"]);
    });

    it("count returns the number of items", () => {
      expect(store.count()).toBe(0);
      store.add({ id: "a", name: "Alice", value: 10 });
      expect(store.count()).toBe(1);
    });
  });

  describe("encryption and persistence", () => {
    it("disk file content is NOT plaintext JSON", () => {
      store.add({ id: "secret", name: "Secret Data", value: 777 });

      const filePath = path.join(dataDir, "test.enc.json");
      const raw = fs.readFileSync(filePath, "utf-8");

      // The file should exist and be non-empty
      expect(raw.length).toBeGreaterThan(0);

      // The raw file is an encrypted envelope (JSON with v/salt/iv/tag/data keys)
      // but the plaintext item data should NOT appear in the file
      expect(raw).not.toContain('"Secret Data"');
      expect(raw).not.toContain('"secret"');

      // It should have the encrypted format markers
      const parsed = JSON.parse(raw);
      expect(parsed.v).toBe(1);
      expect(parsed.salt).toBeDefined();
      expect(parsed.iv).toBeDefined();
      expect(parsed.tag).toBeDefined();
      expect(parsed.data).toBeDefined();
    });

    it("reload with correct passphrase recovers data", () => {
      store.add({ id: "a", name: "Alice", value: 10 });
      store.add({ id: "b", name: "Bob", value: 20 });

      // Create a new store instance with the same passphrase
      const reloaded = new EncryptedJsonStore<TestItem>(dataDir, "test.enc.json", "test-passphrase");

      expect(reloaded.count()).toBe(2);
      expect(reloaded.getById("a")).toEqual({ id: "a", name: "Alice", value: 10 });
      expect(reloaded.getById("b")).toEqual({ id: "b", name: "Bob", value: 20 });
    });

    it("reload with wrong passphrase returns empty store", () => {
      store.add({ id: "a", name: "Alice", value: 10 });

      // Create a new store instance with the WRONG passphrase
      const wrongStore = new EncryptedJsonStore<TestItem>(dataDir, "test.enc.json", "wrong-passphrase");

      // The catch block in load() should have set items to []
      expect(wrongStore.count()).toBe(0);
      expect(wrongStore.getAll()).toEqual([]);
    });
  });
});
