/**
 * Generic JSON file-based store.
 *
 * Simple persistence for MAIP node data. Each store is a single JSON
 * file containing an array of items with string IDs.
 */

import fs from "node:fs";
import path from "node:path";

export class JsonStore<T extends { id: string }> {
  private items: T[] = [];
  private filePath: string;

  constructor(dataDir: string, filename: string) {
    this.filePath = path.join(dataDir, filename);
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.items = JSON.parse(raw);
      }
    } catch {
      this.items = [];
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.items, null, 2), "utf-8");
  }

  getAll(): T[] {
    return [...this.items];
  }

  getById(id: string): T | undefined {
    return this.items.find((item) => item.id === id);
  }

  add(item: T): void {
    const existing = this.items.findIndex((i) => i.id === item.id);
    if (existing >= 0) {
      this.items[existing] = item;
    } else {
      this.items.push(item);
    }
    this.save();
  }

  update(id: string, updater: (item: T) => T): T | undefined {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return undefined;
    this.items[idx] = updater(this.items[idx]);
    this.save();
    return this.items[idx];
  }

  remove(id: string): boolean {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    this.save();
    return true;
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.items.filter(predicate);
  }

  count(): number {
    return this.items.length;
  }
}
