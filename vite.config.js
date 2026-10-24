import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { webMiddleware } from "./scripts/web-middleware.mjs";
import { mcpMiddleware } from "./scripts/mcp-proxy.mjs";

// The web tools (search + page reading) need a same-origin fetch, so the dev
// *and* preview server expose /__web/search and /__web/read. The MCP proxy
// (scripts/mcp-proxy.mjs) lives there too — a page can't spawn a process, so
// /__mcp/* is where the browser starts and talks to MCP servers.
const webTools = {
  name: "aetheris-web-tools",
  configureServer(server) {
    server.middlewares.use(webMiddleware);
    server.middlewares.use(mcpMiddleware);
  },
  configurePreviewServer(server) {
    server.middlewares.use(webMiddleware);
    server.middlewares.use(mcpMiddleware);
  },
};

export default defineConfig({
  plugins: [react(), webTools],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Anytype's API is served by the desktop app on 127.0.0.1:31009 and sends no
      // CORS headers, so a page can't call it directly. Proxying it through the dev
      // server makes every /anytype/* request same-origin for the browser.
      "/anytype": {
        target: "http://127.0.0.1:31009",
        changeOrigin: true,
        // Anytype 403s any browser-originated request (it sees Sec-Fetch-*) that
        // doesn't carry a loopback Origin header, so stamp one on the way through.
        headers: { Origin: "http://127.0.0.1:31009" },
        rewrite: (p) => p.replace(/^\/anytype/, ""),
      },
    },
  },
});
