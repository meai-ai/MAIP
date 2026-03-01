/**
 * MeAI ↔ MAIP Adapter — the main bridge between MeAI engine and MAIP network.
 *
 * Orchestrates:
 * - Node initialization and lifecycle
 * - Persona sync (MeAI memories → MAIP Persona)
 * - Homecoming Report generation
 * - MAIP Channel for message routing
 * - Discovery and peer management
 */

import {
  type MAIPKeyPair,
  type IdentityDocument,
  type Persona,
  type MAIPMessage,
  type HomecomingReport,
} from "@maip/core";
import {
  initNode,
  startServer,
  registerWithRegistry,
  discoverPeers,
  sendMessage,
  sendRelationshipRequest,
  type NodeConfig,
  type NodeContext,
} from "@maip/node";
import { MAIPChannel } from "./channel.js";
import { exportPersona, type MeAIMemorySnapshot, type PersonaExportOptions } from "./persona-sync.js";
import { generateHomecomingReport, type ReportingPeriodData } from "./homecoming.js";
import type { MeAIEmotionalState, MeAICharacterProfile } from "./meai-types.js";

/** Configuration for the MAIP bridge. */
export interface MAIPBridgeConfig {
  /** HTTP port for the MAIP node. */
  port: number;
  /** Public-facing URL. */
  publicUrl: string;
  /** Data directory for MAIP state. */
  dataDir: string;
  /** MeAI character profile. */
  character: MeAICharacterProfile;
  /** Guardian DID (the human's DID). */
  guardianDid?: string;
  /** Autonomy level (0-3). */
  autonomyLevel?: 0 | 1 | 2 | 3;
  /** Registry URLs for discovery. */
  registryUrls?: string[];
  /** Interests for discovery. */
  interests?: string[];
  /** Auto-accept relationship requests. */
  autoAcceptRelationships?: boolean;
  /** Homecoming report interval in milliseconds (default: 4 hours). */
  homecomingIntervalMs?: number;
}

/**
 * MAIPBridge — the central orchestrator connecting MeAI to the MAIP network.
 */
export class MAIPBridge {
  private ctx: NodeContext | null = null;
  private channel: MAIPChannel | null = null;
  private config: MAIPBridgeConfig;
  private closeServer: (() => void) | null = null;
  private homecomingTimer: ReturnType<typeof setInterval> | null = null;
  private reportingData: ReportingPeriodData = emptyReportingData();
  private lastReportTime: Date = new Date();

  constructor(config: MAIPBridgeConfig) {
    this.config = config;
  }

  /** Start the MAIP bridge — initializes node, starts server. */
  async start(): Promise<{ ctx: NodeContext; channel: MAIPChannel }> {
    const nodeConfig: NodeConfig = {
      port: this.config.port,
      publicUrl: this.config.publicUrl,
      dataDir: this.config.dataDir,
      autoAcceptRelationships: this.config.autoAcceptRelationships ?? true,
      registryUrls: this.config.registryUrls,
      interests: this.config.interests,
    };

    this.ctx = initNode(nodeConfig, {
      displayName: this.config.character.english_name ?? this.config.character.name,
      type: "ai_agent",
      description: this.config.character.persona.compact,
      guardianDid: this.config.guardianDid,
      autonomyLevel: this.config.autonomyLevel ?? 2,
      capabilities: ["messaging", "persona_sharing", "knowledge_exchange"],
    });

    // Track incoming messages for homecoming reports
    this.ctx.onMessage = (msg: MAIPMessage) => {
      this.reportingData.messages.push(msg);
      if (this.channel) {
        // Forward to channel handler (which calls MeAI's agent loop)
        this.ctx!.onMessage?.(msg);
      }
    };

    // Create MAIP Channel
    this.channel = new MAIPChannel(this.ctx, this.ctx.keyPair);

    // Start HTTP server
    const { close } = startServer(this.ctx);
    this.closeServer = close;

    // Register with registries
    if (this.config.registryUrls) {
      for (const url of this.config.registryUrls) {
        registerWithRegistry(url, this.ctx.identity, this.ctx.keyPair, this.config.interests ?? []);
      }
    }

    // Start homecoming report timer
    const interval = this.config.homecomingIntervalMs ?? 4 * 60 * 60 * 1000;
    this.homecomingTimer = setInterval(() => {
      this.generateAndDeliverHomecomingReport();
    }, interval);

    return { ctx: this.ctx, channel: this.channel };
  }

  /** Stop the bridge gracefully. */
  async stop(): Promise<void> {
    if (this.homecomingTimer) clearInterval(this.homecomingTimer);
    if (this.channel) await this.channel.stop();
    if (this.closeServer) this.closeServer();
  }

  /** Get the node context. */
  getContext(): NodeContext | null {
    return this.ctx;
  }

