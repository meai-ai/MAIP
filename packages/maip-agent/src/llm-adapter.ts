/**
 * Model-Agnostic LLM Adapter.
 *
 * Implements the whitepaper's vision of AI agents not tied to any
 * specific LLM provider. The adapter interface allows plugging in
 * any backend while maintaining a consistent API.
 */

/** A chat-style message. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Capabilities an LLM adapter may support. */
export type LLMCapability =
  | "chat" | "completion" | "summarization"
  | "analysis" | "translation" | "embedding";

/** Request to an LLM adapter. */
export interface LLMRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  modelParams?: Record<string, unknown>;
}

/** Response from an LLM adapter. */
export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  latencyMs: number;
  truncated: boolean;
}

/** Embedding result. */
export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  model: string;
}

/** LLMAdapter — model-agnostic interface for LLM interactions. */
export interface LLMAdapter {
  readonly name: string;
  readonly model: string;
  readonly capabilities: LLMCapability[];
  generate(request: LLMRequest): Promise<LLMResponse>;
  embed?(text: string): Promise<EmbeddingResult>;
}

/** NoOpLLMAdapter — returns empty responses. Useful for testing. */
export class NoOpLLMAdapter implements LLMAdapter {
  readonly name = "noop";
  readonly model = "noop";
  readonly capabilities: LLMCapability[] = ["chat", "completion"];

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const lastMessage = request.messages[request.messages.length - 1];
    return {
      text: `[NoOp response to: ${lastMessage?.content.slice(0, 50) ?? "empty"}]`,
      inputTokens: 0, outputTokens: 0, model: "noop", latencyMs: 0, truncated: false,
    };
  }
}

/**
 * LLMRouter — routes LLM requests through a fallback chain.
 * If the primary adapter fails, automatically tries the next.
 */
export class LLMRouter implements LLMAdapter {
  readonly name = "router";
  readonly model: string;
  readonly capabilities: LLMCapability[];
  private adapters: LLMAdapter[];

  constructor(adapters: LLMAdapter[]) {
    if (adapters.length === 0) throw new Error("LLMRouter requires at least one adapter");
    this.adapters = adapters;
    this.model = `router(${adapters.map((a) => a.model).join(",")})`;
    const caps = new Set<LLMCapability>();
    for (const a of adapters) for (const c of a.capabilities) caps.add(c);
    this.capabilities = [...caps];
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    let lastError: Error | undefined;
    for (const adapter of this.adapters) {
      try { return await adapter.generate(request); }
      catch (err) { lastError = err instanceof Error ? err : new Error(String(err)); }
    }
    throw lastError ?? new Error("All LLM adapters failed");
  }

  async embed(text: string): Promise<EmbeddingResult> {
    let lastError: Error | undefined;
    for (const adapter of this.adapters) {
      if (!adapter.embed) continue;
      try { return await adapter.embed(text); }
      catch (err) { lastError = err instanceof Error ? err : new Error(String(err)); }
    }
    throw lastError ?? new Error("No adapter supports embeddings");
  }

  getAdapters(): LLMAdapter[] { return [...this.adapters]; }
}
