import { describe, expect, it } from "vitest";
import { ATTACH_BUDGET_CHARS, approxTokens, buildPromptMessages, messageText } from "./prompt";

const doc = (name, len) => ({ id: name, name, kind: "txt", chars: len, text: "x".repeat(len) });
const note = (name, len) => ({ id: name, name, markdown: "y".repeat(len) });

describe("messageText", () => {
  it("passes plain messages through", () => {
    expect(messageText({ content: "hello" })).toBe("hello");
  });
  it("prepends docs and notes", () => {
    const t = messageText({ content: "q", docs: [doc("a.txt", 10)], notes: [note("n", 10)] });
    expect(t).toContain("a.txt");
    expect(t).toContain("Anytype notes");
    expect(t.endsWith("q")).toBe(true);
  });
  it("can drop attachments", () => {
    expect(messageText({ content: "q", docs: [doc("a.txt", 10)] }, { attachments: false })).toBe("q");
  });
});

describe("buildPromptMessages", () => {
  it("includes everything inside the budget", () => {
    const { rows, included, omitted } = buildPromptMessages([
      { id: "1", role: "user", content: "a", docs: [doc("a.txt", 100)] },
      { id: "2", role: "assistant", content: "b" },
    ]);
    expect(included).toBe(1);
    expect(omitted).toBe(0);
    expect(rows[0].content).toContain("a.txt");
    expect(rows.map((r) => r.id)).toEqual(["1", "2"]);
  });
  it("keeps newest attachments and placeholders older ones", () => {
    const msgs = [
      { id: "old", role: "user", content: "first", docs: [doc("old.txt", 100)] },
      { id: "new", role: "user", content: "second", docs: [doc("new.txt", 100)] },
    ];
    const { rows, included, omitted } = buildPromptMessages(msgs, { attachmentBudget: 150 });
    expect(included).toBe(1);
    expect(omitted).toBe(1);
    expect(rows[1].content).toContain("new.txt");
    expect(rows[0].content).toContain("old.txt");
    expect(rows[0].content).toContain("omitted to fit context");
    expect(rows[0].content).toContain("first");
  });
  it("default budget is generous", () => {
    expect(ATTACH_BUDGET_CHARS).toBeGreaterThanOrEqual(12000);
  });
});

describe("approxTokens", () => {
  it("uses ~4 chars per token", () => {
    expect(approxTokens("x".repeat(400))).toBe(100);
  });
});
