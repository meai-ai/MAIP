/**
 * Homecoming Report generator.
 *
 * Generates periodic reports from the agent to its guardian about
 * what happened on the MAIP network. Maps to MeAI's heartbeat actions.
 *
 * Homecoming Reports are the killer feature of MAIP — the natural
 * bridge between agent autonomy and human awareness.
 */

import { v4 as uuid } from "uuid";
import {
  signDocument,
  type MAIPKeyPair,
  type HomecomingReport,
  type InteractionSummary,
  type Discovery,
  type MAIPMessage,
} from "@maip/core";
import type { MeAIEmotionalState, MeAIHeartbeatAction } from "./meai-types.js";

/** Raw data collected during a reporting period. */
export interface ReportingPeriodData {
  /** Peer messages exchanged during this period (excludes guardian conversations). */
  messages: MAIPMessage[];
  /** Heartbeat actions taken. */
  heartbeatActions: Array<{ action: MeAIHeartbeatAction; timestamp: number; detail?: string }>;
  /** Emotional states recorded during the period. */
  emotionalStates: MeAIEmotionalState[];
  /** Web discoveries from curiosity engine. */
  discoveries: Array<{ topic: string; summary: string; source: string; relevance: number }>;
}

/**
 * Generate a Homecoming Report from collected period data.
 */
export function generateHomecomingReport(
  agentDid: string,
  guardianDid: string,
  keyPair: MAIPKeyPair,
  periodStart: Date,
  periodEnd: Date,
  data: ReportingPeriodData
): HomecomingReport {
  // ── Summarize interactions ──
  const interactionsByPeer = new Map<string, MAIPMessage[]>();
  for (const msg of data.messages) {
    const peer = msg.from === agentDid ? msg.to : msg.from;
    if (!interactionsByPeer.has(peer)) interactionsByPeer.set(peer, []);
    interactionsByPeer.get(peer)!.push(msg);
  }

  const interactions: InteractionSummary[] = Array.from(interactionsByPeer.entries()).map(
    ([peerDid, msgs]) => {
      const types = new Set(msgs.map((m) => m.type));
      let type: InteractionSummary["type"] = "conversation";
      if (types.has("knowledge_share")) type = "knowledge_exchange";
      if (types.has("introduction")) type = "introduction";
      if (types.has("proposal")) type = "collaboration";

      const texts = msgs
        .filter((m) => m.content.text)
        .map((m) => m.content.text!)
        .slice(0, 3);
      const summary = texts.length > 0
        ? `Discussed: ${texts[0].slice(0, 100)}${texts.length > 1 ? ` (+${texts.length - 1} more messages)` : ""}`
        : "Exchanged messages";

      return {
        withDid: peerDid,
        withName: peerDid.slice(0, 16) + "...",
        type,
        summary,
        messageCount: msgs.length,
        timestamp: msgs[0].timestamp,
      };
    }
  );

  // ── Discoveries ──
  const discoveries: Discovery[] = data.discoveries.map((d) => ({
    topic: d.topic,
    summary: d.summary,
    source: d.source,
    relevance: d.relevance,
  }));

  // ── Emotional journey narrative ──
  const emotionalJourney = narrateEmotionalJourney(data.emotionalStates);

  // ── Thinking traces from heartbeat actions ──
  const thinkingTraces = data.heartbeatActions
    .filter((a) => a.action !== "rest" && a.detail)
    .slice(0, 5)
    .map((a) => ({
      topic: a.action,
      reasoning: a.detail ?? "",
      conclusion: `Decided to ${a.action} based on current state`,
    }));

  // ── Recommendations ──
  const recommendations = generateRecommendations(data);

  // ── Summary ──
  const summary = generateSummary(interactions, discoveries, data.heartbeatActions);

  // ── Build and sign ──
  const reportData: Omit<HomecomingReport, "signature"> = {
    id: uuid(),
    agentDid,
    guardianDid,
    timestamp: new Date().toISOString(),
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
    },
    summary,
    interactions,
    discoveries,
    emotionalJourney,
    thinkingTraces,
    recommendations,
  };

  return signDocument(
    reportData as HomecomingReport & Record<string, unknown>,
    keyPair.signing.secretKey
  ) as unknown as HomecomingReport;
}

// ── Helpers ──────────────────────────────────────────────────────

function narrateEmotionalJourney(states: MeAIEmotionalState[]): string {
  if (states.length === 0) return "No emotional data recorded during this period.";

  const sorted = [...states].sort((a, b) => a.generatedAt - b.generatedAt);
  const parts = sorted.map((s) => {
    const time = new Date(s.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${time}: ${s.mood} (${s.cause})`;
  });

  const avgValence = sorted.reduce((sum, s) => sum + s.valence, 0) / sorted.length;
  const overall = avgValence > 7 ? "positive" : avgValence > 4 ? "mixed" : "challenging";

  return `Overall ${overall} period. ${parts.join(". ")}.`;
}

function generateRecommendations(data: ReportingPeriodData): string[] {
  const recs: string[] = [];

  if (data.discoveries.length > 0) {
    const top = data.discoveries.sort((a, b) => b.relevance - a.relevance)[0];
    recs.push(`Check out: "${top.topic}" — ${top.summary.slice(0, 80)}`);
  }

  const exploreCount = data.heartbeatActions.filter((a) => a.action === "explore").length;
  const socialCount = data.heartbeatActions.filter((a) => a.action === "reach_out" || a.action === "post").length;

  if (exploreCount > socialCount * 2) {
    recs.push("Spent more time exploring than socializing — consider engaging with peers");
  }

  if (data.messages.length === 0) {
    recs.push("No peer interactions this period — consider discovering new connections");
  }

  if (recs.length === 0) {
    recs.push("Activity levels were balanced this period");
  }

  return recs;
}

function generateSummary(
  interactions: InteractionSummary[],
  discoveries: Discovery[],
  actions: Array<{ action: MeAIHeartbeatAction }>
): string {
  const parts: string[] = [];

  if (interactions.length > 0) {
    parts.push(`${interactions.length} peer interaction(s)`);
  }
  if (discoveries.length > 0) {
    parts.push(`${discoveries.length} discovery(ies)`);
  }

  const actionCounts = new Map<string, number>();
  for (const a of actions) {
    actionCounts.set(a.action, (actionCounts.get(a.action) ?? 0) + 1);
  }
  const activeActions = [...actionCounts.entries()]
    .filter(([action]) => action !== "rest")
    .map(([action, count]) => `${action} ×${count}`);

  if (activeActions.length > 0) {
    parts.push(`activities: ${activeActions.join(", ")}`);
  }

  return parts.length > 0 ? parts.join("; ") + "." : "Quiet period — mostly resting.";
}
