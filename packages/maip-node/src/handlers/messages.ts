/**
 * POST /maip/messages — Receive and process incoming messages.
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";
import { processIncomingMessage } from "./messages-core.js";

export function messagesHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const result = processIncomingMessage(ctx, req.body);
    res.status(result.httpStatus ?? (result.ok ? 200 : 500)).json(
      result.ok
        ? { ok: true, data: result.data }
        : { ok: false, data: result.data, error: result.error, code: result.code }
    );
  };
}
