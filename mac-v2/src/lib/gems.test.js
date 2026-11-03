import { describe, expect, it } from "vitest";
import { TRIGGER_RE, blend, extractGems, gemSystem, resolveGems } from "./gems";

const global = { id: "g1", trigger: "idea", instruction: "be bold", color: "#fff", agentId: null };
const override = { id: "g2", trigger: "idea", instruction: "agent version", color: "#000", agentId: "a1" };
const other = { id: "g3", trigger: "short", instruction: "be brief", color: "#111", agentId: "a2" };

describe("resolveGems", () => {
  it("returns globals for an agent with no overrides", () => {
    expect(resolveGems([global, other], "a9")).toEqual([global]);
  });
  it("lets agent gems override globals with the same trigger", () => {
    const out = resolveGems([global, override], "a1");
    expect(out).toHaveLength(1);
    expect(out[0].instruction).toBe("agent version");
  });
  it("ignores other agents' gems", () => {
    expect(resolveGems([global, other], "a1")).toEqual([global]);
  });
});

describe("extractGems", () => {
  const byTrigger = { idea: global, short: { ...other, agentId: null } };
  it("pulls triggers out of the text and dedupes", () => {
    const { clean, gems } = extractGems("/idea and /idea again /short", byTrigger);
    expect(gems.map((g) => g.trigger)).toEqual(["idea", "short"]);
    expect(clean).not.toContain("/idea");
  });
  it("leaves unknown triggers alone", () => {
    const { clean, gems } = extractGems("keep /nope here", byTrigger);
    expect(gems).toEqual([]);
    expect(clean).toContain("/nope");
  });
  it("leaves mid-word slashes alone", () => {
    const { gems } = extractGems("a/b test", byTrigger);
    expect(gems).toEqual([]);
  });
});

describe("gemSystem", () => {
  it("numbers instructions in order", () => {
    expect(gemSystem([global, { ...other, agentId: null }])).toContain("1. be bold");
  });
  it("is empty without gems", () => {
    expect(gemSystem([])).toBe("");
  });
});

describe("TRIGGER_RE", () => {
  it("accepts slugs", () => {
    expect(TRIGGER_RE.test("idea-2")).toBe(true);
  });
  it("rejects spaces and slashes", () => {
    expect(TRIGGER_RE.test("my gem")).toBe(false);
    expect(TRIGGER_RE.test("/idea")).toBe(false);
  });
});

describe("blend", () => {
  it("averages hex colours", () => {
    expect(blend(["#000000", "#ffffff"])).toBe("#808080");
  });
  it("returns null for none", () => {
    expect(blend([])).toBeNull();
  });
});
