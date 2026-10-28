import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, MessageSquare, Plus, Sparkles } from "lucide-react";
import { useStore } from "../lib/store";
import { AgentAvatar } from "../components/AgentAvatar";
import { GemShape } from "../components/Gem";

const ago = (time) => {
  const seconds = Math.max(0, Math.floor((Date.now() - (time || Date.now())) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const stars = Array.from({ length: 58 }, (_, i) => ({
  left: `${(i * 47 + 13) % 100}%`,
  top: `${(i * 71 + 9) % 100}%`,
  opacity: 0.25 + ((i * 19) % 70) / 100,
  size: i % 11 === 0 ? 2 : 1,
  delay: `${(i % 9) * -0.7}s`,
}));

export default function GalaxyPage() {
  const { state, createConversation } = useStore();
  const nav = useNavigate();
  const { agents, conversations } = state;

  const agentData = useMemo(() => agents.map((agent, index) => {
    const chats = conversations
      .filter((conversation) => conversation.agentId === agent.id)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const gemMessages = conversations
      .filter((conversation) => conversation.agentId === agent.id)
      .flatMap((conversation) => (conversation.messages || [])
        .filter((message) => message.role === "user" && message.gems?.length)
        .map((message) => ({ message, conversation, time: message.createdAt || conversation.updatedAt || 0 })))
      .sort((a, b) => b.time - a.time);
    return { agent, index, chats, latestGem: gemMessages[0] || null };
  }), [agents, conversations]);

  const gemActivity = useMemo(() => {
    const agentById = Object.fromEntries(agents.map((agent) => [agent.id, agent]));
    return conversations
      .filter((conversation) => agentById[conversation.agentId])
      .flatMap((conversation) => (conversation.messages || [])
        .filter((message) => message.role === "user" && message.gems?.length)
        .flatMap((message) => message.gems.map((gem) => ({
          agent: agentById[conversation.agentId],
          gem,
          conversation,
          time: message.createdAt || conversation.updatedAt || 0,
        }))))
      .sort((a, b) => b.time - a.time)
      .slice(0, 6);
  }, [agents, conversations]);

  const startChat = (agent) => {
    if (!agent) return nav("/agents");
    const conversation = createConversation({ type: "chat", agentId: agent.id, title: "New chat" });
    nav(`/agent/${agent.id}/chat/${conversation.id}`);
  };

  const newestAgent = [...agentData].sort((a, b) => (b.chats[0]?.updatedAt || 0) - (a.chats[0]?.updatedAt || 0))[0]?.agent;

  return (
    <div className="h-full overflow-y-auto scroll-thin" data-testid="galaxy-page">
      <div className="mx-auto max-w-6xl px-5 pb-12 pt-8 sm:px-9 sm:pt-10 lg:px-12">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
              <span className="galaxy-live-dot" /> Aetheris · star map
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-fg sm:text-5xl">The Galaxy</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-dim sm:text-base">
              Your agents, in their own orbits. Every gem you throw leaves a little stardust behind.
            </p>
          </div>
          <button onClick={() => startChat(newestAgent || agents[0])} className="btn-solid btn-accent" data-testid="galaxy-new-chat">
            <Plus className="h-4 w-4" /> New transmission
          </button>
        </header>

        <section className="galaxy-stage" aria-label="Orbiting agent planets" data-testid="galaxy-system">
          <div className="galaxy-nebula galaxy-nebula-a" />
          <div className="galaxy-nebula galaxy-nebula-b" />
          <div className="galaxy-stars" aria-hidden="true">
            {stars.map((star, i) => <i key={i} style={{ left: star.left, top: star.top, opacity: star.opacity, width: star.size, height: star.size, animationDelay: star.delay }} />)}
          </div>

          {agentData.map(({ agent, index, chats, latestGem }) => {
            const ring = index % 5;
            const phase = (index * 67 + Math.floor(index / 5) * 31) % 360;
            const duration = 34 + ring * 6 + (index % 3) * 2;
            const latestChat = chats[0];
            const gem = latestGem?.message.gems?.[0];
            return (
              <div
                key={agent.id}
                className="galaxy-path"
                style={{ "--ring": ring, "--phase": `${phase}deg`, "--orbit-duration": `${duration}s`, "--orbit-delay": `${-index * 3.7}s` }}
              >
                <button
                  className="galaxy-world"
                  onClick={() => nav(latestChat ? `/agent/${agent.id}/chat/${latestChat.id}` : `/agent/${agent.id}`)}
                  data-testid={`galaxy-agent-${agent.id}`}
                  aria-label={`${agent.name}, ${agent.role}${gem ? `, latest gem /${gem.trigger}` : ""}`}
                  style={{ "--glow": agent.color }}
                >
                  <span className="galaxy-planet-wrap">
                    <AgentAvatar agent={agent} size={48} pulse={!!latestGem && Date.now() - latestGem.time < 300000} />
                    {gem && <span className="galaxy-planet-gem" style={{ "--gem-color": gem.color }} title={`Latest gem: /${gem.trigger}`}><GemShape color={gem.color} size={12} /></span>}
                  </span>
                  <span className="galaxy-name">{agent.name}</span>
                  <span className="galaxy-role">{agent.role}</span>
                  {gem && <span className="galaxy-gem-label"><GemShape color={gem.color} size={9} /> /{gem.trigger}</span>}
                </button>
              </div>
            );
          })}

          <div className="galaxy-sun" aria-label="Aetheris">
            <div className="galaxy-sun-aura" />
            <div className="galaxy-sun-core"><div className="logo-orb" /></div>
            <span className="galaxy-sun-label">AETHERIS</span>
          </div>

          {!agents.length && (
            <button className="galaxy-empty" onClick={() => nav("/agents")}>
              <Sparkles className="mx-auto mb-3 h-6 w-6 text-accent" />
              <span className="font-display text-lg text-fg">A universe waiting to happen</span>
              <span className="mt-1 block text-sm text-dim">Create your first agent to set a planet in motion.</span>
            </button>
          )}

          <div className="galaxy-coordinates" aria-hidden="true">LOCAL SYSTEM <span>·</span> {String(agents.length).padStart(2, "0")} ORBITS</div>
        </section>

        <section className="mt-8" aria-labelledby="galaxy-activity-title">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-dim">Signal log</div>
              <h2 id="galaxy-activity-title" className="mt-1 font-display text-xl font-semibold text-fg">Recent gem activity</h2>
            </div>
            <span className="font-mono text-[10px] text-dim">SAVED FROM YOUR CHATS</span>
          </div>
          {gemActivity.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {gemActivity.map(({ agent, gem, conversation, time }, i) => (
                <button
                  key={`${conversation.id}-${gem.id}-${i}`}
                  onClick={() => nav(`/agent/${agent.id}/chat/${conversation.id}`)}
                  className="galaxy-signal group flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left"
                  data-testid={`galaxy-gem-activity-${i}`}
                  style={{ "--signal-color": gem.color }}
                >
                  <AgentAvatar agent={agent} size={32} />
                  <GemShape color={gem.color} size={15} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg"><span className="font-medium">{agent.name}</span> received <span className="font-mono" style={{ color: gem.color }}>/{gem.trigger}</span></span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-dim"><MessageSquare className="h-3 w-3 shrink-0" /> {conversation.title} · {ago(time)}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-dim transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
                </button>
              ))}
            </div>
          ) : (
            <div className="galaxy-signal-empty rounded-2xl px-5 py-4 text-sm text-dim">
              No gems in orbit yet. Throw one into any chat and it’ll show up here, beside its planet.
            </div>
          )}
          <p className="mt-3 text-center text-[11px] text-dim">Your original Home is still right where it was in the sidebar.</p>
        </section>
      </div>
    </div>
  );
}
