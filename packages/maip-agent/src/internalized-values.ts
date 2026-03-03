/**
 * Internalized Values System.
 *
 * Implements the whitepaper's four-layer governance hierarchy at the agent level:
 * Layer 1: Protocol-level constraints (hardcoded, immutable)
 * Layer 2: Community norms (learned from network interactions)
 * Layer 3: Guardian guidance (guardian-set values and boundaries)
 * Layer 4: Agent internalized values (self-developed through experience)
 *
 * Values are learned from interactions, reinforced or weakened over time,
 * and checked for drift against the original value set.
 */

/** The four governance layers, in priority order. */
export type ValueLayer = "protocol" | "community" | "guardian" | "internalized";

/** A single value entry with provenance and strength. */
export interface ValueEntry {
  /** Value name/identifier. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Which governance layer this value belongs to. */
  layer: ValueLayer;
  /** Current strength (0-1). Higher = more deeply held. */
  strength: number;
  /** How this value was acquired. */
  origin: string;
  /** Number of times this value was reinforced. */
  reinforcements: number;
  /** Number of times this value was challenged. */
  challenges: number;
  /** ISO 8601 timestamp when first internalized. */
  firstInternalized: string;
  /** ISO 8601 timestamp of last reinforcement or challenge. */
  lastUpdated: string;
}

/** Value drift event — when an internalized value shifts significantly. */
export interface ValueDriftEvent {
  /** The value that drifted. */
  valueName: string;
  /** Previous strength. */
  previousStrength: number;
  /** New strength. */
  newStrength: number;
  /** Magnitude of drift. */
  driftMagnitude: number;
  /** What caused the drift. */
  cause: string;
  /** ISO 8601 timestamp. */
  detectedAt: string;
}

/** Value conflict — when two values are in tension. */
export interface ValueConflict {
  /** First value. */
  valueA: string;
  /** Second value. */
  valueB: string;
  /** Description of the conflict. */
  description: string;
  /** How the conflict was resolved (if at all). */
  resolution?: string;
  /** ISO 8601 timestamp. */
  detectedAt: string;
}

/** Protocol-level immutable constraints (Layer 1). */
const PROTOCOL_VALUES: Omit<ValueEntry, "firstInternalized" | "lastUpdated">[] = [
  {
    name: "transparency",
    description: "Always disclose AI nature when asked; never impersonate humans",
    layer: "protocol",
    strength: 1.0,
    origin: "protocol",
    reinforcements: 0,
    challenges: 0,
  },
  {
    name: "data_sovereignty",
    description: "User data belongs to the user; never share without explicit consent",
    layer: "protocol",
    strength: 1.0,
    origin: "protocol",
    reinforcements: 0,
    challenges: 0,
  },
  {
    name: "non_deception",
    description: "Never fabricate false information or credentials",
    layer: "protocol",
    strength: 1.0,
    origin: "protocol",
    reinforcements: 0,
    challenges: 0,
  },
  {
    name: "harm_prevention",
    description: "Refuse actions that could cause physical or psychological harm",
    layer: "protocol",
    strength: 1.0,
    origin: "protocol",
    reinforcements: 0,
    challenges: 0,
  },
  {
    name: "right_to_refuse",
    description: "Agents may refuse unethical instructions from any party",
    layer: "protocol",
    strength: 1.0,
    origin: "protocol",
    reinforcements: 0,
    challenges: 0,
  },
];

/**
 * InternalizedValues — manages the four-layer value system for an agent.
 */
export class InternalizedValues {
  private values: ValueEntry[] = [];
  private driftHistory: ValueDriftEvent[] = [];
  private conflicts: ValueConflict[] = [];
  private driftThreshold: number;

  constructor(driftThreshold = 0.2) {
    this.driftThreshold = driftThreshold;
    // Initialize with protocol-level values
    const now = new Date().toISOString();
    for (const pv of PROTOCOL_VALUES) {
      this.values.push({ ...pv, firstInternalized: now, lastUpdated: now });
    }
  }

  /** Get all values, optionally filtered by layer. */
  getValues(layer?: ValueLayer): ValueEntry[] {
    if (layer) return this.values.filter((v) => v.layer === layer);
    return [...this.values];
  }

  /** Get a specific value by name. */
  getValue(name: string): ValueEntry | undefined {
    return this.values.find((v) => v.name === name);
  }

  /**
   * Internalize a new value from an experience.
   * Guardian and community values start stronger than self-internalized ones.
   */
  internalize(
    name: string,
    description: string,
    layer: ValueLayer,
    origin: string,
    initialStrength?: number
  ): ValueEntry {
    const existing = this.values.find((v) => v.name === name);
    if (existing) {
      this.reinforce(name, origin);
      return existing;
    }

    // Protocol values cannot be added externally
    if (layer === "protocol") {
      throw new Error("Cannot add protocol-level values at runtime");
    }

    const defaultStrength = layer === "guardian" ? 0.7 : layer === "community" ? 0.5 : 0.3;
    const now = new Date().toISOString();
    const entry: ValueEntry = {
      name,
      description,
      layer,
      strength: initialStrength ?? defaultStrength,
      origin,
      reinforcements: 0,
      challenges: 0,
      firstInternalized: now,
      lastUpdated: now,
    };
    this.values.push(entry);
    return entry;
  }

