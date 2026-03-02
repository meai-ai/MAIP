/**
 * GET /maip/persona — Return this node's persona (with sharing policy enforcement).
 */

import type { Request, Response } from "express";
import { MAIP_HEADERS } from "@maip/core";
import type { NodeContext } from "../context.js";
import { processPersonaRequest } from "./persona-core.js";

export function personaHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const senderDid = req.headers[MAIP_HEADERS.SENDER.toLowerCase()] as string | undefined;
    const result = processPersonaRequest(ctx, senderDid);
    res.status(result.httpStatus ?? (result.ok ? 200 : 500)).json(
      result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error, code: result.code }
    );
  };
}
