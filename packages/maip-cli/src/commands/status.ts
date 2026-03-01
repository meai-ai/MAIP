/**
 * maip status — Show node status and identity info.
 */

import { Command } from "commander";
import { resolveDataDir, loadIdentity } from "../utils.js";
import { NodeStores } from "@maip/node";

export const statusCommand = new Command("status")
  .description("Show node status and identity info")
  .option("-d, --data <dir>", "Data directory", "./maip-data")
  .action((opts) => {
    const dataDir = resolveDataDir(opts.data);
    const identity = loadIdentity(dataDir);
    const stores = new NodeStores(dataDir);

    const activeRels = stores.relationships.filter((r) => r.status === "active");
    const pendingRels = stores.relationships.filter((r) => r.status === "pending");
    const messageCount = stores.messages.count();
    const relayCount = stores.relay.count();

    console.log("MAIP Node Status\n");
    console.log(`  DID:            ${identity.did}`);
    console.log(`  Display Name:   ${identity.displayName}`);
    console.log(`  Type:           ${identity.type}`);
    console.log(`  Endpoint:       ${identity.endpoints.maip}`);
    console.log(`  Capabilities:   ${identity.capabilities.join(", ")}`);
    console.log(`  Created:        ${identity.created}`);
    console.log(`  Updated:        ${identity.updated}`);
    if (identity.guardian) {
      console.log(`  Guardian:       ${identity.guardian.did}`);
    }
    if (identity.autonomyLevel !== undefined) {
      console.log(`  Autonomy Level: ${identity.autonomyLevel}`);
    }
    console.log();
    console.log("  Connections:");
    console.log(`    Active:  ${activeRels.length}`);
    console.log(`    Pending: ${pendingRels.length}`);
    console.log(`  Messages:  ${messageCount}`);
    console.log(`  Relay Queue: ${relayCount}`);
  });
