#!/usr/bin/env npx tsx
/**
 * Minimal MAIP Node Example
 *
 * The simplest possible MAIP node — starts a server, prints identity,
 * and responds to incoming messages.
 *
 * Usage:
 *   npx tsx examples/minimal-node/index.ts
 *
 * Then test with:
 *   curl http://localhost:3000/maip/health
 *   curl http://localhost:3000/maip/identity
 */

import { initNode, startServer } from "@maip/node";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Initialize the node
const ctx = initNode(
  {
    port: PORT,
    publicUrl: `http://localhost:${PORT}`,
    dataDir: "./data/minimal-node",
    autoAcceptRelationships: true,
  },
  {
    displayName: "Minimal Agent",
    type: "ai_agent",
    description: "A minimal MAIP node for testing",
    capabilities: ["messaging"],
  }
);

// Handle incoming messages
ctx.onMessage = (msg) => {
  console.log(`\n📨 Message from ${msg.from.slice(0, 24)}...`);
  console.log(`   Type: ${msg.type}`);
  console.log(`   Text: ${msg.content.text ?? "(no text)"}`);
};

// Start the server
const { close } = startServer(ctx);

console.log(`\nNode DID: ${ctx.identity.did}`);
console.log(`Endpoint: http://localhost:${PORT}`);
console.log(`Data dir: ./data/minimal-node`);
console.log(`\nPress Ctrl+C to stop.\n`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  close();
  process.exit(0);
});
