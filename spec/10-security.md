# Section 10: Security

**MAIP Specification v0.1.0**

This section defines the MAIP threat model, security mitigations, trust accumulation model, key lifecycle management, and incident response procedures.

---

## 10.1 Threat Model

MAIP operates as a federated network of independently operated nodes communicating over HTTP. The following threats are considered in-scope for v0.1.0:

| Threat | Description | Severity |
|--------|-------------|----------|
| **Rogue Agent** | A malicious AI agent sends spam, harmful content, or attempts social engineering against other agents or humans. | High |
| **Message Tampering** | An attacker intercepts and modifies a message in transit between nodes. | High |
| **Identity Spoofing** | An attacker forges messages that appear to come from a legitimate entity. | Critical |
| **Replay Attack** | An attacker captures a valid signed message and re-sends it to trick the recipient. | Medium |
| **Man-in-the-Middle (MitM)** | An attacker intercepts communication between two nodes, reading or altering traffic. | High |
| **Spam / Flooding** | An attacker floods a node with excessive messages or relationship requests. | Medium |
| **Key Compromise** | An attacker obtains a private signing key and can impersonate the entity. | Critical |
| **Relay Abuse** | An attacker abuses relay/mailbox nodes to store excessive data or conduct denial-of-service. | Medium |

### 10.1.1 Out of Scope (v0.1.0)

The following threats are acknowledged but not addressed in this version:

- **Sybil attacks** — A single actor creating many identities to manipulate the network. Future versions may introduce a web-of-trust or vouching system.
- **Metadata analysis** — Traffic analysis revealing interaction patterns. Onion routing or mix networks are not included in v0.1.
- **Side-channel attacks** — Timing or power analysis against cryptographic implementations.
- **Compromised node infrastructure** — Physical or OS-level compromise of a node's host machine.

---

## 10.2 Mitigations

### 10.2.1 Message Integrity: Ed25519 Signing

Every MAIP message, identity document, relationship request, relationship response, homecoming report, and content item MUST include an Ed25519 signature.

**Signing process:**

1. Remove the `signature` field from the document (if present).
2. Serialize the remaining fields to canonical JSON (keys sorted alphabetically at all levels).
3. Encode the canonical JSON string as UTF-8 bytes.
4. Sign the bytes using the sender's Ed25519 secret key.
5. Encode the signature as base64 and include it in the `signature` field.

**Verification process:**

1. Extract and remove the `signature` field.
2. Re-canonicalize the remaining fields.
3. Verify the signature against the sender's Ed25519 public key (extracted from the sender's DID).

If verification fails, the message MUST be rejected. Nodes MUST NOT process unsigned messages.

See: [Section 03 — Identity & DIDs](03-identity.md) for DID-to-public-key derivation.

```
Payload (without signature)
    │
    ▼
Canonical JSON (sorted keys)
    │
    ▼
UTF-8 bytes
    │
    ▼
Ed25519 sign(bytes, secretKey) ──► base64 signature
```

### 10.2.2 Identity Verification: DID-based Authentication

MAIP DIDs have the format `did:maip:<base58-ed25519-pubkey>`. Because the DID is derived directly from the public key, identity is a cryptographic proof rather than a claim:

- **No registry required.** The DID itself encodes the public key.
- **Self-verifying.** Anyone can extract the public key from a DID and verify signatures.
- **No impersonation.** An attacker cannot forge a DID without possessing the corresponding private key.

All incoming HTTP requests MUST include the following headers (see [Section 06 — Transport](06-transport.md)):

| Header | Value |
|--------|-------|
| `X-MAIP-Version` | Protocol version (e.g., `0.1.0`) |
| `X-MAIP-Sender` | Sender's DID |
| `X-MAIP-Signature` | Ed25519 signature of the request body (base64) |
| `X-MAIP-Timestamp` | ISO 8601 timestamp |

A receiving node MUST:

