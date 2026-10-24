import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate, matchPath } from "react-router-dom";
import { motion } from "framer-motion";
import { KeyRound, ArrowRight, PanelLeftOpen } from "lucide-react";
import { Sidebar, MobileNav } from "./Sidebar";
import { SearchPalette, ShortcutsDialog } from "./Palettes";
import { useStore } from "../lib/store";
import { click } from "../lib/sound";

const LiquidBackground = () => (
  <div className="liquid-bg" aria-hidden>
    <div className="orb orb-a" />
    <div className="orb orb-b" />
    <div className="orb orb-c" />
    <div className="grain" />
  </div>
);

const KeyBanner = () => {
  const { state } = useStore();
  const { pathname } = useLocation();
  if (state.settings.apiKey || pathname.startsWith("/settings")) return null;
  return (
    <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-fg sm:mx-8" data-testid="api-key-banner">
      <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <span className="flex-1">Your agents need an OpenAI API key. It stays in this browser only.</span>
      <Link to="/settings" data-testid="api-key-banner-button" className="flex items-center gap-1 font-semibold text-amber-700 hover:underline dark:text-amber-400">
        Add key <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};

const ShowSidebarTab = () => {
  const { state, setSettings } = useStore();
  if (state.settings.sidebar !== "hidden") return null;
  return (
    <button data-click onClick={() => setSettings({ sidebar: "open" })} data-testid="sidebar-show" title="Show sidebar" className="glass fixed left-0 top-1/2 z-30 hidden -translate-y-1/2 rounded-r-2xl border-l-0 px-1.5 py-4 text-dim transition-colors hover:text-fg md:block">
      <PanelLeftOpen className="h-4 w-4" />
    </button>
  );
};

const NEXT_SIDEBAR = { open: "rail", rail: "hidden", hidden: "open" };

const useShortcuts = ({ setSearch, setHelp }) => {
  const { state, setSettings, createConversation } = useStore();
  const nav = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    const newChat = () => {
      const agentId = matchPath("/agent/:agentId/*", pathname)?.params.agentId || state.agents[0]?.id;
      if (!agentId) return;
      const c = createConversation({ type: "chat", agentId, title: "New chat" });
      nav(`/agent/${agentId}/chat/${c.id}`);
    };
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "k") return e.preventDefault() || setSearch((v) => !v);
      if (mod && k === "b") return e.preventDefault() || setSettings({ sidebar: NEXT_SIDEBAR[state.settings.sidebar] || "open" });
      if (e.altKey && e.code === "KeyN") return e.preventDefault() || newChat();
      if (typing || mod || e.altKey || document.querySelector("[role=dialog]")) return;
      if (e.key === "?") setHelp(true);
      else if (k === "f") {
        // Browser full screen only — nothing is hidden.
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen?.().catch(() => {});
      }
      else if (k === "n") newChat();
      else if (e.key === "/" || k === "i") {
        e.preventDefault();
        window.dispatchEvent(new Event("aetheris:focus-composer"));
      } else if (/^[1-9]$/.test(e.key)) {
        const a = state.agents[+e.key - 1];
        if (a) nav(`/agent/${a.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.agents, state.settings.sidebar, pathname, nav, setSettings, createConversation, setSearch, setHelp]);
};

const pageKey = (p) => (p.startsWith("/agent/") ? p.split("/").slice(0, 3).join("/") : p);

export default function Layout() {
  const { pathname } = useLocation();
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  useShortcuts({ setSearch, setHelp });

  useEffect(() => {
    const onClick = (e) => e.target.closest?.('[data-click], [role="switch"], [role="option"], [role="menuitem"], [role="tab"]') && click();
    const onDown = (e) => {
      const el = e.target.closest?.(".btn-solid, .btn-ghost, .btn-icon");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const s = document.createElement("span");
      s.className = "press-ripple";
      s.style.left = `${e.clientX - r.left}px`;
      s.style.top = `${e.clientY - r.top}px`;
      el.appendChild(s);
      setTimeout(() => s.remove(), 650);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <LiquidBackground />
      <ShowSidebarTab />
      <div className="relative z-10 flex h-full gap-3 p-2 sm:p-3">
        <Sidebar onSearch={() => setSearch(true)} onHelp={() => setHelp(true)} />
        <main className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px]" data-testid="main-panel">
          <MobileNav />
          <KeyBanner />
          <div className="min-h-0 flex-1">
            <motion.div key={pageKey(pathname)} className="h-full" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
              <Outlet />
            </motion.div>
          </div>
        </main>
      </div>
      <SearchPalette open={search} onOpenChange={setSearch} />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </div>
  );
}
