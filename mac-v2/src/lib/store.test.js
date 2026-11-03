import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {}, warning: () => {} } }));

import { migrate } from "./store";
import { DEFAULT_MODELS } from "./defaults";

describe("migrate", () => {
  it("keeps an agent's existing model instead of force-resetting it", () => {
    const out = migrate({ agents: [{ id: "a", model: "gpt-4o-mini" }], conversations: [], gems: [], settings: {} });
    expect(out.agents[0].model).toBe("gpt-4o-mini");
  });
  it("defaults a missing model", () => {
    const out = migrate({ agents: [{ id: "a" }], conversations: [], gems: [], settings: {} });
    expect(out.agents[0].model).toBe(DEFAULT_MODELS[0]);
  });
  it("drops non-chat conversations", () => {
    const out = migrate({
      agents: [],
      conversations: [{ id: "1", type: "chat" }, { id: "2", type: "legacy" }],
      gems: [],
      settings: {},
    });
    expect(out.conversations.map((c) => c.id)).toEqual(["1"]);
  });
  it("keeps custom models and fetched lists", () => {
    const out = migrate({ agents: [], conversations: [], gems: [], settings: { models: ["m1"], customModels: ["c1", "c1"] } });
    expect(out.settings.models).toEqual(["m1"]);
    expect(out.settings.customModels).toEqual(["c1"]);
  });
  it("handles garbage input", () => {
    const out = migrate(null);
    expect(out.agents.length).toBeGreaterThan(0);
  });
});
