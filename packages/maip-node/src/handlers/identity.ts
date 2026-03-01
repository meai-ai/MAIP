/**
 * GET /maip/identity — Return this node's identity document.
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";

export function identityHandler(ctx: NodeContext) {
  return (_req: Request, res: Response) => {
    res.json({
      ok: true,
      data: ctx.identity,
    });
  };
}
