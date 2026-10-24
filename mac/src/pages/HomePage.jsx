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
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-12 sm:px-10 sm:pt-16 lg:px-14">
        <header className="rise flex items-center gap-5">
          <div className="logo-orb shrink-0" style={{ width: 64, height: 64 }} />
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-accent">{greeting()}</div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl lg:text-6xl">Aetheris</h1>
          </div>
        </header>

        <p className="rise mt-4 max-w-2xl text-base leading-relaxed text-dim sm:text-lg" style={{ animationDelay: "70ms" }}>
          A crew of planets, each with its own mind and its own colour. {agents.length} {agents.length === 1 ? "agent" : "agents"} ·{" "}
          {gems.length} {gems.length === 1 ? "gem" : "gems"}.
        </p>

        <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "140ms" }}>
          <button data-click onClick={() => newChat(startAgent)} data-testid="home-new-chat" className="btn-solid btn-accent">
            <Plus className="h-4 w-4" /> New chat{startAgent ? ` with ${startAgent.name}` : ""}
          </button>
          <button data-click onClick={() => nav("/agents")} data-testid="home-studio" className="btn-ghost">
            <Bot className="h-4 w-4" /> Agent studio
          </button>
          <button data-click onClick={() => nav("/gems")} data-testid="home-gems" className="btn-ghost">
            <Gem className="h-4 w-4" /> Gems
          </button>
          <button data-click onClick={() => nav("/todo")} data-testid="home-todo" className="btn-ghost">
            <MessageSquare className="h-4 w-4" /> To-do
          </button>
        </div>

        <section className="mt-14 sm:mt-16">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.28em] text-dim">Your planets</h2>
            <button data-click onClick={() => nav("/agents")} className="flex items-center gap-1 text-sm text-dim transition-colors hover:text-fg">
              Manage <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((a, i) => (
              <button
                key={a.id}
                data-click
                onClick={() => nav(`/agent/${a.id}`)}
                data-testid={`home-agent-${a.id}`}
                className="glass-card rise group flex items-center gap-5 rounded-3xl p-6 text-left"
                style={{ animationDelay: `${i * 55}ms`, "--glow": a.color }}
              >
                <AgentAvatar agent={a} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-display text-lg font-semibold text-fg">{a.name}</span>
                    <span className="truncate font-mono text-[10px] uppercase tracking-wider" style={{ color: a.color }}>{a.role}</span>
                  </div>
                  <div className="line-clamp-3 mt-2 text-sm leading-relaxed text-dim">{a.persona}</div>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-dim opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
            {!agents.length && (
              <button data-click onClick={() => nav("/agents")} className="glass-card rounded-3xl p-8 text-left text-base text-dim">
                No planets yet — create your first agent.
              </button>
            )}
          </div>
        </section>

        {recent.length > 0 && (
          <section className="mt-14 sm:mt-16">
            <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.28em] text-dim">Jump back in</h2>
            <div className="grid gap-3">
              {recent.map((c, i) => {
                const a = agents.find((x) => x.id === c.agentId);
                return (
                  <button
                    key={c.id}
                    data-click
                    onClick={() => nav(`/agent/${a.id}/chat/${c.id}`)}
                    data-testid={`home-recent-${c.id}`}
                    className="rise flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-colors hover:bg-[color:var(--hover)]"
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <AgentAvatar agent={a} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base text-fg">{c.title}</div>
                      <div className="truncate text-sm text-dim">
                        {a.name} · {c.messages.length} {c.messages.length === 1 ? "message" : "messages"} · {ago(c.updatedAt)}
                      </div>
                    </div>
                    {c.pinned ? <Pin className="h-4 w-4 shrink-0 text-accent" /> : <MessageSquare className="h-4 w-4 shrink-0 text-dim opacity-60" />}
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
