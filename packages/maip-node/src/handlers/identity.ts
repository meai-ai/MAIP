/**
 * GET /maip/identity — Return this node's identity document.
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";
import { processIdentityRequest } from "./identity-core.js";

export function identityHandler(ctx: NodeContext) {
  return (_req: Request, res: Response) => {
    const result = processIdentityRequest(ctx);
    res.json({ ok: true, data: result.data });
  };
}
