import { describe, expect, it } from "vitest";
import { chatFilename, chatToMarkdown } from "./export";

const agent = { name: "Nova", role: "Researcher", model: "gpt-4o-mini" };
const conv = {
  title: "Hello: world?",
  updatedAt: 1_700_000_000_000,
  messages: [
    { role: "user", content: "hi", gems: [{ trigger: "idea" }], docs: [{ name: "a.txt", kind: "txt" }], notes: [{ name: "n" }] },
    { role: "assistant", content: "hello back", usage: { model: "gpt-4o-mini", inChars: 4, actual: { prompt_tokens: 10, completion_tokens: 5 } } },
  ],
};

describe("chatFilename", () => {
  it("sanitizes titles", () => {
    expect(chatFilename(conv.title)).toBe("Hello-world.md");
  });
  it("falls back for empty titles", () => {
    expect(chatFilename("")).toBe("chat.md");
  });
});

describe("chatToMarkdown", () => {
  it("keeps speakers, gems, attachments and cost", () => {
    const md = chatToMarkdown(conv, agent);
    expect(md).toContain("# Hello: world?");
    expect(md).toContain("Nova · Researcher · gpt-4o-mini");
    expect(md).toContain("**You** /idea");
    expect(md).toContain("📎 a.txt");
    expect(md).toContain('📝 Anytype note "n"');
    expect(md).toContain("**Nova**");
    expect(md).toContain("Approximate model cost");
  });
});
