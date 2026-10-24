# Repository rules — read this before changing anything

This repository contains two separate builds of Aetheris:

| Path | Platform | Status |
| --- | --- | --- |
| `mac/` | macOS | **Active — the only maintained build** |
| repository root | Windows | **Frozen — do not modify** |

## Hard rules

1. **Never modify the non-macOS build.** That means everything outside `mac/`: `src/`, `index.html`,
   `vite.config.js`, `scripts/`, `package.json`, `package-lock.json`, `Start Aetheris.bat`, and the root
   `README.md` (its frozen notice is the only exception).
2. Make every app change inside `mac/`.
3. The Windows/root build is **not published or updated on GitHub**. Do not prepare, commit, or push updates,
   fixes, or documentation for it.
4. Do not "sync" or copy changes from `mac/` into the root build.
5. `.env` and `.mcp.json` hold secrets and are gitignored. Never commit them, print their values, or copy them
   into docs.

## Working in `mac/`

- Start: `npm install && npm run dev` (http://localhost:5173), or double-click `Start Aetheris.command`.
- Build check: `npx vite build`.
- The app is a static Vite/React SPA; there is no backend. Data lives in browser `localStorage`.
- Word, PowerPoint and OneDrive/Outlook MCP presets were removed on request. Keep MCP support generic; do not
  add presets back.
