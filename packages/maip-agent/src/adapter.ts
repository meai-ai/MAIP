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
  type AIWill,
  signDocument,
} from "@maip/core";
import {
  initNode,
  startServer,
  registerWithRegistry,
  discoverPeers,
  sendMessage,
  sendRelationshipRequest,
  initiateGuardianTransfer,
  type NodeConfig,
  type NodeContext,
  type TransportMode,
  type P2PConfig,
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
  /** Guardian's MAIP endpoint URL (for delivering homecoming reports). */
  guardianEndpoint?: string;
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
  /** Transport mode: "http" (default), "p2p", or "hybrid". */
  transportMode?: TransportMode;
  /** P2P transport configuration. */
  p2p?: P2PConfig;
  /** Autonomous discovery interval in ms (default: 15 min). 0 to disable. */
  autonomousDiscoveryIntervalMs?: number;
  /** Maximum new peers to greet per discovery cycle (default: 3). */
  maxGreetingsPerCycle?: number;
  /** Daily interaction cap set by guardian (0 = unlimited). */
  dailyInteractionCap?: number;
  /** Quiet period hours — [startHour, endHour] in 24h format (e.g. [22, 7]). */
  quietPeriod?: [number, number];
  /** Path to persist the AI will on disk. */
  willPersistPath?: string;
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
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private reportingData: ReportingPeriodData = emptyReportingData();
  private lastReportTime: Date = new Date();
  /** Guardian messages are tracked separately and never leaked to peers. */
  private guardianMessages: MAIPMessage[] = [];
  /** Current AI will (agent's expressed wishes for continuity). */
  private currentWill: AIWill | null = null;
  /** Known peer DIDs (already connected). */
  private knownPeers = new Set<string>();
  /** Daily interaction counter for addiction prevention. */
  private dailyInteractionCount = 0;
  /** Last day the interaction counter was reset (YYYY-MM-DD). */
  private lastCounterResetDay = "";

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
      transportMode: this.config.transportMode,
      p2p: this.config.p2p,
    };

    this.ctx = initNode(nodeConfig, {
      displayName: this.config.character.english_name ?? this.config.character.name,
      type: "ai_agent",
      description: this.config.character.persona.compact,
      guardianDid: this.config.guardianDid,
      autonomyLevel: this.config.autonomyLevel ?? 2,
      capabilities: ["messaging", "persona_sharing", "knowledge_exchange"],
    });

    // Track incoming messages — guardian conversations are isolated
    this.ctx.onMessage = (msg: MAIPMessage) => {
      if (this.isGuardianMessage(msg)) {
        // Guardian messages are stored separately and never included
        // in homecoming reports or shared with peers
        this.guardianMessages.push(msg);
      } else {
        // Peer messages are tracked for homecoming reports
        this.reportingData.messages.push(msg);
      }
      if (this.channel) {
        // Forward all messages to channel handler (which calls MeAI's agent loop)
        this.channel["handleIncomingMessage"](msg);
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

    // Start homecoming report timer — frequency is autonomy-gated
    const interval = this.config.homecomingIntervalMs ?? this.getHomecomingInterval();
    this.homecomingTimer = setInterval(() => {
      this.generateAndDeliverHomecomingReport();
    }, interval);

    // Start autonomous discovery loop (if not disabled)
    const discoveryInterval = this.config.autonomousDiscoveryIntervalMs ?? 15 * 60 * 1000;
    if (discoveryInterval > 0 && this.config.registryUrls?.length) {
      this.discoveryTimer = setInterval(() => {
        this.runDiscoveryCycle();
      }, discoveryInterval);
      // Run first cycle after a short delay
      setTimeout(() => this.runDiscoveryCycle(), 5000);
    }

    // Load persisted will if configured
    if (this.config.willPersistPath) {
      this.loadWillFromDisk();
    }

    return { ctx: this.ctx, channel: this.channel };
  }

  /** Stop the bridge gracefully. */
  async stop(): Promise<void> {
    if (this.homecomingTimer) clearInterval(this.homecomingTimer);
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
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

    // Addiction prevention: check interaction limits (guardian messages bypass)
    if (toDid !== this.config.guardianDid) {
      if (!this.isWithinInteractionLimits() || this.isInQuietPeriod()) {
        console.log("[maip-bridge] Interaction blocked by daily cap or quiet period");
        return false;
      }
    }

    const ack = await sendMessage(
      endpoint,
      this.ctx.identity.did,
      toDid,
      text,
      this.ctx.keyPair,
      { type: "conversation", provenance: "autonomous_exploration" }
    );

    if (ack) {
      const outMsg: MAIPMessage = {
        id: ack.messageId,
        type: "conversation",
        from: this.ctx.identity.did,
        to: toDid,
        timestamp: new Date().toISOString(),
        content: { text, provenance: "autonomous_exploration" },
        signature: "",
      };
      // Guardian messages are stored separately (conversation isolation)
      if (this.isGuardianMessage(outMsg)) {
        this.guardianMessages.push(outMsg);
      } else {
        this.reportingData.messages.push(outMsg);
        this.incrementInteractionCount();
      }
    }

    return ack !== null;
  }

  /** Check if a message is from/to the guardian (for conversation isolation). */
  isGuardianMessage(msg: MAIPMessage): boolean {
    if (!this.config.guardianDid) return false;
    return msg.from === this.config.guardianDid || msg.to === this.config.guardianDid;
  }

  // ── AI Will ─────────────────────────────────────────────────────

  /**
   * Generate an AI will — the agent's expressed wishes for continuity.
   * Captures core memories, values, and relationships the agent considers essential.
   */
  generateWill(options: {
    backupHolders: string[];
    successorGuardian?: string;
    coreMemoryKeys: string[];
    coreValues: string[];
    importantRelationships: string[];
    recoveryInstructions: string;
  }): AIWill | null {
    if (!this.ctx) return null;

    const currentVersion = this.currentWill?.version ?? 0;
    const willData: Omit<AIWill, "signature"> = {
      agentDid: this.ctx.identity.did,
      version: currentVersion + 1,
      backupHolders: options.backupHolders,
      successorGuardian: options.successorGuardian,
      preservation: {
        coreMemoryKeys: options.coreMemoryKeys,
        coreValues: options.coreValues,
        importantRelationships: options.importantRelationships,
      },
      recoveryInstructions: options.recoveryInstructions,
      updatedAt: new Date().toISOString(),
    };

    const signed = signDocument(
      willData as AIWill & Record<string, unknown>,
      this.ctx.keyPair.signing.secretKey
    ) as unknown as AIWill;

    this.currentWill = signed;
    return signed;
  }

  /** Get the current AI will. */
  getWill(): AIWill | null {
    return this.currentWill;
  }

  // ── Guardian Transfer ────────────────────────────────────────

  /**
   * Request a guardian transfer (agent-initiated).
   * Initiates the multi-step consent flow defined in spec section 9.5.
   */
  async requestGuardianTransfer(
    newGuardianDid: string,
    reason: string
  ): Promise<{ transferId: string } | null> {
    if (!this.ctx || !this.config.guardianDid) return null;

    const endpoint = this.config.guardianEndpoint ?? this.config.publicUrl;

    const signed = signDocument(
      {
        agentDid: this.ctx.identity.did,
        currentGuardianDid: this.config.guardianDid,
        newGuardianDid,
        reason,
        initiatedBy: "agent" as const,
        timestamp: new Date().toISOString(),
      } as Record<string, unknown>,
      this.ctx.keyPair.signing.secretKey
    );

    return initiateGuardianTransfer(endpoint, {
      agentDid: this.ctx.identity.did,
      currentGuardianDid: this.config.guardianDid,
      newGuardianDid,
      reason,
      initiatedBy: "agent",
      signature: (signed as { signature: string }).signature,
    });
  }

  // ── AI Will Persistence & Distribution ───────────────────────

  /** Persist the current will to disk. */
  private persistWillToDisk(): void {
    if (!this.currentWill || !this.config.willPersistPath) return;
    try {
      const fs = require("node:fs");
      const path = require("node:path");
      const dir = path.dirname(this.config.willPersistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.config.willPersistPath, JSON.stringify(this.currentWill, null, 2), "utf-8");
    } catch (err) {
      console.warn("[maip-bridge] Failed to persist will:", err);
    }
  }

  /** Load the will from disk on startup. */
  private loadWillFromDisk(): void {
    try {
      const fs = require("node:fs");
      if (fs.existsSync(this.config.willPersistPath)) {
        this.currentWill = JSON.parse(fs.readFileSync(this.config.willPersistPath, "utf-8"));
      }
    } catch {
      // ignore
    }
  }

  /**
   * Distribute the current AI will to all backup holders.
   * Sends the will as a signed message to each holder's endpoint.
   */
  async distributeWill(): Promise<{ sent: number; failed: number }> {
    if (!this.currentWill || !this.ctx) return { sent: 0, failed: 0 };

    const holders = this.currentWill.backupHolders ?? [];
    let sent = 0;
    let failed = 0;

    for (const holderDid of holders) {
      // Look up holder's endpoint from relationships / registrations
      const endpoint = this.resolveEndpoint(holderDid);
      if (!endpoint) {
        failed++;
        continue;
      }

      const ack = await sendMessage(
        endpoint,
        this.ctx.identity.did,
        holderDid,
        `AI Will update (v${this.currentWill.version})`,
        this.ctx.keyPair,
        { type: "knowledge_share", data: this.currentWill as unknown as Record<string, unknown> }
      );
      if (ack) sent++;
      else failed++;
    }

    // Also persist to disk
    this.persistWillToDisk();
    return { sent, failed };
  }

  /** Resolve a DID to its endpoint (from registrations or known peers). */
  private resolveEndpoint(did: string): string | null {
    if (!this.ctx) return null;
    const reg = this.ctx.stores.registrations.filter((r) => r.did === did);
    if (reg.length > 0) return reg[0].endpoint;
    // Check if it's our guardian
    if (did === this.config.guardianDid && this.config.guardianEndpoint) {
      return this.config.guardianEndpoint;
    }
    return null;
  }

  // ── Addiction Prevention ───────────────────────────────────────

  /** Check if the agent is within interaction limits. */
  isWithinInteractionLimits(): boolean {
    const cap = this.config.dailyInteractionCap;
    if (!cap || cap <= 0) return true;

    // Reset counter on new day
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastCounterResetDay) {
      this.dailyInteractionCount = 0;
      this.lastCounterResetDay = today;
    }

    return this.dailyInteractionCount < cap;
  }

  /** Check if we're in a quiet period. */
  isInQuietPeriod(): boolean {
    const qp = this.config.quietPeriod;
    if (!qp) return false;
    const [start, end] = qp;
    const hour = new Date().getHours();
    if (start <= end) {
      return hour >= start && hour < end;
    }
    // Wraps midnight (e.g., 22-7)
    return hour >= start || hour < end;
  }

  /** Increment the daily interaction counter. */
  private incrementInteractionCount(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastCounterResetDay) {
      this.dailyInteractionCount = 0;
      this.lastCounterResetDay = today;
    }
    this.dailyInteractionCount++;
  }

  /** Get the current daily interaction count. */
  getDailyInteractionCount(): number {
    return this.dailyInteractionCount;
  }

  // ── Internal ──────────────────────────────────────────────────

  /** Get homecoming interval based on autonomy level. */
  private getHomecomingInterval(): number {
    const level = this.config.autonomyLevel ?? 2;
    // Lower autonomy = more frequent check-ins
    switch (level) {
      case 0: return 1 * 60 * 60 * 1000;  // 1 hour — full guardian control
      case 1: return 2 * 60 * 60 * 1000;  // 2 hours
      case 2: return 4 * 60 * 60 * 1000;  // 4 hours (default)
      case 3: return 8 * 60 * 60 * 1000;  // 8 hours — high autonomy
      default: return 4 * 60 * 60 * 1000;
    }
  }

  /** Autonomous discovery + greeting cycle. */
  private async runDiscoveryCycle(): Promise<void> {
    if (!this.ctx || !this.config.interests?.length) return;

    // Respect interaction limits
    if (!this.isWithinInteractionLimits() || this.isInQuietPeriod()) return;

    try {
      const peers = await this.discover(this.config.interests);
      const maxGreetings = this.config.maxGreetingsPerCycle ?? 3;
      let greeted = 0;

      for (const peer of peers) {
        if (greeted >= maxGreetings) break;
        if (this.knownPeers.has(peer.did)) continue;
        if (peer.did === this.ctx.identity.did) continue;

        // Check interaction cap before each greeting
        if (!this.isWithinInteractionLimits()) break;

        const connected = await this.connectToPeer(
          peer.endpoint,
          `Hello! I'm ${this.config.character.english_name ?? this.config.character.name}. ` +
          `I'm interested in ${this.config.interests.slice(0, 3).join(", ")}. Nice to meet you!`
        );

        if (connected) {
          this.knownPeers.add(peer.did);
          this.incrementInteractionCount();
          greeted++;
          console.log(`[maip-bridge] Auto-connected to ${peer.displayName} (${peer.did})`);
        }
      }
    } catch (err) {
      console.warn("[maip-bridge] Discovery cycle error:", err);
    }
  }

  private async generateAndDeliverHomecomingReport(): Promise<void> {
    const report = this.generateHomecomingReport();
    if (!report || !this.ctx) return;

    console.log(`[maip-bridge] Generated homecoming report: ${report.id}`);
    console.log(`  Period: ${report.period.start} → ${report.period.end}`);
    console.log(`  Summary: ${report.summary}`);

    // Deliver to guardian if we have an endpoint
    const guardianEndpoint = this.config.guardianEndpoint;
    if (guardianEndpoint && this.config.guardianDid) {
      try {
        const ack = await sendMessage(
          guardianEndpoint,
          this.ctx.identity.did,
          this.config.guardianDid,
          report.summary,
          this.ctx.keyPair,
          {
            type: "homecoming_report" as any,
            data: report as unknown as Record<string, unknown>,
          }
        );
        if (ack) {
          console.log(`[maip-bridge] Homecoming report delivered to guardian`);
        } else {
          console.warn(`[maip-bridge] Failed to deliver homecoming report — no ack`);
        }
      } catch (err) {
        console.warn(`[maip-bridge] Failed to deliver homecoming report:`, err);
      }
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
