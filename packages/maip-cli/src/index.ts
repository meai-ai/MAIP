#!/usr/bin/env node
/**
 * MAIP CLI — command-line tools for the MAIP protocol.
 *
 * Commands:
 *   maip init       — Initialize a new MAIP node identity
 *   maip start      — Start the MAIP node server
 *   maip connect    — Connect to a remote MAIP node
 *   maip message    — Send a message to a connected peer
 *   maip discover   — Discover peers on the network
 *   maip status     — Show node status and connections
 *   maip peers      — List active relationships
 */

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { startCommand } from "./commands/start.js";
import { connectCommand } from "./commands/connect.js";
import { messageCommand } from "./commands/message.js";
import { discoverCommand } from "./commands/discover.js";
import { statusCommand } from "./commands/status.js";
import { peersCommand } from "./commands/peers.js";

const program = new Command();

program
  .name("maip")
  .description("MAIP Protocol CLI — tools for the MeAI Interweave Protocol")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(startCommand);
program.addCommand(connectCommand);
program.addCommand(messageCommand);
program.addCommand(discoverCommand);
program.addCommand(statusCommand);
program.addCommand(peersCommand);

program.parse();
