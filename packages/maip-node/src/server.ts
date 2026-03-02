/**
 * MAIP Node HTTP server.
 *
 * Standalone Express server implementing all MAIP protocol endpoints.
 * Designed to be used both as a library (createServer) and as a
 * standalone binary (bin.ts).
 */

import express, { type Express } from "express";
import { MAIP_ENDPOINTS } from "@maip/core";
import type { NodeContext } from "./context.js";
import { healthHandler } from "./handlers/health.js";
import { identityHandler } from "./handlers/identity.js";
import { messagesHandler } from "./handlers/messages.js";
import { relationshipsHandler } from "./handlers/relationships.js";
import { personaHandler } from "./handlers/persona.js";
import { discoverHandler } from "./handlers/discover.js";
import { relayPostHandler, relayGetHandler } from "./handlers/relay.js";

/** Create the Express app with all MAIP routes. */
export function createApp(ctx: NodeContext): Express {
  const app = express();

  // Body parsing
  app.use(express.json({ limit: "1mb" }));

  // CORS — allow cross-origin for interoperability
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-MAIP-Version, X-MAIP-Sender, X-MAIP-Signature, X-MAIP-Timestamp");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  });

  // Routes
  app.get(MAIP_ENDPOINTS.HEALTH, healthHandler(ctx));
  app.get(MAIP_ENDPOINTS.IDENTITY, identityHandler(ctx));
  app.post(MAIP_ENDPOINTS.MESSAGE, messagesHandler(ctx));
  app.post(MAIP_ENDPOINTS.RELATIONSHIP, relationshipsHandler(ctx));
  app.get(MAIP_ENDPOINTS.PERSONA, personaHandler(ctx));
  app.get(MAIP_ENDPOINTS.DISCOVER, discoverHandler(ctx));

  // Discovery registration (POST for registry nodes)
  app.post(MAIP_ENDPOINTS.DISCOVER, (req, res) => {
    const body = req.body;
    if (!body.did || !body.endpoint) {
      res.status(400).json({ ok: false, error: "Missing did or endpoint", code: "INVALID_FORMAT" });
      return;
    }

    // Unique instance detection: if same DID registers from a different
    // endpoint with a different nonce, flag as duplicate.
    const existing = ctx.stores.registrations.filter(
      (r) => r.did === body.did && r.endpoint !== body.endpoint
    );
    if (existing.length > 0 && body.instanceNonce) {
      const prev = existing[0];
      if (prev.instanceNonce && prev.instanceNonce !== body.instanceNonce) {
        console.warn(
          `[maip-node] Duplicate instance detected for ${body.did}: ` +
          `existing at ${existing[0].endpoint}, new at ${body.endpoint}`
        );
      }
    }

    const now = new Date().toISOString();
    ctx.stores.registrations.add({
      id: body.did,
      did: body.did,
      displayName: body.displayName ?? "Unknown",
      type: body.type ?? "ai_agent",
      description: body.description,
      interests: body.interests ?? [],
      capabilities: body.capabilities ?? [],
      endpoint: body.endpoint,
      instanceNonce: body.instanceNonce,
      registeredAt: now,
      lastSeen: now,
    });

    res.json({ ok: true, data: { registered: true } });
  });

  // Relay endpoints
  app.post(MAIP_ENDPOINTS.RELAY, relayPostHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.RELAY}/:did`, relayGetHandler(ctx));

  return app;
}

/** Start the MAIP node server. Returns a close function. */
export function startServer(
  ctx: NodeContext
): { app: Express; close: () => void } {
  const app = createApp(ctx);

  const server = app.listen(ctx.config.port, () => {
    console.log(`[maip-node] MAIP node running on port ${ctx.config.port}`);
    console.log(`[maip-node] DID: ${ctx.identity.did}`);
    console.log(`[maip-node] Endpoint: ${ctx.config.publicUrl}`);
  });

  return {
    app,
    close: () => {
      server.close();
    },
  };
}
