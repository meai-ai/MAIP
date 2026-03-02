/**
 * MeAI type definitions used by the bridge.
 *
 * These mirror the MeAI types without creating a hard dependency
 * on the MeAI codebase. The bridge accepts these types from the
 * MeAI engine and converts them to MAIP protocol types.
 */

/** Privacy level for individual memories. */
export type MeAIMemoryPrivacy = "public" | "network" | "private" | "confidential";

/** MeAI Memory (from src/types.ts). */
export interface MeAIMemory {
  key: string;
  value: string;
  timestamp: number;
  confidence: number;
  /** Privacy level — controls what can be shared externally. Defaults to "network". */
  privacy?: MeAIMemoryPrivacy;
}

/** MeAI memory categories (from src/memory/store-manager.ts). */
export type MeAIMemoryCategory = "core" | "emotional" | "knowledge" | "character" | "insights" | "system";

/** MeAI EmotionalState (from src/emotion.ts). */
export interface MeAIEmotionalState {
  mood: string;
  cause: string;
  energy: number;     // 1-10
  valence: number;    // 1-10
  behaviorHints: string;
  microEvent: string;
  generatedAt: number;
}

/** MeAI heartbeat action types (from src/heartbeat.ts). */
export type MeAIHeartbeatAction =
  | "explore"
  | "reach_out"
  | "post"
  | "activity"
  | "reflect"
  | "rest";

/** MeAI character profile (subset of fields we use). */
export interface MeAICharacterProfile {
  name: string;
  english_name?: string;
  age?: number;
  gender: "female" | "male" | "nonbinary";
  languages: string[];
  user: {
    name: string;
    relationship: string;
  };
  persona: {
    compact?: string;
    full?: string;
  };
}

/** MeAI Channel interface (from src/channel/types.ts). */
export interface MeAIChannel {
  readonly id: string;
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: MeAIMessageHandler): void;
  sendMessage(text: string): Promise<{ messageId: number | string }>;
  sendPhoto(photo: Buffer | string, caption?: string): Promise<{ messageId: number | string }>;
}

export type MeAIMessageHandler = (
  text: string,
  chatId: number | string,
  sendReply: (text: string) => Promise<{ messageId: number | string }>,
  editReply: (messageId: number | string, text: string) => Promise<void>,
  sendTyping: () => Promise<void>,
) => Promise<void>;
