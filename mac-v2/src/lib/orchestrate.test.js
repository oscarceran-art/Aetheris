import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {}, warning: () => {} } }));

import { linksFromResult, sourcesFromTranscript } from "./orchestrate";

describe("linksFromResult", () => {
  it("pulls links out of web_search results", () => {
    const out = linksFromResult("web_search", { results: [{ title: "A", url: "https://a.example" }, { title: "B", url: "https://b.example" }] });
    expect(out).toEqual([{ title: "A", url: "https://a.example" }, { title: "B", url: "https://b.example" }]);
  });
  it("pulls the page out of web_read", () => {
    expect(linksFromResult("web_read", { url: "https://a.example", title: "A" })).toEqual([{ title: "A", url: "https://a.example" }]);
  });
  it("ignores errors and non-web tools", () => {
    expect(linksFromResult("web_search", { error: "nope" })).toEqual([]);
    expect(linksFromResult("anytype_search", { results: [] })).toEqual([]);
    expect(linksFromResult("web_search", null)).toEqual([]);
  });
});

describe("sourcesFromTranscript", () => {
  it("flattens and dedupes links, keeping search order", () => {
    const transcript = [
      { name: "web_search", links: [{ title: "A", url: "https://a.example" }, { title: "B", url: "https://b.example" }] },
      { name: "web_read", links: [{ title: "A again", url: "https://a.example" }] },
      { name: "anytype_search", links: [] },
    ];
    expect(sourcesFromTranscript(transcript)).toEqual([
      { title: "A", url: "https://a.example" },
      { title: "B", url: "https://b.example" },
    ]);
  });
  it("caps at 8 and tolerates missing links", () => {
    const transcript = Array.from({ length: 10 }, (_, i) => ({ name: "web_search", links: [{ title: `S${i}`, url: `https://s${i}.example` }] }));
    transcript.push({ name: "web_search" });
    expect(sourcesFromTranscript(transcript)).toHaveLength(8);
    expect(sourcesFromTranscript()).toEqual([]);
  });
});
