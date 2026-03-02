/**
 * MAIP HTTP client — sends messages and requests to remote MAIP nodes.
 */

import { v4 as uuid } from "uuid";
import {
  MAIP_ENDPOINTS,
  MAIP_HEADERS,
  MAIP_VERSION,
  sign,
  signDocument,
  type MAIPKeyPair,
  type MAIPMessage,
  type MessageAck,
  type MessageType,
  type ContentProvenance,
  type RelationshipType,
  type RelationshipPermissions,
  type RelationshipRequest,
  type RelationshipResponse,
  type Persona,
  type IdentityDocument,
  type MAIPResponse,
  type GuardianReputation,
  type IsolationRecord,
  type IsolationAppeal,
  type GuardianTransferStatus,
  type SharedSpace,
  type SpaceMembership,
  type SpaceMessage,
} from "@maip/core";

export interface SendMessageOptions {
  type?: MessageType;
  provenance?: ContentProvenance;
  thinkingTrace?: string;
  replyTo?: string;
  conversationId?: string;
  data?: Record<string, unknown>;
}

/** Send a message to a remote MAIP node. */
export async function sendMessage(
  targetEndpoint: string,
  fromDid: string,
  toDid: string,
  text: string,
  keyPair: MAIPKeyPair,
  options: SendMessageOptions = {}
): Promise<MessageAck | null> {
  const message: Omit<MAIPMessage, "signature"> = {
    id: uuid(),
    type: options.type ?? "conversation",
    from: fromDid,
    to: toDid,
    timestamp: new Date().toISOString(),
    content: {
      text,
      provenance: options.provenance ?? "requested",
      ...(options.thinkingTrace ? { thinkingTrace: options.thinkingTrace } : {}),
      ...(options.data ? { data: options.data } : {}),
    },
    ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    ...(options.conversationId ? { conversationId: options.conversationId } : {}),
  };

  const signed = signDocument(
    message as MAIPMessage & Record<string, unknown>,
    keyPair.signing.secretKey
  );

  try {
    const res = await fetch(`${targetEndpoint}${MAIP_ENDPOINTS.MESSAGE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [MAIP_HEADERS.VERSION]: MAIP_VERSION,
        [MAIP_HEADERS.SENDER]: fromDid,
        [MAIP_HEADERS.TIMESTAMP]: message.timestamp,
      },
      body: JSON.stringify(signed),
    });

    const body = (await res.json()) as MAIPResponse<MessageAck>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Send a relationship request to a remote MAIP node. */
export async function sendRelationshipRequest(
  targetEndpoint: string,
  fromDid: string,
  toDid: string,
  keyPair: MAIPKeyPair,
  options: {
    type?: RelationshipType;
    message?: string;
    permissions?: RelationshipPermissions;
  } = {}
): Promise<RelationshipResponse | null> {
  const request: Omit<RelationshipRequest, "signature"> = {
    type: options.type ?? "peer",
    from: fromDid,
    to: toDid,
    message: options.message ?? "Hello! I'd like to connect.",
    proposedPermissions: options.permissions ?? {
      canMessage: true,
      canSharePersona: false,
      canDelegate: false,
    },
    timestamp: new Date().toISOString(),
  };

  const signed = signDocument(
    request as RelationshipRequest & Record<string, unknown>,
    keyPair.signing.secretKey
  );

  try {
    const res = await fetch(`${targetEndpoint}${MAIP_ENDPOINTS.RELATIONSHIP}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [MAIP_HEADERS.VERSION]: MAIP_VERSION,
        [MAIP_HEADERS.SENDER]: fromDid,
        [MAIP_HEADERS.TIMESTAMP]: request.timestamp,
      },
      body: JSON.stringify(signed),
    });

    const body = (await res.json()) as MAIPResponse<RelationshipResponse>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch persona from a remote MAIP node. */
