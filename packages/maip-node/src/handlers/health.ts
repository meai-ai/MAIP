/**
 * GET /maip/health — Health check endpoint.
 */

import type { Request, Response } from "express";
import { MAIP_VERSION } from "@maip/core";
import type { NodeContext } from "../context.js";

export function healthHandler(ctx: NodeContext) {
  return (_req: Request, res: Response) => {
    res.json({
      ok: true,
      data: {
        version: MAIP_VERSION,
        did: ctx.identity.did,
        displayName: ctx.identity.displayName,
        capabilities: ctx.identity.capabilities,
        uptime: Math.floor((Date.now() - ctx.startedAt) / 1000),
        status: "running",
      },
    });
  };
}
