import { addUsage, normalizeUsage } from "./cost";
import { completeChat } from "./openai";

const approximateTokens = (text) => Math.ceil(String(text || "").length / 4);
const contextRows = (messages = []) =>
  messages
    .map((m, i) => ({ id: m.id || `legacy-${i}`, role: m.role, content: String(m.content || "").trim() }))
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content);

const startForBudget = (messages, config, summary = "") => {
  if (config.mode !== "tokens") return Math.max(0, messages.length - config.maxMessages);
  let tokens = approximateTokens(summary);
  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const size = approximateTokens(messages[i].content);
    if (start < messages.length && tokens + size > config.maxTokens) break;
    tokens += size;
    start = i;
  }
  return start;
};

const normalizedConfig = (config = {}) => ({
  mode: config.mode === "tokens" ? "tokens" : "messages",
  maxMessages: Math.max(1, Math.min(500, Math.floor(Number(config.maxMessages) || 40))),
  maxTokens: Math.max(1000, Math.min(900000, Math.floor(Number(config.maxTokens) || 16000))),
  overflow: config.overflow === "forget" ? "forget" : "summarize",
});

export async function prepareContext({ messages, config, memory, apiKey, model, onSummarizing }) {
  const settings = normalizedConfig(config);
  const rows = contextRows(messages);
  let previous = memory?.summary && Array.isArray(memory.coveredIds) ? memory : null;

  // A summary is only valid while the messages it covers remain a prefix. If a
  // user edits, branches, or regenerates earlier context, rebuild it from the
  // transcript rather than carrying facts from the discarded branch forward.
  if (previous && !previous.coveredIds.every((id, i) => rows[i]?.id === id)) previous = null;

  if (settings.overflow === "forget") {
    const start = startForBudget(rows, settings);
    return {
      messages: rows.slice(start).map(({ role, content }) => ({ role, content })),
      memory: null,
      memoryChanged: !!memory,
      usage: null,
    };
  }

  const coveredIds = previous?.coveredIds || [];
  const uncompressed = rows.slice(coveredIds.length);
  let summary = previous?.summary || "";
  let start = startForBudget(uncompressed, settings, summary);
  const newlyOld = uncompressed.slice(0, start);
  const summaryBudget = settings.mode === "tokens" ? Math.max(100, Math.floor(settings.maxTokens * 0.25)) : 800;
  const compactSummary = summary && approximateTokens(summary) > summaryBudget;
  let usage = null;
  let memoryChanged = !previous && !!memory;
  let summaryFailed = false;

  if (newlyOld.length || compactSummary) {
    onSummarizing?.();
    const transcript = [
      summary ? `Existing memory summary:\n${summary}` : "",
      ...newlyOld.map((m) => `${m.role === "user" ? "User" : "Assistant"}:\n${m.content}`),
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const result = await completeChat({
        apiKey,
        model,
        messages: [
          {
            role: "system",
            content: `Update a concise memory of an ongoing chat. Preserve durable user preferences, decisions, facts, names, constraints, unresolved questions, and work in progress. Remove repetition and completed small talk. Do not invent facts. Return only the updated memory, in at most ${summaryBudget} tokens.`,
          },
          { role: "user", content: transcript },
        ],
      });
      const updated = String(result.content || "").trim().slice(0, summaryBudget * 4);
      if (updated) {
        summary = updated;
        usage = normalizeUsage(result.usage);
        memoryChanged = true;
        previous = {
          summary,
          coveredIds: [...coveredIds, ...newlyOld.map((m) => m.id)],
        };
      } else summaryFailed = true;
    } catch {
      // Keep the conversation usable if the separate summary request fails; the
      // context limit still applies, and a later prompt can retry summarizing.
      summaryFailed = true;
    }
  }

  // Recompute after compaction so the retained suffix fits the configured
  // approximate token/message budget along with the summary.
  const finalRows = rows.slice((previous?.coveredIds || []).length);
  start = startForBudget(finalRows, settings, summary);
  const retained = finalRows.slice(start).map(({ role, content }) => ({ role, content }));
  const prompt = [
    ...(summary ? [{ role: "system", content: `Memory summary of earlier messages (the full transcript remains in chat history):\n${summary}` }] : []),
    ...retained,
  ];

  return {
    messages: prompt,
    memory: previous,
    memoryChanged,
    usage: addUsage(usage),
    summaryFailed,
  };
}
