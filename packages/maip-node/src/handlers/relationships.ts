/**
 * POST /maip/relationships — Handle relationship requests and responses.
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";
import { processRelationshipRequest } from "./relationships-core.js";

export function relationshipsHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const result = processRelationshipRequest(ctx, req.body);
    res.status(result.httpStatus ?? (result.ok ? 200 : 500)).json(
      result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error, code: result.code }
    );
  };
}
