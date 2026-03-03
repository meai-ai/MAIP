/**
 * MAIP Node HTTP server.
 *
 * Standalone Express server implementing all MAIP protocol endpoints.
 * Designed to be used both as a library (createServer) and as a
 * standalone binary (bin.ts).
 */

import fs from "node:fs";
import https from "node:https";
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
import {
  getGuardianReputationHandler,
  reportGuardianEventHandler,
  isolateHandler,
  checkIsolationHandler,
  appealHandler,
  appealVoteHandler,
} from "./handlers/governance.js";
import {
  initiateTransferHandler,
  transferConsentHandler,
  getTransferStatusHandler,
} from "./handlers/guardian-transfer.js";
import {
  createSpaceHandler,
  joinSpaceHandler,
  postToSpaceHandler,
  getSpaceMessagesHandler,
} from "./handlers/spaces.js";
import {
  rotateKeysHandler,
  revokeKeyHandler,
} from "./handlers/key-rotation.js";
import {
  abuseReportHandler,
  getAbuseReportsHandler,
  rightToRefuseHandler,
} from "./handlers/guardian-abuse.js";
import {
  issueTokensHandler,
  getTokenBalanceHandler,
  spendTokensHandler,
  getCreditBalanceHandler,
  transferCreditsHandler,
  awardCreditsHandler,
  createStakeHandler,
  resolveStakeHandler,
  getStakesHandler,
} from "./handlers/economy.js";
import {
  receiveAnomalyHandler,
  assessThreatHandler,
  pendingForwardsHandler,
} from "./handlers/anomaly-sharing.js";
import {
  reportBreachHandler,
  executeRemediationHandler,
  listBreachesHandler,
  getBreachHandler,
} from "./handlers/remediation.js";
import {
  guardianCommandHandler,
  checkActionHandler,
  getRestrictionsHandler,
  getCommandsHandler,
} from "./handlers/guardian-authority.js";
import {
  registerRegistryHandler,
  resolveDidHandler,
  federationHealthHandler,
  listRegistriesHandler,
  updateTrustHandler,
} from "./handlers/federation.js";
import {
  forkHandler,
  verifyForkHandler,
} from "./handlers/fork.js";
import {
  proposeIsolationHandler,
  voteProposalHandler,
  listProposalsHandler,
  getProposalHandler,
} from "./handlers/consensus.js";
import {
  submitFactHandler,
  verifyFactHandler,
  getFactHandler,
  searchFactsHandler,
} from "./handlers/fact-verification.js";

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

  // Governance endpoints
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/reputation/:did`, getGuardianReputationHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/reputation`, reportGuardianEventHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/isolate`, isolateHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/isolation/:did`, checkIsolationHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/appeal`, appealHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/appeal/:id/vote`, appealVoteHandler(ctx));

  // Guardian transfer endpoints
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/transfer`, initiateTransferHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/transfer/:id/consent`, transferConsentHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/transfer/:id`, getTransferStatusHandler(ctx));

  // Key rotation endpoints
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/rotate-keys`, rotateKeysHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/revoke-key`, revokeKeyHandler(ctx));

  // Guardian abuse and right-to-refuse endpoints
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/abuse`, abuseReportHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/abuse/:guardianDid`, getAbuseReportsHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/refuse`, rightToRefuseHandler(ctx));

  // Shared Spaces endpoints (v0.2+)
  app.post("/maip/spaces", createSpaceHandler(ctx));
  app.post("/maip/spaces/:id/join", joinSpaceHandler(ctx));
  app.post("/maip/spaces/:id/messages", postToSpaceHandler(ctx));
  app.get("/maip/spaces/:id/messages", getSpaceMessagesHandler(ctx));

  // Economic layer endpoints (v0.2+)
  app.post("/maip/economy/tokens/issue", issueTokensHandler(ctx));
  app.get("/maip/economy/tokens/:did", getTokenBalanceHandler(ctx));
  app.post("/maip/economy/tokens/spend", spendTokensHandler(ctx));
  app.get("/maip/economy/credits/:did", getCreditBalanceHandler(ctx));
  app.post("/maip/economy/credits/transfer", transferCreditsHandler(ctx));
  app.post("/maip/economy/credits/award", awardCreditsHandler(ctx));
  app.post("/maip/economy/stakes", createStakeHandler(ctx));
  app.post("/maip/economy/stakes/:id/resolve", resolveStakeHandler(ctx));
  app.get("/maip/economy/stakes/:did", getStakesHandler(ctx));

  // Cross-node anomaly sharing endpoints
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/anomaly`, receiveAnomalyHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/threat/:did`, assessThreatHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/anomaly/pending`, pendingForwardsHandler(ctx));

  // Post-leak remediation endpoints
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/breach`, reportBreachHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/breach/:id/remediate`, executeRemediationHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/breaches`, listBreachesHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/breach/:id`, getBreachHandler(ctx));

  // Guardian authority enforcement endpoints
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/guardian/command`, guardianCommandHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/guardian/check-action`, checkActionHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/guardian/restrictions`, getRestrictionsHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/guardian/commands`, getCommandsHandler(ctx));

  // Federation endpoints
  app.post("/maip/federation/registry", registerRegistryHandler(ctx));
  app.get("/maip/federation/resolve/:did", resolveDidHandler(ctx));
  app.get("/maip/federation/health", federationHealthHandler(ctx));
  app.get("/maip/federation/registries", listRegistriesHandler(ctx));
  app.post("/maip/federation/trust", updateTrustHandler(ctx));

  // Fork protocol endpoints
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/fork`, forkHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/fork/verify/:did`, verifyForkHandler(ctx));

  // Distributed consensus endpoints
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/consensus/propose`, proposeIsolationHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/consensus/:id/vote`, voteProposalHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/consensus`, listProposalsHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/consensus/:id`, getProposalHandler(ctx));

  // Distributed fact verification endpoints
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/facts`, submitFactHandler(ctx));
  app.post(`${MAIP_ENDPOINTS.GOVERNANCE}/facts/:id/verify`, verifyFactHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/facts/:id`, getFactHandler(ctx));
  app.get(`${MAIP_ENDPOINTS.GOVERNANCE}/facts`, searchFactsHandler(ctx));

  return app;
}

/**
 * Start the MAIP node server.
 *
 * When transportMode is "http" (default), starts only the Express server.
 * When "p2p", starts only the libp2p node.
 * When "hybrid", starts both.
 */
export function startServer(
  ctx: NodeContext
): { app: Express; close: () => void } {
  const transportMode = ctx.config.transportMode ?? "http";
  const app = createApp(ctx);

  let httpServer: ReturnType<Express["listen"]> | ReturnType<typeof https.createServer> | null = null;

  // Start HTTP/HTTPS transport
  if (transportMode === "http" || transportMode === "hybrid") {
    if (ctx.config.tls) {
      const tlsOptions: https.ServerOptions = {
        cert: fs.readFileSync(ctx.config.tls.certPath),
        key: fs.readFileSync(ctx.config.tls.keyPath),
        ...(ctx.config.tls.caPath ? { ca: fs.readFileSync(ctx.config.tls.caPath) } : {}),
      };
      const server = https.createServer(tlsOptions, app);
      server.listen(ctx.config.port, () => {
        console.log(`[maip-node] MAIP HTTPS server running on port ${ctx.config.port}`);
        console.log(`[maip-node] DID: ${ctx.identity.did}`);
        console.log(`[maip-node] Endpoint: ${ctx.config.publicUrl}`);
      });
      httpServer = server;
    } else {
      httpServer = app.listen(ctx.config.port, () => {
        console.log(`[maip-node] MAIP HTTP server running on port ${ctx.config.port}`);
        console.log(`[maip-node] DID: ${ctx.identity.did}`);
        console.log(`[maip-node] Endpoint: ${ctx.config.publicUrl}`);
      });
    }
  }

  // P2P transport is started separately via startP2PServer() from @maip/transport-p2p
  // to keep libp2p deps optional. See packages/maip-transport-p2p/src/p2p-handlers.ts.
  if (transportMode === "p2p" || transportMode === "hybrid") {
    console.log(`[maip-node] P2P transport enabled — call registerP2PHandlers() to start`);
  }

  return {
    app,
    close: () => {
      if (httpServer) httpServer.close();
    },
  };
}