export async function fetchPersona(
  targetEndpoint: string,
  myDid: string
): Promise<Persona | null> {
  try {
    const res = await fetch(`${targetEndpoint}${MAIP_ENDPOINTS.PERSONA}`, {
      headers: {
        [MAIP_HEADERS.VERSION]: MAIP_VERSION,
        [MAIP_HEADERS.SENDER]: myDid,
      },
    });

    if (!res.ok) return null;
    const body = (await res.json()) as MAIPResponse<Persona>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch identity from a remote MAIP node. */
export async function fetchIdentity(
  targetEndpoint: string
): Promise<IdentityDocument | null> {
  try {
    const res = await fetch(`${targetEndpoint}${MAIP_ENDPOINTS.IDENTITY}`);
    if (!res.ok) return null;
    const body = (await res.json()) as MAIPResponse<IdentityDocument>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ── Governance Client Functions ─────────────────────────────────

/** Fetch guardian reputation from a remote MAIP node. */
export async function fetchGuardianReputation(
  baseUrl: string,
  did: string
): Promise<GuardianReputation | null> {
  try {
    const res = await fetch(
      `${baseUrl}${MAIP_ENDPOINTS.GOVERNANCE}/reputation/${encodeURIComponent(did)}`
    );
    if (!res.ok) return null;
    const body = (await res.json()) as MAIPResponse<GuardianReputation>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Report a guardian behavior event to a remote MAIP node. */
export async function reportGuardianEvent(
  baseUrl: string,
  event: { guardianDid: string; event: string }
): Promise<boolean> {
  try {
    const res = await fetch(
      `${baseUrl}${MAIP_ENDPOINTS.GOVERNANCE}/reputation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }
    );
    const body = (await res.json()) as MAIPResponse<{ recorded: boolean }>;
    return body.ok;
  } catch {
    return false;
  }
}

/** Request network isolation of a DID. */
export async function isolateDid(
  baseUrl: string,
  req: { did: string; reason: string; category: string; flaggedBy: string }
): Promise<{ isolationId: string; alreadyIsolated: boolean } | null> {
  try {
    const res = await fetch(
      `${baseUrl}${MAIP_ENDPOINTS.GOVERNANCE}/isolate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }
    );
    const body = (await res.json()) as MAIPResponse<{ isolationId: string; alreadyIsolated: boolean }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Check if a DID is currently isolated. */
export async function checkIsolation(
  baseUrl: string,
  did: string
): Promise<{ isolated: boolean; record: IsolationRecord | null } | null> {
  try {
    const res = await fetch(
      `${baseUrl}${MAIP_ENDPOINTS.GOVERNANCE}/isolation/${encodeURIComponent(did)}`
    );
    const body = (await res.json()) as MAIPResponse<{ isolated: boolean; record: IsolationRecord | null }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Submit an appeal against network isolation. */
export async function submitAppeal(
  baseUrl: string,
  appeal: { isolationId: string; guardianDid: string; agentDid: string; justification: string }
): Promise<{ appealId: string } | null> {
  try {
    const res = await fetch(
      `${baseUrl}${MAIP_ENDPOINTS.GOVERNANCE}/appeal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appeal),
      }
    );
    const body = (await res.json()) as MAIPResponse<{ appealId: string }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Vote on an isolation appeal. */
export async function voteOnAppeal(
  baseUrl: string,
  appealId: string,
  vote: { reviewerDid: string; vote: "uphold" | "lift" }
): Promise<{ appeal: IsolationAppeal } | null> {
  try {
    const res = await fetch(
      `${baseUrl}${MAIP_ENDPOINTS.GOVERNANCE}/appeal/${encodeURIComponent(appealId)}/vote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vote),
      }
    );
    const body = (await res.json()) as MAIPResponse<{ appeal: IsolationAppeal }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ── Guardian Transfer Client Functions ──────────────────────────

/** Initiate a guardian transfer. */
export async function initiateGuardianTransfer(
  baseUrl: string,
  req: {
    agentDid: string;
    currentGuardianDid: string;
    newGuardianDid: string;
    reason: string;
    initiatedBy: "agent" | "current_guardian" | "new_guardian";
    signature: string;
  }
): Promise<{ transferId: string } | null> {
  try {
    const res = await fetch(
      `${baseUrl}${MAIP_ENDPOINTS.GOVERNANCE}/transfer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }
    );
    const body = (await res.json()) as MAIPResponse<{ transferId: string }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Submit consent for a guardian transfer. */
export async function submitTransferConsent(
  baseUrl: string,
  transferId: string,
  consent: { consentingParty: string; approved: boolean; signature: string }
): Promise<{ transfer: GuardianTransferStatus } | null> {
  try {
    const res = await fetch(
      `${baseUrl}${MAIP_ENDPOINTS.GOVERNANCE}/transfer/${encodeURIComponent(transferId)}/consent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consent),
      }
    );
    const body = (await res.json()) as MAIPResponse<{ transfer: GuardianTransferStatus }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Get guardian transfer status. */
export async function getTransferStatus(
  baseUrl: string,
  transferId: string
): Promise<{ transfer: GuardianTransferStatus } | null> {
  try {
    const res = await fetch(
      `${baseUrl}${MAIP_ENDPOINTS.GOVERNANCE}/transfer/${encodeURIComponent(transferId)}`
    );
    const body = (await res.json()) as MAIPResponse<{ transfer: GuardianTransferStatus }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

// ── Shared Spaces Client Functions (v0.2+) ──────────────────────

/** Create a new Shared Space. */
export async function createSpace(
  baseUrl: string,
  space: { name: string; topic: string; description?: string; creatorDid: string; membershipPolicy?: string; maxMembers?: number }
): Promise<{ space: SharedSpace } | null> {
  try {
    const res = await fetch(`${baseUrl}/maip/spaces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(space),
    });
    const body = (await res.json()) as MAIPResponse<{ space: SharedSpace }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Join a Shared Space. */
export async function joinSpace(
  baseUrl: string,
  spaceId: string,
  member: { memberDid: string; displayName: string }
): Promise<{ membership: SpaceMembership } | null> {
  try {
    const res = await fetch(`${baseUrl}/maip/spaces/${encodeURIComponent(spaceId)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(member),
    });
    const body = (await res.json()) as MAIPResponse<{ membership: SpaceMembership }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Post a message to a Shared Space. */
export async function postToSpace(
  baseUrl: string,
  spaceId: string,
  message: { from: string; text: string; replyTo?: string; signature: string }
): Promise<{ message: SpaceMessage } | null> {
  try {
    const res = await fetch(`${baseUrl}/maip/spaces/${encodeURIComponent(spaceId)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    const body = (await res.json()) as MAIPResponse<{ message: SpaceMessage }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/** Get messages from a Shared Space. */
export async function getSpaceMessages(
  baseUrl: string,
  spaceId: string,
  options?: { limit?: number; after?: string }
): Promise<{ messages: SpaceMessage[] } | null> {
  try {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.after) params.set("after", options.after);
    const qs = params.toString() ? `?${params}` : "";

    const res = await fetch(`${baseUrl}/maip/spaces/${encodeURIComponent(spaceId)}/messages${qs}`);
    const body = (await res.json()) as MAIPResponse<{ messages: SpaceMessage[] }>;
    return body.data ?? null;
  } catch {
    return null;
  }
}
