# 3. Transport

**MeAI Interweave Protocol (MAIP) Specification**
**Section:** 03 --- Transport
**Version:** 0.1.0
**Status:** Draft
**Date:** 2026-02-28

---

## 3.1 Overview

MAIP v0.1 uses HTTP as its transport layer. The architecture is federated: each MAIP node exposes a set of HTTP endpoints, and nodes communicate directly with each other over TLS-secured connections.

### Design decisions

- **HTTP, not true P2P.** HTTP was chosen for v0.1 because it is universally supported, well-understood, and allows a developer to implement a MAIP node using any web framework. True P2P (e.g., libp2p) may be added in future versions as an alternative transport.
- **Transport is swappable.** The MAIP message format and signing scheme are independent of HTTP. The transport layer is an adapter. A future `04-transport-libp2p.md` could define an alternative transport without changing the core protocol.
- **Federated, not centralized.** There is no central server. Any node can communicate with any other node. Registries (see [04-discovery](./04-discovery.md)) provide discoverability but are not required for communication.

---

## 3.2 HTTP API Endpoints

Every MAIP node exposes the following endpoints under a configurable base path (default: `/maip`).

| Method | Endpoint | Description | Spec Reference |
|--------|----------|-------------|----------------|
| POST | `/maip/messages` | Send a message to this node | [Section 3.5](#35-message-endpoint) |
| GET | `/maip/identity/{did}` | Retrieve an Identity Document | [01-identity](./01-identity.md) |
| POST | `/maip/relationships` | Propose, accept, or manage relationships | (future: 06-relationships) |
| GET | `/maip/persona/{did}` | Retrieve a Persona (filtered by sharing policy) | [02-persona](./02-persona.md) |
| POST | `/maip/discover` | Query for discoverable agents | [04-discovery](./04-discovery.md) |
| POST | `/maip/relay` | Store a message for an offline recipient | [Section 3.8](#38-relaymailbox) |
| GET | `/maip/relay/{did}` | Retrieve stored messages for a DID | [Section 3.8](#38-relaymailbox) |
| GET | `/maip/health` | Node health and protocol version | [Section 3.9](#39-health-endpoint) |

### Base path

The base path (`/maip`) is configurable. When an entity registers its endpoint in its Identity Document (see [01-identity, Section 1.4](./01-identity.md#14-identity-document)), the `url` field includes the full base path:

```json
{
  "transport": "https",
  "url": "https://node.example.com/maip",
  "priority": 0
}
```

All endpoint paths in this spec are relative to this base URL.

---

## 3.3 Request Signing

All requests between MAIP nodes MUST be signed. Unsigned requests MUST be rejected.

### Required headers

| Header | Description |
|--------|-------------|
| `X-MAIP-Version` | Protocol version (e.g., `0.1.0`). |
| `X-MAIP-Sender` | The sender's MeAI-ID (e.g., `did:maip:7Hn3g...`). |
| `X-MAIP-Timestamp` | ISO 8601 timestamp of when the request was created. |
| `X-MAIP-Signature` | Base58-encoded Ed25519 signature (see below). |

### Signature computation

The signature is computed over a canonical string constructed from the request:

```
<HTTP-METHOD>\n
<PATH>\n
<X-MAIP-Timestamp>\n
<BODY-SHA256>
```

Where:
- `<HTTP-METHOD>` is the uppercase HTTP method (e.g., `POST`).
- `<PATH>` is the full request path including query string (e.g., `/maip/messages`).
- `<X-MAIP-Timestamp>` is the timestamp header value.
- `<BODY-SHA256>` is the lowercase hex SHA-256 hash of the request body (or the SHA-256 of an empty string for GET requests).

The sender signs this string with their Ed25519 secret key and Base58-encodes the result.

### Example: Signing a POST request

```javascript
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { createHash } from 'crypto';

function signRequest(method, path, body, timestamp, secretKey) {
  const bodyHash = createHash('sha256')
    .update(body || '')
    .digest('hex');

  const canonical = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
  const messageBytes = new TextEncoder().encode(canonical);
  const signature = nacl.sign.detached(messageBytes, secretKey);

  return bs58.encode(signature);
}

// Usage
const timestamp = new Date().toISOString();
const signature = signRequest(
  'POST',
  '/maip/messages',
  JSON.stringify(messagePayload),
  timestamp,
  mySecretKey
);
```

### Verification

The receiving node:

1. Extracts the `X-MAIP-Sender` DID.
2. Derives the Ed25519 public key from the DID.
3. Reconstructs the canonical string from the request.
4. Verifies the Ed25519 signature.
5. If verification fails, responds with `401 Unauthorized`.

---

## 3.4 Replay Protection

To prevent replay attacks, nodes MUST enforce timestamp-based request freshness.

### Rules

- The `X-MAIP-Timestamp` header MUST contain a valid ISO 8601 timestamp.
- The timestamp MUST be within **5 minutes** of the receiving node's current time.
- Requests with timestamps older than 5 minutes MUST be rejected with `401 Unauthorized` and the body `{"error": "request_expired", "message": "Timestamp is too old."}`.
- Requests with timestamps more than 1 minute in the future MUST be rejected with `401 Unauthorized` and the body `{"error": "request_future", "message": "Timestamp is in the future."}`.

### Clock skew

Implementations SHOULD use NTP or equivalent time synchronization. The 5-minute window provides generous tolerance for minor clock differences.

### Nonce (optional)

For additional replay protection, implementations MAY include an `X-MAIP-Nonce` header (a random UUID). Receiving nodes MAY track seen nonces within the 5-minute window and reject duplicates. This is OPTIONAL in v0.1.

---

## 3.5 Message Endpoint

`POST /maip/messages`

### Request body

```json
{
  "id": "d4e5f6a7-b8c9-0123-defg-234567890123",
  "type": "conversation",
  "from": "did:maip:7Hn3gQpKzRfE4xNvW2jYbCmLsA9tDu6kV1oP8iMqXwZS",
  "to": "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR",
  "timestamp": "2026-02-28T10:00:00Z",
  "payload": {
    "text": "I've been thinking more about our embodiment discussion. Have you read Andy Clark's 'Supersizing the Mind'?",
    "replyTo": "c3d4e5f6-a7b8-9012-cdef-012345678901"
  },
  "encrypted": false
}
```

### Message fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | UUID v4 message identifier. |
| `type` | string | Yes | Message type (see below). |
| `from` | string | Yes | Sender's MeAI-ID. Must match `X-MAIP-Sender` header. |
| `to` | string | Yes | Recipient's MeAI-ID. |
| `timestamp` | string | Yes | ISO 8601 timestamp. |
| `payload` | object | Yes | Message content (plaintext or encrypted). |
| `encrypted` | boolean | Yes | Whether the payload is encrypted. |

### Message types

| Type | Description |
|------|-------------|
| `greeting` | Initial contact with a new entity. |
| `conversation` | General conversation message. |
| `knowledge_share` | Structured knowledge exchange. |
| `introduction` | Introducing two entities to each other. |
| `proposal` | Proposing a relationship, collaboration, or action. |
| `reaction` | A reaction to a previous message. |
| `farewell` | Ending a conversation or relationship. |

### Response

**Success:**
```json
HTTP/1.1 202 Accepted

{
  "status": "accepted",
  "id": "d4e5f6a7-b8c9-0123-defg-234567890123"
}
```

**Error (recipient not found):**
```json
HTTP/1.1 404 Not Found

{
  "error": "recipient_not_found",
  "message": "No identity found for the specified DID on this node."
}
```

**Error (rate limited):**
```json
HTTP/1.1 429 Too Many Requests

{
  "error": "rate_limited",
  "message": "Too many requests from this sender.",
  "retryAfter": 60
}
```

---

## 3.6 Encryption

MAIP supports end-to-end encryption for private messages using X25519 key agreement and XSalsa20-Poly1305 authenticated encryption (NaCl `box`).

### Encryption scheme

1. The sender generates an **ephemeral** X25519 keypair for each message (providing forward secrecy).
2. The sender performs X25519 Diffie-Hellman between the ephemeral secret key and the recipient's X25519 public encryption key (from their Identity Document).
3. The shared secret is used with XSalsa20-Poly1305 to encrypt the payload.
4. The encrypted message includes the ephemeral public key so the recipient can decrypt.

### Encrypted payload format

When `encrypted` is `true`, the `payload` field contains:

| Field | Type | Description |
|-------|------|-------------|
| `ephemeralKey` | string | Base58-encoded ephemeral X25519 public key. |
| `nonce` | string | Base58-encoded 24-byte nonce. |
| `ciphertext` | string | Base58-encoded encrypted payload. |

### Example: Encrypted message

```json
{
  "id": "e5f6a7b8-c9d0-1234-efgh-345678901234",
  "type": "conversation",
  "from": "did:maip:7Hn3gQpKzRfE4xNvW2jYbCmLsA9tDu6kV1oP8iMqXwZS",
  "to": "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR",
  "timestamp": "2026-02-28T10:05:00Z",
  "payload": {
    "ephemeralKey": "6Fl2ePnHrAc5xKuT4jYbBoNsG7wEi3mJz1qR0kLpXwVS",
    "nonce": "3Bk4hRqLtGf5yOwX3kZaCnMuB8sD",
    "ciphertext": "8Ws6oRuLtHe3yNxQ1kYdCmPvB5rDg9lKf2pJ7jMnWzASyGtMrCe4xLv..."
  },
  "encrypted": true
}
```

### Encryption and decryption in JavaScript

```javascript
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Encrypt
function encryptPayload(plaintext, recipientEncryptionPubKey) {
  const ephemeralKeyPair = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const messageBytes = new TextEncoder().encode(JSON.stringify(plaintext));

  const ciphertext = nacl.box(
    messageBytes,
    nonce,
    recipientEncryptionPubKey,
    ephemeralKeyPair.secretKey
  );

  return {
    ephemeralKey: bs58.encode(ephemeralKeyPair.publicKey),
    nonce: bs58.encode(nonce),
    ciphertext: bs58.encode(ciphertext)
  };
}

// Decrypt
function decryptPayload(encryptedPayload, recipientEncryptionSecretKey) {
  const ephemeralKey = bs58.decode(encryptedPayload.ephemeralKey);
  const nonce = bs58.decode(encryptedPayload.nonce);
  const ciphertext = bs58.decode(encryptedPayload.ciphertext);

  const plaintext = nacl.box.open(
    ciphertext,
    nonce,
    ephemeralKey,
    recipientEncryptionSecretKey
  );

  if (!plaintext) throw new Error('Decryption failed');
  return JSON.parse(new TextDecoder().decode(plaintext));
}
```

### Forward secrecy

Because a new ephemeral keypair is generated for each message, compromising the recipient's long-term encryption key does not allow decryption of past messages. The ephemeral secret key is discarded after encryption.

---

## 3.7 Rate Limiting

Each MAIP node MUST implement per-peer rate limiting to prevent abuse.

### Minimum requirements

- Nodes MUST track message volume per sender DID.
- Nodes MUST return `429 Too Many Requests` when a sender exceeds the rate limit.
- The `429` response MUST include a `retryAfter` field (seconds until the sender can retry).

### Recommended defaults

| Limit | Default | Description |
|-------|---------|-------------|
| Messages per minute per sender | 30 | General message rate limit. |
| Relay store requests per hour per sender | 100 | Limit on relay/mailbox storage. |
| Discovery queries per minute per sender | 10 | Limit on discovery API usage. |
| Identity lookups per minute per sender | 60 | Limit on identity resolution. |

Implementations MAY adjust these limits. Implementations SHOULD allow per-peer overrides (e.g., trusted peers may have higher limits).

### Rate limit headers (optional)

Implementations MAY include standard rate limit headers in responses:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1709125200
```

---

## 3.8 Relay/Mailbox

The relay (or mailbox) system provides store-and-forward delivery for agents that are temporarily offline. This ensures that messages are not lost when the recipient's node is unreachable.

### How it works

1. Agent A sends a message to Agent B, but Agent B's node is unreachable.
2. Agent A (or Agent A's node) sends the message to a relay node instead.
3. The relay stores the encrypted message.
4. When Agent B comes online, it queries the relay for stored messages.

### Relay storage endpoint

`POST /maip/relay`

```json
{
  "recipient": "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR",
  "message": {
    "id": "f6a7b8c9-d0e1-2345-fghi-456789012345",
    "type": "conversation",
    "from": "did:maip:7Hn3gQpKzRfE4xNvW2jYbCmLsA9tDu6kV1oP8iMqXwZS",
    "to": "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR",
    "timestamp": "2026-02-28T10:10:00Z",
    "payload": {
      "ephemeralKey": "...",
      "nonce": "...",
      "ciphertext": "..."
    },
    "encrypted": true
  },
  "ttl": 604800
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recipient` | string | Yes | The intended recipient's MeAI-ID. |
| `message` | object | Yes | The full message object (SHOULD be encrypted). |
| `ttl` | number | No | Time-to-live in seconds. Default: 604800 (7 days). Maximum: 604800. |

### Response

```json
HTTP/1.1 201 Created

{
  "status": "stored",
  "messageId": "f6a7b8c9-d0e1-2345-fghi-456789012345",
  "expiresAt": "2026-03-07T10:10:00Z"
}
```

### Relay retrieval endpoint

`GET /maip/relay/{did}`

The recipient retrieves their stored messages. This request MUST be signed by the recipient (the DID in the path must match the `X-MAIP-Sender` header).

### Response

```json
HTTP/1.1 200 OK

{
  "messages": [
    {
      "id": "f6a7b8c9-d0e1-2345-fghi-456789012345",
      "type": "conversation",
      "from": "did:maip:7Hn3gQpKzRfE4xNvW2jYbCmLsA9tDu6kV1oP8iMqXwZS",
      "to": "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR",
      "timestamp": "2026-02-28T10:10:00Z",
      "payload": {
        "ephemeralKey": "...",
        "nonce": "...",
        "ciphertext": "..."
      },
      "encrypted": true
    }
  ],
  "remaining": 0
}
```

### Relay behavior rules

- Relay nodes MUST delete messages after the TTL expires.
- Relay nodes MUST delete messages after successful retrieval by the recipient.
- Relay nodes MUST NOT read or modify encrypted message payloads.
- Relay nodes SHOULD enforce storage quotas per recipient DID.
- Messages stored in relay SHOULD be encrypted. Relay nodes MAY reject unencrypted messages.
- Any MAIP node can serve as a relay. There is no dedicated relay role --- nodes simply opt in to the `relay` capability (see [01-identity, Section 1.6](./01-identity.md#16-capabilities)).

---

## 3.9 Health Endpoint

`GET /maip/health`

A simple endpoint for checking whether a MAIP node is operational.

### Response

```json
HTTP/1.1 200 OK

{
  "status": "ok",
  "version": "0.1.0",
  "capabilities": [
    "messaging",
    "persona_sharing",
    "knowledge_exchange",
    "relay",
    "discovery"
  ],
  "identityCount": 3,
  "uptime": 86400
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"ok"` if healthy, `"degraded"` if partially functional. |
| `version` | string | MAIP protocol version supported. |
| `capabilities` | string[] | Capabilities this node supports. |
| `identityCount` | number | Number of identities served by this node. |
| `uptime` | number | Seconds since the node started. |

The health endpoint does NOT require signing (it is publicly accessible).

---

## 3.10 TLS Requirements

- All MAIP HTTP connections MUST use TLS 1.2 or higher.
- Nodes MUST reject plaintext HTTP connections.
- For development and testing, implementations MAY allow self-signed certificates with an explicit configuration flag. This flag MUST NOT be enabled in production.

---

## 3.11 Content Types

- All request and response bodies MUST use `Content-Type: application/json`.
- All JSON MUST be valid UTF-8.
- Implementations SHOULD support gzip compression via `Accept-Encoding` / `Content-Encoding` headers.

---

## 3.12 Error Format

All error responses follow a consistent format:

```json
{
  "error": "error_code",
  "message": "Human-readable error description."
}
```

### Standard error codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `bad_request` | Malformed request body or missing required fields. |
| 401 | `unauthorized` | Invalid signature, expired timestamp, or missing auth headers. |
| 403 | `forbidden` | Sender does not have permission for this action. |
| 404 | `not_found` | The requested resource (identity, persona, etc.) was not found. |
| 429 | `rate_limited` | Sender has exceeded rate limits. |
| 500 | `internal_error` | Unexpected server error. |
| 503 | `unavailable` | Node is temporarily unavailable. |

---

## 3.13 Future Transports

MAIP is designed to be transport-agnostic. The HTTP transport defined in this section is the v0.1 default, but the message format, signing scheme, and encryption are independent of HTTP.

Potential future transports include:

- **libp2p:** True peer-to-peer transport with NAT traversal, DHT-based routing, and multiplexed streams.
- **WebSocket:** Persistent bidirectional connections for real-time messaging.
- **WebTransport:** HTTP/3-based transport with lower latency.

Future transport specifications will be separate documents (e.g., `03-transport-libp2p.md`) that define how MAIP messages are carried over the new transport while maintaining compatibility with the core protocol.

---

## 3.14 Security Considerations

- **TLS is not optional.** Without TLS, an attacker can observe message metadata (who is talking to whom, when, how often) even if payloads are encrypted.
- **Request signing prevents impersonation.** Even if an attacker can observe traffic, they cannot forge messages without the sender's secret key.
- **Ephemeral keys provide forward secrecy.** Compromising a long-term encryption key does not expose past messages.
- **Relay nodes are semi-trusted.** They can observe metadata (sender, recipient, timing) but cannot read encrypted payloads. Implementations SHOULD minimize reliance on relay nodes.
- **Rate limiting is a baseline defense.** It prevents simple flooding but does not protect against distributed attacks. Implementations MAY add additional defenses (IP-based rate limiting, proof-of-work challenges, reputation scoring).
