/**
 * Guardian transfer Express handlers.
 *
 * Routes:
 *   POST /maip/governance/transfer — initiate transfer
 *   POST /maip/governance/transfer/:id/consent — submit consent
 *   GET  /maip/governance/transfer/:id — check status
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";
import {
  processInitiateTransfer,
  processTransferConsent,
  processGetTransferStatus,
} from "./guardian-transfer-core.js";

/** POST /maip/governance/transfer */
export function initiateTransferHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const result = processInitiateTransfer(ctx, req.body);
    res.status(result.ok ? 200 : 400).json(result);
  };
}

/** POST /maip/governance/transfer/:id/consent */
export function transferConsentHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const transferId = req.params.id as string;
    const result = processTransferConsent(ctx, transferId, req.body);
    const status = result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 400;
    res.status(status).json(result);
  };
}

/** GET /maip/governance/transfer/:id */
export function getTransferStatusHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const transferId = req.params.id as string;
    const result = processGetTransferStatus(ctx, transferId);
    const status = result.ok ? 200 : 404;
    res.status(status).json(result);
  };
}
