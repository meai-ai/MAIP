/**
 * Cross-Node Anomaly Sharing — Express handlers.
 */

import type { RequestHandler } from "express";
import type { NodeContext } from "../context.js";
import { receiveAnomalyReport, assessThreat, getPendingForwards } from "./anomaly-sharing-core.js";

/** POST /maip/governance/anomaly — receive a shared anomaly report. */
export function receiveAnomalyHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = receiveAnomalyReport(ctx, req.body);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/threat/:did — assess threat level of a DID. */
export function assessThreatHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = assessThreat(ctx, req.params.did as string);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/anomaly/pending — get reports pending forward. */
export function pendingForwardsHandler(ctx: NodeContext): RequestHandler {
  return (_req, res) => {
    const pending = getPendingForwards(ctx);
    res.json({ ok: true, data: { reports: pending, count: pending.length } });
  };
}
