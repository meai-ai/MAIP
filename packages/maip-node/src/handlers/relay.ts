/**
 * POST /maip/relay — Store a message for offline delivery.
 * GET  /maip/relay/:did — Retrieve stored messages for a DID.
 */

import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { MAIP_HEADERS, verifyWithDid } from "@maip/core";
import type { NodeContext } from "../context.js";

const DEFAULT_TTL_DAYS = 7;
const MAX_RELAY_PER_DID = 100;

export function relayPostHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const { recipientDid, encryptedPayload, senderDid } = req.body;

    if (!recipientDid || !encryptedPayload || !senderDid) {
      res.status(400).json({
        ok: false,
        error: "Missing required fields: recipientDid, encryptedPayload, senderDid",
        code: "INVALID_FORMAT",
      });
      return;
    }

    // Check storage limit for recipient
    const existing = ctx.stores.relay.filter((m) => m.recipientDid === recipientDid);
    if (existing.length >= MAX_RELAY_PER_DID) {
      res.status(507).json({
        ok: false,
        error: "Relay mailbox full for this recipient",
        code: "MAILBOX_FULL",
      });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_TTL_DAYS * 86_400_000);

    const relayMessage = {
      id: uuid(),
      recipientDid,
      encryptedPayload,
      senderDid,
      storedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    ctx.stores.relay.add(relayMessage);

    res.status(201).json({
      ok: true,
      data: {
        id: relayMessage.id,
        expiresAt: relayMessage.expiresAt,
      },
    });
  };
}

export function relayGetHandler(ctx: NodeContext) {
  return (req: Request, res: Response) => {
    const did = req.params.did;
    const senderDid = req.headers[MAIP_HEADERS.SENDER.toLowerCase()] as string | undefined;

    // Only the recipient can retrieve their messages
    if (!senderDid || senderDid !== did) {
      res.status(403).json({
        ok: false,
        error: "Only the recipient can retrieve relay messages",
        code: "ACCESS_DENIED",
      });
      return;
    }

    // Purge expired messages first
    ctx.stores.purgeExpiredRelay();

    // Get messages for this DID
    const messages = ctx.stores.relay.filter((m) => m.recipientDid === did);

    // Remove retrieved messages (store-and-forward)
    for (const m of messages) {
      ctx.stores.relay.remove(m.id);
    }

    res.json({
      ok: true,
      data: messages,
    });
  };
}
