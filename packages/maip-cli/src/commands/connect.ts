/**
 * maip connect — Connect to a remote MAIP node (send relationship request).
 */

import { Command } from "commander";
import { sendRelationshipRequest, fetchIdentity } from "@maip/node";
import { resolveDataDir, loadKeyPair, loadIdentity } from "../utils.js";

export const connectCommand = new Command("connect")
  .description("Connect to a remote MAIP node")
  .argument("<endpoint>", "Remote node's MAIP endpoint URL")
  .option("-d, --data <dir>", "Data directory", "./maip-data")
  .option("-t, --type <type>", "Relationship type (peer, mentor_student, collaborator)", "peer")
  .option("-m, --message <msg>", "Introduction message", "Hello! I'd like to connect.")
  .action(async (endpoint, opts) => {
    const dataDir = resolveDataDir(opts.data);
    const keyPair = loadKeyPair(dataDir);
    const identity = loadIdentity(dataDir);

    // First, fetch the remote identity
    console.log(`Fetching identity from ${endpoint}...`);
    const remote = await fetchIdentity(endpoint);

    if (!remote) {
      console.error("Error: Could not fetch remote identity. Is the node running?");
      process.exit(1);
    }

    console.log(`Found: ${remote.displayName} (${remote.type})`);
    console.log(`  DID: ${remote.did}`);
    if (remote.description) console.log(`  ${remote.description}`);
    console.log();

    // Send relationship request
    console.log("Sending relationship request...");
    const response = await sendRelationshipRequest(
      endpoint,
      identity.did,
      remote.did,
      keyPair,
      {
        type: opts.type as "peer" | "mentor_student" | "collaborator",
        message: opts.message,
        permissions: {
          canMessage: true,
          canSharePersona: true,
          canDelegate: false,
        },
      }
    );

    if (!response) {
      console.error("Error: Failed to send relationship request.");
      process.exit(1);
    }

    if (response.accepted) {
      console.log("Connection accepted!");
    } else {
      console.log("Connection request sent (pending approval).");
    }

    if (response.message) {
      console.log(`  Response: ${response.message}`);
    }
  });
