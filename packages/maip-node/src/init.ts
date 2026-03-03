/**
 * MAIP Node initialization.
 *
 * Creates or loads a node's identity, keypair, and stores.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Encrypt a secret key string with a passphrase using AES-256-GCM. */
function encryptSecretKey(plaintext: string, passphrase: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

/** Decrypt a secret key string encrypted with encryptSecretKey. */
function decryptSecretKey(encryptedStr: string, passphrase: string): string {
  const { salt, iv, tag, data } = JSON.parse(encryptedStr);
  const key = crypto.scryptSync(passphrase, Buffer.from(salt, "base64"), 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf-8");
}
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
    const rawKey = fs.readFileSync(keyPath, "utf-8").trim();
    const passphrase = config.secretKeyPassphrase;
    let secretKeyBase64: string;
    if (passphrase && rawKey.startsWith("{")) {
      // Encrypted key — decrypt it
      secretKeyBase64 = decryptSecretKey(rawKey, passphrase);
    } else {
      secretKeyBase64 = rawKey;
    }
    keyPair = importSecretKey(secretKeyBase64);
    identity = JSON.parse(fs.readFileSync(identityPath, "utf-8"));
    // Generate fresh instance nonce on each startup (unique active instance)
    identity.instanceNonce = crypto.randomUUID();
  } else {
    // Generate new
    keyPair = generateKeyPair();

    const now = new Date().toISOString();
    const transportMode = config.transportMode ?? "http";
    const endpoints: { maip: string; p2p?: string } = {
      maip: config.publicUrl,
    };
    // P2P endpoint is populated later in server.ts once libp2p starts and
    // we know the actual multiaddr. For now, set a placeholder if in p2p/hybrid mode.
    if (transportMode === "p2p" || transportMode === "hybrid") {
      const tcpPort = config.p2p?.tcpPort ?? 0;
      endpoints.p2p = `/ip4/0.0.0.0/tcp/${tcpPort}`;
    }

    const identityData: Omit<IdentityDocument, "signature"> = {
      version: MAIP_VERSION,
      did: keyPair.did,
      type: options.type ?? "ai_agent",
      publicKey: getPublicKeyBase58(keyPair),
      encryptionKey: getEncryptionKeyBase58(keyPair),
      displayName: options.displayName,
      description: options.description,
      capabilities: options.capabilities ?? ["messaging", "persona_sharing", "knowledge_exchange"],
      endpoints,
      instanceNonce: crypto.randomUUID(),
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

    // Save (encrypt secret key if passphrase is configured)
    const exportedKey = exportSecretKey(keyPair);
    const passphrase = config.secretKeyPassphrase;
    if (passphrase) {
      fs.writeFileSync(keyPath, encryptSecretKey(exportedKey, passphrase), "utf-8");
    } else {
      fs.writeFileSync(keyPath, exportedKey, "utf-8");
    }
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
