const GEM_RE = /(^|\s)\/([a-z0-9][\w-]*)(?=\s|$)/gi;

export const TRIGGER_RE = /^[a-z0-9][a-z0-9-]*$/;

// Agent gems override global gems with the same trigger
export const resolveGems = (all, agentId) => {
  const map = {};
  all.filter((g) => !g.agentId).forEach((g) => (map[g.trigger] = g));
  all.filter((g) => g.agentId === agentId).forEach((g) => (map[g.trigger] = g));
  return Object.values(map);
};

export const extractGems = (text, byTrigger) => {
  const gems = [];
  const clean = text
    .replace(GEM_RE, (m, pre, t) => {
      const g = byTrigger[t.toLowerCase()];
      if (!g) return m;
      if (!gems.some((x) => x.id === g.id)) gems.push(g);
      return pre;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { clean, gems };
};

export const gemSystem = (gems) =>
  gems.length
    ? `For this reply only, apply these instructions in order:\n${gems.map((g, i) => `${i + 1}. ${g.instruction}`).join("\n")}`
    : "";

export const blend = (hexes = []) => {
  if (!hexes.length) return null;
  const rgb = hexes.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const avg = [0, 1, 2].map((k) => Math.round(rgb.reduce((s, c) => s + c[k], 0) / rgb.length));
  return `#${avg.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
