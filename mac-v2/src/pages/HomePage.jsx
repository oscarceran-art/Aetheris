import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bot, CalendarDays, CheckCircle2, Clock3, Gem, MessageSquare, Pin, Plus, Sparkles } from "lucide-react";
import "../HomeTodo.css";
import { useStore } from "../lib/store";
import { AgentAvatar } from "../components/AgentAvatar";
import { OnboardingDialog } from "../components/OnboardingDialog";
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
  const { state, createConversation, presence } = useStore();
  const nav = useNavigate();
  const { agents, conversations, gems } = state;
  const todos = state.settings.todos || [];
  const today = localDateKey();

  const withAgent = useMemo(
    () => conversations.filter((c) => c.messages?.length && agents.some((a) => a.id === c.agentId)),
    [conversations, agents]
  );
  const pinned = useMemo(
    () => withAgent.filter((c) => c.pinned).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4),
    [withAgent]
  );
  const recent = useMemo(
    () => withAgent.filter((c) => !c.pinned).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 3),
    [withAgent]
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
  const resume = pinned[0] || recent[0];
  const startAgent = agents.find((a) => a.id === resume?.agentId) || agents[0];
  const chatsOf = (id) => conversations.filter((c) => c.agentId === id);
  const lastActive = (id) => chatsOf(id).reduce((m, c) => Math.max(m, c.updatedAt || 0), 0);

  const newChat = (agent) => {
    if (!agent) return nav("/agents");
    const c = createConversation({ type: "chat", agentId: agent.id, title: "New chat" });
    nav(`/agent/${agent.id}/chat/${c.id}`);
  };

  const stats = [
    { label: "Agents", value: agents.length, icon: Bot, color: "text-accent", action: () => nav("/agents"), testid: "home-stat-agents" },
    { label: "Open tasks", value: openTasks, icon: CheckCircle2, color: "text-emerald-400", action: () => nav("/todo"), testid: "home-stat-open-tasks" },
    { label: "Due today", value: dueToday, icon: Clock3, color: "text-amber-400", action: () => nav("/todo"), testid: "home-stat-due-today" },
    { label: "Chats", value: conversations.length, icon: MessageSquare, color: "text-violet-400", action: () => nav("/agents"), testid: "home-stat-conversations" },
  ];

  return (
    <div className="h-full overflow-y-auto scroll-thin" data-testid="home-page">
      {!state.settings.onboarded && <OnboardingDialog />}
      <div className="relative mx-auto max-w-7xl space-y-10 px-5 pb-20 pt-8 sm:px-8 sm:pt-11 lg:px-12">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[480px]"
          aria-hidden
          style={{ background: "radial-gradient(600px 300px at 15% 10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%), radial-gradient(700px 340px at 85% 0%, color-mix(in srgb, #22d3ee 10%, transparent), transparent 70%)" }}
        />

        <section className="home-hero rise relative py-4 sm:py-6 lg:py-8">
          <div className="relative z-10 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="home-kicker"><Sparkles className="h-3 w-3" /> Your creative workspace</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</span>
            </div>
            <h1 className="mt-5 max-w-3xl font-display text-3xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-4xl lg:text-5xl">
              {greeting()} <span className="home-title-accent">What’s on your mind?</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-dim sm:text-base">
              Bring a question, shape an idea, or pick up right where you left off. Your agents are ready when you are.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button data-click onClick={() => newChat(startAgent)} data-testid="home-new-chat" className="btn-solid btn-accent"><Plus className="h-4 w-4" /> New chat{startAgent ? ` · ${startAgent.name}` : ""}</button>
              {resume && (
                <button data-click onClick={() => nav(`/agent/${resume.agentId}/chat/${resume.id}`)} data-testid="home-resume" className="btn-ghost"><MessageSquare className="h-4 w-4" /> Resume · {(resume.title || "Untitled").slice(0, 24)}</button>
              )}
              <button data-click onClick={() => nav("/todo")} data-testid="home-todo" className="btn-ghost"><CalendarDays className="h-4 w-4" /> Open planner</button>
              {dueToday > 0 && (
                <button data-click onClick={() => nav("/todo")} data-testid="home-due-today" className="btn-ghost text-amber-400"><Clock3 className="h-4 w-4" /> {dueToday} due today</button>
              )}
            </div>
          </div>
        </section>

        {pinned.length > 0 && (
          <section aria-label="Pinned conversations">
            <div className="mb-4 flex items-center gap-2">
              <Pin className="h-3.5 w-3.5 text-accent" />
              <h2 className="font-display text-xl font-semibold text-fg">Pinned</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {pinned.map((c, i) => {
                const agent = agents.find((a) => a.id === c.agentId);
                return (
                  <button
                    key={c.id}
                    data-click
                    onClick={() => nav(`/agent/${c.agentId}/chat/${c.id}`)}
                    data-testid={`home-pinned-${c.id}`}
                    className="glass-card rise group rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5"
                    style={{ animationDelay: `${i * 45}ms` }}
                  >
                    <div className="flex items-center gap-2">
                      {agent && <AgentAvatar agent={agent} size={22} />}
                      <span className="truncate text-[10px] text-dim">{agent?.name} · {ago(c.updatedAt)}</span>
                      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-dim opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                    <div className="mt-2 truncate text-sm font-medium text-fg">{c.title || "Untitled"}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-accent">Meet the crew</div>
              <h2 className="mt-1 font-display text-xl font-semibold text-fg sm:text-2xl">Choose a perspective</h2>
            </div>
            <button data-click onClick={() => nav("/agents")} className="flex items-center gap-1 text-xs text-dim transition-colors hover:text-fg" data-testid="home-manage-agents">Agent studio <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent, i) => {
              const n = chatsOf(agent.id).length;
              const active = lastActive(agent.id);
              const live = presence === agent.id;
              return (
                <button
                  key={agent.id}
                  data-click
                  onClick={() => nav(`/agent/${agent.id}`)}
                  data-testid={`home-agent-${agent.id}`}
                  className="glass-card rise group flex min-h-0 items-center gap-4 rounded-2xl p-5 text-left transition-transform hover:-translate-y-0.5 sm:p-6"
                  style={{ animationDelay: `${i * 45}ms`, "--glow": agent.color }}
                >
                  <span className="relative shrink-0">
                    <AgentAvatar agent={agent} size={46} />
                    {live && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[color:var(--bg)] bg-emerald-400" data-testid={`home-presence-${agent.id}`} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-display text-lg font-semibold text-fg">{agent.name}</span>
                      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-dim opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                    </span>
                    <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: agent.color }}>{agent.role}</span>
                    <span className="mt-2 block text-[11px] text-dim">
                      {live ? <span className="text-emerald-400">live now</span> : active ? `active ${ago(active)}` : "no chats yet"}{n > 0 && ` · ${n} conversation${n === 1 ? "" : "s"}`}
                    </span>
                  </span>
                </button>
              );
            })}
            {!agents.length && <button data-click onClick={() => nav("/agents")} className="glass-card rounded-3xl p-6 text-left text-sm text-dim">Create your first agent to start building your crew.</button>}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="glass-card min-w-0 rounded-3xl p-6 sm:p-7">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div><div className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent">Pick up the thread</div><h2 className="mt-1 font-display text-xl font-semibold text-fg">Recent conversations</h2></div>
              <button data-click onClick={() => startAgent && newChat(startAgent)} className="btn-icon h-9 w-9 text-accent" title="Start a conversation" aria-label="Start a conversation"><Plus className="h-4 w-4" /></button>
            </div>
            {recent.length ? <div className="space-y-1">
              {recent.map((conversation) => {
                const agent = agents.find((a) => a.id === conversation.agentId);
                return (
                  <button key={conversation.id} data-click onClick={() => nav(`/agent/${agent.id}/chat/${conversation.id}`)} data-testid={`home-recent-${conversation.id}`} className="group flex w-full items-center gap-3 rounded-2xl px-3 py-4 text-left transition-colors hover:bg-[color:var(--hover)]">
                    <AgentAvatar agent={agent} size={31} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm text-fg">{conversation.title}</span><span className="mt-0.5 block truncate text-[10px] text-dim">{agent.name} · {ago(conversation.updatedAt)}</span></span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-dim opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </button>
                );
              })}
            </div> : <div className="rounded-2xl border border-dashed border-[color:var(--line)] px-4 py-8 text-center"><MessageSquare className="mx-auto h-5 w-5 text-dim" /><p className="mt-2 text-xs text-dim">Your conversations will show up here.</p><button data-click onClick={() => newChat(startAgent)} className="btn-ghost mt-2 text-xs"><Plus className="h-3.5 w-3.5" /> Start a chat</button></div>}
          </div>

          <div className="glass-card min-w-0 rounded-3xl p-6 sm:p-7">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div><div className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent">A little momentum</div><h2 className="mt-1 font-display text-xl font-semibold text-fg">Coming up</h2></div>
              <button data-click onClick={() => nav("/todo")} className="flex items-center gap-1 text-xs text-dim transition-colors hover:text-fg" data-testid="home-open-planner">Planner <ArrowRight className="h-3.5 w-3.5" /></button>
            </div>
            {upcoming.length ? <div className="space-y-1">
              {upcoming.map((task) => (
                <button key={task.id} data-click onClick={() => nav("/todo")} className="group flex w-full items-center gap-3 rounded-2xl px-3 py-4 text-left transition-colors hover:bg-[color:var(--hover)]" data-testid={`home-task-${task.id}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${task.due && task.due < today ? "bg-rose-400/10 text-rose-400" : "bg-[color:var(--hover)] text-accent"}`}><CheckCircle2 className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm text-fg">{task.title}</span><span className="mt-0.5 block text-[10px] text-dim">{task.due ? `${task.due < today ? "Overdue · " : "Due "}${formatDateKey(task.due)}` : "No due date"}</span></span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-dim opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div> : <div className="rounded-2xl border border-dashed border-[color:var(--line)] px-4 py-8 text-center"><CheckCircle2 className="mx-auto h-5 w-5 text-dim" /><p className="mt-2 text-xs text-dim">You’re all clear. Add a task when something comes up.</p><button data-click onClick={() => nav("/todo")} className="btn-ghost mt-2 text-xs"><Plus className="h-3.5 w-3.5" /> Open planner</button></div>}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Workspace overview">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <button key={stat.label} data-click onClick={stat.action} className="home-stat-card glass-card rise group flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition-transform hover:-translate-y-0.5 sm:gap-4 sm:px-5 sm:py-5" style={{ animationDelay: `${i * 45}ms` }} data-testid={stat.testid}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--hover)] ${stat.color}`}><Icon className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block font-display text-xl font-semibold text-fg">{stat.value}</span><span className="block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-dim sm:text-[10px]">{stat.label}</span></span>
                <ArrowRight className="ml-auto hidden h-4 w-4 text-dim opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
              </button>
            );
          })}
        </section>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-dim/70">
          <Gem className="h-3 w-3 text-accent" /> {gems.length} creative gems <span>·</span> local-first by design
        </div>
      </div>
    </div>
  );
}