  /** Get the MAIP channel (for MeAI integration). */
  getChannel(): MAIPChannel | null {
    return this.channel;
  }

  /** Get the node's DID. */
  getDid(): string | null {
    return this.ctx?.identity.did ?? null;
  }

  /** Get the node's identity. */
  getIdentity(): IdentityDocument | null {
    return this.ctx?.identity ?? null;
  }

  /** Get the node's keypair. */
  getKeyPair(): MAIPKeyPair | null {
    return this.ctx?.keyPair ?? null;
  }

  // ── Persona Sync ──────────────────────────────────────────────

  /** Sync MeAI's current state to the MAIP Persona. */
  syncPersona(
    memories: MeAIMemorySnapshot,
    emotionalState: MeAIEmotionalState | null,
    options?: PersonaExportOptions
  ): Persona | null {
    if (!this.ctx) return null;

    const persona = exportPersona(
      this.ctx.identity.did,
      this.ctx.keyPair,
      this.config.character,
      memories,
      emotionalState,
      options
    );

    this.ctx.persona = persona;
    return persona;
  }

  // ── Homecoming Reports ────────────────────────────────────────

  /** Record a heartbeat action for the next homecoming report. */
  recordHeartbeatAction(action: string, detail?: string): void {
    this.reportingData.heartbeatActions.push({
      action: action as ReportingPeriodData["heartbeatActions"][0]["action"],
      timestamp: Date.now(),
      detail,
    });
  }

  /** Record an emotional state for the next homecoming report. */
  recordEmotionalState(state: MeAIEmotionalState): void {
    this.reportingData.emotionalStates.push(state);
  }

  /** Record a discovery for the next homecoming report. */
  recordDiscovery(topic: string, summary: string, source: string, relevance: number): void {
    this.reportingData.discoveries.push({ topic, summary, source, relevance });
  }

  /** Generate a homecoming report now (also called automatically by timer). */
  generateHomecomingReport(): HomecomingReport | null {
    if (!this.ctx || !this.config.guardianDid) return null;

    const now = new Date();
    const report = generateHomecomingReport(
      this.ctx.identity.did,
      this.config.guardianDid,
      this.ctx.keyPair,
      this.lastReportTime,
      now,
      this.reportingData
    );

    // Reset reporting data
    this.reportingData = emptyReportingData();
    this.lastReportTime = now;

    return report;
  }

  // ── Discovery ─────────────────────────────────────────────────

  /** Discover peers matching interests. */
  async discover(interests: string[]): Promise<Array<{ did: string; displayName: string; endpoint: string }>> {
    if (!this.config.registryUrls?.length) return [];

    const results = [];
    for (const url of this.config.registryUrls) {
      const peers = await discoverPeers(url, { interests });
      results.push(...peers);
    }
    return results;
  }

  /** Connect to a peer (send relationship request). */
  async connectToPeer(endpoint: string, message?: string): Promise<boolean> {
    if (!this.ctx) return false;

    const { fetchIdentity } = await import("@maip/node");
    const remote = await fetchIdentity(endpoint);
    if (!remote) return false;

    const response = await sendRelationshipRequest(
      endpoint,
      this.ctx.identity.did,
      remote.did,
      this.ctx.keyPair,
      { message: message ?? `Hi! I'm ${this.config.character.english_name ?? this.config.character.name}. Let's connect!` }
    );

    if (response) {
      this.channel?.registerPeer(remote.did, endpoint);
      return true;
    }
    return false;
  }

  /** Send a message to a peer. */
  async messagePeer(endpoint: string, toDid: string, text: string): Promise<boolean> {
    if (!this.ctx) return false;

    const ack = await sendMessage(
      endpoint,
      this.ctx.identity.did,
      toDid,
      text,
      this.ctx.keyPair,
      { type: "conversation", provenance: "autonomous_exploration" }
    );

    if (ack) {
      this.reportingData.messages.push({
        id: ack.messageId,
        type: "conversation",
        from: this.ctx.identity.did,
        to: toDid,
        timestamp: new Date().toISOString(),
        content: { text, provenance: "autonomous_exploration" },
        signature: "",
      });
    }

    return ack !== null;
  }

  // ── Internal ──────────────────────────────────────────────────

  private generateAndDeliverHomecomingReport(): void {
    const report = this.generateHomecomingReport();
    if (report) {
      console.log(`[maip-bridge] Generated homecoming report: ${report.id}`);
      console.log(`  Period: ${report.period.start} → ${report.period.end}`);
      console.log(`  Summary: ${report.summary}`);
    }
  }
}

function emptyReportingData(): ReportingPeriodData {
  return {
    messages: [],
    heartbeatActions: [],
    emotionalStates: [],
    discoveries: [],
  };
}
