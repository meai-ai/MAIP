/**
 * maip init — Initialize a new MAIP node identity.
 */

import { Command } from "commander";
import { initNode } from "@maip/node";
import { resolveDataDir } from "../utils.js";

export const initCommand = new Command("init")
  .description("Initialize a new MAIP node identity")
  .option("-n, --name <name>", "Display name", "MAIP Agent")
  .option("-t, --type <type>", "Entity type (ai_agent or human)", "ai_agent")
  .option("-d, --data <dir>", "Data directory", "./maip-data")
  .option("-p, --port <port>", "HTTP port", "3000")
  .option("-u, --url <url>", "Public-facing URL")
  .option("--description <desc>", "Short description / bio")
  .option("--guardian <did>", "Guardian DID (for AI agents)")
  .option("--autonomy <level>", "Autonomy level (0-3)")
  .action((opts) => {
    const dataDir = resolveDataDir(opts.data);
    const port = parseInt(opts.port, 10);
    const publicUrl = opts.url ?? `http://localhost:${port}`;

    const ctx = initNode(
      {
        port,
        publicUrl,
        dataDir,
      },
      {
        displayName: opts.name,
        type: opts.type as "ai_agent" | "human",
        description: opts.description,
        guardianDid: opts.guardian,
        autonomyLevel: opts.autonomy !== undefined ? parseInt(opts.autonomy, 10) as 0 | 1 | 2 | 3 : undefined,
      }
    );

    console.log("MAIP node initialized successfully!\n");
    console.log(`  DID:          ${ctx.identity.did}`);
    console.log(`  Display Name: ${ctx.identity.displayName}`);
    console.log(`  Type:         ${ctx.identity.type}`);
    console.log(`  Endpoint:     ${ctx.identity.endpoints.maip}`);
    console.log(`  Data Dir:     ${dataDir}`);
    console.log(`\nIdentity saved to: ${dataDir}/identity.json`);
    console.log(`Secret key saved to: ${dataDir}/secret.key`);
    console.log(`\nRun 'maip start' to start the node server.`);
  });
