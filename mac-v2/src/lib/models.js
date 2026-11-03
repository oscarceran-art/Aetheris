// Model catalogue — v1 hardcoded two models and reset anything else on load.
// v2 keeps whatever the user has: models fetched from their OpenAI key, plus
// their own custom ids, plus whatever an agent already uses.

import { DEFAULT_MODELS } from "./defaults";

export const modelOptions = (settings = {}, extra = []) => {
  const clean = (list) => (Array.isArray(list) ? list.filter((m) => typeof m === "string" && m.trim()) : []);
  const fetched = clean(settings.models);
  const out = [];
  for (const m of [...clean(settings.customModels), ...(fetched.length ? fetched : DEFAULT_MODELS), ...clean(extra)]) {
    if (!out.includes(m)) out.push(m);
  }
  return out;
};