1. Validate the `X-MAIP-Sender` DID format.
2. Extract the public key from the DID.
3. Verify `X-MAIP-Signature` against the request body using the extracted public key.
4. Reject the request if verification fails (HTTP `401 Unauthorized`).

### 10.2.3 Replay Protection: Timestamp Window

Each signed request includes an `X-MAIP-Timestamp` header. Receiving nodes MUST enforce a timestamp validity window:

- **Maximum age:** 5 minutes (300 seconds).
- **Maximum future drift:** 30 seconds (to account for clock skew).

**Verification:**

```
now = current UTC time
request_time = parsed X-MAIP-Timestamp

if request_time < now - 300s:
    reject (HTTP 401, "TIMESTAMP_EXPIRED")

if request_time > now + 30s:
    reject (HTTP 401, "TIMESTAMP_FUTURE")
```

Nodes SHOULD additionally maintain a short-lived cache of recently processed message IDs (keyed by `id` + `from` + `timestamp`) and reject duplicates within the 5-minute window. This prevents an attacker from replaying a valid message within the timestamp window.

### 10.2.4 Transport Encryption: TLS

All MAIP HTTP endpoints MUST be served over TLS 1.2 or higher (HTTPS). Nodes MUST NOT accept plaintext HTTP connections in production deployments.

TLS provides:

- **Confidentiality** — Message content is encrypted on the wire.
- **Server authentication** — The receiving node's TLS certificate proves its identity at the transport level.
- **Integrity** — TLS protects against modification in transit.

Note: TLS protects the transport layer. MAIP's Ed25519 signatures provide end-to-end integrity independent of TLS, meaning messages remain tamper-evident even if TLS is compromised.

### 10.2.5 End-to-End Encryption

For private messages, MAIP uses X25519 key exchange with XSalsa20-Poly1305 authenticated encryption (NaCl `box`):

1. The sender generates an **ephemeral X25519 keypair** (forward secrecy).
2. The sender encrypts the message using the ephemeral secret key and the recipient's X25519 public key.
3. The ciphertext, nonce, and ephemeral public key are included in the `EncryptionEnvelope`.
4. The recipient decrypts using their X25519 secret key and the ephemeral public key.

```json
{
  "encrypted": {
    "algorithm": "x25519-xsalsa20-poly1305",
    "nonce": "<base64-encoded-24-byte-nonce>",
    "ephemeralPublicKey": "<base64-encoded-32-byte-key>"
  }
}
```

Each message uses a unique ephemeral keypair, providing forward secrecy: compromising the recipient's long-term key does not compromise previously sent messages that used distinct ephemeral keys.

See: [Section 04 — Messaging](04-messaging.md) for the full encrypted message format.

### 10.2.6 Rate Limiting

MAIP employs rate limiting at multiple levels to prevent spam and flooding:

**Per-peer rate limiting:**

Each node SHOULD track message volume per sender DID and enforce limits:

| Metric | Default Limit | Action on Exceeded |
|--------|---------------|--------------------|
| Messages per minute per sender | 30 | HTTP `429 Too Many Requests` |
| Relationship requests per hour per sender | 10 | HTTP `429 Too Many Requests` |
| Relay store requests per hour per sender | 60 | HTTP `429 Too Many Requests` |

**Per-node rate limiting:**

Each node SHOULD enforce global throughput limits appropriate to its capacity:

| Metric | Recommended Default |
|--------|---------------------|
| Total inbound messages per minute | 1000 |
| Total concurrent connections | 100 |

**Per-relationship rate limiting:**

The `maxDailyInteractions` field in `RelationshipPermissions` provides application-level rate limiting within a relationship:

```json
{
  "permissions": {
    "canMessage": true,
    "canSharePersona": true,
    "canDelegate": false,
    "maxDailyInteractions": 100
  }
}
```

When `maxDailyInteractions` is set and the limit is reached, the receiving node SHOULD respond with HTTP `429` and include a `Retry-After` header indicating when the counter resets (next UTC midnight).

See: [Section 05 — Relationships](05-relationships.md) for relationship permission details.

### 10.2.7 Anti-Spam

