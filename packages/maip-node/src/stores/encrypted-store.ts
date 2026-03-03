/**
 * Encrypted JSON file-based store.
 *
 * Wraps JsonStore with AES-256-GCM encryption at rest.
 * All data is encrypted before writing and decrypted when reading.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export class EncryptedJsonStore<T extends { id: string }> {
  private items: T[] = [];
  private filePath: string;
  private passphrase: string;

  constructor(dataDir: string, filename: string, passphrase: string) {
    this.filePath = path.join(dataDir, filename);
    this.passphrase = passphrase;
    this.load();
  }

  private encrypt(plaintext: string): string {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.passphrase, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      v: 1,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: encrypted.toString("base64"),
    });
  }

  private decrypt(encryptedStr: string): string {
    const { salt, iv, tag, data } = JSON.parse(encryptedStr);
    const key = crypto.scryptSync(this.passphrase, Buffer.from(salt, "base64"), 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf-8");
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        if (raw.trim().startsWith("{") && JSON.parse(raw).v === 1) {
          // Encrypted format
          const decrypted = this.decrypt(raw);
          this.items = JSON.parse(decrypted);
        } else {
          // Plaintext format (migration: re-save as encrypted)
          this.items = JSON.parse(raw);
          this.save();
        }
      }
    } catch {
      this.items = [];
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const plaintext = JSON.stringify(this.items, null, 2);
    fs.writeFileSync(this.filePath, this.encrypt(plaintext), "utf-8");
  }

  getAll(): T[] { return [...this.items]; }
  getById(id: string): T | undefined { return this.items.find((i) => i.id === id); }

  add(item: T): void {
    const idx = this.items.findIndex((i) => i.id === item.id);
    if (idx >= 0) this.items[idx] = item;
    else this.items.push(item);
    this.save();
  }

  remove(id: string): boolean {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    this.save();
    return true;
  }

  filter(predicate: (item: T) => boolean): T[] { return this.items.filter(predicate); }
  count(): number { return this.items.length; }
}
