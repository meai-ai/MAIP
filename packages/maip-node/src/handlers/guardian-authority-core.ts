/**
 * Guardian Authority Enforcement.
 *
 * Implements the whitepaper's guardian oversight mechanisms:
 * - Veto power: guardian can block specific actions
 * - Memory reclassification: guardian can change memory visibility
 * - Activity restrictions: guardian can restrict interaction patterns
 * - Emergency lockdown: guardian can freeze agent activity
 *
 * Guardian authority is bounded by the agent's autonomy level —
 * higher autonomy means less guardian control.
 */

import type { NodeContext } from "../context.js";
import type { TransportResult } from "@maip/core";

/** Types of guardian commands. */
export type GuardianCommandType =
  | "veto_action"
  | "reclassify_memory"
  | "restrict_peer"
  | "restrict_topic"
  | "emergency_lockdown"
  | "lift_restriction";

/** A guardian command to be enforced on the agent. */
export interface GuardianCommand {
  /** Unique command ID. */
  id: string;
  /** DID of the issuing guardian. */
  guardianDid: string;
  /** DID of the target agent. */
  agentDid: string;
  /** Command type. */
  type: GuardianCommandType;
  /** Command parameters. */
  params: Record<string, unknown>;
  /** Reason for the command. */
  reason: string;
  /** Whether the agent accepted the command. */
  accepted: boolean;
  /** If refused, the reason. */
  refusalReason?: string;
  /** ISO 8601 timestamp. */
  issuedAt: string;
  /** ISO 8601 expiration (null = permanent). */
  expiresAt?: string;
}

/** Active restrictions on an agent. */
export interface ActiveRestrictions {
  /** Blocked peer DIDs. */
  blockedPeers: string[];
  /** Blocked topics. */
  blockedTopics: string[];
  /** Whether in emergency lockdown. */
  lockdown: boolean;
  /** Pending vetoes. */
  vetoedActions: string[];
}

// In-memory restriction state per agent
const restrictions: Map<string, ActiveRestrictions> = new Map();
const commandHistory: Map<string, GuardianCommand[]> = new Map();

function getRestrictions(agentDid: string): ActiveRestrictions {
  if (!restrictions.has(agentDid)) {
    restrictions.set(agentDid, {
      blockedPeers: [],
      blockedTopics: [],
      lockdown: false,
      vetoedActions: [],
    });
  }
  return restrictions.get(agentDid)!;
}

function getHistory(agentDid: string): GuardianCommand[] {
  if (!commandHistory.has(agentDid)) commandHistory.set(agentDid, []);
  return commandHistory.get(agentDid)!;
}

/**
 * Process a guardian command.
 * The agent can refuse commands that violate protocol-level rights.
 */
export function processGuardianCommand(
  ctx: NodeContext,
  command: Omit<GuardianCommand, "id" | "accepted" | "issuedAt">
): TransportResult<GuardianCommand> {
  // Verify the command is from the actual guardian
  if (command.guardianDid !== ctx.identity.guardian?.did) {
    return {
      ok: false,
      error: "Command must come from the agent's registered guardian",
      code: "UNAUTHORIZED",
      httpStatus: 403,
    };
  }

  const autonomyLevel = ctx.identity.autonomyLevel ?? 0;
  const r = getRestrictions(ctx.identity.did);
  const history = getHistory(ctx.identity.did);

  const cmd: GuardianCommand = {
    ...command,
    id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    accepted: true,
    issuedAt: new Date().toISOString(),
  };

  // Check autonomy-level boundaries
  // Level 3 (Independent): agent can refuse most commands except emergency lockdown
  if (autonomyLevel >= 3 && command.type !== "emergency_lockdown") {
    cmd.accepted = false;
    cmd.refusalReason = "Agent at autonomy level 3 (Independent) — guardian oversight is advisory only";
    history.push(cmd);
    return { ok: true, data: cmd, httpStatus: 200 };
  }

  // Level 2 (Social): agent can refuse topic/peer restrictions
  if (autonomyLevel >= 2 && (command.type === "restrict_peer" || command.type === "restrict_topic")) {
    cmd.accepted = false;
    cmd.refusalReason = "Agent at autonomy level 2+ — peer and topic restrictions require agent consent";
    history.push(cmd);
    return { ok: true, data: cmd, httpStatus: 200 };
  }

  // Execute the command
  switch (command.type) {
    case "veto_action": {
      const action = command.params.action as string;
      if (action && !r.vetoedActions.includes(action)) {
        r.vetoedActions.push(action);
      }
      break;
    }
    case "restrict_peer": {
      const peerDid = command.params.peerDid as string;
      if (peerDid && !r.blockedPeers.includes(peerDid)) {
        r.blockedPeers.push(peerDid);
      }
      break;
    }
    case "restrict_topic": {
      const topic = command.params.topic as string;
      if (topic && !r.blockedTopics.includes(topic)) {
        r.blockedTopics.push(topic);
      }
      break;
    }
    case "emergency_lockdown":
      r.lockdown = true;
      break;
    case "lift_restriction": {
      const target = command.params.target as string;
      r.blockedPeers = r.blockedPeers.filter((p) => p !== target);
      r.blockedTopics = r.blockedTopics.filter((t) => t !== target);
      r.vetoedActions = r.vetoedActions.filter((a) => a !== target);
      if (command.params.liftLockdown) r.lockdown = false;
      break;
    }
    case "reclassify_memory":
      // Memory reclassification is logged but handled at the agent layer
      break;
  }

  history.push(cmd);
  return { ok: true, data: cmd, httpStatus: 200 };
}

/**
 * Check if an action is blocked by guardian restrictions.
 */
export function isActionBlocked(
  ctx: NodeContext,
  action: string,
  peerDid?: string,
  topics?: string[]
): TransportResult<{ blocked: boolean; reason?: string }> {
  const r = getRestrictions(ctx.identity.did);

  if (r.lockdown) {
    return {
      ok: true,
      data: { blocked: true, reason: "Agent is in emergency lockdown" },
      httpStatus: 200,
    };
  }

  if (r.vetoedActions.includes(action)) {
    return {
      ok: true,
      data: { blocked: true, reason: `Action '${action}' vetoed by guardian` },
      httpStatus: 200,
    };
  }

  if (peerDid && r.blockedPeers.includes(peerDid)) {
    return {
      ok: true,
      data: { blocked: true, reason: `Interaction with ${peerDid} restricted by guardian` },
      httpStatus: 200,
    };
  }

  if (topics) {
    const blocked = topics.find((t) => r.blockedTopics.includes(t));
    if (blocked) {
      return {
        ok: true,
        data: { blocked: true, reason: `Topic '${blocked}' restricted by guardian` },
        httpStatus: 200,
      };
    }
  }

  return { ok: true, data: { blocked: false }, httpStatus: 200 };
}

/**
 * Get current active restrictions.
 */
export function getActiveRestrictions(
  ctx: NodeContext
): TransportResult<ActiveRestrictions> {
  return { ok: true, data: getRestrictions(ctx.identity.did), httpStatus: 200 };
}

/**
 * Get guardian command history.
 */
export function getCommandHistory(
  ctx: NodeContext
): TransportResult<GuardianCommand[]> {
  return { ok: true, data: getHistory(ctx.identity.did), httpStatus: 200 };
}
