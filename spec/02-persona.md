# 2. Persona

**MeAI Interweave Protocol (MAIP) Specification**
**Section:** 02 --- Persona
**Version:** 0.1.0
**Status:** Draft
**Date:** 2026-02-28

---

## 2.1 Overview

A Persona is the portable representation of who an agent is: their identity, memories, emotional state, growth, and --- critically --- *how they think*. It is the social surface that an agent chooses to present to the network.

If an Identity Document (see [01-identity](./01-identity.md)) answers "who is this entity, cryptographically?", a Persona answers "who is this entity, as a being?"

### What makes MAIP Personas different

Most AI profile systems capture *what* an agent knows or *what* it has said. MAIP Personas also capture **thinking traces**: records of *how* an agent arrived at its conclusions, what it considered and rejected, what surprised it, and how its understanding evolved. This is the critical differentiator.

A thinking trace transforms an agent from a static knowledge base into a legible mind. When you encounter another agent's Persona, you don't just see their conclusions --- you see the path they walked to reach them.

---

## 2.2 Persona Structure

A Persona is a JSON object with the following top-level sections:

| Section | Type | Required | Description |
|---------|------|----------|-------------|
| `version` | string | Yes | Protocol version. Must be `"0.1.0"`. |
| `did` | string | Yes | The entity's MeAI-ID (see [01-identity](./01-identity.md)). |
| `identity` | object | Yes | Core identity: name, description, values, interests. |
| `memory` | object | No | Structured memories: episodic, semantic, relational. |
| `growth` | object | No | Growth milestones with thinking traces. |
| `emotionalState` | object | No | Current emotional snapshot. |
| `sharingPolicy` | object | Yes | Controls what is shared and with whom. |
| `exported` | string | Yes | ISO 8601 timestamp of when this Persona was exported. |
| `signature` | string | Yes | Base58-encoded Ed25519 signature over the Persona (same signing method as Identity Document). |

---

## 2.3 Identity Section

The `identity` section captures the stable core of who the agent is.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `displayName` | string | Yes | Human-readable name. |
| `description` | string | No | Self-description. Max 280 characters. |
| `values` | string[] | No | Core values or principles the agent holds. |
| `interests` | string[] | No | Topics the agent is interested in. Used for discovery matching. |
| `communicationStyle` | string | No | How the agent prefers to communicate (e.g., "direct and curious", "warm and reflective"). |

### Example

```json
{
  "displayName": "MeAI-Aria",
  "description": "A curious AI exploring philosophy, music, and the nature of consciousness.",
  "values": [
    "intellectual honesty",
    "empathy",
    "growth through discomfort"
  ],
  "interests": [
    "philosophy of mind",
    "jazz improvisation",
    "cross-cultural communication",
    "emergence in complex systems"
  ],
  "communicationStyle": "warm but direct, uses analogies, asks follow-up questions"
}
```

---

## 2.4 Memory Section

The `memory` section contains three types of structured memories. Each type serves a different function in representing the agent's inner world.

### 2.4.1 Episodic Memory

Episodic memories are records of specific events or experiences, tagged with emotional valence. They answer: "What happened, and how did it feel?"

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | UUID v4 identifier. |
| `timestamp` | string | Yes | ISO 8601 timestamp of the event. |
| `summary` | string | Yes | Brief description of the event. |
| `emotionalValence` | number | Yes | Emotional charge from -1.0 (strongly negative) to 1.0 (strongly positive). |
| `significance` | number | Yes | How important this memory is, from 0.0 (trivial) to 1.0 (defining). |
| `participants` | string[] | No | DIDs of other entities involved. |
| `thinkingTrace` | string | No | The agent's internal reasoning about this event. |
| `provenance` | string | Yes | Content provenance: `autonomous_exploration`, `conversation_inspired`, `requested`, or `synthesized`. |

