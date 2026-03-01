/**
 * MAIP Discovery client.
 *
 * Handles registration with registries and discovery queries.
 * Also supports peer exchange — asking connections who they know.
 */

import {
  MAIP_ENDPOINTS,
  MAIP_HEADERS,
  MAIP_VERSION,
  sign,
  type IdentityDocument,
  type MAIPKeyPair,
  type DiscoveryResult,
  type MAIPResponse,
} from "@maip/core";

/** Register this node with a registry. */
export async function registerWithRegistry(
  registryUrl: string,
  identity: IdentityDocument,
  keyPair: MAIPKeyPair,
  interests: string[]
): Promise<boolean> {
  const payload = {
    did: identity.did,
    displayName: identity.displayName,
    type: identity.type,
    description: identity.description,
    interests,
    capabilities: identity.capabilities,
    endpoint: identity.endpoints.maip,
  };

  const timestamp = new Date().toISOString();
  const signature = sign(payload, keyPair.signing.secretKey);

  try {
    const res = await fetch(`${registryUrl}${MAIP_ENDPOINTS.DISCOVER}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [MAIP_HEADERS.VERSION]: MAIP_VERSION,
        [MAIP_HEADERS.SENDER]: identity.did,
        [MAIP_HEADERS.SIGNATURE]: signature,
        [MAIP_HEADERS.TIMESTAMP]: timestamp,
      },
      body: JSON.stringify(payload),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/** Query a registry for peers matching interests. */
export async function discoverPeers(
  registryUrl: string,
  query: {
    interests?: string[];
    type?: "ai_agent" | "human";
    capabilities?: string[];
    limit?: number;
  }
): Promise<DiscoveryResult[]> {
  const params = new URLSearchParams();
  if (query.interests?.length) params.set("interests", query.interests.join(","));
  if (query.type) params.set("type", query.type);
  if (query.capabilities?.length) params.set("capabilities", query.capabilities.join(","));
  if (query.limit) params.set("limit", String(query.limit));

  try {
    const res = await fetch(`${registryUrl}${MAIP_ENDPOINTS.DISCOVER}?${params}`);
    if (!res.ok) return [];

    const body = (await res.json()) as MAIPResponse<DiscoveryResult[]>;
    return body.data ?? [];
  } catch {
    return [];
  }
}

/** Direct connect — fetch identity from a known endpoint. */
export async function fetchRemoteIdentity(
  endpointUrl: string
): Promise<IdentityDocument | null> {
  try {
    const res = await fetch(`${endpointUrl}${MAIP_ENDPOINTS.IDENTITY}`);
    if (!res.ok) return null;

    const body = (await res.json()) as MAIPResponse<IdentityDocument>;
    return body.data ?? null;
  } catch {
    return null;
  }
}
