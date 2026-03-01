/**
 * MAIP Channel — implements MeAI's Channel interface for the MAIP network.
 *
 * This allows MeAI to treat MAIP network messages just like Telegram
 * or Discord messages — they flow through the same agent loop.
 *
 * When a MAIP message arrives, the channel converts it to a MeAI
 * message handler call. When the agent responds, the channel sends
 * the reply back via MAIP.
 */

import {
  type MAIPMessage,
  type MAIPKeyPair,
  type IdentityDocument,
} from "@maip/core";
import { sendMessage, type NodeContext } from "@maip/node";
import type { MeAIMessageHandler } from "./meai-types.js";

/**
 * MAIP Channel — bridges MAIP network messages into MeAI's Channel interface.
 */
export class MAIPChannel {
  readonly id = "maip";
  readonly name = "MAIP Network";

  private messageHandler: MeAIMessageHandler | null = null;
  private ctx: NodeContext;
  private keyPair: MAIPKeyPair;

  /** Map of DID → endpoint URL for reply routing. */
  private peerEndpoints = new Map<string, string>();

  constructor(ctx: NodeContext, keyPair: MAIPKeyPair) {
    this.ctx = ctx;
    this.keyPair = keyPair;
  }

  async start(): Promise<void> {
    // Register as the message handler on the MAIP node context
    this.ctx.onMessage = (msg: MAIPMessage) => {
      this.handleIncomingMessage(msg);
    };
  }

  async stop(): Promise<void> {
    this.ctx.onMessage = undefined;
  }

  onMessage(handler: MeAIMessageHandler): void {
    this.messageHandler = handler;
  }

  /** Register a peer endpoint for reply routing. */
  registerPeer(did: string, endpoint: string): void {
    this.peerEndpoints.set(did, endpoint);
  }

  async sendMessage(text: string): Promise<{ messageId: number | string }> {
    // Broadcast to most recent peer — in practice, the channel
    // would target a specific peer based on conversation context
    return { messageId: `maip-${Date.now()}` };
  }

  async sendPhoto(_photo: Buffer | string, _caption?: string): Promise<{ messageId: number | string }> {
    // MAIP doesn't support binary media in v0.1, log and skip
    return { messageId: `maip-photo-${Date.now()}` };
  }

  // ── Internal ──────────────────────────────────────────────────

  private handleIncomingMessage(msg: MAIPMessage): void {
    if (!this.messageHandler) return;

    const text = msg.content.text ?? "";
    const chatId = msg.from; // Use sender DID as chat ID

    // Build reply function — sends back via MAIP
    const sendReply = async (replyText: string) => {
      const endpoint = this.peerEndpoints.get(msg.from);
      if (endpoint) {
        const ack = await sendMessage(
          endpoint,
          this.ctx.identity.did,
          msg.from,
          replyText,
          this.keyPair,
          {
            type: "conversation",
            provenance: "conversation_inspired",
            replyTo: msg.id,
            conversationId: msg.conversationId,
          }
        );
        return { messageId: ack?.messageId ?? `maip-reply-${Date.now()}` };
      }
      return { messageId: `maip-no-endpoint-${Date.now()}` };
    };

    // Edit is a no-op for MAIP (messages are immutable)
    const editReply = async (_messageId: number | string, _text: string) => {};

    // Typing indicator is a no-op for MAIP
    const sendTyping = async () => {};

    // Forward to MeAI's agent loop
    this.messageHandler(text, chatId, sendReply, editReply, sendTyping).catch((err) => {
      console.error("[maip-channel] Error handling message:", err);
    });
  }
}
