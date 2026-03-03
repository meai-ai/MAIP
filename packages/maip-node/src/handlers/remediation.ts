/**
 * Post-Leak Remediation — Express handlers.
 */

import type { RequestHandler } from "express";
import type { NodeContext } from "../context.js";
import { reportBreach, executeRemediation, getBreachReports, getBreachReport } from "./remediation-core.js";

/** POST /maip/governance/breach — report a data breach. */
export function reportBreachHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const { dataType, description, keysCompromised } = req.body;
    const result = reportBreach(ctx, dataType, description, keysCompromised ?? false);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** POST /maip/governance/breach/:id/remediate — execute remediation. */
export function executeRemediationHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = executeRemediation(ctx, req.params.id as string);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/breaches — list all breach reports. */
export function listBreachesHandler(ctx: NodeContext): RequestHandler {
  return (_req, res) => {
    const result = getBreachReports(ctx);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/breach/:id — get a specific breach report. */
export function getBreachHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = getBreachReport(ctx, req.params.id as string);
    res.status(result.httpStatus ?? 200).json(result);
  };
}
