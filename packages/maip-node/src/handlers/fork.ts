/**
 * Fork Protocol — Express handlers.
 */

import type { RequestHandler } from "express";
import type { NodeContext } from "../context.js";
import { processFork, verifyNotClone } from "./fork-core.js";

/** POST /maip/governance/fork — initiate an identity fork. */
export function forkHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = processFork(ctx, req.body);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/governance/fork/verify/:did — verify a DID is not a clone. */
export function verifyForkHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = verifyNotClone(ctx, req.params.did as string);
    res.status(result.httpStatus ?? 200).json(result);
  };
}
