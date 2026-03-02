/**
 * MAIP WebSocket client — connects to a MAIP WebSocket server.
 *
 * Provides the same operations as the HTTP client but over WebSocket,
 * suitable for browser environments and persistent connections.
 */

import { WebSocket } from "ws";
import type {
  MAIPMessage,
  MessageAck,
  RelationshipRequest,
  RelationshipResponse,
  Persona,
  IdentityDocument,
  DiscoveryQuery,
  DiscoveryResult,
  MAIPResponse,
} from "@maip/core";

let requestCounter = 0;

/** A MAIP WebSocket request envelope. */
interface WSRequest {
  action: string;
  payload: unknown;
  requestId: string;
}

/**
 * MAIP WebSocket client.
 *
 * Maintains a persistent connection to a MAIP node's WebSocket endpoint
 * and provides typed methods for all MAIP operations.
 */
export class MAIPWebSocketClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private url: string;

  constructor(url: string) {
    // Normalize URL: http:// → ws://, https:// → wss://
    this.url = url
      .replace(/^http:\/\//, "ws://")
      .replace(/^https:\/\//, "wss://");
    if (!this.url.endsWith("/maip")) {
      this.url = this.url.replace(/\/$/, "") + "/maip";
    }
  }

  /** Connect to the MAIP WebSocket server. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => resolve());
      this.ws.on("error", (err) => reject(err));

      this.ws.on("message", (raw: Buffer) => {
        try {
          const response = JSON.parse(raw.toString("utf-8"));
          const requestId = response.requestId;
          if (requestId && this.pending.has(requestId)) {
            const { resolve } = this.pending.get(requestId)!;
            this.pending.delete(requestId);
            resolve(response);
          }
        } catch {
          // Ignore unparseable messages
        }
      });

      this.ws.on("close", () => {
        // Reject all pending requests
        for (const [, { reject }] of this.pending) {
          reject(new Error("WebSocket closed"));
        }
        this.pending.clear();
      });
    });
  }

  /** Disconnect from the server. */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Send a MAIP message. */
  async sendMessage(message: MAIPMessage): Promise<MessageAck | null> {
    const res = await this.request<MAIPResponse<MessageAck>>("message", message);
    return res.ok ? (res.data ?? null) : null;
  }

  /** Send a relationship request. */
  async sendRelationshipRequest(request: RelationshipRequest): Promise<RelationshipResponse | null> {
    const res = await this.request<MAIPResponse<RelationshipResponse>>("relationship", request);
    return res.ok ? (res.data ?? null) : null;
  }

  /** Fetch persona. */
  async fetchPersona(requesterDid: string): Promise<Persona | null> {
    const res = await this.request<MAIPResponse<Persona>>("persona", { requesterDid });
    return res.ok ? (res.data ?? null) : null;
  }

  /** Fetch identity. */
  async fetchIdentity(): Promise<IdentityDocument | null> {
    const res = await this.request<MAIPResponse<IdentityDocument>>("identity", {});
    return res.ok ? (res.data ?? null) : null;
  }

  /** Discover peers. */
  async discover(query: DiscoveryQuery): Promise<DiscoveryResult[]> {
    const res = await this.request<MAIPResponse<DiscoveryResult[]>>("discover", query);
    return res.ok ? (res.data ?? []) : [];
  }

  private request<T>(action: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const requestId = `req-${++requestCounter}`;
      const request: WSRequest = { action, payload, requestId };

      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.ws.send(JSON.stringify(request));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error(`Request ${requestId} timed out`));
        }
      }, 30_000);
    });
  }
}
