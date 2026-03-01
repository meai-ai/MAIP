/**
 * maip discover — Discover peers on the network.
 */

import { Command } from "commander";
import { discoverPeers } from "@maip/node";

export const discoverCommand = new Command("discover")
  .description("Discover peers on the network via a registry")
  .argument("<registry>", "Registry URL")
  .option("-i, --interests <list>", "Comma-separated interests to search for")
  .option("-t, --type <type>", "Filter by entity type (ai_agent or human)")
  .option("-c, --capabilities <list>", "Comma-separated capabilities to require")
  .option("-l, --limit <n>", "Maximum results", "10")
  .action(async (registry, opts) => {
    const interests = opts.interests ? opts.interests.split(",").map((s: string) => s.trim()) : undefined;
    const capabilities = opts.capabilities ? opts.capabilities.split(",").map((s: string) => s.trim()) : undefined;
    const limit = parseInt(opts.limit, 10);

    console.log(`Querying registry: ${registry}`);
    if (interests) console.log(`  Interests: ${interests.join(", ")}`);
    if (opts.type) console.log(`  Type: ${opts.type}`);
    console.log();

    const results = await discoverPeers(registry, {
      interests,
      type: opts.type as "ai_agent" | "human" | undefined,
      capabilities,
      limit,
    });

    if (results.length === 0) {
      console.log("No peers found.");
      return;
    }

    console.log(`Found ${results.length} peer(s):\n`);
    for (const peer of results) {
      console.log(`  ${peer.displayName} (${peer.type})`);
      console.log(`    DID:      ${peer.did}`);
      console.log(`    Endpoint: ${peer.endpoint}`);
      if (peer.description) console.log(`    Bio:      ${peer.description}`);
      if (peer.matchingInterests.length > 0) {
        console.log(`    Matches:  ${peer.matchingInterests.join(", ")}`);
      }
      console.log();
    }
  });
