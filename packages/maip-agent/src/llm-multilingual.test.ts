/**
 * Tests for LLM adapter (NoOpLLMAdapter, LLMRouter) and I18n multilingual support.
 */

import { describe, it, expect } from "vitest";
import { NoOpLLMAdapter, LLMRouter, type LLMAdapter } from "./llm-adapter.js";
import { I18n } from "./multilingual.js";

// ── Mock Adapters ────────────────────────────────────────────────

const failingAdapter: LLMAdapter = {
  name: "failing",
  model: "fail",
  capabilities: ["chat"],
  generate: async () => {
    throw new Error("fail");
  },
};

const workingAdapter: LLMAdapter = {
  name: "working",
  model: "test",
  capabilities: ["chat", "embedding"],
  generate: async (_req) => ({
    text: "response",
    inputTokens: 10,
    outputTokens: 5,
    model: "test",
    latencyMs: 100,
    truncated: false,
  }),
  embed: async (_text) => ({
    vector: [0.1, 0.2],
    dimensions: 2,
    model: "test",
  }),
};

const secondWorkingAdapter: LLMAdapter = {
  name: "second",
  model: "backup",
  capabilities: ["chat"],
  generate: async (_req) => ({
    text: "backup response",
    inputTokens: 5,
    outputTokens: 3,
    model: "backup",
    latencyMs: 200,
    truncated: false,
  }),
};

// ── NoOpLLMAdapter ───────────────────────────────────────────────

describe("NoOpLLMAdapter", () => {
  it("echoes response with [NoOp response to: ...]", async () => {
    const adapter = new NoOpLLMAdapter();
    const result = await adapter.generate({
      messages: [{ role: "user", content: "Hello world" }],
    });
    expect(result.text).toBe("[NoOp response to: Hello world]");
    expect(result.model).toBe("noop");
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it("has capabilities [chat, completion]", () => {
    const adapter = new NoOpLLMAdapter();
    expect(adapter.capabilities).toEqual(["chat", "completion"]);
  });
});

// ── LLMRouter ────────────────────────────────────────────────────

describe("LLMRouter", () => {
  it("returns first adapter's response on success", async () => {
    const router = new LLMRouter([workingAdapter, secondWorkingAdapter]);
    const result = await router.generate({
      messages: [{ role: "user", content: "test" }],
    });
    expect(result.text).toBe("response");
    expect(result.model).toBe("test");
  });

  it("falls back to second adapter when first fails", async () => {
    const router = new LLMRouter([failingAdapter, workingAdapter]);
    const result = await router.generate({
      messages: [{ role: "user", content: "test" }],
    });
    expect(result.text).toBe("response");
    expect(result.model).toBe("test");
  });

  it("throws when all adapters fail", async () => {
    const router = new LLMRouter([failingAdapter]);
    await expect(
      router.generate({ messages: [{ role: "user", content: "test" }] })
    ).rejects.toThrow("fail");
  });

  it("embed routing: falls back if first adapter does not support embed", async () => {
    // failingAdapter has no embed method, workingAdapter does
    const router = new LLMRouter([failingAdapter, workingAdapter]);
    const result = await router.embed("test text");
    expect(result.vector).toEqual([0.1, 0.2]);
    expect(result.dimensions).toBe(2);
  });

  it("throws when constructed with empty array", () => {
    expect(() => new LLMRouter([])).toThrow("at least one adapter");
  });
});

// ── I18n ─────────────────────────────────────────────────────────

describe("I18n", () => {
  it("translates greeting to English", () => {
    const i18n = new I18n("en");
    const greeting = i18n.t("greeting");
    expect(greeting).toContain("Hello");
    expect(greeting).toContain("MAIP");
  });

  it("translates greeting to Chinese", () => {
    const i18n = new I18n("en");
    const greeting = i18n.t("greeting", "zh");
    expect(greeting).toContain("你好");
    expect(greeting).toContain("MAIP");
  });

  it("falls back to English for unknown locale", () => {
    const i18n = new I18n("en");
    const greeting = i18n.t("greeting", "xx");
    // Should fall back to English
    expect(greeting).toContain("Hello");
  });

  it("returns the key itself for unknown key", () => {
    const i18n = new I18n("en");
    const result = i18n.t("nonexistent_key");
    expect(result).toBe("nonexistent_key");
  });

  it("detectLanguage: Chinese text returns zh", () => {
    const i18n = new I18n();
    const detection = i18n.detectLanguage("这是一段中文测试文本");
    expect(detection.language).toBe("zh");
    expect(detection.script).toBe("Han");
    expect(detection.isRTL).toBe(false);
  });

  it("detectLanguage: Japanese text returns ja", () => {
    const i18n = new I18n();
    const detection = i18n.detectLanguage("こんにちは世界");
    expect(detection.language).toBe("ja");
    expect(detection.script).toBe("Kana");
    expect(detection.isRTL).toBe(false);
  });

  it("detectLanguage: Arabic text returns ar", () => {
    const i18n = new I18n();
    const detection = i18n.detectLanguage("مرحبا بالعالم");
    expect(detection.language).toBe("ar");
    expect(detection.script).toBe("Arabic");
    expect(detection.isRTL).toBe(true);
  });

  it("isRTL returns true for ar, he, fa, ur", () => {
    const i18n = new I18n();
    expect(i18n.isRTL("ar")).toBe(true);
    expect(i18n.isRTL("he")).toBe(true);
    expect(i18n.isRTL("fa")).toBe(true);
    expect(i18n.isRTL("ur")).toBe(true);
  });

  it("isRTL returns false for en, zh", () => {
    const i18n = new I18n();
    expect(i18n.isRTL("en")).toBe(false);
    expect(i18n.isRTL("zh")).toBe(false);
  });
});
