/**
 * Guardian Authority Enforcement — Express handlers.
 */

import type { RequestHandler } from "express";
import type { NodeContext } from "../context.js";
import {
  processGuardianCommand,
  isActionBlocked,
  getActiveRestrictions,
  getCommandHistory,
} from "./guardian-authority-core.js";

/** POST /maip/governance/guardian/command — issue a guardian command. */
export function guardianCommandHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = processGuardianCommand(ctx, req.body);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** POST /maip/governance/guardian/check-action — check if an action is blocked. */
export function checkActionHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const { action, peerDid, topics } = req.body;
    const result = isActionBlocked(ctx, action, peerDid, topics);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/guardian/restrictions — get active restrictions. */
export function getRestrictionsHandler(ctx: NodeContext): RequestHandler {
  return (_req, res) => {
    const result = getActiveRestrictions(ctx);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/guardian/commands — get command history. */
export function getCommandsHandler(ctx: NodeContext): RequestHandler {
  return (_req, res) => {
    const result = getCommandHistory(ctx);
    res.status(result.httpStatus ?? 200).json(result);
  };
}
