import { toast } from "sonner";
import { completeChat, streamChat } from "./openai";
import { addUsage, normalizeUsage } from "./cost";
import { ANYTYPE_TOOLS, anytypeReady, anytypeSystem, runAnytypeTool, toolLabel } from "./anytype";
import { WEB_TOOLS, isWebTool, runWebTool, webReady, webSystem, webToolLabel } from "./websearch";
import { isMcpTool, mcpChatTools, mcpToolLabel } from "./mcp";

// How often streamed text is pushed into the store. React re-renders subscribed
// components on every store update, so pushing every token would thrash the tree.
const FLUSH_MS = 80;
// Upper bound on tool round-trips before we force a plain answer.
const MAX_TOOL_ROUNDS = 6;
// Vision: images ride along on the last user message, capped per request.
const MAX_IMAGES = 5;

// Anytype rate-limits writes (~1/sec), so creates/updates run one at a time.
// Everything else in a round is independent and runs in parallel.
const isAnytypeWrite = (name) => name === "anytype_create" || name === "anytype_update";

// Short, UI-safe summaries for the tool transcript (the model still gets full results).
const shortText = (v, n) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…` : s || "";
};

// Links a tool result contributes to the reply's Sources footer.
export const linksFromResult = (name, result) => {
  if (!result || result.error) return [];
  if (name === "web_search") {
    return (result.results || []).filter((r) => r?.url).map((r) => ({ title: r.title || r.url, url: r.url }));
  }
  if (name === "web_read" && result.url) return [{ title: result.title || result.url, url: result.url }];
  return [];
};

// Flatten a tool transcript into deduped source links (max 8, search order kept).
export const sourcesFromTranscript = (transcript = []) => {
  const seen = new Set();
  const out = [];
  for (const entry of transcript) {
    for (const link of entry?.links || []) {
      if (!link?.url || seen.has(link.url)) continue;
      seen.add(link.url);
      out.push(link);
      if (out.length >= 8) return out;
    }
  }
  return out;
};

// Attach image parts to the last user message (OpenAI vision content blocks).
const withImages = (messages, images) => {
  const urls = (images || []).filter(Boolean).slice(0, MAX_IMAGES);
  if (!urls.length) return messages;
  const rows = messages.map((m) => ({ ...m }));
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].role === "user") {
      rows[i] = {
        ...rows[i],
        content: [{ type: "text", text: rows[i].content }, ...urls.map((url) => ({ type: "image_url", image_url: { url } }))],
      };
      break;
    }
  }
  return rows;
};

// Throttled forwarder: many onToken calls in, at most one onUpdate per FLUSH_MS.
const throttledContent = (onUpdate) => {
  let pending = null;
  let timer = null;
  const flush = () => {
    timer = null;
    if (pending != null) {
      const t = pending;
      pending = null;
      onUpdate({ content: t });
    }
  };
  return {
    push: (t) => {
      pending = t;
      if (timer == null) timer = setTimeout(flush, FLUSH_MS);
    },
    drain: () => {
      if (timer != null) clearTimeout(timer);
      flush();
    },
  };
};

// Tool-calling loop: the model may search the web, read (and, if enabled,
// write) the user's Anytype vault, and run tools from any connected MCP server
// a few times, then replies. Independent calls in a round run in parallel; the
// final answer streams when it needs its own request. Every call is recorded
// into a transcript for the reply's "what the agent did" disclosure.
async function withTools({ apiKey, agent, system, messages, images, anytype, web, mcp, onUpdate, signal }) {
  const tools = [...(anytypeReady(anytype) ? ANYTYPE_TOOLS : []), ...(webReady(web) ? WEB_TOOLS : []), ...mcp.tools];
  const label = (name, args) =>
    isMcpTool(name) ? mcpToolLabel(name) : isWebTool(name) ? webToolLabel(name, args) : toolLabel(name, args);
  const transcript = [];
  const convo = withImages(
    [
      {
        role: "system",
        content: [agent.persona, system, anytypeSystem(anytype), webSystem(web), mcpSystem(mcp)]
          .filter(Boolean)
          .join("\n\n"),
      },
      ...messages,
    ],
    images
  );
  const runOne = async (name, args) => {
    const started = Date.now();
    const record = (result, ok) => {
      transcript.push({
        name,
        label: label(name, args),
        args: shortText(args, 300),
        result: shortText(result, 600),
        links: linksFromResult(name, result),
        ok,
        ms: Date.now() - started,
      });
    };
    try {
      const result = isMcpTool(name)
        ? await mcp.run(name, args)
        : isWebTool(name)
          ? await runWebTool(name, args, web, signal)
          : await runAnytypeTool(name, args, anytype, signal);
      record(result, !result?.error);
      return result;
    } catch (e) {
      if (e.name === "AbortError") throw e;
      const result = { error: e.message };
      record(result, false);
      return result;
    }
  };
  let usage = null;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const msg = await completeChat({ apiKey, model: agent.model, temperature: agent.temperature, messages: convo, tools, signal });
    usage = addUsage(usage, msg.usage);
    const calls = msg.tool_calls || [];
    // The no-tools reply already came back with its text — a second request
    // just to stream it would bill the input tokens twice.
    if (!calls.length) return { text: msg.content || "", usage, transcript };
    const { usage: _usage, ...assistantMessage } = msg;
    convo.push(assistantMessage);
    const parsed = calls.map((call) => {
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        /* malformed arguments — run with {} so the model gets an error back */
      }
      return { call, name: call.function?.name || "", args };
    });
    const writes = parsed.filter((p) => isAnytypeWrite(p.name));
    const parallel = parsed.filter((p) => !isAnytypeWrite(p.name));
    if (parallel.length === 1 && !writes.length) onUpdate({ streaming: true, toolStatus: label(parallel[0].name, parallel[0].args) });
    else if (parallel.length) onUpdate({ streaming: true, toolStatus: `running ${parallel.length} tools` });
    const settled = await Promise.all(parallel.map((p) => runOne(p.name, p.args)));
    for (const p of writes) {
      onUpdate({ streaming: true, toolStatus: label(p.name, p.args) });
      settled.push(await runOne(p.name, p.args));
    }
    // Results go back in call order so tool_call_ids line up with the request.
    const byCall = new Map();
    [...parallel, ...writes].forEach((p, i) => byCall.set(p.call, settled[i]));
    for (const { call } of parsed) {
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(byCall.get(call)) });
    }
  }
  // Rounds exhausted: stream the forced final answer so the wait feels alive.
  const fwd = throttledContent(onUpdate);
  onUpdate({ streaming: true, toolStatus: null });
  const text = await streamChat({
    apiKey,
    model: agent.model,
    temperature: agent.temperature,
    messages: convo,
    signal,
    onUsage: (u) => {
      usage = addUsage(usage, u);
    },
    onToken: (t) => fwd.push(t),
  });
  fwd.drain();
  return { text, usage, transcript };
}

// One line telling the model what's connected — the tool schemas already
// describe each tool, this only sets expectations (they run locally, the
// first call can be slow while a server warms up).
const mcpSystem = (mcp) =>
  mcp.servers?.length
    ? `Local MCP tool servers connected: ${mcp.servers.join(", ")}. Their tools run on this machine; the first call to a server can take a few extra seconds.`
    : "";

export async function streamInto({ apiKey, agent, messages, images, system, anytype, web, onUpdate, signal }) {
  // Ask the dev-server proxy which MCP servers are up. Chats keep working when
  // it isn't reachable (built preview, proxy off) — they just get no MCP tools.
  const mcp = await mcpChatTools();
  if (anytypeReady(anytype) || webReady(web) || mcp.tools.length) {
    try {
      const out = await withTools({ apiKey, agent, system, messages, images, anytype, web, mcp, onUpdate, signal });
      onUpdate({ content: out.text, streaming: false, toolStatus: null });
      return { ...out, usage: normalizeUsage(out.usage) };
    } catch (e) {
      const aborted = e.name === "AbortError";
      onUpdate({ streaming: false, toolStatus: null, ...(aborted ? {} : { error: e.message }) });
      if (!aborted) toast.error(e.message);
      throw e;
    }
  }

  const fwd = throttledContent(onUpdate);
  let usage = null;
  try {
    const text = await streamChat({
      apiKey,
      model: agent.model,
      temperature: agent.temperature,
      messages: withImages([{ role: "system", content: [agent.persona, system].filter(Boolean).join("\n\n") }, ...messages], images),
      signal,
      onUsage: (u) => {
        usage = normalizeUsage(u);
      },
      onToken: (t) => fwd.push(t),
    });
    fwd.drain();
    onUpdate({ content: text, streaming: false });
    return { text, usage, transcript: [] };
  } catch (e) {
    fwd.drain();
    const aborted = e.name === "AbortError";
    onUpdate({ streaming: false, ...(aborted ? {} : { error: e.message }) });
    if (!aborted) toast.error(e.message);
    throw e;
  }
}
