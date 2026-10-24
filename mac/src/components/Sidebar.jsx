import { NavLink, matchPath, useLocation, useNavigate } from "react-router-dom";
import { Bot, Gem, Settings, Moon, Sun, KeyRound, PanelLeftClose, PanelLeftOpen, EyeOff, Search, Volume2, VolumeX, Keyboard, MessageSquare, Home, CalendarCheck } from "lucide-react";
import { useStore } from "../lib/store";
import { AgentAvatar } from "./AgentAvatar";

export const NAV = [
  { to: "/", label: "Home", icon: Home, id: "home", end: true },
  { to: "/agents", label: "Agent studio", icon: Bot, id: "agents" },
  { to: "/gems", label: "Gems", icon: Gem, id: "gems" },
  { to: "/todo", label: "To-do", icon: CalendarCheck, id: "todo" },
  { to: "/settings", label: "Settings", icon: Settings, id: "settings" },
];

const linkCls = ({ isActive }) =>
  `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "nav-active" : "text-dim hover:text-fg hover:bg-[color:var(--hover)]"}`;

export const useActiveAgentId = () => matchPath("/agent/:agentId/*", useLocation().pathname)?.params.agentId;

export const ThemeToggle = () => {
  const { state, setSettings } = useStore();
  const dark = state.settings.theme === "dark";
  return (
    <button data-click data-testid="theme-toggle" onClick={() => setSettings({ theme: dark ? "light" : "dark" })} className="btn-icon glass-pill h-9 w-9 text-fg" title="Toggle theme">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

const MuteToggle = () => {
  const { state, setSettings } = useStore();
  const { muted } = state.settings.sound;
  return (
    <button data-click data-testid="mute-toggle" onClick={() => setSettings({ sound: { ...state.settings.sound, muted: !muted } })} className="btn-icon glass-pill h-9 w-9 text-fg" title={muted ? "Unmute" : "Mute"}>
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  );
};

const AgentList = ({ rail }) => {
  const { state } = useStore();
  const nav = useNavigate();
  const activeId = useActiveAgentId();
  return (
    <div className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-thin ${rail ? "w-full space-y-2 py-1" : "space-y-1 pr-1"}`}>
      {state.agents.map((a, i) => (
        <button
          key={a.id}
          data-click
          data-testid={`sidebar-agent-${a.id}`}
          onClick={() => nav(`/agent/${a.id}`)}
          title={`${a.name} — ${a.status || a.role} · ${i + 1}`}
          className={`rise flex w-full items-center rounded-2xl transition-colors ${rail ? "justify-center px-1 py-2.5" : "gap-4 px-3 py-2.5"} ${a.id === activeId ? "nav-active" : "hover:bg-[color:var(--hover)]"}`}
          style={{ animationDelay: `${i * 45}ms` }}
        >
          <AgentAvatar agent={a} size={rail ? 28 : 32} />
          {!rail && (
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-fg">{a.name}</span>
              <span className="block truncate text-[11px] text-dim">{a.status || a.role}</span>
            </span>
          )}
          {!rail && i < 9 && <kbd className="font-mono text-[10px] text-dim opacity-60">{i + 1}</kbd>}
        </button>
      ))}
    </div>
  );
};

export const Sidebar = ({ onSearch, onHelp }) => {
  const { state, setSettings } = useStore();
  const mode = state.settings.sidebar || "open";
  if (mode === "hidden") return null;
  const rail = mode === "rail";
  const hasKey = !!state.settings.apiKey;
  return (
    <aside className={`glass hidden shrink-0 flex-col rounded-[28px] p-3 transition-[width] duration-300 md:flex ${rail ? "w-[84px] items-center" : "w-[260px]"}`} data-testid="sidebar" data-mode={mode}>
      <div className={`flex items-center pb-4 pt-2 ${rail ? "flex-col gap-3" : "gap-3 px-2"}`}>
        <div className="logo-orb shrink-0" />
        {!rail && (
          <div className="min-w-0 flex-1">
            <div className="font-display text-[17px] font-semibold tracking-tight text-fg">Aetheris</div>
            <div className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-dim">planets · gems</div>
          </div>
        )}
        <div className={`flex text-dim ${rail ? "flex-col" : ""}`}>
          <button data-click onClick={() => setSettings({ sidebar: rail ? "open" : "rail" })} data-testid={rail ? "sidebar-expand" : "sidebar-collapse"} className="btn-icon h-8 w-8 hover:text-fg" title={rail ? "Expand" : "Collapse"}>
            {rail ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button data-click onClick={() => setSettings({ sidebar: "hidden" })} data-testid="sidebar-hide" className="btn-icon h-8 w-8 hover:text-fg" title="Hide sidebar">
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      </div>
      <button data-click onClick={onSearch} data-testid="open-search" title="Search (⌘K)" className={`mb-3 flex items-center gap-2 rounded-2xl border border-[color:var(--line)] text-sm text-dim transition-colors hover:text-fg ${rail ? "h-10 w-10 justify-center" : "px-3 py-2"}`}>
        <Search className="h-4 w-4" /> {!rail && <><span className="flex-1 text-left">Search chats</span><kbd className="font-mono text-[10px]">⌘K</kbd></>}
      </button>
      {!rail && <div className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Agents</div>}
      <AgentList rail={rail} />
      <nav className={`mt-3 space-y-1 border-t border-[color:var(--line)] pt-3 ${rail ? "w-full" : ""}`}>
        {NAV.map(({ to, label, icon: Icon, id, end }) => (
          <NavLink key={to} to={to} end={end} data-click data-testid={`nav-${id}`} className={(p) => `${linkCls(p)} ${rail ? "justify-center" : ""}`} title={label}>
            <Icon className="h-4 w-4" /> {!rail && label}
          </NavLink>
        ))}
      </nav>
      <div className={`mt-3 flex items-center px-1 pt-1 ${rail ? "flex-col gap-2" : "gap-2"}`}>
        <NavLink to="/settings" data-testid="key-status" className="mr-auto flex items-center gap-2 text-xs text-dim hover:text-fg" title={hasKey ? "Key configured" : "No API key"}>
          <span className={`h-2 w-2 rounded-full ${hasKey ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-amber-400 shadow-[0_0_10px_#f59e0b]"}`} />
          {!rail && <><KeyRound className="h-3.5 w-3.5" /> {hasKey ? "Key set" : "No key"}</>}
        </NavLink>
        <button data-click onClick={onHelp} data-testid="open-shortcuts" className="btn-icon glass-pill h-9 w-9 text-fg" title="Shortcuts (?)"><Keyboard className="h-4 w-4" /></button>
        <MuteToggle />
        <ThemeToggle />
      </div>
    </aside>
  );
};

export const MobileNav = () => {
  const { state } = useStore();
  const first = state.agents[0];
  return (
    <div className="flex items-center gap-1 border-b border-[color:var(--line)] px-3 py-2 md:hidden" data-testid="mobile-nav">
      <div className="logo-orb mr-2 h-6 w-6" />
      {first && (
        <NavLink to={`/agent/${first.id}`} data-testid="mobile-nav-chats" className={({ isActive }) => `btn-icon h-9 w-9 ${isActive ? "nav-active" : "text-dim"}`}>
          <MessageSquare className="h-4 w-4" />
        </NavLink>
      )}
      {NAV.map(({ to, icon: Icon, id, end }) => (
        <NavLink key={to} to={to} end={end} data-testid={`mobile-nav-${id}`} className={({ isActive }) => `btn-icon h-9 w-9 ${isActive ? "nav-active" : "text-dim"}`}>
          <Icon className="h-4 w-4" />
        </NavLink>
      ))}
      <div className="ml-auto flex gap-1">
        <MuteToggle />
        <ThemeToggle />
      </div>
    </div>
  );
};
