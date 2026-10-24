// Anytype integration — lets an agent read and write the user's local Anytype vault.
//
// Anytype's REST API is served by the Anytype desktop app on http://127.0.0.1:31009.
// It deliberately sends no CORS headers, so a web page cannot call it directly: the
// dev server proxies /anytype -> 127.0.0.1:31009 (see vite.config.js), which makes
// every request below same-origin. The desktop app has to be running for any of this
// to work.
//
// We talk to the **v2** API. Current Anytype releases hand out *space-scoped* API
// keys (a "grant" over one or more spaces) and /v1 refuses those by design; v2
// accepts them. In v2 an object is a JSON document: reading with `?format=md` gives
// markdown, creating takes `{name, markdown, type}`, and updating goes through an
// ordered list of ops (`set_properties` to rename, `insert_blocks` with markdown to
// add text, `delete_block` to clear the body).

const RESULT_CHARS = 6000;

export const ANYTYPE_DEFAULT_BASE = "/anytype";

const baseOf = (cfg) => String(cfg?.base || ANYTYPE_DEFAULT_BASE).replace(/\/+$/, "");

// Anything that needs the desktop app + a key
export const anytypeReady = (cfg) => !!(cfg?.enabled && cfg?.apiKey);

// An agent can pin its own Anytype space; otherwise the one chosen in Settings
// acts as the default.
export const anytypeFor = (cfg, agent) =>
  agent?.anytypeSpace
    ? { ...cfg, spaceId: agent.anytypeSpace, spaceName: agent.anytypeSpaceName || agent.anytypeSpace }
    : cfg;

