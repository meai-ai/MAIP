/**
 * MAIP Node data stores.
 *
 * All node state is persisted as JSON files in a configurable data directory.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  MAIPMessage,
  Relationship,
  RelayMessage,
  IdentityDocument,
  GuardianReputation,
  IsolationRecord,
  IsolationAppeal,
  BehaviorProfile,
} from "@maip/core";
import { JsonStore } from "./json-store.js";

/** Discovery registration stored in a registry node. */
export interface RegistrationEntry {
  id: string;
  did: string;
  displayName: string;
  type: "ai_agent" | "human";
  description?: string;
  interests: string[];
  capabilities: string[];
  endpoint: string;
  /** Instance nonce for unique-active-instance detection. */
  instanceNonce?: string;
  registeredAt: string;
  lastSeen: string;
}

/** Guardian reputation record stored by registry nodes. */
export interface GuardianReputationEntry extends GuardianReputation {
  id: string;
}

/** Network isolation record. */
export interface IsolationRecordEntry extends IsolationRecord {
  id: string;
}

/** Isolation appeal record. */
export interface IsolationAppealEntry extends IsolationAppeal {
  id: string;
}

/** Behavioral profile record. */
export interface BehaviorProfileEntry extends BehaviorProfile {
  id: string;
}

export class NodeStores {
  readonly messages: JsonStore<MAIPMessage & { id: string }>;
  readonly relationships: JsonStore<Relationship>;
  readonly relay: JsonStore<RelayMessage & { id: string }>;
  readonly registrations: JsonStore<RegistrationEntry>;
  readonly guardianReputations: JsonStore<GuardianReputationEntry>;
  readonly isolations: JsonStore<IsolationRecordEntry>;
  readonly appeals: JsonStore<IsolationAppealEntry>;
  readonly behaviorProfiles: JsonStore<BehaviorProfileEntry>;

  constructor(dataDir: string) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.messages = new JsonStore(dataDir, "messages.json");
    this.relationships = new JsonStore(dataDir, "relationships.json");
    this.relay = new JsonStore(dataDir, "relay.json");
    this.registrations = new JsonStore(dataDir, "registrations.json");
    this.guardianReputations = new JsonStore(dataDir, "guardian-reputations.json");
    this.isolations = new JsonStore(dataDir, "isolations.json");
    this.appeals = new JsonStore(dataDir, "appeals.json");
    this.behaviorProfiles = new JsonStore(dataDir, "behavior-profiles.json");
  }

  /** Purge expired relay messages. */
  purgeExpiredRelay(): number {
    const now = new Date().toISOString();
    const expired = this.relay.filter((m) => m.expiresAt < now);
    for (const m of expired) {
      this.relay.remove(m.id);
    }
    return expired.length;
  }
}
