const PRICES = {
  "gpt-4.1-nano": { input: 0.1, output: 0.4 }, "gpt-4.1-mini": { input: 0.4, output: 1.6 }, "gpt-4.1": { input: 2, output: 8 }, "gpt-4o-mini": { input: 0.15, output: 0.6 }, "gpt-4o": { input: 2.5, output: 10 },
  "gpt-5-nano": { input: 0.05, output: 0.4 }, "gpt-5-mini": { input: 0.25, output: 2 }, "gpt-5.2": { input: 1.75, output: 14 }, "gpt-5": { input: 1.25, output: 10 }, "o4-mini": { input: 1.1, output: 4.4 }, o3: { input: 2, output: 8 },
  // OpenAI standard API rates per million text tokens (USD):
  // https://developers.openai.com/api/docs/pricing
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5, longContextAt: 272_000 },
  "gpt-6-sol": { input: 2, cachedInput: 0.1, output: 10, longContextAt: 272_000 },
};

export const normalizeUsage = (usage) => {
  if (!usage) return null;
  const inputTokens = Number(usage.inputTokens ?? usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.outputTokens ?? usage.completion_tokens ?? 0);
  const cachedInputTokens = Number(
    usage.cachedInputTokens ?? usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? 0
  );
  return { inputTokens, outputTokens, cachedInputTokens };
};

export const addUsage = (...usages) => {
  const rows = usages.map(normalizeUsage).filter(Boolean);
  if (!rows.length) return null;
  return rows.reduce(
    (sum, row) => ({
      inputTokens: sum.inputTokens + row.inputTokens,
      outputTokens: sum.outputTokens + row.outputTokens,
      cachedInputTokens: sum.cachedInputTokens + row.cachedInputTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }
  );
};

// Prefer API-reported token usage; character counts are only a fallback.
export const estimate = (model = "", inChars = 0, out = "", actualUsage = null) => {
  const key = Object.keys(PRICES).find((k) => model === k) || Object.keys(PRICES).find((k) => model.startsWith(k));
  const rates = PRICES[key] || { input: 1, cachedInput: 1, output: 4 };
  const usage = normalizeUsage(actualUsage);
  const ti = usage ? usage.inputTokens : Math.ceil(inChars / 4);
  const to = usage ? usage.outputTokens : Math.ceil(out.length / 4);
  const cached = Math.min(ti, usage?.cachedInputTokens || 0);
  const longContext = rates.longContextAt && ti > rates.longContextAt;
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;
  const uncachedInput = ti - cached;
  const cost = (
    uncachedInput * rates.input * inputMultiplier +
    cached * (rates.cachedInput ?? rates.input) * inputMultiplier +
    to * rates.output * outputMultiplier
  ) / 1e6;
  return { ti, to, cached, cost };
};