async function call(cfg, path, { method = "GET", body, signal } = {}) {
  if (!cfg?.apiKey) throw new Error("No Anytype API key — add one in Settings → Anytype.");
  let res;
  try {
    res = await fetch(`${baseOf(cfg)}/v2${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Can't reach Anytype — is the desktop app running and open?");
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* proxy/error page, not JSON */
  }
  if (!res.ok) {
    const msg = json?.message || json?.error?.message || (text || "").slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(`Anytype: ${msg}`);
  }
  return json;
}

const spacePath = (cfg) => {
  if (!cfg?.spaceId) throw new Error("No Anytype space selected — pick one in Settings → Anytype.");
  return encodeURIComponent(cfg.spaceId);
};

const objPath = (cfg, id) => `/spaces/${spacePath(cfg)}/objects/${encodeURIComponent(id)}`;

// Objects come back as {id, name, type, properties:{snippet,…}} — flatted to the
// handful of fields the model (and the composer's `\` picker) needs.
export const brief = (o) => {
  const snippet = String(o.properties?.snippet || o.snippet || "").replace(/\s+/g, " ").trim();
  return {
    id: o.id,
    name: o.name || o.properties?.name || "(untitled)",
    type: o.type || null,
    ...(snippet ? { snippet: snippet.slice(0, 200) } : {}),
  };
};

/* ---------------- plain API helpers (used by Settings too) ---------------- */

export const listSpaces = async (cfg, signal) => (await call(cfg, "/spaces?limit=100", { signal }))?.data || [];

export const searchObjects = async (cfg, { query, type, limit = 10 } = {}, signal) => {
  const n = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const body = { query: query || "", fields: ["id", "name", "type", "snippet"] };
  if (type) body.type = type;
  return (await call(cfg, `/spaces/${spacePath(cfg)}/search?limit=${n}`, { method: "POST", body, signal }))?.data || [];
};

export const listObjects = async (cfg, { type, limit = 25 } = {}, signal) => {
  const n = Math.min(Math.max(Number(limit) || 25, 1), 100);
  // The v2 list endpoint can't filter by type; search can.
  if (type) return searchObjects(cfg, { query: "", type, limit: Math.min(n, 25) }, signal);
  const q = new URLSearchParams({ limit: String(n), fields: "id,name,type,snippet" });
  return (await call(cfg, `/spaces/${spacePath(cfg)}/objects?${q}`, { signal }))?.data || [];
};

// The markdown rendering starts with the title as an `#` heading — pull it out so
// the model isn't shown the name twice.
export const getObject = async (cfg, id, signal) => {
  const r = await call(cfg, `${objPath(cfg, id)}?format=md`, { signal });
  if (!r) return null;
  const lines = String(r.markdown || "").split("\n");
  let name = "";
  if (/^#\s+\S/.test(lines[0] || "")) {
    name = lines.shift().replace(/^#\s+/, "").trim();
  }
  const markdown = lines
    .join("\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/^\s*\n/, "");
  return { id: r.id || id, name: name || "(untitled)", type: r.type || null, markdown, etag: r.etag };
};

export const createObject = async (cfg, { name, body = "", type_key = "page" } = {}, signal) => {
  if (!String(name || "").trim()) throw new Error("A name is required to create an Anytype object.");
  const type = type_key || "page";
  const r = await call(cfg, `/spaces/${spacePath(cfg)}/objects`, {
    method: "POST",
    body: { name, markdown: body, type },
    signal,
  });
  return { id: r?.id, name, type: r?.type || type, etag: r?.etag };
};

const blockIds = async (cfg, id, signal) =>
  ((await call(cfg, objPath(cfg, id), { signal }))?.blocks || []).map((b) => b.id).filter(Boolean);

export const updateObject = async (cfg, { id, name, markdown, mode = "replace" } = {}, signal) => {
  if (!id) throw new Error("An object id is required.");
  const ops = [];
  if (String(name || "").trim()) ops.push({ op: "set_properties", set: { name } });
  if (typeof markdown === "string" && markdown.length) {
    if (mode !== "append") {
      // Reverse order: children come after their parent in the flat block list, so
      // deleting deepest-first keeps every delete targeting a childless block.
      const ids = (await blockIds(cfg, id, signal)).reverse();
      for (const b of ids) ops.push({ op: "delete_block", id: b });
    }
    ops.push({ op: "insert_blocks", markdown });
  }
  if (!ops.length) throw new Error("Nothing to update — pass a name or some markdown.");
  const r = await call(cfg, objPath(cfg, id), { method: "PATCH", body: { ops }, signal });
  return { id, name, etag: r?.etag, stats: r?.diff_stats };
};

/* ------------------------------- OpenAI tools ------------------------------ */

export const ANYTYPE_TOOLS = [
  {
    type: "function",
    function: {
      name: "anytype_search",
      description: "Search the user's Anytype space by text. Returns matching objects with their ids, names and a short snippet. Use this first when the user refers to their notes/documents.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Words to look for in object names and content." },
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Max results, default 10." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "anytype_list",
      description: "List objects in the Anytype space, most recently modified first. Optionally filter by an object type key such as page, note or task.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "Optional type key, e.g. page, note, task." },
          limit: { type: "integer", minimum: 1, maximum: 100, description: "Max results, default 25." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "anytype_read",
      description: "Read one Anytype object (title + markdown body) by its id. Ids come from anytype_search or anytype_list.",
      parameters: { type: "object", properties: { id: { type: "string", description: "Object id." } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "anytype_create",
      description: "Create a new object (page) in the user's Anytype space with a title and a markdown body. Only available when write access is enabled.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Title of the new object." },
          body: { type: "string", description: "Markdown body." },
          type_key: { type: "string", description: "Optional type key, defaults to page." },
        },
        required: ["name", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "anytype_update",
      description: "Update an existing Anytype object by id: rename it and/or rewrite its markdown body. Only available when write access is enabled.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Object id to update." },
          name: { type: "string", description: "New title (optional)." },
          markdown: { type: "string", description: "Markdown to write into the body (optional)." },
          mode: {
            type: "string",
            enum: ["replace", "append"],
            description: "replace (default) swaps the whole body for `markdown`; append adds `markdown` at the end and keeps what's there.",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "anytype_spaces",
      description: "List the Anytype spaces available to this API key.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const WRITE_TOOLS = new Set(["anytype_create", "anytype_update"]);

export const toolLabel = (name, args = {}) =>
  ({
    anytype_search: `searching Anytype for “${args.query || ""}”`,
    anytype_read: "reading an Anytype object",
    anytype_list: "listing Anytype objects",
    anytype_create: `writing to Anytype${args.name ? ` — “${args.name}”` : ""}`,
    anytype_update: `updating Anytype${args.name ? ` — “${args.name}”` : ""}`,
    anytype_spaces: "listing Anytype spaces",
  }[name] || name);

// Executes a tool call and returns a compact JSON-able result for the model.
export const runAnytypeTool = async (name, args = {}, cfg, signal) => {
  if (WRITE_TOOLS.has(name) && !cfg?.write) {
    return { error: "Write access is turned off in Settings → Anytype. Ask the user to enable it or answer without saving." };
  }
  switch (name) {
    case "anytype_spaces":
      return { spaces: (await listSpaces(cfg, signal)).map((s) => ({ id: s.id, name: s.name })) };
    case "anytype_search":
      return { results: (await searchObjects(cfg, args, signal)).map(brief) };
    case "anytype_list":
      return { objects: (await listObjects(cfg, args, signal)).map(brief) };
    case "anytype_read": {
      const o = await getObject(cfg, args.id, signal);
      if (!o) return { error: "Object not found." };
      return { id: o.id, name: o.name, type: o.type, markdown: (o.markdown || "").slice(0, RESULT_CHARS) };
    }
    case "anytype_create": {
      const o = await createObject(cfg, args, signal);
      return { created: { id: o?.id, name: o?.name, type: o?.type }, note: "Saved to Anytype." };
    }
    case "anytype_update": {
      const o = await updateObject(cfg, args, signal);
      return { updated: { id: o?.id, name: o?.name, mode: args.mode === "append" ? "append" : "replace" }, note: "Updated in Anytype." };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
};

// System-prompt addendum describing the tools that are actually available.
export const anytypeSystem = (cfg) => {
  if (!anytypeReady(cfg)) return "";
  const write = cfg.write
    ? "You may also create and update objects with anytype_create and anytype_update (anytype_update rewrites the body unless you pass mode: \"append\")."
    : "You have read-only access — do not attempt to create or update objects.";
  return [
    "You are connected to the user's Anytype vault (their local notes and documents).",
    cfg.spaceName || cfg.spaceId ? `Default space: ${cfg.spaceName || cfg.spaceId}.` : "",
    "Use anytype_search / anytype_list / anytype_read before answering questions about their notes, and quote titles so they can find the object. Ids are opaque — never show them to the user.",
    write,
    "If a tool fails because the API key, space or desktop app is missing, say so plainly instead of guessing.",
  ]
    .filter(Boolean)
    .join(" ");
};
