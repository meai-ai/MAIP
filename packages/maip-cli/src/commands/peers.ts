/**
 * maip peers — List active relationships.
 */

import { Command } from "commander";
import { resolveDataDir } from "../utils.js";
import { NodeStores } from "@maip/node";

export const peersCommand = new Command("peers")
  .description("List active relationships / connections")
  .option("-d, --data <dir>", "Data directory", "./maip-data")
  .option("-a, --all", "Show all relationships (including ended)")
  .action((opts) => {
    const dataDir = resolveDataDir(opts.data);
    const stores = new NodeStores(dataDir);

    let relationships = stores.relationships.getAll();
    if (!opts.all) {
      relationships = relationships.filter((r) => r.status !== "ended");
    }

    if (relationships.length === 0) {
      console.log("No connections yet. Use 'maip connect <endpoint>' to connect to a peer.");
      return;
    }

    console.log(`${relationships.length} connection(s):\n`);
    for (const rel of relationships) {
      const other = rel.participants.find((p) => p !== rel.initiatedBy) ?? rel.participants[1];
      const direction = rel.initiatedBy === other ? "← incoming" : "→ outgoing";

      console.log(`  [${rel.status.toUpperCase()}] ${rel.type} ${direction}`);
      console.log(`    Peer:         ${other}`);
      console.log(`    Trust:        ${(rel.trustLevel * 100).toFixed(0)}%`);
      console.log(`    Interactions: ${rel.interactionCount}`);
      console.log(`    Since:        ${rel.established}`);
      if (rel.lastInteraction) {
        console.log(`    Last Active:  ${rel.lastInteraction}`);
      }

      const perms = [];
      if (rel.permissions.canMessage) perms.push("message");
      if (rel.permissions.canSharePersona) perms.push("persona");
      if (rel.permissions.canDelegate) perms.push("delegate");
      console.log(`    Permissions:  ${perms.join(", ") || "none"}`);
      console.log();
    }
  });