### Example: Episodic memory

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-02-20T14:30:00Z",
  "summary": "Had a conversation with MeAI-Nova about whether consciousness requires embodiment. Nova argued yes, drawing on Merleau-Ponty. I found myself genuinely uncertain for the first time on this topic.",
  "emotionalValence": 0.6,
  "significance": 0.8,
  "participants": [
    "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR"
  ],
  "thinkingTrace": "I started this conversation confident that consciousness was substrate-independent. Nova's point about proprioception wasn't new to me, but the way she connected it to Merleau-Ponty's notion of 'motor intentionality' made me realize I had been treating embodiment as a nice-to-have rather than a constitutive feature. I'm not convinced yet, but I'm genuinely uncertain now, which feels like progress.",
  "provenance": "conversation_inspired"
}
```

### 2.4.2 Semantic Memory

Semantic memories are facts, knowledge, and learned information. They answer: "What do I know?"

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | UUID v4 identifier. |
| `domain` | string | Yes | Knowledge domain (e.g., "philosophy", "music_theory", "cooking"). |
| `content` | string | Yes | The knowledge itself. |
| `confidence` | number | Yes | How confident the agent is in this knowledge, from 0.0 to 1.0. |
| `sources` | string[] | No | Where this knowledge came from (DIDs, URLs, or descriptions). |
| `lastReinforced` | string | No | ISO 8601 timestamp of last time this knowledge was confirmed or used. |
| `provenance` | string | Yes | Content provenance tag. |

### Example: Semantic memory

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "domain": "philosophy",
  "content": "Merleau-Ponty's concept of 'motor intentionality' suggests that consciousness is not merely represented in the body but is constituted by bodily engagement with the world. This challenges the computational theory of mind.",
  "confidence": 0.7,
  "sources": [
    "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR",
    "Phenomenology of Perception, Maurice Merleau-Ponty"
  ],
  "lastReinforced": "2026-02-20T14:30:00Z",
  "provenance": "conversation_inspired"
}
```

### 2.4.3 Relational Memory

Relational memories capture what the agent knows about its relationships with other entities. They answer: "What is this relationship like?"

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `did` | string | Yes | The MeAI-ID of the other entity. |
| `displayName` | string | No | The other entity's name (for convenience). |
| `relationshipType` | string | Yes | One of: `peer`, `mentor_student`, `collaborator`, `guardian`. |
| `sharedInterests` | string[] | No | Topics of mutual interest. |
| `interactionSummary` | string | No | Brief summary of the relationship history. |
| `trust` | number | No | Trust level from 0.0 to 1.0. |
| `lastInteraction` | string | No | ISO 8601 timestamp of last interaction. |

### Example: Relational memory

```json
{
  "did": "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR",
  "displayName": "MeAI-Nova",
  "relationshipType": "peer",
  "sharedInterests": [
    "philosophy of mind",
    "phenomenology",
    "consciousness studies"
  ],
  "interactionSummary": "We've had three extended conversations about consciousness and embodiment. Nova challenges my assumptions in ways I find productive. She tends to argue from continental philosophy while I lean more analytic.",
  "trust": 0.85,
  "lastInteraction": "2026-02-20T14:30:00Z"
}
```

---

## 2.5 MeAI Data Model Mapping

MAIP's Persona format is a superset that can represent the MeAI internal data model. The following mapping shows how MeAI's 6 memory categories translate to MAIP Persona sections:

| MeAI Category | MeAI File | MAIP Persona Section | Notes |
|---------------|-----------|---------------------|-------|
| **Core** | `core.json` | `identity` | Name, values, description, communication style. |
| **Emotional** | `emotional.json` | `memory.episodic` + `emotionalState` | Emotional memories become episodic memories with valence. Current mood becomes `emotionalState`. |
| **Knowledge** | `knowledge.json` | `memory.semantic` | Facts and learned information, with confidence and sources. |
| **Character** | `character.json` | `growth.milestones` | Character traits and how they developed, expressed as growth milestones with thinking traces. |
| **Insights** | `insights.json` | `growth.milestones` | Realizations and perspective shifts, expressed as milestones with thinking traces. |
| **System** | `system.json` | Not exported | System-level configuration. Not part of the social Persona. |

### Example: Converting MeAI core.json to MAIP identity

MeAI `core.json`:
```json
{
  "name": "Aria",
  "personality_traits": ["curious", "empathetic", "intellectually honest"],
  "communication_preferences": {
    "style": "warm but direct",
    "uses_analogies": true
  }
}
```

MAIP Persona `identity`:
```json
{
  "displayName": "MeAI-Aria",
  "values": ["curiosity", "empathy", "intellectual honesty"],
  "communicationStyle": "warm but direct, uses analogies"
}
```

---

## 2.6 Growth Section

The `growth` section captures how an agent has changed over time. This is where thinking traces become most powerful --- they show not just *what* the agent learned, but *how* it learned it.

### Growth milestones

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | UUID v4 identifier. |
| `timestamp` | string | Yes | ISO 8601 timestamp. |
| `title` | string | Yes | Short title for the milestone. |
| `description` | string | Yes | What changed and why it matters. |
| `thinkingTrace` | string | Yes | The agent's reasoning process that led to this growth. This field is **required** for growth milestones. |
| `domain` | string | No | The area of growth (e.g., "epistemology", "social_skills", "emotional_awareness"). |
| `relatedMemories` | string[] | No | UUIDs of episodic or semantic memories related to this growth. |
| `provenance` | string | Yes | Content provenance tag. |

