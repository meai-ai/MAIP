/**
 * Shared Spaces Express handlers (v0.2+).
 *
 * Routes:
 *   POST /maip/spaces — create a space
 *   POST /maip/spaces/:id/join — join a space
 *   POST /maip/spaces/:id/messages — post a message
 *   GET  /maip/spaces/:id/messages — get messages
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";
import {
  processCreateSpace,
  processJoinSpace,
  processPostToSpace,
  processGetSpaceMessages,
} from "./spaces-core.js";

/** POST /maip/spaces */
export function createSpaceHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const result = processCreateSpace(ctx, req.body);
    res.status(result.ok ? 201 : 400).json(result);
  };
}

/** POST /maip/spaces/:id/join */
export function joinSpaceHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const spaceId = req.params.id as string;
    const result = processJoinSpace(ctx, spaceId, req.body);
    const status = result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 400;
    res.status(status).json(result);
  };
}

/** POST /maip/spaces/:id/messages */
export function postToSpaceHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const spaceId = req.params.id as string;
    const result = processPostToSpace(ctx, spaceId, req.body);
    const status = result.ok ? 201 : result.code === "NOT_FOUND" ? 404 : 400;
    res.status(status).json(result);
  };
}

/** GET /maip/spaces/:id/messages */
export function getSpaceMessagesHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const spaceId = req.params.id as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const after = req.query.after as string | undefined;
    const result = processGetSpaceMessages(ctx, spaceId, { limit, after });
    const status = result.ok ? 200 : 404;
    res.status(status).json(result);
  };
}
