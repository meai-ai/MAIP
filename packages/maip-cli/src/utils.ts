/**
 * Shared CLI utilities.
 */

import fs from "node:fs";
import path from "node:path";
import { importSecretKey, type MAIPKeyPair, type IdentityDocument } from "@maip/core";

const DEFAULT_DATA_DIR = "./maip-data";

/** Resolve the data directory from option or default. */
export function resolveDataDir(optionValue?: string): string {
  return path.resolve(optionValue ?? DEFAULT_DATA_DIR);
}

/** Load the node's keypair from the data directory. */
export function loadKeyPair(dataDir: string): MAIPKeyPair {
  const keyPath = path.join(dataDir, "secret.key");
  if (!fs.existsSync(keyPath)) {
    console.error("Error: No identity found. Run 'maip init' first.");
    process.exit(1);
  }
  const secretKeyBase64 = fs.readFileSync(keyPath, "utf-8").trim();
  return importSecretKey(secretKeyBase64);
}

/** Load the node's identity document. */
export function loadIdentity(dataDir: string): IdentityDocument {
  const identityPath = path.join(dataDir, "identity.json");
  if (!fs.existsSync(identityPath)) {
    console.error("Error: No identity found. Run 'maip init' first.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(identityPath, "utf-8"));
}

/** Pretty-print a JSON object. */
export function prettyJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}
