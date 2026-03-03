/**
 * Express handlers for guardian abuse reporting and right-to-refuse.
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";
import {
  processAbuseReport,
  processGetAbuseReports,
  processRightToRefuse,
} from "./guardian-abuse-core.js";

/** POST /maip/governance/abuse — file an abuse report. */
export function abuseReportHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const result = processAbuseReport(ctx, req.body);
    res.status(result.httpStatus ?? 200).json({
      ok: result.ok,
      ...(result.data ? { data: result.data } : {}),
      ...(result.error ? { error: result.error, code: result.code } : {}),
    });
  };
}

/** GET /maip/governance/abuse/:guardianDid — get abuse reports for a guardian. */
export function getAbuseReportsHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const result = processGetAbuseReports(ctx, req.params.guardianDid as string);
    res.status(result.httpStatus ?? 200).json({
      ok: result.ok,
      ...(result.data ? { data: result.data } : {}),
    });
  };
}

/** POST /maip/governance/refuse — record a right-to-refuse action. */
export function rightToRefuseHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const result = processRightToRefuse(ctx, req.body);
    res.status(result.httpStatus ?? 200).json({
      ok: result.ok,
      ...(result.data ? { data: result.data } : {}),
      ...(result.error ? { error: result.error, code: result.code } : {}),
    });
  };
}
