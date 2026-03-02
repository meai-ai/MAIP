/**
 * POST /maip/relay — Store a message for offline delivery.
 * GET  /maip/relay/:did — Retrieve stored messages for a DID.
 */

import type { Request, Response } from "express";
import { MAIP_HEADERS } from "@maip/core";
import type { NodeContext } from "../context.js";
import { processRelayStore, processRelayRetrieve } from "./relay-core.js";

export function relayPostHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const result = processRelayStore(ctx, req.body);
    res.status(result.httpStatus ?? (result.ok ? 200 : 500)).json(
      result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error, code: result.code }
    );
  };
}

export function relayGetHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const did = req.params.did as string;
    const senderDid = req.headers[MAIP_HEADERS.SENDER.toLowerCase()] as string | undefined;
    const result = processRelayRetrieve(ctx, { did, senderDid });
    res.status(result.httpStatus ?? (result.ok ? 200 : 500)).json(
      result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: result.error, code: result.code }
    );
  };
}