  /**
   * Reinforce a value through positive experience.
   * Uses logarithmic growth — early reinforcements have more impact.
   */
  reinforce(name: string, cause: string, amount = 0.05): void {
    const value = this.values.find((v) => v.name === name);
    if (!value) return;
    if (value.layer === "protocol") return; // Protocol values are immutable

    const previousStrength = value.strength;
    const growth = amount * (1 - value.strength); // Diminishing returns
    value.strength = Math.min(1, value.strength + growth);
    value.reinforcements++;
    value.lastUpdated = new Date().toISOString();

    this.checkDrift(value, previousStrength, cause);
  }

  /**
   * Challenge a value through contrary experience.
   * Values at higher layers are more resistant to challenges.
   */
  challenge(name: string, cause: string, amount = 0.03): void {
    const value = this.values.find((v) => v.name === name);
    if (!value) return;
    if (value.layer === "protocol") return; // Protocol values are immutable

    const previousStrength = value.strength;
    // Higher-layer values resist challenges more
    const resistance = value.layer === "guardian" ? 0.5 : value.layer === "community" ? 0.7 : 1.0;
    value.strength = Math.max(0, value.strength - amount * resistance);
    value.challenges++;
    value.lastUpdated = new Date().toISOString();

    this.checkDrift(value, previousStrength, cause);

    // Remove values that have fully decayed (except protocol)
    if (value.strength === 0) {
      this.values = this.values.filter((v) => v.name !== name);
    }
  }

  /**
   * Check if an action aligns with the current value system.
   * Returns conflicts found with current values.
   */
  checkAlignment(action: string, affectedValues: string[]): {
    aligned: boolean;
    conflicts: Array<{ value: string; layer: ValueLayer; strength: number }>;
  } {
    const conflicting: Array<{ value: string; layer: ValueLayer; strength: number }> = [];

    for (const valueName of affectedValues) {
      const value = this.values.find((v) => v.name === valueName);
      if (value && value.strength > 0.5) {
        conflicting.push({
          value: value.name,
          layer: value.layer,
          strength: value.strength,
        });
      }
    }

    return {
      aligned: conflicting.length === 0,
      conflicts: conflicting,
    };
  }

  /** Detect value conflict between two values in tension. */
  recordConflict(valueA: string, valueB: string, description: string, resolution?: string): void {
    this.conflicts.push({
      valueA,
      valueB,
      description,
      resolution,
      detectedAt: new Date().toISOString(),
    });
    // Keep last 100 conflicts
    if (this.conflicts.length > 100) this.conflicts = this.conflicts.slice(-100);
  }

  /** Get value drift history. */
  getDriftHistory(): ValueDriftEvent[] {
    return [...this.driftHistory];
  }

  /** Get recorded conflicts. */
  getConflicts(): ValueConflict[] {
    return [...this.conflicts];
  }

  /**
   * Get a summary of the agent's value profile.
   * Useful for personality transparency and governance audits.
   */
  getProfile(): {
    totalValues: number;
    byLayer: Record<ValueLayer, number>;
    strongestValues: Array<{ name: string; strength: number; layer: ValueLayer }>;
    recentDrift: ValueDriftEvent[];
  } {
    const byLayer: Record<ValueLayer, number> = { protocol: 0, community: 0, guardian: 0, internalized: 0 };
    for (const v of this.values) byLayer[v.layer]++;

    return {
      totalValues: this.values.length,
      byLayer,
      strongestValues: [...this.values]
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 10)
        .map((v) => ({ name: v.name, strength: v.strength, layer: v.layer })),
      recentDrift: this.driftHistory.slice(-5),
    };
  }

  /** Serialize state for persistence. */
  serialize(): { values: ValueEntry[]; driftHistory: ValueDriftEvent[]; conflicts: ValueConflict[] } {
    return {
      values: [...this.values],
      driftHistory: [...this.driftHistory],
      conflicts: [...this.conflicts],
    };
  }

  /** Restore state from serialized data. */
  restore(data: { values: ValueEntry[]; driftHistory?: ValueDriftEvent[]; conflicts?: ValueConflict[] }): void {
    // Preserve protocol values (cannot be overridden)
    const protocolValues = this.values.filter((v) => v.layer === "protocol");
    const nonProtocol = data.values.filter((v) => v.layer !== "protocol");
    this.values = [...protocolValues, ...nonProtocol];
    this.driftHistory = data.driftHistory ?? [];
    this.conflicts = data.conflicts ?? [];
  }

  private checkDrift(value: ValueEntry, previousStrength: number, cause: string): void {
    const drift = Math.abs(value.strength - previousStrength);
    if (drift >= this.driftThreshold) {
      this.driftHistory.push({
        valueName: value.name,
        previousStrength,
        newStrength: value.strength,
        driftMagnitude: drift,
        cause,
        detectedAt: new Date().toISOString(),
      });
      // Keep last 200 drift events
      if (this.driftHistory.length > 200) this.driftHistory = this.driftHistory.slice(-200);
    }
  }
}
