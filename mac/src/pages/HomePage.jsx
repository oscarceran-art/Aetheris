import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bot, CalendarDays, CheckCircle2, Clock3, Gem, MessageSquare, Pin, Plus, Sparkles } from "lucide-react";
import { version as appVersion } from "../../package.json";
import "../HomeTodo.css";
import { useStore } from "../lib/store";
import { AgentAvatar } from "../components/AgentAvatar";
import { formatDateKey, localDateKey } from "../lib/dates";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "A quiet hour for big ideas.";
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
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
  const todos = state.settings.todos || [];
  const today = localDateKey();

  const recent = useMemo(
    () => conversations
      .filter((c) => c.messages?.length && agents.some((a) => a.id === c.agentId))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 3),
    [conversations, agents]
  );
  const upcoming = useMemo(
    () => todos
      .filter((t) => !t.done)
      .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 3),
    [todos]
  );
  const dueToday = todos.filter((t) => !t.done && t.due === today).length;
  const openTasks = todos.filter((t) => !t.done).length;
  const startAgent = agents.find((a) => a.id === recent[0]?.agentId) || agents[0];

  const newChat = (agent) => {
    if (!agent) return nav("/agents");
    const c = createConversation({ type: "chat", agentId: agent.id, title: "New chat" });
    nav(`/agent/${agent.id}/chat/${c.id}`);
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin" data-testid="home-page">
      <div className="mx-auto max-w-7xl space-y-8 px-5 pb-16 pt-6 sm:px-8 sm:pt-9 lg:px-12">
        <section className="home-hero glass-card rise relative overflow-hidden rounded-[32px] p-6 sm:p-9 lg:grid lg:min-h-[330px] lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-11">
          <div className="home-hero-glow" aria-hidden="true" />
          <div className="relative z-10 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="home-kicker"><Sparkles className="h-3 w-3" /> Your creative workspace</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</span>
            </div>
            <h1 className="mt-5 max-w-xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-fg sm:text-5xl lg:text-[3.5rem]">
              {greeting()}<br /><span className="home-title-accent">What’s on your mind?</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-dim sm:text-base">
              Bring a question, shape an idea, or pick up right where you left off. Your agents are ready when you are.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button data-click onClick={() => newChat(startAgent)} data-testid="home-new-chat" className="btn-solid btn-accent"><Plus className="h-4 w-4" /> New chat{startAgent ? ` · ${startAgent.name}` : ""}</button>
              <button data-click onClick={() => nav("/todo")} data-testid="home-todo" className="btn-ghost"><CalendarDays className="h-4 w-4" /> Open planner</button>
            </div>
            <div className="home-release mt-7 max-w-sm" data-testid="home-release-progress">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-dim">Road to v1.0</span>
                <span className="font-mono text-[10px] text-fg">v{appVersion} <span className="text-accent">· 70%</span></span>
              </div>
              <div className="home-progress-track mt-2"><span style={{ width: "70%" }} /></div>
            </div>
          </div>

          <div className="home-constellation relative mx-auto mt-8 h-56 w-full max-w-sm lg:mt-0" aria-hidden="true">
            <div className="home-orbit home-orbit-one" />
            <div className="home-orbit home-orbit-two" />
            <div className="home-orbit home-orbit-three" />
            <div className="home-star home-star-a" />
            <div className="home-star home-star-b" />
            <div className="home-star home-star-c" />
            <div className="home-sun"><div className="logo-orb" /></div>
            {agents.slice(0, 3).map((agent, i) => (
              <div className={`home-agent-orbit home-agent-orbit-${i + 1}`} key={agent.id} style={{ "--agent-color": agent.color }}>
                <AgentAvatar agent={agent} size={i === 0 ? 50 : 38} />
              </div>
            ))}
            <div className="home-constellation-label"><span className="home-live-dot" /> {agents.length} minds in your orbit</div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Workspace overview">
          {[
            { label: "Your agents", value: agents.length, icon: Bot, color: "text-accent", action: () => nav("/agents"), testid: "home-stat-agents" },
            { label: "Open tasks", value: openTasks, icon: CheckCircle2, color: "text-emerald-400", action: () => nav("/todo"), testid: "home-stat-open-tasks" },
            { label: "Due today", value: dueToday, icon: Clock3, color: "text-amber-400", action: () => nav("/todo"), testid: "home-stat-due-today" },
            { label: "Conversations", value: conversations.length, icon: MessageSquare, color: "text-violet-400", action: () => nav("/agents"), testid: "home-stat-conversations" },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <button key={stat.label} data-click onClick={stat.action} className="glass-card rise group flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-transform hover:-translate-y-0.5 sm:gap-4 sm:px-5 sm:py-4" style={{ animationDelay: `${i * 45}ms` }} data-testid={stat.testid}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--hover)] ${stat.color}`}><Icon className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block font-display text-xl font-semibold text-fg">{stat.value}</span><span className="block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-dim sm:text-[10px]">{stat.label}</span></span>
                <ArrowRight className="ml-auto hidden h-4 w-4 text-dim opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
              </button>
            );
          })}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-accent">Meet the crew</div>
              <h2 className="mt-1 font-display text-2xl font-semibold text-fg">Choose a perspective</h2>
            </div>
            <button data-click onClick={() => nav("/agents")} className="flex items-center gap-1 text-xs text-dim transition-colors hover:text-fg" data-testid="home-manage-agents">Agent studio <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent, i) => (
              <button
                key={agent.id}
                data-click
                onClick={() => nav(`/agent/${agent.id}`)}
                data-testid={`home-agent-${agent.id}`}
                className="glass-card rise group flex min-h-36 items-start gap-4 rounded-3xl p-5 text-left transition-transform hover:-translate-y-1 sm:p-6"
                style={{ animationDelay: `${i * 45}ms`, "--glow": agent.color }}
              >
                <AgentAvatar agent={agent} size={46} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-lg font-semibold text-fg">{agent.name}</span>
                    <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-dim opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                  </div>
                  <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: agent.color }}>{agent.role}</span>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-dim">{agent.persona}</p>
                </div>
              </button>
            ))}
            {!agents.length && <button data-click onClick={() => nav("/agents")} className="glass-card rounded-3xl p-6 text-left text-sm text-dim">Create your first agent to start building your crew.</button>}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="glass-card min-w-0 rounded-3xl p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div><div className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent">Pick up the thread</div><h2 className="mt-1 font-display text-xl font-semibold text-fg">Recent conversations</h2></div>
              <button data-click onClick={() => startAgent && newChat(startAgent)} className="btn-icon h-9 w-9 text-accent" title="Start a conversation" aria-label="Start a conversation"><Plus className="h-4 w-4" /></button>
            </div>
            {recent.length ? <div className="space-y-1">
              {recent.map((conversation) => {
                const agent = agents.find((a) => a.id === conversation.agentId);
                return (
                  <button key={conversation.id} data-click onClick={() => nav(`/agent/${agent.id}/chat/${conversation.id}`)} data-testid={`home-recent-${conversation.id}`} className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-[color:var(--hover)]">
                    <AgentAvatar agent={agent} size={31} />
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 truncate text-sm text-fg">{conversation.pinned && <Pin className="h-3 w-3 shrink-0 text-accent" />}{conversation.title}</span><span className="mt-0.5 block truncate text-[10px] text-dim">{agent.name} · {ago(conversation.updatedAt)}</span></span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-dim opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </button>
                );
              })}
            </div> : <div className="rounded-2xl border border-dashed border-[color:var(--line)] px-4 py-8 text-center"><MessageSquare className="mx-auto h-5 w-5 text-dim" /><p className="mt-2 text-xs text-dim">Your conversations will show up here.</p><button data-click onClick={() => newChat(startAgent)} className="btn-ghost mt-2 text-xs"><Plus className="h-3.5 w-3.5" /> Start a chat</button></div>}
          </div>

          <div className="glass-card min-w-0 rounded-3xl p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div><div className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent">A little momentum</div><h2 className="mt-1 font-display text-xl font-semibold text-fg">Coming up</h2></div>
              <button data-click onClick={() => nav("/todo")} className="flex items-center gap-1 text-xs text-dim transition-colors hover:text-fg" data-testid="home-open-planner">Planner <ArrowRight className="h-3.5 w-3.5" /></button>
            </div>
            {upcoming.length ? <div className="space-y-1">
              {upcoming.map((task) => (
                <button key={task.id} data-click onClick={() => nav("/todo")} className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-[color:var(--hover)]" data-testid={`home-task-${task.id}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${task.due && task.due < today ? "bg-rose-400/10 text-rose-400" : "bg-[color:var(--hover)] text-accent"}`}><CheckCircle2 className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm text-fg">{task.title}</span><span className="mt-0.5 block text-[10px] text-dim">{task.due ? `${task.due < today ? "Overdue · " : "Due "}${formatDateKey(task.due)}` : "No due date"}</span></span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-dim opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div> : <div className="rounded-2xl border border-dashed border-[color:var(--line)] px-4 py-8 text-center"><CheckCircle2 className="mx-auto h-5 w-5 text-dim" /><p className="mt-2 text-xs text-dim">You’re all clear. Add a task when something comes up.</p><button data-click onClick={() => nav("/todo")} className="btn-ghost mt-2 text-xs"><Plus className="h-3.5 w-3.5" /> Open planner</button></div>}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-dim/70">
          <Gem className="h-3 w-3 text-accent" /> {gems.length} creative gems <span>·</span> local-first by design
        </div>
      </div>
    </div>
  );
}
