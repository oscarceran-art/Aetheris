import { describe, expect, it } from "vitest";
import { addUsage, chatCost, estimate, messageCost, normalizeUsage, workspaceCost } from "./cost";

describe("normalizeUsage", () => {
  it("reads OpenAI chat-completions usage", () => {
    expect(normalizeUsage({ prompt_tokens: 10, completion_tokens: 5 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cachedInputTokens: 0,
    });
  });
  it("reads cached tokens", () => {
    expect(normalizeUsage({ prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } }).cachedInputTokens).toBe(4);
  });
  it("returns null for nothing", () => {
    expect(normalizeUsage(null)).toBeNull();
  });
});

describe("addUsage", () => {
  it("sums rows", () => {
    expect(
      addUsage({ prompt_tokens: 10, completion_tokens: 5 }, { inputTokens: 3, outputTokens: 1, cachedInputTokens: 0 })
    ).toEqual({ inputTokens: 13, outputTokens: 6, cachedInputTokens: 0 });
  });
  it("ignores nulls", () => {
    expect(addUsage(null, undefined)).toBeNull();
  });
});

describe("estimate", () => {
  it("prices a known model from actual usage", () => {
    const e = estimate("gpt-4o-mini", 0, "", { prompt_tokens: 1_000_000, completion_tokens: 0 });
    expect(e.ti).toBe(1_000_000);
    expect(e.cost).toBeCloseTo(0.15, 6);
  });
  it("falls back to char counts without usage", () => {
    const e = estimate("gpt-4o-mini", 400, "x".repeat(40), null);
    expect(e.ti).toBe(100);
    expect(e.to).toBe(10);
  });
  it("prices unknown models with fallback rates instead of crashing", () => {
    const e = estimate("future-model-99", 0, "", { prompt_tokens: 1000, completion_tokens: 1000 });
    expect(e.cost).toBeGreaterThan(0);
  });
  it("prefix-matches model variants", () => {
    const a = estimate("gpt-4o-mini", 0, "", { prompt_tokens: 1000, completion_tokens: 0 });
    const b = estimate("gpt-4o-mini-2024-07-18", 0, "", { prompt_tokens: 1000, completion_tokens: 0 });
    expect(a.cost).toBe(b.cost);
  });
});

describe("messageCost / chatCost / workspaceCost", () => {
  const assistant = (cost) => ({ role: "assistant", content: "hi", usage: { model: "gpt-4o-mini", inChars: 4, actual: cost ? { prompt_tokens: 1000, completion_tokens: 0 } : null } });
  it("messageCost is 0 without usage", () => {
    expect(messageCost({ role: "assistant", content: "hi" })).toBe(0);
  });
  it("chatCost skips user messages", () => {
    const c = chatCost({ messages: [{ role: "user", content: "q" }, assistant(true)] });
    expect(c.messages).toBe(1);
    expect(c.tokens).toBe(1000);
    expect(c.cost).toBeCloseTo(0.00015, 8);
  });
  it("workspaceCost breaks down per agent", () => {
    const w = workspaceCost([
      { agentId: "a", messages: [assistant(true)] },
      { agentId: "b", messages: [] },
    ]);
    expect(w.chats).toBe(2);
    expect(w.byAgent.a.chats).toBe(1);
    expect(w.byAgent.b.tokens).toBe(0);
  });
});
