import { toast } from "sonner";
import { completeChat, streamChat } from "./openai";
import { ANYTYPE_TOOLS, anytypeReady, anytypeSystem, runAnytypeTool, toolLabel } from "./anytype";
import { WEB_TOOLS, isWebTool, runWebTool, webReady, webSystem, webToolLabel } from "./websearch";
import { isMcpTool, mcpChatTools, mcpToolLabel } from "./mcp";

// How often streamed text is pushed into the store. React re-renders the app on
// every store update, so pushing every token makes the whole tree diff 30-60x/s.
const FLUSH_MS = 80;
// Upper bound on Anytype tool round-trips before we force a plain answer.
const MAX_TOOL_ROUNDS = 6;

// Tool-calling loop: the model may search the web, read (and, if enabled,
// write) the user's Anytype vault, and run tools from any connected MCP server
// (Word, PowerPoint, OneDrive, …) a few times, then replies. The final text
// isn't streamed — the UI fades it in word by word anyway.
async function withTools({ apiKey, agent, system, messages, anytype, web, mcp, onUpdate, signal }) {
  const tools = [...ANYTYPE_TOOLS, ...(webReady(web) ? WEB_TOOLS : []), ...mcp.tools];
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
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const msg = await completeChat({ apiKey, model: agent.model, temperature: agent.temperature, messages: convo, tools, signal });
    const calls = msg.tool_calls || [];
    if (!calls.length) return msg.content || "";
    convo.push(msg);
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        /* malformed arguments — run with {} so the model gets an error back */
      }
      const name = call.function?.name || "";
      onUpdate({ streaming: true, toolStatus: label(name, args) });
      let result;
      try {
        result = isMcpTool(name)
          ? await mcp.run(name, args)
          : isWebTool(name)
            ? await runWebTool(name, args, web, signal)
            : await runAnytypeTool(name, args, anytype, signal);
      } catch (e) {
        if (e.name === "AbortError") throw e;
        result = { error: e.message };
      }
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  const last = await completeChat({ apiKey, model: agent.model, messages: convo, signal });
  return last.content || "";
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
      onUpdate({ content: text, streaming: false, toolStatus: null });
      return text;
    } catch (e) {
      const aborted = e.name === "AbortError";
      onUpdate({ streaming: false, toolStatus: null, ...(aborted ? {} : { error: e.message }) });
      if (!aborted) toast.error(e.message);
      throw e;
    }
  }

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
  // Push whatever is buffered right now (stream ended, errored or aborted)
  const drain = () => {
    if (timer != null) clearTimeout(timer);
    flush();
  };
  try {
    const text = await streamChat({
      apiKey,
      model: agent.model,
      temperature: agent.temperature,
      messages: [{ role: "system", content: [agent.persona, system].filter(Boolean).join("\n\n") }, ...messages],
      signal,
      onToken: (t) => {
        pending = t;
        if (timer == null) timer = setTimeout(flush, FLUSH_MS);
      },
    });
    drain();
    onUpdate({ content: text, streaming: false });
    return text;
  } catch (e) {
    drain();
    const aborted = e.name === "AbortError";
    onUpdate({ streaming: false, ...(aborted ? {} : { error: e.message }) });
    if (!aborted) toast.error(e.message);
    throw e;
  }
}
