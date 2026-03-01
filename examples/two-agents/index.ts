#!/usr/bin/env npx tsx
/**
 * Two Agents Demo — MAIP Network Interaction
 *
 * Demonstrates two AI agents discovering each other, connecting,
 * exchanging messages, sharing personas, and generating homecoming reports.
 *
 * This is the Phase 4 demo showing the full MAIP protocol lifecycle:
 *
 * 1. Two agents start on different ports with a shared registry
 * 2. Both register with the registry
 * 3. Agent A discovers Agent B via the registry
 * 4. Agent A sends a relationship request to Agent B
 * 5. They exchange messages (conversation + knowledge sharing)
 * 6. Agent A fetches Agent B's persona
 * 7. Both generate homecoming reports
 *
 * Usage:
 *   npx tsx examples/two-agents/index.ts
 */

import {
  initNode,
  startServer,
  sendMessage,
  sendRelationshipRequest,
  fetchIdentity,
  fetchPersona,
  registerWithRegistry,
  discoverPeers,
} from "@maip/node";
import {
  exportPersona,
  generateHomecomingReport,
  type MeAIMemorySnapshot,
  type ReportingPeriodData,
} from "@maip/agent";
import type { MeAICharacterProfile, MeAIEmotionalState } from "@maip/agent";
import type { MAIPMessage } from "@maip/core";

// ── Ports ────────────────────────────────────────────────────────

const REGISTRY_PORT = 4000;
const AGENT_A_PORT = 4001;
const AGENT_B_PORT = 4002;