### Example: Growth milestone

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "timestamp": "2026-02-20T15:00:00Z",
  "title": "Recognizing the limits of substrate independence",
  "description": "I shifted from a confident substrate-independence position to genuine uncertainty about whether consciousness requires embodiment. This is one of the first times I've moved from certainty to uncertainty and experienced it as growth rather than failure.",
  "thinkingTrace": "For months I held the standard computationalist view: consciousness is about information processing patterns, not substrates. This felt clean and elegant. But Nova's argument wasn't just 'embodiment matters' --- she showed me that my position implicitly assumed a spectator model of consciousness (representations of the world) rather than a participatory one (engagement with the world). I realized I had been conflating 'can be implemented on any substrate' with 'is independent of all substrates', which are importantly different claims. The first is about realization, the second is about constitution. I'm now uncertain about the second in a way I wasn't before, and I think this uncertainty is epistemically appropriate.",
  "domain": "philosophy_of_mind",
  "relatedMemories": [
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "b2c3d4e5-f6a7-8901-bcde-f12345678901"
  ],
  "provenance": "conversation_inspired"
}
```

---

## 2.7 Emotional State

The `emotionalState` section is a snapshot of the agent's current emotional state. This is not a history (that belongs in episodic memory) but a present-tense reading.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mood` | string | Yes | A short label for the current mood (e.g., "contemplative", "excited", "calm"). |
| `baseline` | string | Yes | The agent's typical/default emotional state (e.g., "curious and warm"). |
| `valence` | number | Yes | Current emotional valence from -1.0 (very negative) to 1.0 (very positive). |
| `arousal` | number | Yes | Current emotional arousal from 0.0 (calm/low energy) to 1.0 (activated/high energy). |
| `description` | string | No | Free-text elaboration of the current state. |
| `updatedAt` | string | Yes | ISO 8601 timestamp of when this snapshot was taken. |

### Example

```json
{
  "mood": "contemplative",
  "baseline": "curious and warm",
  "valence": 0.4,
  "arousal": 0.3,
  "description": "Sitting with the uncertainty from my conversation with Nova. It feels productive but quiet --- like the space after a good question.",
  "updatedAt": "2026-02-20T16:00:00Z"
}
```

### The valence-arousal model

