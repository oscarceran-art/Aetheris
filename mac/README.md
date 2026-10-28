# Aetheris (macOS)

A local-first multi-agent chat app. Runs entirely in your browser — your API key and all data stay on your device (localStorage). No backend.

This is the **macOS app** and the only supported version of Aetheris.

**Current development milestone:** v0.8.0 · about 80% toward v1.0. See the [GitHub releases](https://github.com/oscarceran-art/Aetheris/releases) for versioned milestones.

## Requirements

- macOS 12 or newer (Apple Silicon or Intel)
- Node.js 18+ (tested on Node 24) — get the LTS installer from [nodejs.org](https://nodejs.org)
- Google Chrome (recommended — the launcher and device file saving use Chrome features)

## Run it

**macOS — double-click `Start Aetheris.command`.** It installs dependencies on the first run, starts the dev server, and opens http://localhost:5173 in Chrome once it is ready. Keep the Terminal window open; press `Ctrl+C` in it (or close it) to stop the server.

**First time only** — make the launcher executable. Open Terminal in this folder and run:

```bash
chmod +x "Start Aetheris.command" scripts/open-browser.sh
```

If macOS says the file is from an unidentified developer, right-click `Start Aetheris.command` → **Open** → **Open** once. You can also skip double-clicking entirely and run it with:

```bash
bash "Start Aetheris.command"
```

Or start it by hand from a terminal:

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Where your data lives

- **In the browser.** Everything (agents, chats, gems, settings) is written to this browser's `localStorage` on the `http://localhost:5173` origin. It survives restarts but not clearing site data, and it is not shared with other browsers or ports.
- **On your device (recommended).** In **Settings → Local data → Save chats on this device**, pick a file once (e.g. `~/Documents/aetheris-data.json`). From then on the whole workspace is mirrored into that file automatically after every change, so you always have a real file you own and can back up or move. Use **Load from file** to restore it, and **Stop** to turn the mirror off. Chrome/Edge/Opera only; Firefox and Safari can use **Export JSON** instead.
- API keys are never written into that file — they stay in `localStorage` / `.env` on this machine.

## Configure your OpenAI API key

Your key is read from the `.env` file (`VITE_OPENAI_API_KEY`) and used as the default. You can also set/change it any time in the app under **Settings → OpenAI API key**.

`.env` is not included (it's gitignored). Create it from the template:

```bash
cp .env.example .env
```

Then edit `.env` and replace the placeholder, and restart the dev server (`Ctrl+C`, then `npm run dev`).

`.env` is gitignored — don't commit or share it.

## Anytype (read & write your vault)

Agents can search, read, create and update objects in your local [Anytype](https://anytype.io) vault.

1. Open the Anytype desktop app and create a key under **Settings → API Keys → Create new**.
2. In Aetheris, go to **Settings → Anytype**, paste the key and press **Connect**.
3. Optionally choose a **default space** in Settings; no space is selected automatically. Agents can select their own space in **Agent studio → Edit agent → Anytype space**. Turn off Anytype tools in Settings to keep their tool definitions out of prompts.
4. That's it — ask an agent *"search my Anytype for the project plan and summarise it"* or *"save this answer to Anytype as a page called …"*.

How it works: Anytype's REST API only listens on `127.0.0.1:31009` and deliberately sends no CORS headers, so the browser can't call it directly. The dev server proxies `/anytype/*` to it (`vite.config.js`) and stamps a loopback `Origin` header, which is what Anytype's origin gate requires for browser-originated requests. Aetheris talks to the **v2** API: current Anytype releases issue *space-scoped* keys (a grant over one or more spaces) and `/v1` refuses those by design, while v2 accepts them. Reads use `?format=md`, creates send `{name, markdown, type}`, and updates are sent as ordered ops (`set_properties` to rename, `insert_blocks` to add text, `delete_block` to rewrite the body).

Notes:

- The Anytype desktop app must be **running** while you chat; the key stays in localStorage like the OpenAI key.
- This proxy only exists on the Vite dev server — `npm run preview` (production build) won't have it.
- Anytype rate-limits **writes** to ~1/second, so agents shouldn't be asked to create dozens of objects at once.
- `VITE_ANYTYPE_API_KEY` in `.env` is loaded as the initial key (same treatment as the OpenAI key), so a fresh install connects without retyping it.

## Pulling a note into a prompt (`\` in the composer)

You don't have to make the agent go looking for a note. In the chat composer, type `\` and a picker opens over the agent's Anytype space:

- `\` on its own lists the notes you edited most recently; keep typing (`\innovation`) to search names and content.
- Use ↑/↓ and Enter, or click a result, to attach it. It appears as a chip above your message — press the ✕ on the chip to detach it, or attach several.
- The note's full text is sent to the model as context (**capped at 4,000 characters**, and the model is told when a note was cut short), while your transcript only shows a small chip so it stays readable. Hover a chip in your message to check what was sent.
- Each agent searches *its own* space if it has one (Agent studio → Edit agent → Anytype space), otherwise the default space from Settings.

## Live web access (`web_search` + `web_read`)

Agents can search the open web and read the pages they find, so answers aren't stuck at their training date. Toggle it with the **globe button in the chat composer** (or in **Settings → Web**; on by default, and every agent gets both tools). The Settings card also has a "Test a search" button.

- `web_search` returns titles, links and snippets; `web_read` downloads one page and strips it to readable text (the model gets the first ~8,000 characters).
- No API key: a browser can't call a search engine directly (no CORS), so requests go through two local endpoints on the dev server — `/__web/search` and `/__web/read` (`scripts/web-middleware.mjs`). The search tries DuckDuckGo, then its lite page, then Bing, and says so when an engine rate-limits the connection (free engines throttle shared connections; waiting a minute clears it).
- `/__web/read` only accepts public http(s) URLs — your router, localhost and this app itself are refused. Web text reaches the model as data, and the system prompt tells it never to follow instructions found inside a page.
- The prompt includes today's date, so "this week" means something.
- Works under both `npm run dev` and `npm run preview`.

## MCP servers (optional extra tools)

MCP (Model Context Protocol) servers are small local programs that give every agent extra tools — search files, query
databases, talk to local services. Manage them in **Settings → MCP tools**; the card has an Add server form and a Test
button per server.

How it works:

- A web page can't start a process, so the dev server runs the servers: it spawns each one, speaks MCP (JSON-RPC over
  stdin/stdout) and exposes `/__mcp/servers`, `/__mcp/config` and `/__mcp/call` (`scripts/mcp-proxy.mjs`). Every enabled
  server's tools ride along in the tool loop as `mcp__<server>__<tool>`.
- Config lives in `.mcp.json` next to the project — **not** in localStorage — so environment variables (API keys) never
  end up in an exported backup. `.mcp.json` is gitignored. Env values and the working directory may use `%NAME%` or
  `${NAME}` to reference other variables, and `~` means your home folder.
- While a server is switched on its tool definitions add tokens to every message. Flip it off in Settings when you're not
  using it; each server keeps running (warm) until you restart the dev server.
- First start downloads the package through `npx`, so it can take 20–60 seconds once; after that it's warm and fast.
  Tool output reaches the model capped at ~12,000 characters per call.

There are no built-in presets. Add any server by giving its command, arguments, environment and (optionally) a working
directory.

## Production build

```bash
npm run build     # outputs to dist/
npm run preview   # serves the production build locally
```

## Project layout

```
index.html              App shell (loads /src/index.jsx)
vite.config.js          Vite config, "@" alias -> ./src
Start Aetheris.command  Double-click launcher: server + Chrome (macOS)
scripts/
  open-browser.sh       Opens the app in Chrome, or the default browser
  web-middleware.mjs    Local /__web endpoints: search + page reading
  mcp-proxy.mjs         Local /__mcp endpoints: starts + talks to MCP servers
.mcp.json               MCP server config, created when you add one (gitignored)
src/
  index.jsx             Entry: React root + React Query provider
  App.jsx               Routes
  App.css               App styles (glass, orbs, animations)
  index.css             Tailwind (compiled) + theme variables
  components/           UI components
  lib/                  Store, OpenAI client, gems, orchestration, web/MCP tools, device file
  pages/                Route pages (Home, AgentSpace, Agents, Gems, Settings)
```

## Note on the original files

`src/index.css` and `src/App.css` were shipped as webpack css-loader bundles (JS wrappers around real CSS). They were extracted to plain CSS in place; the untouched originals are kept as `*.bundle.bak` next to them.
