/**
 * Express handlers for key rotation and revocation.
 */

import type { Request, Response } from "express";
import type { NodeContext } from "../context.js";
import { processKeyRotation, processKeyRevocation } from "./key-rotation-core.js";

/** POST /maip/governance/rotate-keys — rotate this node's keys. */
export function rotateKeysHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { reason } = req.body ?? {};
    const result = processKeyRotation(ctx, reason ?? "scheduled");
    res.status(result.httpStatus ?? 200).json({
      ok: result.ok,
      ...(result.data ? { data: result.data } : {}),
      ...(result.error ? { error: result.error, code: result.code } : {}),
    });
  };
}

/** POST /maip/governance/revoke-key — receive a key revocation notice. */
export function revokeKeyHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const result = processKeyRevocation(ctx, req.body);
    res.status(result.httpStatus ?? 200).json({
      ok: result.ok,
      ...(result.data ? { data: result.data } : {}),
      ...(result.error ? { error: result.error, code: result.code } : {}),
    });
  };
}
