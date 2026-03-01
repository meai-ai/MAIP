/**
 * maip message — Send a message to a connected peer.
 */

import { Command } from "commander";
import { sendMessage } from "@maip/node";
import { resolveDataDir, loadKeyPair, loadIdentity } from "../utils.js";

export const messageCommand = new Command("message")
  .description("Send a message to a connected peer")
  .argument("<endpoint>", "Remote node's MAIP endpoint URL")
  .argument("<text>", "Message text")
  .option("-d, --data <dir>", "Data directory", "./maip-data")
  .option("-t, --type <type>", "Message type", "conversation")
  .option("--to <did>", "Recipient DID (auto-detected if not specified)")
  .option("--provenance <prov>", "Content provenance", "requested")
  .option("--reply-to <id>", "Reply to message ID")
  .option("--conversation <id>", "Conversation thread ID")
  .action(async (endpoint, text, opts) => {
    const dataDir = resolveDataDir(opts.data);
    const keyPair = loadKeyPair(dataDir);
    const identity = loadIdentity(dataDir);

    // If no target DID, fetch it from the endpoint
    let toDid = opts.to;
    if (!toDid) {
      const { fetchIdentity } = await import("@maip/node");
      const remote = await fetchIdentity(endpoint);
      if (!remote) {
        console.error("Error: Could not fetch remote identity. Specify --to <did> manually.");
        process.exit(1);
      }
      toDid = remote.did;
    }

    console.log(`Sending ${opts.type} message to ${endpoint}...`);

    const ack = await sendMessage(
      endpoint,
      identity.did,
      toDid,
      text,
      keyPair,
      {
        type: opts.type as "greeting" | "conversation" | "knowledge_share" | "introduction" | "proposal" | "reaction" | "farewell",
        provenance: opts.provenance as "autonomous_exploration" | "conversation_inspired" | "requested" | "synthesized",
        replyTo: opts.replyTo,
        conversationId: opts.conversation,
      }
    );

    if (!ack) {
      console.error("Error: No response from remote node.");
      process.exit(1);
    }

    console.log(`Status: ${ack.status}`);
    if (ack.reason) console.log(`Reason: ${ack.reason}`);
    console.log(`Message ID: ${ack.messageId}`);
  });
