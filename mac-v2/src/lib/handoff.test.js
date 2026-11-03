import { describe, expect, it } from "vitest";
import { HANDOFF_QUOTE_CHARS, QUICK_HANDOFFS, buildHandoff } from "./handoff";

describe("buildHandoff", () => {
  it("quotes the message and appends the instruction", () => {
    const out = buildHandoff({ message: { role: "assistant", content: "line one\nline two" }, fromAgent: { name: "Nova" }, instruction: "Critique it." });
    expect(out).toContain("> line one\n> line two");
    expect(out).toContain("From nova via Nova: Critique it.");
  });
  it("labels user messages and mentions attachments", () => {
    const out = buildHandoff({
      message: { role: "user", content: "q", docs: [{ name: "a.txt" }], notes: [{ name: "n" }] },
      fromAgent: { name: "Nova" },
      instruction: "Take it.",
    });
    expect(out).toContain("From the user via Nova");
    expect(out).toContain('document "a.txt"');
    expect(out).toContain('Anytype note "n"');
  });
  it("truncates very long quotes", () => {
    const out = buildHandoff({ message: { role: "assistant", content: "x".repeat(HANDOFF_QUOTE_CHARS + 500) }, fromAgent: { name: "A" }, instruction: "go" });
    expect(out).toContain("> …");
    expect(out.length).toBeLessThan(HANDOFF_QUOTE_CHARS + 500);
  });
  it("ships quick instructions", () => {
    expect(QUICK_HANDOFFS.map((q) => q.id)).toContain("critique");
    expect(QUICK_HANDOFFS.every((q) => q.label && q.instruction)).toBe(true);
  });
});
