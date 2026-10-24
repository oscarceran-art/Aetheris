// A small MCP (Model Context Protocol) client that lives in the dev server.
//
// MCP servers are ordinary local programs — started with a command like
// `npx -y @knorq/docx-mcp-server` — that speak JSON-RPC over stdin/stdout and
// hand the model extra tools: read and edit Word documents, build slide decks,
// browse OneDrive, query a database, anything someone has published.
//
// A web page can't start a process, so the browser asks this proxy instead:
//
//   GET  /__mcp/servers   configured servers + their live tool lists
//   POST /__mcp/config    save the server list (persisted in .mcp.json)
//   POST /__mcp/call      { server, tool, args } → tool output
//   POST /__mcp/restart   { server } → stop it and start it fresh
//
// The config lives next to the project (.mcp.json), never in localStorage, so
// environment variables — API keys for cloud services — never end up in an
// exported backup or in the page's storage. Env values and cwd may reference
// other variables as %NAME% or ${NAME}, and a leading ~ means the home folder
// (the PowerPoint preset uses ~/OneDrive on every platform).

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONFIG_PATH = join(ROOT, ".mcp.json");
const PROTOCOL_VERSION = "2025-06-18";
const START_TIMEOUT = 180_000; // first run downloads the package through npx
const CALL_TIMEOUT = 120_000;
const MAX_RESULT_CHARS = 12_000;
const STDERR_TAIL = 30;

let config = loadConfig();
const live = new Map(); // server name → running state

function loadConfig() {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (Array.isArray(parsed?.servers)) return parsed;
  } catch {
    /* no config yet (or unreadable) — start empty */
  }
  return { servers: [] };
}

function saveConfig() {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  } catch (e) {
    console.error(`[mcp] could not save ${CONFIG_PATH}: ${e.message}`);
  }
}

// %NAME% / ${NAME} → environment value, so presets can point at folders that
// differ per machine; a leading ~ expands to the home folder, so ~/OneDrive
// works on macOS and Windows alike. Unknown names are left as the user typed.
const expand = (value) => {
  let out = String(value ?? "").replace(/%([A-Za-z_][A-Za-z0-9_]*)%|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, a, b) => {
    const v = process.env[a || b];
    return v || m;
  });
  if (out === "~" || out.startsWith("~/") || out.startsWith("~\\")) out = homedir() + out.slice(1);
  return out;
};

const signature = (e) => JSON.stringify([e.command, e.args, e.env, e.cwd]);

const childEnv = (entry) => {
  const out = {};
  for (const [k, v] of Object.entries(entry.env || {})) out[k] = expand(v);
  return out;
};

