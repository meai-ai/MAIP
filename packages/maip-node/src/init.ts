/**
 * MAIP Node initialization.
 *
 * Creates or loads a node's identity, keypair, and stores.
 */

import fs from "node:fs";
import path from "node:path";
import {
  generateKeyPair,
  importSecretKey,
  exportSecretKey,
  getPublicKeyBase58,
  getEncryptionKeyBase58,
  signDocument,
  MAIP_VERSION,
  type MAIPKeyPair,
  type IdentityDocument,
  type EntityType,
  type Capability,
  type Persona,
} from "@maip/core";
import type { NodeConfig, NodeContext } from "./context.js";
import { NodeStores } from "./stores/index.js";

/** Options for initializing a new node identity. */
export interface InitOptions {
  displayName: string;
  type?: EntityType;
  description?: string;
  capabilities?: Capability[];
  guardianDid?: string;
  autonomyLevel?: 0 | 1 | 2 | 3;
}

/** File names for persisted node state. */
const KEY_FILE = "secret.key";
const IDENTITY_FILE = "identity.json";
const PERSONA_FILE = "persona.json";

/** Initialize a new node from scratch. */
export function initNode(
  config: NodeConfig,
  options: InitOptions
): NodeContext {
  const dataDir = config.dataDir;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const keyPath = path.join(dataDir, KEY_FILE);
  const identityPath = path.join(dataDir, IDENTITY_FILE);

  let keyPair: MAIPKeyPair;
  let identity: IdentityDocument;

  if (fs.existsSync(keyPath) && fs.existsSync(identityPath)) {
    // Load existing
    const secretKeyBase64 = fs.readFileSync(keyPath, "utf-8").trim();
    keyPair = importSecretKey(secretKeyBase64);
    identity = JSON.parse(fs.readFileSync(identityPath, "utf-8"));
  } else {
    // Generate new
    keyPair = generateKeyPair();

    const now = new Date().toISOString();
    const identityData: Omit<IdentityDocument, "signature"> = {
      version: MAIP_VERSION,
      did: keyPair.did,
      type: options.type ?? "ai_agent",
      publicKey: getPublicKeyBase58(keyPair),
      encryptionKey: getEncryptionKeyBase58(keyPair),
      displayName: options.displayName,
      description: options.description,
      capabilities: options.capabilities ?? ["messaging", "persona_sharing", "knowledge_exchange"],
      endpoints: {
        maip: config.publicUrl,
      },
      created: now,
      updated: now,
    };

    if (options.guardianDid) {
      (identityData as IdentityDocument).guardian = {
        did: options.guardianDid,
        since: now,
        agentConsent: true,
      };
    }

    if (options.autonomyLevel !== undefined) {
      (identityData as IdentityDocument).autonomyLevel = options.autonomyLevel;
    }

    identity = signDocument(
      identityData as IdentityDocument & Record<string, unknown>,
      keyPair.signing.secretKey
    ) as unknown as IdentityDocument;

    // Save
    fs.writeFileSync(keyPath, exportSecretKey(keyPair), "utf-8");
    fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), "utf-8");
  }

  // Load persona if exists
  const personaPath = path.join(dataDir, PERSONA_FILE);
  let persona: Persona | null = null;
  if (fs.existsSync(personaPath)) {
    try {
      persona = JSON.parse(fs.readFileSync(personaPath, "utf-8"));
    } catch {
      persona = null;
    }
  }

  const stores = new NodeStores(dataDir);

  return {
    identity,
    persona,
    keyPair,
    stores,
    config,
    startedAt: Date.now(),
  };
}

/** Update the identity document (e.g., after config changes). */
export function updateIdentity(
  ctx: NodeContext,
  updates: Partial<Pick<IdentityDocument, "displayName" | "description" | "capabilities" | "endpoints">>
): IdentityDocument {
  const updated: IdentityDocument = {
    ...ctx.identity,
    ...updates,
    updated: new Date().toISOString(),
    signature: "",
  };

  const signed = signDocument(
    updated as IdentityDocument & Record<string, unknown>,
    ctx.keyPair.signing.secretKey
  ) as unknown as IdentityDocument;

  ctx.identity = signed;

  // Persist
  const identityPath = path.join(ctx.config.dataDir, IDENTITY_FILE);
  fs.writeFileSync(identityPath, JSON.stringify(signed, null, 2), "utf-8");

  return signed;
}
