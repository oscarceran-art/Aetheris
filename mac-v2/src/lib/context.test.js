import { describe, expect, it, vi } from "vitest";

vi.mock("./openai", () => ({
  completeChat: vi.fn(async () => ({ content: "MEMORY: likes concise answers.", usage: null })),
}));

import { completeChat } from "./openai";
import { prepareContext } from "./context";

const msg = (id, role, content) => ({ id, role, content });

describe("prepareContext", () => {
  it("passes short histories through untouched", async () => {
    const out = await prepareContext({
      messages: [msg("1", "user", "hi"), msg("2", "assistant", "hello")],
      config: { mode: "messages", maxMessages: 40, overflow: "summarize" },
      memory: null,
      apiKey: "k",
      model: "m",
    });
    expect(out.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(out.memory).toBeNull();
    expect(completeChat).not.toHaveBeenCalled();
  });

  it("forget mode slices to the budget", async () => {
    const messages = Array.from({ length: 10 }, (_, i) => msg(`m${i}`, i % 2 ? "assistant" : "user", `text ${i}`));
    const out = await prepareContext({
      messages,
      config: { mode: "messages", maxMessages: 4, overflow: "forget" },
      memory: null,
      apiKey: "k",
      model: "m",
    });
    expect(out.messages).toHaveLength(4);
    expect(out.messages[0].content).toBe("text 6");
  });

  it("summarizes overflow and keeps the newest messages", async () => {
    const messages = Array.from({ length: 10 }, (_, i) => msg(`m${i}`, i % 2 ? "assistant" : "user", `text ${i}`));
    let summarizing = 0;
    const out = await prepareContext({
      messages,
      config: { mode: "messages", maxMessages: 4, overflow: "summarize" },
      memory: null,
      apiKey: "k",
      model: "m",
      onSummarizing: () => (summarizing += 1),
    });
    expect(summarizing).toBe(1);
    expect(completeChat).toHaveBeenCalled();
    expect(out.memory.summary).toContain("MEMORY");
    expect(out.memory.coveredIds).toHaveLength(6);
    // summary system message + 4 retained
    expect(out.messages).toHaveLength(5);
    expect(out.messages[0].role).toBe("system");
  });

  it("extends an existing summary instead of redoing it", async () => {
    const messages = Array.from({ length: 8 }, (_, i) => msg(`m${i}`, i % 2 ? "assistant" : "user", `text ${i}`));
    const out = await prepareContext({
      messages,
      config: { mode: "messages", maxMessages: 4, overflow: "summarize" },
      memory: { summary: "OLD", coveredIds: ["m0", "m1"] },
      apiKey: "k",
      model: "m",
    });
    expect(out.memory.summary).toContain("MEMORY");
    expect(out.memory.coveredIds).toEqual(["m0", "m1", "m2", "m3"]);
    expect(out.messages.filter((m) => m.role !== "system")).toHaveLength(4);
  });

  it("rebuilds the summary when the covered prefix changed", async () => {
    const messages = [msg("x", "user", "branched"), msg("m1", "assistant", "text")];
    const out = await prepareContext({
      messages,
      config: { mode: "messages", maxMessages: 40, overflow: "summarize" },
      memory: { summary: "STALE", coveredIds: ["m0"] },
      apiKey: "k",
      model: "m",
    });
    expect(out.memoryChanged).toBe(true);
    // stale prefix dropped; nothing over budget so no summary kept
    expect(out.memory).toBeNull();
  });
});
