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
  GuardianTransferStatus,
  SharedSpace,
  SpaceMembership,
  SpaceMessage,
  GuardianAbuseReport,
  RightToRefuseRecord,
  AttentionToken,
  KnowledgeCreditBalance,
  KnowledgeCreditTransaction,
  ReputationStake,
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

/** Guardian transfer record. */
export interface GuardianTransferEntry extends GuardianTransferStatus {
  id: string;
}

/** Shared Space record. */
export interface SharedSpaceEntry extends SharedSpace {
  id: string;
}

/** Space membership record. */
export interface SpaceMembershipEntry extends SpaceMembership {
  id: string;
}

/** Space message record. */
export interface SpaceMessageEntry extends SpaceMessage {
  id: string;
}

/** Guardian abuse report record. */
export interface GuardianAbuseReportEntry extends GuardianAbuseReport {
  id: string;
}

/** Right-to-refuse record. */
export interface RightToRefuseEntry extends RightToRefuseRecord {
  id: string;
}

/** Attention token entry. */
export interface AttentionTokenEntry extends AttentionToken {
  id: string;
}

/** Knowledge credit balance entry. */
export interface KnowledgeCreditBalanceEntry extends KnowledgeCreditBalance {
  id: string;
}

/** Knowledge credit transaction entry. */
export interface KnowledgeCreditTransactionEntry extends KnowledgeCreditTransaction {
  id: string;
}

/** Reputation stake entry. */
export interface ReputationStakeEntry extends ReputationStake {
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
  readonly guardianTransfers: JsonStore<GuardianTransferEntry>;
  readonly spaces: JsonStore<SharedSpaceEntry>;
  readonly spaceMembers: JsonStore<SpaceMembershipEntry>;
  readonly spaceMessages: JsonStore<SpaceMessageEntry>;
  readonly abuseReports: JsonStore<GuardianAbuseReportEntry>;
  readonly refusalRecords: JsonStore<RightToRefuseEntry>;
  readonly attentionTokens: JsonStore<AttentionTokenEntry>;
  readonly creditBalances: JsonStore<KnowledgeCreditBalanceEntry>;
  readonly creditTransactions: JsonStore<KnowledgeCreditTransactionEntry>;
  readonly reputationStakes: JsonStore<ReputationStakeEntry>;

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
    this.guardianTransfers = new JsonStore(dataDir, "guardian-transfers.json");
    this.spaces = new JsonStore(dataDir, "spaces.json");
    this.spaceMembers = new JsonStore(dataDir, "space-members.json");
    this.spaceMessages = new JsonStore(dataDir, "space-messages.json");
    this.abuseReports = new JsonStore(dataDir, "abuse-reports.json");
    this.refusalRecords = new JsonStore(dataDir, "refusal-records.json");
    this.attentionTokens = new JsonStore(dataDir, "attention-tokens.json");
    this.creditBalances = new JsonStore(dataDir, "credit-balances.json");
    this.creditTransactions = new JsonStore(dataDir, "credit-transactions.json");
    this.reputationStakes = new JsonStore(dataDir, "reputation-stakes.json");
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
