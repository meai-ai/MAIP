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