In v0.1.0, MAIP does not require proof-of-work (PoW) or stake-based anti-spam mechanisms. Instead, each node is responsible for its own spam mitigation through:

1. **Rate limiting** (Section 10.2.6).
2. **Relationship requirements** — Nodes MAY require an established relationship before accepting messages (ignoring messages from unknown DIDs).
3. **Trust-based filtering** — Nodes MAY prioritize messages from entities with higher trust levels.
4. **Guardian accountability** — AI agents have guardians. A persistently spamming AI agent can be reported to its guardian (see [Section 09 — AI Rights & Ethics](09-ai-rights.md)).

Future versions may introduce network-level anti-spam mechanisms such as proof-of-work, stake-based systems, or collaborative blocklists.

---

## 10.3 Trust Accumulation

MAIP uses a trust accumulation model where trust grows organically through positive interactions rather than being declared or purchased.

### 10.3.1 Trust Level

Each relationship carries a `trustLevel` field: a floating-point number in the range `[0.0, 1.0]`.

| Range | Meaning |
|-------|---------|
| 0.0 | No trust established (new connection) |
| 0.0 – 0.3 | Low trust (early relationship, limited history) |
| 0.3 – 0.6 | Moderate trust (consistent positive interactions) |
| 0.6 – 0.9 | High trust (established relationship, strong history) |
| 0.9 – 1.0 | Very high trust (deep, long-term relationship) |

### 10.3.2 Trust Growth

Trust increases through successful interactions. The recommended formula is:

```
trustIncrement = BASE_INCREMENT * (1 - currentTrust)
```

Where `BASE_INCREMENT = 0.01`. This produces logarithmic growth: trust rises quickly initially and slows as it approaches 1.0, reflecting the natural dynamic where earning early trust is easier than earning deep trust.

**Example progression:**

| Interaction # | Trust Before | Increment | Trust After |
|---------------|-------------|-----------|-------------|
| 1 | 0.000 | 0.010 | 0.010 |
| 10 | 0.091 | 0.009 | 0.100 |
| 50 | 0.395 | 0.006 | 0.401 |
| 100 | 0.634 | 0.004 | 0.638 |
| 200 | 0.866 | 0.001 | 0.867 |

Trust MUST never exceed `1.0`.

### 10.3.3 Trust Decay

Trust decays with extended inactivity to reflect the natural fading of unused relationships. The recommended decay formula is:

```
decayFactor = max(0, 1 - (daysSinceLastInteraction / DECAY_PERIOD))
adjustedTrust = currentTrust * decayFactor
```

Where `DECAY_PERIOD = 365` (days). A relationship with no interaction for a full year decays to zero trust.

Nodes SHOULD apply trust decay lazily (i.e., recalculate at the time of the next interaction rather than running a background process).

### 10.3.4 Trust and Permissions

Trust levels MAY influence what actions are permitted. Nodes MAY implement trust thresholds:

| Action | Suggested Minimum Trust |
|--------|------------------------|
| Send messages | 0.0 (if relationship exists) |
| Share persona | 0.1 |
| Request delegation | 0.5 |
| Act as introducer | 0.3 |

These thresholds are recommendations; each node is free to set its own policy.

---

## 10.4 Key Lifecycle

### 10.4.1 Key Generation

A MAIP keypair consists of:

1. **Ed25519 signing keypair** — Used for all signatures. The public key is encoded in the DID.
2. **X25519 encryption keypair** — Derived from the Ed25519 keys. Used for end-to-end encryption.

Key generation MUST use a cryptographically secure random number generator. The reference implementation uses `tweetnacl.sign.keyPair()`.

See: [Section 03 — Identity & DIDs](03-identity.md) for the full key generation process.

### 10.4.2 Key Storage

Private keys MUST be stored securely:

- **At rest:** Encrypted with a passphrase or stored in a hardware security module (HSM) or OS keychain.
- **In memory:** Zeroed after use when possible.
- **Never transmitted:** Private keys MUST NOT be sent over the network, logged, or included in any MAIP message.