// Accepts either an object or "KEY=value" lines (the Settings textarea).
function envFrom(raw) {
  const out = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw).slice(0, 30)) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) out[k] = String(v).slice(0, 2000);
    }
    return out;
  }
  if (typeof raw === "string") {
    for (const line of raw.split("\n").slice(0, 30)) {
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      if (i > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) out[k] = line.slice(i + 1).trim().slice(0, 2000);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------

// On Windows `npx` is npx.cmd — batch files must go through a shell (Node
// refuses to spawn them directly) and the shell joins arguments with spaces,
// so anything containing a space or a shell metacharacter gets quoted.
const winQuote = (a) => (/[\s"&|<>^%()]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : String(a));

function spawnServer(st) {
  const useShell = process.platform === "win32";
  const command = expand(st.entry.command);
  const file = useShell && /\s/.test(command) && !command.startsWith('"') ? `"${command}"` : command;
  const argv = st.entry.args.map(expand).map((a) => (useShell ? winQuote(a) : a));

  const child = spawn(file, argv, {
    cwd: expand(st.entry.cwd) || ROOT,
    env: { ...process.env, ...childEnv(st.entry) },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    // Off Windows the server gets its own process group, so stop() can take
    // the whole tree (npx → node → server) down with one signal.
    detached: !useShell,
    ...(useShell ? { shell: true } : {}),
  });

  st.proc = child;
  st.buffer = "";
  st.stderr = [];

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    st.buffer += chunk;
    let i;
    while ((i = st.buffer.indexOf("\n")) >= 0) {
      const line = st.buffer.slice(0, i).trim();
      st.buffer = st.buffer.slice(i + 1);
      if (line) onMessage(st, line);
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    st.stderr.push(String(chunk).trim());
    if (st.stderr.length > STDERR_TAIL) st.stderr.splice(0, st.stderr.length - STDERR_TAIL);
  });

  child.on("error", (err) => {
    st.error = `${st.entry.command} failed to start: ${err.message}`;
    failPending(st, st.error);
    if (st.proc === child) {
      st.proc = null;
      st.ready = false;
      st.tools = [];
    }
  });

  child.on("exit", (code, signal) => {
    if (st.proc !== child) return; // we stopped it ourselves
    st.proc = null;
    st.ready = false;
    st.tools = [];
    const why = signal ? `was killed (${signal})` : `exited with code ${code}`;
    const tail = st.stderr.filter(Boolean).slice(-2).join(" ").slice(0, 300);
    st.error = `${st.entry.name} ${why}${tail ? ` — ${tail}` : ""}`;
    failPending(st, st.error);
  });
}

function send(st, payload) {
  if (!st.proc?.stdin || st.proc.stdin.destroyed) return false;
  try {
    return st.proc.stdin.write(JSON.stringify(payload) + "\n");
  } catch {
    return false;
  }
}

function request(st, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!st.proc) return reject(new Error(`${st.entry.name} is not running.`));
    const id = st.nextId++;
    const timer = setTimeout(() => {
      st.pending.delete(id);
      reject(new Error(`${method} timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
    st.pending.set(id, { resolve, reject, timer });
    if (!send(st, { jsonrpc: "2.0", id, method, params })) {
      clearTimeout(timer);
      st.pending.delete(id);
      reject(new Error(`${st.entry.name} stopped accepting messages.`));
    }
  });
}

function failPending(st, message) {
  for (const [, waiter] of st.pending) {
    clearTimeout(waiter.timer);
    waiter.reject(new Error(message));
  }
  st.pending.clear();
}

function onMessage(st, line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  // A response to something we asked.
  if (msg.id !== undefined && (Object.hasOwn(msg, "result") || Object.hasOwn(msg, "error"))) {
    const waiter = st.pending.get(msg.id);
    if (!waiter) return;
    st.pending.delete(msg.id);
    clearTimeout(waiter.timer);
    if (msg.error) waiter.reject(new Error(msg.error.message || `MCP error ${msg.error.code}`));
    else waiter.resolve(msg.result);
    return;
  }
  // A question from the server itself — answer it so nothing stalls.
  if (msg.id !== undefined && msg.method) {
    send(
      st,
      msg.method === "ping"
        ? { jsonrpc: "2.0", id: msg.id, result: {} }
        : { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } },
    );
  }
  // Notifications (progress, logging, cancelled) need no reply.
}

async function boot(st) {
  st.error = null;
  st.stderr = [];
  spawnServer(st);
  try {
    const init = await request(
      st,
      "initialize",
      { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "aetheris", version: "1.0.0" } },
      START_TIMEOUT,
    );
    send(st, { jsonrpc: "2.0", method: "notifications/initialized" });
    const list = await request(st, "tools/list", {}, START_TIMEOUT);
    st.tools = (Array.isArray(list?.tools) ? list.tools : []).filter((t) => t && typeof t.name === "string");
    if (!st.tools.length) throw new Error(`${st.entry.name} connected but offered no tools.`);
    st.serverInfo = init?.serverInfo || null;
    st.ready = true;
    console.log(`[mcp] ${st.entry.name} ready — ${st.tools.length} tools`);
  } catch (e) {
    st.error = e.message;
    stop(st);
    throw e;
  }
}

async function ensure(entry) {
  let st = live.get(entry.name);
  if (st && st.sig !== signature(entry)) {
    stop(st);
    live.delete(entry.name);
    st = null;
  }
  if (!st) {
    st = {
      name: entry.name,
      sig: signature(entry),
      entry,
      proc: null,
      ready: false,
      tools: [],
      pending: new Map(),
      nextId: 1,
      buffer: "",
      stderr: [],
      error: null,
      starting: null,
      serverInfo: null,
    };
    live.set(entry.name, st);
  } else {
    st.entry = entry;
  }
  if (st.ready) return st;
  if (!st.starting) {
    st.starting = boot(st).finally(() => {
      st.starting = null;
    });
  }
  await st.starting; // throws boot's own error if the server couldn't start
  return st;
}

function stop(st) {
  st.ready = false;
  const child = st.proc;
  st.proc = null;
  st.tools = [];
  failPending(st, `${st.name} stopped.`);
  if (!child || child.exitCode !== null || child.killed) return;
  if (process.platform === "win32") {
    // /T takes the whole tree (npx → node → server) down with it.
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } catch {
      /* already gone */
    }
  } else {
    // A negative pid signals the whole process group (see `detached` above).
    const groupKill = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          /* already gone */
        }
      }
    };
    groupKill("SIGTERM");
    setTimeout(() => groupKill("SIGKILL"), 2500).unref();
  }
}

// Orphaned MCP servers would outlive a dev-server restart, so take them along.
process.on("exit", () => {
  for (const st of live.values()) stop(st);
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function applyConfig(rawList) {
  const clean = [];
  const seen = new Set();
  for (const raw of Array.isArray(rawList) ? rawList : []) {
    const name = String(raw?.name || "").trim().slice(0, 40);
    const command = String(raw?.command || "").trim().slice(0, 300);
    if (!name || !command || seen.has(name)) continue;
    seen.add(name);
    clean.push({
      name,
      command,
      args: (Array.isArray(raw.args) ? raw.args : []).slice(0, 50).map((a) => String(a).slice(0, 400)),
      env: envFrom(raw.env),
      cwd: String(raw.cwd || "").trim().slice(0, 500),
      enabled: raw.enabled !== false,
    });
  }
  config = { servers: clean };
  saveConfig();

  for (const [name, st] of [...live.entries()]) {
    const entry = clean.find((s) => s.name === name);
    if (!entry) {
      stop(st);
      live.delete(name);
    } else if (entry.enabled === false || st.sig !== signature(entry)) {
      stop(st);
    }
  }
  // Warm up the enabled ones in the background: failures land in each server's
  // own error field, they don't fail the save request.
  Promise.allSettled(clean.filter((e) => e.enabled !== false).map(ensure));
}

async function describe(entry) {
  const base = {
    name: entry.name,
    command: entry.command,
    args: entry.args,
    env: entry.env,
    cwd: entry.cwd,
    enabled: entry.enabled !== false,
    running: false,
    tools: [],
    error: null,
  };
  if (!base.enabled) return base;
  try {
    const st = await ensure(entry);
    return {
      ...base,
      running: st.ready,
      serverInfo: st.serverInfo || undefined,
      tools: st.tools.map((t) => ({
        name: t.name,
        description: String(t.description || "").slice(0, 500),
        inputSchema: t.inputSchema,
      })),
    };
  } catch (e) {
    const st = live.get(entry.name);
    return { ...base, error: e.message, stderr: (st?.stderr || []).filter(Boolean).slice(-6) };
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 400_000) reject(new Error("Request too large."));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("That wasn't valid JSON."));
      }
    });
    req.on("error", reject);
  });

// MCP results are content blocks ({type:"text"|"image"|…}) — reduce them to
// what the model can use.
function flatten(result) {
  const parts = [];
  for (const c of Array.isArray(result?.content) ? result.content : []) {
    if (c?.type === "text") parts.push(String(c.text ?? ""));
    else if (c?.type === "resource") parts.push(String(c.resource?.text ?? c.resource?.uri ?? ""));
    else if (c?.type === "resource_link") parts.push(String(c.uri ?? ""));
    else if (c?.type === "image") parts.push("[image]");
  }
  let text = parts.join("\n").trim();
  if (text.length > MAX_RESULT_CHARS) text = text.slice(0, MAX_RESULT_CHARS) + "\n[…output truncated]";
  return text;
}

const findEntry = (name) => config.servers.find((s) => s.name === String(name || ""));

export async function mcpMiddleware(req, res, next) {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return next();
  }
  if (!url.pathname.startsWith("/__mcp/")) return next();
  const route = url.pathname.slice("/__mcp/".length);
  if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { error: "Method not allowed." });

  try {
    if (route === "servers" && req.method === "GET") {
      const servers = await Promise.all(config.servers.map(describe));
      return json(res, 200, { servers });
    }

    if (route === "config" && req.method === "POST") {
      const body = await readBody(req);
      applyConfig(body?.servers);
      return json(res, 200, { ok: true, saved: config.servers.length });
    }

    if (route === "call" && req.method === "POST") {
      const body = await readBody(req);
      const entry = findEntry(body?.server);
      if (!entry) return json(res, 404, { error: `No MCP server named “${body?.server}”.` });
      if (entry.enabled === false) return json(res, 400, { error: `${entry.name} is switched off in Settings.` });
      const tool = String(body?.tool || "");
      const st = await ensure(entry);
      if (!st.tools.some((t) => t.name === tool)) return json(res, 404, { error: `${entry.name} has no tool “${tool}”.` });
      const result = await request(
        st,
        "tools/call",
        { name: tool, arguments: body?.args && typeof body.args === "object" ? body.args : {} },
        CALL_TIMEOUT,
      );
      const text = flatten(result);
      if (result?.isError) return json(res, 200, { ok: false, error: text || "The tool reported an error." });
      return json(res, 200, { ok: true, text: text || "(the tool returned nothing)" });
    }

    if (route === "restart" && req.method === "POST") {
      const body = await readBody(req);
      const entry = findEntry(body?.server);
      if (!entry) return json(res, 404, { error: `No MCP server named “${body?.server}”.` });
      const st = live.get(entry.name);
      if (st) stop(st);
      const fresh = await ensure(entry);
      return json(res, 200, { ok: true, tools: fresh.tools.length });
    }

    return json(res, 404, { error: `Unknown MCP route: ${route}` });
  } catch (e) {
    return json(res, 502, { error: e?.message || "MCP request failed." });
  }
}
