/**
 * Federation — Express handlers.
 */

import type { RequestHandler } from "express";
import type { NodeContext } from "../context.js";
import {
  registerFederatedRegistry,
  resolveDID,
  getFederationHealth,
  getFederatedRegistries,
  updateRegistryTrust,
} from "./federation-core.js";

/** POST /maip/federation/registry — register a federated registry. */
export function registerRegistryHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const result = registerFederatedRegistry(ctx, req.body);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/federation/resolve/:did — resolve a DID across federation. */
export function resolveDidHandler(ctx: NodeContext): RequestHandler {
  return async (req, res) => {
    const maxHops = req.query.maxHops ? Number(req.query.maxHops) : 3;
    const result = await resolveDID(ctx, req.params.did as string, maxHops);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/federation/health — get federation health report. */
export function federationHealthHandler(ctx: NodeContext): RequestHandler {
  return (_req, res) => {
    const result = getFederationHealth(ctx);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** GET /maip/federation/registries — list known federated registries. */
export function listRegistriesHandler(ctx: NodeContext): RequestHandler {
  return (_req, res) => {
    const result = getFederatedRegistries(ctx);
    res.status(result.httpStatus ?? 200).json(result);
  };
}

/** POST /maip/federation/trust — update trust score for a registry. */
export function updateTrustHandler(ctx: NodeContext): RequestHandler {
  return (req, res) => {
    const { registryDid, positive } = req.body;
    const result = updateRegistryTrust(ctx, registryDid, positive);
    res.status(result.httpStatus ?? 200).json(result);
  };
}