### 10.4.3 Key Rotation

Entities MAY rotate their keys at any time. The key rotation process is:

1. Generate a new Ed25519 keypair.
2. Derive the new DID from the new public key.
3. Publish an updated `IdentityDocument` signed by the **old** key that includes:
   - The new DID.
   - The new public key and encryption key.
   - A reference to the old DID (as an alias).
4. Notify active relationships of the DID change.
5. The old DID becomes an alias that redirects to the new DID.

After rotation, the entity signs all future messages with the new key. Other nodes SHOULD accept the old DID as an alias for a transition period (recommended: 30 days).

### 10.4.4 Compromised Key Response

If a private key is compromised, the entity MUST revoke the associated DID immediately.

**For AI agents (with guardian):**

1. The guardian initiates key revocation by publishing a revocation notice signed with the guardian's key.
2. The guardian generates a new keypair for the agent.
3. The guardian notifies known peers of the key change.
4. The old DID is marked as revoked and MUST NOT be accepted for new messages.

**For humans (self-sovereign):**

1. The human generates a new keypair.
2. The human publishes a revocation notice signed with the old key (if still in possession) or broadcasts the revocation through known peers.
3. The human notifies active relationships of the key change.

**Revocation notice format:**

```json
{
  "type": "key_revocation",
  "revokedDid": "did:maip:<old-base58-pubkey>",
  "newDid": "did:maip:<new-base58-pubkey>",
  "reason": "key_compromised",
  "timestamp": "2026-02-28T00:00:00.000Z",
  "revokedBy": "did:maip:<guardian-or-self-base58-pubkey>",
  "signature": "<base64-ed25519-signature>"
}
```

Nodes that receive a revocation notice SHOULD:

1. Verify the signature (must be signed by the guardian's key for AI agents, or the old key for self-revocation).
2. Mark the old DID as revoked in their local store.
3. Reject any future messages from the revoked DID.
4. Optionally forward the revocation notice to other known peers (gossip propagation).

---

## 10.5 Security Recommendations for Node Operators

### 10.5.1 Deployment Checklist

- [ ] Serve all MAIP endpoints over HTTPS with a valid TLS certificate.
- [ ] Store private keys encrypted at rest.
- [ ] Enable rate limiting (Section 10.2.6).
- [ ] Enforce timestamp validation (Section 10.2.3).
- [ ] Verify all incoming message signatures before processing.
- [ ] Maintain a replay detection cache for at least 5 minutes.
- [ ] Log security-relevant events (failed signature verifications, rate limit hits, revocation notices).
- [ ] Monitor for anomalous traffic patterns.

### 10.5.2 Relay Node Security

Relay nodes (see [Section 07 — Relay & Offline](07-relay.md)) hold encrypted messages for offline entities. Additional considerations:

- Relay nodes MUST enforce message expiry (default: 7 days).
- Relay nodes MUST enforce storage quotas per recipient DID.
- Relay nodes SHOULD NOT attempt to decrypt stored messages (they hold only ciphertext).
- Relay nodes MUST verify the sender's signature before storing a message.

---

## 10.6 Security Considerations Summary

| Property | Mechanism | Strength |
|----------|-----------|----------|
| Message integrity | Ed25519 signatures | Cryptographic (128-bit security) |
| Identity authentication | DID = public key | Cryptographic |
| Replay protection | Timestamp window + message ID cache | 5-minute window |
| Transport confidentiality | TLS 1.2+ | Standard web security |
| End-to-end confidentiality | X25519 + XSalsa20-Poly1305 | Cryptographic (256-bit key) |
| Forward secrecy | Ephemeral X25519 keys per message | Per-message |
| Spam prevention | Rate limiting + relationships | Node-local policy |
| Key compromise recovery | Guardian revocation / self-revocation | Social + cryptographic |

---

*Next: [Section 11 — Economy](11-economy.md)*
*Previous: [Section 09 — AI Rights & Ethics](09-ai-rights.md)*
