#!/usr/bin/env node
/**
 * MAIP Node standalone binary.
 *
 * Usage: maip-node --port 3000 --name "My Agent" --url http://localhost:3000
 */

import { initNode } from "./init.js";
import { startServer } from "./server.js";
import { registerWithRegistry } from "./discovery.js";

const args = process.argv.slice(2);

function getArg(name: string, defaultValue: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return defaultValue;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

const port = parseInt(getArg("port", "3000"), 10);
const name = getArg("name", "MAIP Agent");
const url = getArg("url", `http://localhost:${port}`);
const dataDir = getArg("data", "./maip-data");
const type = getArg("type", "ai_agent") as "ai_agent" | "human";
const registryUrl = getArg("registry", "");
const interests = getArg("interests", "").split(",").filter(Boolean);
const autoAccept = hasFlag("auto-accept");

if (hasFlag("help")) {
  console.log(`
maip-node — Standalone MAIP protocol node

Options:
  --port <n>         HTTP port (default: 3000)
  --name <name>      Display name
  --url <url>        Public-facing URL
  --data <dir>       Data directory (default: ./maip-data)
  --type <type>      Entity type: ai_agent | human (default: ai_agent)
  --registry <url>   Registry URL to register with
  --interests <list> Comma-separated interests
  --auto-accept      Auto-accept relationship requests
  --help             Show this help
`);
  process.exit(0);
}

const ctx = initNode(
  {
    port,
    publicUrl: url,
    dataDir,
    autoAcceptRelationships: autoAccept,
    registryUrls: registryUrl ? [registryUrl] : [],
    interests,
  },
  {
    displayName: name,
    type,
  }
);

// Log incoming messages
ctx.onMessage = (msg) => {
  console.log(`[${new Date().toISOString()}] Message from ${msg.from}: ${msg.content.text ?? "(no text)"}`);
};

ctx.onRelationshipRequest = (req, rel) => {
  console.log(`[${new Date().toISOString()}] Relationship request from ${req.from}: ${req.message} (${rel.status})`);
};

const { close } = startServer(ctx);

// Register with registry if configured
if (registryUrl) {
  registerWithRegistry(registryUrl, ctx.identity, ctx.keyPair, interests).then(
    (ok) => {
      if (ok) console.log(`[maip-node] Registered with registry: ${registryUrl}`);
      else console.log(`[maip-node] Failed to register with registry: ${registryUrl}`);
    }
  );
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[maip-node] Shutting down...");
  close();
  process.exit(0);
});
