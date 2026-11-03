import { describe, expect, it } from "vitest";
import { modelOptions } from "./models";
import { DEFAULT_MODELS } from "./defaults";

describe("modelOptions", () => {
  it("falls back to defaults", () => {
    expect(modelOptions({})).toEqual(DEFAULT_MODELS);
  });
  it("unions custom, fetched and extra ids without dupes", () => {
    expect(modelOptions({ models: ["m1", "m2"], customModels: ["c1", "m1"] }, ["m2", "agent-model"])).toEqual([
      "c1",
      "m1",
      "m2",
      "agent-model",
    ]);
  });
  it("drops blanks", () => {
    expect(modelOptions({ models: ["", "  "] })).toEqual(DEFAULT_MODELS);
  });
});
