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

// Anytype rate-limits writes (~1/sec), so creates/updates run one at a time.
// Everything else in a round is independent and runs in parallel.
const isAnytypeWrite = (name) => name === "anytype_create" || name === "anytype_update";

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
// final answer streams when it needs its own request.
async function withTools({ apiKey, agent, system, messages, anytype, web, mcp, onUpdate, signal }) {
  const tools = [...(anytypeReady(anytype) ? ANYTYPE_TOOLS : []), ...(webReady(web) ? WEB_TOOLS : []), ...mcp.tools];
  const label = (name, args) =>
    isMcpTool(name) ? mcpToolLabel(name) : isWebTool(name) ? webToolLabel(name, args) : toolLabel(name, args);
  const convo = [
    {
      role: "system",
      content: [agent.persona, system, anytypeSystem(anytype), webSystem(web), mcpSystem(mcp)]
        .filter(Boolean)
        .join("\n\n"),
    },
    ...messages,
  ];
  const runOne = async (name, args) => {
    try {
      return isMcpTool(name)
        ? await mcp.run(name, args)
        : isWebTool(name)
          ? await runWebTool(name, args, web, signal)
          : await runAnytypeTool(name, args, anytype, signal);
    } catch (e) {
      if (e.name === "AbortError") throw e;
      return { error: e.message };
    }
  };
  let usage = null;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const msg = await completeChat({ apiKey, model: agent.model, temperature: agent.temperature, messages: convo, tools, signal });
    usage = addUsage(usage, msg.usage);
    const calls = msg.tool_calls || [];
    // The no-tools reply already came back with its text — a second request
    // just to stream it would bill the input tokens twice.
    if (!calls.length) return { text: msg.content || "", usage };
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
  return { text, usage };
}

// One line telling the model what's connected — the tool schemas already
// describe each tool, this only sets expectations (they run locally, the
// first call can be slow while a server warms up).
const mcpSystem = (mcp) =>
  mcp.servers?.length
    ? `Local MCP tool servers connected: ${mcp.servers.join(", ")}. Their tools run on this machine; the first call to a server can take a few extra seconds.`
    : "";

export async function streamInto({ apiKey, agent, messages, system, anytype, web, onUpdate, signal }) {
  // Ask the dev-server proxy which MCP servers are up. Chats keep working when
  // it isn't reachable (built preview, proxy off) — they just get no MCP tools.
  const mcp = await mcpChatTools();
  if (anytypeReady(anytype) || webReady(web) || mcp.tools.length) {
    try {
      const text = await withTools({ apiKey, agent, system, messages, anytype, web, mcp, onUpdate, signal });
      onUpdate({ content: text.text, streaming: false, toolStatus: null });
      return { ...text, usage: normalizeUsage(text.usage) };
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
      messages: [{ role: "system", content: [agent.persona, system].filter(Boolean).join("\n\n") }, ...messages],
      signal,
      onUsage: (u) => {
        usage = normalizeUsage(u);
      },
      onToken: (t) => fwd.push(t),
    });
    fwd.drain();
    onUpdate({ content: text, streaming: false });
    return { text, usage };
  } catch (e) {
    fwd.drain();
    const aborted = e.name === "AbortError";
    onUpdate({ streaming: false, ...(aborted ? {} : { error: e.message }) });
    if (!aborted) toast.error(e.message);
    throw e;
  }
}
