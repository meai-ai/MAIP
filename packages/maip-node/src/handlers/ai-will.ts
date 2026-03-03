/**
 * AI Will & Distributed Backup — Express handlers.
 */

import type { RequestHandler } from "express";
import type { NodeContext } from "../context.js";
import {
  upsertWill,
  getWill,
  deleteWill,
  receiveBackupShard,
  getBackupShards,
} from "./ai-will-core.js";

/** POST /maip/governance/will — create or update an AI will. */
export function upsertWillHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = upsertWill(ctx, req.body);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/will/:did — get an AI will. */
export function getWillHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = getWill(ctx, req.params.did as string);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** DELETE /maip/governance/will/:did — delete an AI will. */
export function deleteWillHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = deleteWill(ctx, req.params.did as string);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** POST /maip/governance/backup — receive a backup shard from a peer. */
export function receiveBackupHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = receiveBackupShard(ctx, req.body);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/backup/:did — retrieve backup shards for an agent. */
export function getBackupShardsHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = getBackupShards(ctx, req.params.did as string);
    res.status(result.httpStatus ?? 200).json(result);
  };
}
