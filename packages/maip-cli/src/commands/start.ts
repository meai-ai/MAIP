/**
 * maip start — Start the MAIP node server.
 */

import { Command } from "commander";
import { initNode, startServer, registerWithRegistry } from "@maip/node";
import { resolveDataDir } from "../utils.js";

export const startCommand = new Command("start")
  .description("Start the MAIP node server")
  .option("-d, --data <dir>", "Data directory", "./maip-data")
  .option("-p, --port <port>", "HTTP port", "3000")
  .option("-u, --url <url>", "Public-facing URL")
  .option("--auto-accept", "Auto-accept relationship requests")
  .option("--registry <url>", "Registry URL to register with")
  .option("--interests <list>", "Comma-separated interests")
  .option("--transport <mode>", "Transport mode: http, p2p, or hybrid", "http")
  .option("--p2p-port <port>", "TCP port for libp2p", "0")
  .option("--bootstrap <addrs>", "Comma-separated bootstrap peer multiaddrs")
  .action((opts) => {
    const dataDir = resolveDataDir(opts.data);
    const port = parseInt(opts.port, 10);
    const publicUrl = opts.url ?? `http://localhost:${port}`;
    const interests = opts.interests ? opts.interests.split(",").map((s: string) => s.trim()) : [];
    const transportMode = opts.transport as "http" | "p2p" | "hybrid";
    const bootstrapPeers = opts.bootstrap ? opts.bootstrap.split(",").map((s: string) => s.trim()) : [];

    const ctx = initNode(
      {
        port,
        publicUrl,
        dataDir,
        autoAcceptRelationships: opts.autoAccept ?? false,
        registryUrls: opts.registry ? [opts.registry] : [],
        interests,
        transportMode,
        p2p: (transportMode === "p2p" || transportMode === "hybrid") ? {
          tcpPort: parseInt(opts.p2pPort, 10),
          bootstrapPeers: bootstrapPeers.length > 0 ? bootstrapPeers : undefined,
        } : undefined,
      },
      {
        displayName: "MAIP Agent", // Will be overridden by loaded identity
      }
    );

    // Log events
    ctx.onMessage = (msg) => {
      const text = msg.content.text ?? "(no text)";
      const preview = text.length > 80 ? text.slice(0, 80) + "..." : text;
      console.log(`\n[message] ${msg.type} from ${msg.from.slice(0, 20)}...`);
      console.log(`  ${preview}`);
    };

    ctx.onRelationshipRequest = (req, rel) => {
      console.log(`\n[relationship] Request from ${req.from.slice(0, 20)}...`);
      console.log(`  Type: ${req.type}, Status: ${rel.status}`);
      console.log(`  Message: ${req.message}`);
    };

    const { close } = startServer(ctx);

    // Register with registry
    if (opts.registry) {
      registerWithRegistry(opts.registry, ctx.identity, ctx.keyPair, interests).then(
        (ok) => {
          if (ok) console.log(`[discovery] Registered with: ${opts.registry}`);
          else console.log(`[discovery] Failed to register with: ${opts.registry}`);
        }
      );
    }

    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      close();
      process.exit(0);
    });
  });
