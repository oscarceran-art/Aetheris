const PRICES = {
  "gpt-4.1-nano": [0.1, 0.4], "gpt-4.1-mini": [0.4, 1.6], "gpt-4.1": [2, 8], "gpt-4o-mini": [0.15, 0.6], "gpt-4o": [2.5, 10],
  "gpt-5-nano": [0.05, 0.4], "gpt-5-mini": [0.25, 2], "gpt-5.2": [1.75, 14], "gpt-5": [1.25, 10], "o4-mini": [1.1, 4.4], o3: [2, 8],
  // Placeholder per-million rates (input, output) for the two models this app
  // offers — adjust to match what your organisation is billed.
  "gpt-6-luna": [1, 4], "gpt-6-sol": [1, 4],
};

// Rough browser-side estimate: ~4 characters per token
export const estimate = (model = "", inChars = 0, out = "") => {
  const key = Object.keys(PRICES).find((k) => model === k) || Object.keys(PRICES).find((k) => model.startsWith(k));
  const [pi, po] = PRICES[key] || [1, 4];
  const ti = Math.ceil(inChars / 4);
  const to = Math.ceil(out.length / 4);
  return { ti, to, cost: (ti * pi + to * po) / 1e6 };
};