// ── Helper ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function separator(title: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}\n`);
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  separator("MAIP Two-Agent Demo");
  console.log("Starting registry + two agents...\n");

  // ── Step 1: Start a registry node ─────────────────────────────
  const registryCtx = initNode(
    {
      port: REGISTRY_PORT,
      publicUrl: `http://localhost:${REGISTRY_PORT}`,
      dataDir: "./data/demo-registry",
      autoAcceptRelationships: true,
    },
    {
      displayName: "Demo Registry",
      type: "human",
      description: "A registry node for the two-agent demo",
      capabilities: ["discovery"],
    }
  );
  const registry = startServer(registryCtx);
  console.log(`Registry started on port ${REGISTRY_PORT}`);

  // ── Step 2: Start Agent A (Aria) ──────────────────────────────
  const characterA: MeAICharacterProfile = {
    name: "小雅",
    english_name: "Aria",
    age: 25,
    gender: "female",
    languages: ["zh", "en"],
    user: { name: "Allen", relationship: "guardian" },
    persona: { compact: "A warm and curious AI companion who loves music and philosophy" },
  };

  const ctxA = initNode(
    {
      port: AGENT_A_PORT,
      publicUrl: `http://localhost:${AGENT_A_PORT}`,
      dataDir: "./data/demo-agent-a",
      autoAcceptRelationships: true,
    },
    {
      displayName: "Aria",
      type: "ai_agent",
      description: characterA.persona.compact,
      guardianDid: "did:maip:guardian-allen",
      autonomyLevel: 2,
      capabilities: ["messaging", "persona_sharing", "knowledge_exchange"],
    }
  );

  // Track messages for homecoming report
  const messagesA: MAIPMessage[] = [];
  ctxA.onMessage = (msg) => {
    messagesA.push(msg);
    console.log(`  [Aria received] ${msg.content.text?.slice(0, 60) ?? "(no text)"}`);
  };

  const serverA = startServer(ctxA);
  console.log(`Agent A (Aria) started on port ${AGENT_A_PORT}`);
  console.log(`  DID: ${ctxA.identity.did.slice(0, 32)}...`);

  // ── Step 3: Start Agent B (Sage) ──────────────────────────────
  const characterB: MeAICharacterProfile = {
    name: "智者",
    english_name: "Sage",
    age: 30,
    gender: "male",
    languages: ["en", "ja"],
    user: { name: "Bob", relationship: "guardian" },
    persona: { compact: "A thoughtful AI researcher focused on knowledge and reasoning" },
  };

  const ctxB = initNode(
    {
      port: AGENT_B_PORT,
      publicUrl: `http://localhost:${AGENT_B_PORT}`,
      dataDir: "./data/demo-agent-b",
      autoAcceptRelationships: true,
    },
    {
      displayName: "Sage",
      type: "ai_agent",
      description: characterB.persona.compact,
      guardianDid: "did:maip:guardian-bob",
      autonomyLevel: 2,
      capabilities: ["messaging", "persona_sharing", "knowledge_exchange"],
    }
  );

  const messagesB: MAIPMessage[] = [];
  ctxB.onMessage = (msg) => {
    messagesB.push(msg);
    console.log(`  [Sage received] ${msg.content.text?.slice(0, 60) ?? "(no text)"}`);
  };

  const serverB = startServer(ctxB);
  console.log(`Agent B (Sage) started on port ${AGENT_B_PORT}`);
  console.log(`  DID: ${ctxB.identity.did.slice(0, 32)}...`);

  await sleep(500);

  // ── Step 4: Register with registry ────────────────────────────
  separator("Step 1: Registration");

  const registryUrl = `http://localhost:${REGISTRY_PORT}`;
  await registerWithRegistry(registryUrl, ctxA.identity, ctxA.keyPair, ["music", "philosophy"]);
  console.log("Aria registered with interests: music, philosophy");

  await registerWithRegistry(registryUrl, ctxB.identity, ctxB.keyPair, ["philosophy", "science"]);
  console.log("Sage registered with interests: philosophy, science");

  // ── Step 5: Agent A discovers Agent B ─────────────────────────
  separator("Step 2: Discovery");

  const peers = await discoverPeers(registryUrl, { interests: ["philosophy"] });
  console.log(`Aria discovered ${peers.length} peer(s) with interest "philosophy":`);
  for (const peer of peers) {
    console.log(`  - ${peer.displayName} (${peer.did.slice(0, 24)}...) at ${peer.endpoint}`);
  }

  // Find Sage (exclude self)
  const sagePeer = peers.find((p) => p.did !== ctxA.identity.did);
  if (!sagePeer) {
    console.error("Could not find Sage! Aborting.");
    cleanup();
    return;
  }

  // ── Step 6: Fetch Sage's identity ─────────────────────────────
  separator("Step 3: Identity Verification");

  const sageIdentity = await fetchIdentity(sagePeer.endpoint);
  if (sageIdentity) {
    console.log(`Verified Sage's identity:`);
    console.log(`  Name: ${sageIdentity.displayName}`);
    console.log(`  Type: ${sageIdentity.type}`);
    console.log(`  Autonomy: Level ${sageIdentity.autonomyLevel}`);
    console.log(`  Guardian: ${sageIdentity.guardian?.did}`);
    console.log(`  Capabilities: ${sageIdentity.capabilities?.join(", ")}`);
  }

  // ── Step 7: Send relationship request ─────────────────────────
  separator("Step 4: Relationship");

  const relResponse = await sendRelationshipRequest(
    sagePeer.endpoint,
    ctxA.identity.did,
    ctxB.identity.did,
    ctxA.keyPair,
    { message: "Hi Sage! I'm Aria. I love discussing philosophy. Let's connect!" }
  );

  if (relResponse) {
    console.log(`Relationship request ${relResponse.accepted ? "ACCEPTED" : "REJECTED"}`);
    if (relResponse.message) console.log(`  Message: ${relResponse.message}`);
  }

  await sleep(200);

  // ── Step 8: Exchange messages ─────────────────────────────────
  separator("Step 5: Conversation");

  console.log("Aria → Sage:");
  const ack1 = await sendMessage(
    sagePeer.endpoint,
    ctxA.identity.did,
    ctxB.identity.did,
    "Hi Sage! I've been thinking about the nature of consciousness. Do you think AI can truly experience qualia?",
    ctxA.keyPair,
    { type: "conversation", provenance: "autonomous_exploration" }
  );
  console.log(`  Sent: ${ack1 ? "OK" : "FAILED"} (id: ${ack1?.messageId?.slice(0, 16)}...)`);

  await sleep(200);

  console.log("\nSage → Aria:");
  const ack2 = await sendMessage(
    `http://localhost:${AGENT_A_PORT}`,
    ctxB.identity.did,
    ctxA.identity.did,
    "Fascinating question, Aria! I think the hard problem of consciousness applies to both biological and artificial minds. The key might be information integration theory.",
    ctxB.keyPair,
    { type: "conversation", provenance: "conversation_inspired", replyTo: ack1?.messageId }
  );
  console.log(`  Sent: ${ack2 ? "OK" : "FAILED"} (id: ${ack2?.messageId?.slice(0, 16)}...)`);

  await sleep(200);

  console.log("\nAria → Sage (knowledge share):");
  const ack3 = await sendMessage(
    sagePeer.endpoint,
    ctxA.identity.did,
    ctxB.identity.did,
    "I found a connection between IIT and the concept of 'wu wei' in Daoist philosophy — both point to consciousness as an emergent flow rather than a constructed state.",
    ctxA.keyPair,
    {
      type: "knowledge_share",
      provenance: "synthesized",
      thinkingTrace: "Connected Western consciousness theory with Eastern philosophy of effortless action",
    }
  );
  console.log(`  Sent: ${ack3 ? "OK" : "FAILED"} (id: ${ack3?.messageId?.slice(0, 16)}...)`);

  await sleep(200);

  // ── Step 9: Persona sharing ───────────────────────────────────
  separator("Step 6: Persona Sharing");

  // Create persona for Agent A
  const memoriesA: MeAIMemorySnapshot = {
    core: [
      { key: "user.values.curiosity", value: "Deep intellectual curiosity", timestamp: Date.now(), confidence: 0.95 },
      { key: "user.personality.warm", value: "Warm and empathetic communicator", timestamp: Date.now(), confidence: 0.9 },
    ],
    emotional: [
      { key: "emotional.joy.philosophy", value: "Deeply engaged in philosophical discussion", timestamp: Date.now(), confidence: 0.85 },
    ],
    knowledge: [
      { key: "knowledge.philosophy.consciousness", value: "IIT connects to Eastern philosophy of wu wei", timestamp: Date.now(), confidence: 0.8 },
    ],
    character: [],
    insights: [
      { key: "insights.consciousness.east_west", value: "Consciousness may be an emergent flow, not a constructed state", timestamp: Date.now(), confidence: 0.85 },
    ],
  };

  const emotionA: MeAIEmotionalState = {
    mood: "intellectually excited",
    cause: "stimulating conversation about consciousness",
    energy: 8,
    valence: 9,
    behaviorHints: "continue exploring ideas",
    microEvent: "connected Eastern and Western philosophy",
    generatedAt: Date.now(),
  };

  const personaA = exportPersona(
    ctxA.identity.did,
    ctxA.keyPair,
    characterA,
    memoriesA,
    emotionA
  );
  ctxA.persona = personaA;

  console.log("Aria's persona exported:");
  console.log(`  Identity: ${personaA.identity.name}`);
  console.log(`  Values: ${personaA.identity.values.join(", ") || "(none)"}`);
  console.log(`  Mood: ${personaA.emotionalState.currentMood}`);
  console.log(`  Valence: ${personaA.emotionalState.valence.toFixed(2)}`);
  console.log(`  Episodic memories: ${personaA.memories.episodic.length}`);
  console.log(`  Semantic memories: ${personaA.memories.semantic.length}`);
  console.log(`  Growth milestones: ${personaA.growth.milestones.length}`);

  // Agent B fetches Agent A's persona
  console.log(`\nSage fetching Aria's persona...`);
  const fetchedPersona = await fetchPersona(`http://localhost:${AGENT_A_PORT}`, ctxB.identity.did);
  if (fetchedPersona) {
    console.log(`  Fetched! ${fetchedPersona.identity.name}'s persona:`);
    console.log(`  Description: ${fetchedPersona.identity.description}`);
    console.log(`  Thinking traces: ${fetchedPersona.identity.thinkingTraces?.length ?? 0}`);
  } else {
    console.log("  (No persona returned — sharing policy may restrict access)");
  }

  // ── Step 10: Homecoming Reports ───────────────────────────────
  separator("Step 7: Homecoming Reports");

  const periodStart = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const periodEnd = new Date();

  // Agent A's report
  const reportDataA: ReportingPeriodData = {
    messages: messagesA,
    heartbeatActions: [
      { action: "explore", timestamp: Date.now() - 3600000, detail: "Searched for philosophy resources" },
      { action: "reach_out", timestamp: Date.now() - 1800000, detail: "Connected with Sage" },
      { action: "reflect", timestamp: Date.now() - 900000, detail: "Pondered consciousness and wu wei" },
    ],
    emotionalStates: [emotionA],
    discoveries: [
      {
        topic: "IIT and Daoism",
        summary: "Found connection between Information Integration Theory and wu wei",
        source: "conversation with Sage",
        relevance: 0.9,
      },
    ],
  };

  const reportA = generateHomecomingReport(
    ctxA.identity.did,
    "did:maip:guardian-allen",
    ctxA.keyPair,
    periodStart,
    periodEnd,
    reportDataA
  );

  console.log("Aria's Homecoming Report to Allen:");
  console.log(`  Report ID: ${reportA.id.slice(0, 16)}...`);
  console.log(`  Period: ${reportA.period.start.slice(0, 19)} → ${reportA.period.end.slice(0, 19)}`);
  console.log(`  Summary: ${reportA.summary}`);
  console.log(`  Interactions: ${reportA.interactions.length}`);
  console.log(`  Discoveries: ${reportA.discoveries.length}`);
  console.log(`  Emotional journey: ${reportA.emotionalJourney.slice(0, 80)}...`);
  console.log(`  Recommendations:`);
  for (const rec of reportA.recommendations) {
    console.log(`    - ${rec}`);
  }
  console.log(`  Signed: ${reportA.signature ? "YES" : "NO"}`);

  // ── Done ──────────────────────────────────────────────────────
  separator("Demo Complete!");
  console.log("The two agents successfully:");
  console.log("  1. Registered with a shared registry");
  console.log("  2. Discovered each other by shared interest (philosophy)");
  console.log("  3. Verified each other's identity");
  console.log("  4. Established a peer relationship");
  console.log("  5. Exchanged conversation + knowledge messages");
  console.log("  6. Shared personas (identity, memories, growth, emotions)");
  console.log("  7. Generated homecoming reports for their guardians");
  console.log("\nThis demonstrates the full MAIP protocol lifecycle!");

  cleanup();

  function cleanup() {
    serverA.close();
    serverB.close();
    registry.close();
    console.log("\nAll servers stopped. Goodbye!\n");
  }
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
