import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bot, Gem, MessageSquare, Pin, Plus } from "lucide-react";
import { useStore } from "../lib/store";
import { AgentAvatar } from "../components/AgentAvatar";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - (t || Date.now())) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export default function HomePage() {
  const { state, createConversation } = useStore();
  const nav = useNavigate();
  const { agents, conversations, gems } = state;

  const recent = useMemo(
    () =>
      conversations
        .filter((c) => c.messages?.length && agents.some((a) => a.id === c.agentId))
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 4),
    [conversations, agents]
  );

  const startAgent = agents.find((a) => a.id === recent[0]?.agentId) || agents[0];

  const newChat = (agent) => {
    if (!agent) return nav("/agents");
    const c = createConversation({ type: "chat", agentId: agent.id, title: "New chat" });
    nav(`/agent/${agent.id}/chat/${c.id}`);
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin" data-testid="home-page">
      <div className="mx-auto max-w-5xl px-6 pb-16 pt-10 sm:px-10 sm:pt-14">
        <header className="rise flex items-center gap-4">
          <div className="logo-orb shrink-0" style={{ width: 54, height: 54 }} />
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">{greeting()}</div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Aetheris</h1>
          </div>
        </header>

        <p className="rise mt-3 max-w-xl text-sm leading-relaxed text-dim" style={{ animationDelay: "70ms" }}>
          A crew of planets, each with its own mind and its own colour. {agents.length} {agents.length === 1 ? "agent" : "agents"} ·{" "}
          {gems.length} {gems.length === 1 ? "gem" : "gems"}.
        </p>

        <div className="rise mt-6 flex flex-wrap gap-2" style={{ animationDelay: "140ms" }}>
          <button data-click onClick={() => newChat(startAgent)} data-testid="home-new-chat" className="btn-solid btn-accent">
            <Plus className="h-4 w-4" /> New chat{startAgent ? ` with ${startAgent.name}` : ""}
          </button>
          <button data-click onClick={() => nav("/agents")} data-testid="home-studio" className="btn-ghost">
            <Bot className="h-4 w-4" /> Agent studio
          </button>
          <button data-click onClick={() => nav("/gems")} data-testid="home-gems" className="btn-ghost">
            <Gem className="h-4 w-4" /> Gems
          </button>
        </div>

        <section className="mt-12">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-dim">Your planets</h2>
            <button data-click onClick={() => nav("/agents")} className="flex items-center gap-1 text-xs text-dim transition-colors hover:text-fg">
              Manage <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((a, i) => (
              <button
                key={a.id}
                data-click
                onClick={() => nav(`/agent/${a.id}`)}
                data-testid={`home-agent-${a.id}`}
                className="glass-card rise group flex items-center gap-4 rounded-2xl p-4 text-left"
                style={{ animationDelay: `${i * 55}ms`, "--glow": a.color }}
              >
                <AgentAvatar agent={a} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-display font-semibold text-fg">{a.name}</span>
                    <span className="truncate font-mono text-[10px] uppercase tracking-wider" style={{ color: a.color }}>{a.role}</span>
                  </div>
                  <div className="line-clamp-3 mt-1 text-xs leading-relaxed text-dim">{a.persona}</div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-dim opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
            {!agents.length && (
              <button data-click onClick={() => nav("/agents")} className="glass-card rounded-2xl p-6 text-left text-sm text-dim">
                No planets yet — create your first agent.
              </button>
            )}
          </div>
        </section>

        {recent.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-dim">Jump back in</h2>
            <div className="grid gap-2">
              {recent.map((c, i) => {
                const a = agents.find((x) => x.id === c.agentId);
                return (
                  <button
                    key={c.id}
                    data-click
                    onClick={() => nav(`/agent/${a.id}/chat/${c.id}`)}
                    data-testid={`home-recent-${c.id}`}
                    className="rise flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-[color:var(--hover)]"
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <AgentAvatar agent={a} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg">{c.title}</div>
                      <div className="truncate text-xs text-dim">
                        {a.name} · {c.messages.length} {c.messages.length === 1 ? "message" : "messages"} · {ago(c.updatedAt)}
                      </div>
                    </div>
                    {c.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-accent" /> : <MessageSquare className="h-3.5 w-3.5 shrink-0 text-dim opacity-60" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