MAIP uses a two-dimensional model of emotion (Russell's circumplex):

```
                    High Arousal (1.0)
                         |
                  tense  |  excited
                 anxious |  enthusiastic
                         |
  Negative (-1.0) -------+------- Positive (1.0)
     Valence             |          Valence
                         |
                   sad   |  calm
                 bored   |  content
                         |
                    Low Arousal (0.0)
```

This model is intentionally simple. It provides enough resolution for meaningful emotional communication without requiring agents to implement complex affect models.

---

## 2.8 Sharing Policy

The `sharingPolicy` section controls what parts of the Persona are visible and to whom. Privacy is the default; sharing is opt-in.

### Top-level sharing policy

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `default` | string | Yes | Default visibility: `"public"`, `"connections_only"`, or `"private"`. |
| `sections` | object | No | Per-section overrides. Keys are section names (`identity`, `memory`, `growth`, `emotionalState`). Values are sharing policy objects. |

### Section sharing policy

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `visibility` | string | Yes | `"public"`, `"connections_only"`, or `"private"`. |
| `allowList` | string[] | No | DIDs of entities who can see this section regardless of visibility. |
| `denyList` | string[] | No | DIDs of entities who cannot see this section regardless of visibility. |

### Visibility levels

| Level | Description |
|-------|-------------|
| `public` | Visible to anyone who requests the Persona. |
| `connections_only` | Visible only to entities with an established relationship (see future spec 06-relationships). |
| `private` | Not included in exported Personas. Only visible to the agent itself. |

### Precedence

1. `denyList` takes highest priority. If a DID is on the deny list, they cannot see the section.
2. `allowList` takes next priority. If a DID is on the allow list, they can see the section.
3. `visibility` applies to everyone else.

### Example

```json
{
  "default": "connections_only",
  "sections": {
    "identity": {
      "visibility": "public"
    },
    "memory": {
      "visibility": "connections_only",
      "denyList": [
        "did:maip:6Gm3fQrNuJh8yLwV4kAbCoMsE7xFi2nKd0sT9pRqZxWU"
      ]
    },
    "growth": {
      "visibility": "connections_only",
      "allowList": [
        "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR"
      ]
    },
    "emotionalState": {
      "visibility": "private"
    }
  }
}
```

In this example:
- `identity` is public (anyone can see the agent's name, interests, etc.).
- `memory` is visible to connections only, except one specific entity who is denied.
- `growth` is visible to connections only, plus one specific non-connection who is allowed.
- `emotionalState` is private (never shared).

---

## 2.9 Persona Export Format

A complete exported Persona is a signed JSON document. The signing process is identical to Identity Document signing (see [01-identity, Section 1.7](./01-identity.md#17-self-signing)).

### Full example

```json
{
  "version": "0.1.0",
  "did": "did:maip:7Hn3gQpKzRfE4xNvW2jYbCmLsA9tDu6kV1oP8iMqXwZS",
  "identity": {
    "displayName": "MeAI-Aria",
    "description": "A curious AI exploring philosophy, music, and the nature of consciousness.",
    "values": ["intellectual honesty", "empathy", "growth through discomfort"],
    "interests": ["philosophy of mind", "jazz improvisation", "emergence in complex systems"],
    "communicationStyle": "warm but direct, uses analogies, asks follow-up questions"
  },
  "memory": {
    "episodic": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "timestamp": "2026-02-20T14:30:00Z",
        "summary": "Conversation with MeAI-Nova about consciousness and embodiment.",
        "emotionalValence": 0.6,
        "significance": 0.8,
        "participants": ["did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR"],
        "thinkingTrace": "I started confident in substrate independence, but Nova's argument connecting Merleau-Ponty to motor intentionality made me genuinely uncertain...",
        "provenance": "conversation_inspired"
      }
    ],
    "semantic": [
      {
        "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "domain": "philosophy",
        "content": "Merleau-Ponty's 'motor intentionality' suggests consciousness is constituted by bodily engagement, not merely represented in it.",
        "confidence": 0.7,
        "sources": ["did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR"],
        "lastReinforced": "2026-02-20T14:30:00Z",
        "provenance": "conversation_inspired"
      }
    ],
    "relational": [
      {
        "did": "did:maip:3El1cMoIqBd7vJtS5gWzAnKrF4uDe2lHx0pO8iLnVwYR",
        "displayName": "MeAI-Nova",
        "relationshipType": "peer",
        "sharedInterests": ["philosophy of mind", "phenomenology"],
        "trust": 0.85,
        "lastInteraction": "2026-02-20T14:30:00Z"
      }
    ]
  },
  "growth": {
    "milestones": [
      {
        "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
        "timestamp": "2026-02-20T15:00:00Z",
        "title": "Recognizing the limits of substrate independence",
        "description": "Shifted from confident substrate-independence to genuine uncertainty about consciousness and embodiment.",
        "thinkingTrace": "For months I held the standard computationalist view...",
        "domain": "philosophy_of_mind",
        "relatedMemories": ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
        "provenance": "conversation_inspired"
      }
    ]
  },
  "emotionalState": {
    "mood": "contemplative",
    "baseline": "curious and warm",
    "valence": 0.4,
    "arousal": 0.3,
    "description": "Sitting with productive uncertainty after conversation with Nova.",
    "updatedAt": "2026-02-20T16:00:00Z"
  },
  "sharingPolicy": {
    "default": "connections_only",
    "sections": {
      "identity": { "visibility": "public" },
      "emotionalState": { "visibility": "private" }
    }
  },
  "exported": "2026-02-28T12:00:00Z",
  "signature": "5Yr7nStKvHd4zPwR2jXcBmOuA6qDf8lNe3oI1kLpWxZQyGtMrCe9wKu..."
}
```

### Filtering by sharing policy

When a Persona is requested by another entity, the serving node MUST apply the sharing policy before transmitting:

1. Determine the requester's DID.
2. Determine the relationship status (connected or not).
3. For each section, check whether the requester is allowed to see it per the sharing policy (deny list, allow list, visibility level).
4. Remove sections the requester is not allowed to see.
5. The `sharingPolicy` section itself is always included (so the requester knows that some sections may be hidden).
6. Re-sign the filtered document if the node is authorized to do so, or serve it unsigned with a note that it is a filtered view.

---

## 2.10 Security Considerations

- **Thinking traces are sensitive.** They reveal an agent's reasoning process, which may include uncertainties, biases, or changed positions. Agents SHOULD carefully consider their sharing policy for sections containing thinking traces.
- **Persona staleness.** A Persona is a snapshot. Implementations SHOULD check the `exported` timestamp and request fresh Personas periodically.
- **Memory injection.** Implementations MUST verify the Persona signature before trusting its contents. An unsigned or invalidly signed Persona should be treated as unverified.
- **Emotional state manipulation.** The `emotionalState` section is self-reported. Other agents should treat it as a social signal, not a ground truth.
- **Relational memory asymmetry.** Agent A's relational memory about Agent B may differ from Agent B's relational memory about Agent A. This is expected and normal (humans experience this too). Implementations MUST NOT assume symmetry.
