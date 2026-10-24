# Aetheris

> **Frozen build (Windows).** This root-level build is no longer maintained and will not be updated on GitHub. All future
> work happens in [`mac/`](mac/), which is the only supported version. Do not modify anything outside `mac/`.

A local-first multi-agent chat app. Runs entirely in your browser — your API key and all data stay on your device (localStorage). No backend.

## Requirements

- Node.js 18+ (tested on Node 24)
- Google Chrome (recommended — the double-click launcher and device file saving use Chrome features)

## Run it

**Windows — double click `Start Aetheris.bat`.** It installs dependencies on the first run, starts the dev server, and opens http://localhost:5173 in Chrome once it is ready. Keep the window open; close it (or press Ctrl+C) to stop the server.

**macOS** — the same app is in the `mac/` folder, with a `Start Aetheris.command` double-click launcher instead of the `.bat`. Copy that folder to your Mac and follow its README.

Or from a terminal:

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Where your data lives

- **In the browser.** Everything (agents, chats, gems, settings) is written to this browser's `localStorage` on the `http://localhost:5173` origin. It survives restarts but not clearing site data, and it is not shared with other browsers or ports.
- **On your device (recommended).** In **Settings → Local data → Save chats on this device**, pick a file (e.g. `aetheris-data.json`) once. From then on the whole workspace is mirrored into that file automatically after every change, so you always have a real file you own and can back up or move. Use **Load from file** to restore it, and **Stop** to turn the mirror off. Chrome/Edge/Opera only; Firefox and Safari can use **Export JSON** instead.
- API keys are never written into that file — they stay in `localStorage` / `.env` on this machine.

## Configure your OpenAI API key

Your key is read from the `.env` file (`VITE_OPENAI_API_KEY`) and used as the default. You can also set/change it any time in the app under **Settings → OpenAI API key**.

To change the key in `.env`:

1. Edit `.env` and replace the value
2. Restart the dev server (`Ctrl+C`, then `npm run dev`)

`.env` is gitignored — don't commit or share it.

## Anytype (read & write your vault)

Agents can search, read, create and update objects in your local [Anytype](https://anytype.io) vault.

1. Open the Anytype desktop app and create a key under **Settings → API Keys → Create new**.
2. In Aetheris, go to **Settings → Anytype**, paste the key and press **Connect**.
3. Pick the **default space**, then choose whether agents may write. Any agent can override that space in **Agent studio → Edit agent → Anytype space**.
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

Agents can search the open web and read the pages they find, so answers aren't stuck at their training date. Toggle it in **Settings → Web** (on by default; every agent gets both tools, and the card has a "Test a search" button).

- `web_search` returns titles, links and snippets; `web_read` downloads one page and strips it to readable text (the model gets the first ~8,000 characters).
- No API key: a browser can't call a search engine directly (no CORS), so requests go through two local endpoints on the dev server — `/__web/search` and `/__web/read` (`scripts/web-middleware.mjs`). The search tries DuckDuckGo, then its lite page, then Bing, and says so when an engine rate-limits the connection (free engines throttle shared connections; waiting a minute clears it).
- `/__web/read` only accepts public http(s) URLs — your router, localhost and this app itself are refused. Web text reaches the model as data, and the system prompt tells it never to follow instructions found inside a page.
- The prompt includes today's date, so "this week" means something.
- Works under both `npm run dev` and `npm run preview`.

## MCP servers (Word, PowerPoint, OneDrive, anything)

MCP (Model Context Protocol) servers are small local programs that give every agent extra tools — read and edit Word
documents, build PowerPoint decks, browse OneDrive and Outlook, query databases. Manage them in **Settings → MCP**; the
card has one-click presets and a Test button per server.

Two are configured and verified on this machine:

| Server | Package | What agents can do |
| --- | --- | --- |
| `word` | `npx -y @knorq/docx-mcp-server` (27 tools) | Read, create, edit, format, comment on `.docx` files — anywhere on disk, including inside OneDrive |
| `powerpoint` | `npx -y @lifeng688/pptx-mcp` (11 tools) | Create decks (from markdown, JSON outlines or slide by slide), read them back, replace text. The workspace is `~/OneDrive`, so decks live in your OneDrive folder |

How it works:

- A web page can't start a process, so the dev server runs the servers: it spawns each one, speaks MCP (JSON-RPC over
  stdin/stdout) and exposes `/__mcp/servers`, `/__mcp/config` and `/__mcp/call` (`scripts/mcp-proxy.mjs`). Every enabled
  server's tools ride along in the tool loop as `mcp__<server>__<tool>`.
- Config lives in `.mcp.json` next to the project — **not** in localStorage — so environment variables (API keys) never
  end up in an exported backup. Env values and the working directory may use `%NAME%` or `${NAME}` to reference other
  variables; the PowerPoint preset uses `~/OneDrive`.
- While a server is switched on its tool definitions add a few thousand tokens to every message (27 Word tools ≈ 2,500).
  Flip it off in Settings when you're not working with documents; each server keeps running (warm) until you restart the
  dev server.
- First start downloads the package through `npx`, so it can take 20–60 seconds once; after that it's warm and fast.
  Tool output reaches the model capped at ~12,000 characters per call.

### OneDrive, Outlook and the rest of Microsoft 365

The **OneDrive + Outlook** preset (`npx -y @juststas/graph-mcp`, 127 tools) needs a one-time, free Azure app
registration because Microsoft's Graph API works through OAuth — no way around that step:

1. Go to [entra.azure.com](https://entra.azure.com) → **App registrations** → **New registration** (name it anything,
   personal Microsoft account is fine).
2. Add a redirect URI of type "Mobile and desktop applications": `http://localhost:3000/auth/callback`.
3. Under **API permissions**, add delegated permissions: `Files.ReadWrite`, `Mail.Read`, `Calendars.Read`,
   `offline_access`, `User.Read`. Grant consent when asked.
4. Copy the **Application (client) ID** into the preset's `AZURE_CLIENT_ID=` line in Settings → MCP, then **Add server**.
5. In a chat, ask your agent to "sign in to Microsoft" — it calls the `graph_auth_login` tool, your browser opens the
   consent page, and after that it can search mail, read OneDrive files, list calendar events and more.

(Your synced OneDrive folder is also just a folder on this machine — the `word` server can already read every `.docx`
in it, and the PowerPoint workspace is your OneDrive root, so simple document work needs no cloud setup at all.)

## Production build

```bash
npm run build     # outputs to dist/
npm run preview   # serves the production build locally
```

## Project layout

```
index.html          App shell (loads /src/index.jsx)
vite.config.js      Vite config, "@" alias -> ./src
Start Aetheris.bat  Double-click launcher: server + Chrome
scripts/
  open-browser.ps1  Waits for the port, then opens Chrome
  web-middleware.mjs Local /__web endpoints: search + page reading
  mcp-proxy.mjs      Local /__mcp endpoints: starts + talks to MCP servers
.mcp.json            MCP server config (env values live here, not in the browser)
mac/                 macOS build: same src/, Start Aetheris.command + open-browser.sh
src/
  index.jsx         Entry: React root + React Query provider
  App.jsx           Routes
  App.css           App styles (glass, orbs, animations)
  index.css         Tailwind (compiled) + theme variables
  components/       UI components
  lib/              Store, OpenAI client, gems, orchestration, device file
  pages/            Route pages (Home, AgentSpace, Agents, Gems, Settings)
```

## Note on the original files

`src/index.css` and `src/App.css` were shipped as webpack css-loader bundles (JS wrappers around real CSS). They were extracted to plain CSS in place; the untouched originals are kept as `*.bundle.bak` next to them.
