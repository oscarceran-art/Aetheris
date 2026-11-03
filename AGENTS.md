# Repository rules — read this before changing anything

This repository contains two separate builds of Aetheris:

| Path | Platform | Status |
| --- | --- | --- |
| `mac/` | macOS | **Active — the maintained v0.8 build (do not modify for the v2 batch)** |
| `mac-v2/` | macOS | **v0.9 improvement batch — the working copy (all new changes go here)** |
| repository root | Windows | Discontinued — removed |


## Working in `mac/`

- Start: `npm install && npm run dev` (http://localhost:5173), or double-click `Start Aetheris.command`.
- Build check: `npx vite build`.
- The app is a static Vite/React SPA; there is no backend. Data lives in browser `localStorage`.
- Word, PowerPoint and OneDrive/Outlook MCP presets were removed on request. Keep MCP support generic; do not
  add presets back.
