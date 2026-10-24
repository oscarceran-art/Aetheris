import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus, PanelLeftClose, PanelLeftOpen, ArrowDown, Maximize2, Minimize2 } from "lucide-react";
import { useStore } from "../lib/store";
import { streamInto } from "../lib/orchestrate";
import { anytypeFor, anytypeReady } from "../lib/anytype";
import { streamChat } from "../lib/openai";
import { gemSystem, resolveGems } from "../lib/gems";
import { docForMessage } from "../lib/docs";
import { chime, complete, receive, tick, whoosh } from "../lib/sound";
import { AgentAvatar } from "../components/AgentAvatar";
import { AgentMessage, UserMessage } from "../components/Message";
import { Composer } from "../components/Composer";
import { GemThrows } from "../components/GemThrow";
import { GemChip } from "../components/Gem";
import { ChatPanel } from "../components/ChatPanel";
import { useAutoScroll } from "../components/useAutoScroll";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const snap = (g) => ({ id: g.id, trigger: g.trigger, color: g.color, instruction: g.instruction });
const EMPTY_TEMPLATES = [];

// Stable identity that always calls the latest closure — lets memoized
// children skip re-rendering on every store update.
const useLatest = (fn) => {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...a) => ref.current(...a), []);
};

const useGemThrow = (planetRef) => {
  const reduce = useReducedMotion();
  const live = useRef(false);
  const [throws, setThrows] = useState([]);
  const [impact, setImpact] = useState(null);
  const [pulse, setPulse] = useState([]);
  const hit = (key, color) => {
    setImpact({ key, color });
    chime(color);
    if (live.current) setPulse((p) => [...p, color]);
  };
  const launch = (gems, from) => {
    if (!gems.length) return;
    const now = Date.now();
    if (reduce || !planetRef.current || !from) return gems.forEach((g, i) => setTimeout(() => hit(`${now}-${i}`, g.color), i * 350));
    const r = planetRef.current.getBoundingClientRect();
    const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    setThrows(gems.map((g, i) => ({ key: `${now}-${i}`, gem: g, from: { x: from.left + 56 + i * 30, y: from.top + 14 }, to, delay: i * 0.38 })));
    gems.forEach((_, i) => setTimeout(whoosh, i * 380));
  };
  const onImpact = (t) => {
    setThrows((x) => x.filter((y) => y.key !== t.key));
    hit(t.key, t.gem.color);
  };
  const setLive = (v) => {
    live.current = v;
    setPulse([]);
  };
  return { throws, impact, pulse, launch, onImpact, setLive };
};

const Confetti = ({ colors }) => (
  <div className="pointer-events-none absolute left-1/2 top-1/3 z-20" data-testid="confetti">
    {Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2;
      const d = 80 + ((i * 37) % 90);
      return <span key={i} className="confetti" style={{ "--dx": `${Math.cos(a) * d}px`, "--dy": `${Math.sin(a) * d}px`, "--r": `${i * 47}deg`, background: colors[i % colors.length], animationDelay: `${(i % 5) * 20}ms` }} />;
    })}
  </div>
);

const ChatRoom = ({ conv, agent, fx, setRunning }) => {
  const { state, addMessage, updateMessage, patchConversation, createConversation } = useStore();
  const nav = useNavigate();
  const [ctrl, setCtrl] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [revealDoneId, setRevealDoneId] = useState(null);
  const [confetti, setConfetti] = useState(null);
  const doneRef = useRef(null);
  const composerRef = useRef(null);
  const { ref: scrollRef, atBottom, toBottom } = useAutoScroll();
  const gems = useMemo(() => resolveGems(state.gems, agent.id), [state.gems, agent.id]);
  const msgs = conv.messages;
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const lastUserIdx = msgs.map((m) => m.role).lastIndexOf("user");
  const apiKey = state.settings.apiKey;
  const wps = state.settings.instant ? 0 : state.settings.wps || 10;

  // The pulsing "live" look (planet breathing, status dot, composer ring, reply
  // glow) keeps running until the reply has faded in on screen — i.e. past the
  // end of the stream, until the active message reports its reveal is done.
  const revealDone = useLatest((mid) => {
    if (mid !== activeId || doneRef.current === mid) return;
    doneRef.current = mid;
    setRevealDoneId(mid);
    complete(); // reply has fully appeared on screen
  });
  const activeReveal = activeId != null && revealDoneId !== activeId;
  const liveAnim = !!ctrl || activeReveal;
  useEffect(() => {
    if (liveAnim) return;
    setRunning(false);
    fx.setLive(false);
  }, [liveAnim]);

  const liveGems = (snaps = []) => snaps.map((s) => state.gems.find((g) => g.id === s.id) || (s.instruction && s)).filter(Boolean);

  // Attachments from the composer ride along as context: the model sees the
  // document / note text, while the transcript only shows a small chip for each.
  const withContext = (m) => {
    const parts = [];
    if (m.docs?.length) {
      parts.push(
        m.docs
          .map((d) => `Attached document — "${d.name}" (${d.kind || "doc"}):\n${d.text}${d.truncated ? "\n(document truncated)" : ""}`)
          .join("\n\n")
      );
    }
    if (m.notes?.length) {
      parts.push(
        m.notes
          .map((n) => `From my Anytype notes — "${n.name}":\n${n.markdown}${n.truncated ? "\n(note truncated)" : ""}`)
          .join("\n\n")
      );
    }
    if (!parts.length) return m.content;
    return `${parts.join("\n\n")}${m.content ? `\n\n${m.content}` : ""}`;
  };

  const autoTitle = async (q, a) => {
    try {
      const t = await streamChat({ apiKey, model: agent.model, messages: [{ role: "system", content: "Write a 2-5 word title for this chat. Reply with the title only, no quotes." }, { role: "user", content: `${q.slice(0, 400)}\n\n${a.slice(0, 400)}` }] });
      if (t.trim()) patchConversation(conv.id, { title: t.trim().replace(/^["']|["'.]$/g, "").slice(0, 60) });
    } catch {}
  };

  const run = async (history, userMsg, used, fromRect) => {
    const prompt = [...history.filter((m) => (m.content || m.notes?.length || m.docs?.length) && !m.error).map((m) => ({ role: m.role, content: withContext(m) })), { role: "user", content: withContext(userMsg) || "Go ahead." }];
    const inChars = agent.persona.length + gemSystem(used).length + prompt.reduce((s, m) => s + m.content.length, 0);
    const id = addMessage(conv.id, { role: "assistant", agentId: agent.id, content: "", streaming: true, gems: userMsg.gems, usage: { model: agent.model, inChars } });
    const c = new AbortController();
    setActiveId(id);
    setRevealDoneId(null);
    doneRef.current = null;
    setCtrl(c);
    setRunning(true);
    fx.setLive(true);
    fx.launch(used, fromRect || composerRef.current?.getBoundingClientRect());
    try {
      const out = await streamInto({ apiKey, agent, signal: c.signal, system: gemSystem(used), messages: prompt, anytype: anytypeFor(state.settings.anytype, agent), web: state.settings.web, onUpdate: (p) => updateMessage(conv.id, id, p) });
      receive();
      if (!history.length) {
        setConfetti(Date.now());
        setTimeout(() => setConfetti(null), 1600);
        autoTitle(userMsg.content || userMsg.docs?.[0]?.name || "", out);
      }
    } catch {}
    // ctrl covers the stream only; the pulsing "live" look is cleared by the
    // effect above once the reply has finished revealing on screen.
    setCtrl(null);
  };

  const send = (text, used, rect, attached = [], documents = []) => {
    tick();
    const notes = attached.map((n) => ({ id: n.id, name: n.name, markdown: n.markdown, ...(n.truncated ? { truncated: true } : {}) }));
    const docs = documents.map(docForMessage);
    const u = { role: "user", content: text, gems: used.map(snap), ...(notes.length ? { notes } : {}), ...(docs.length ? { docs } : {}) };
    if (!msgs.length) patchConversation(conv.id, { title: (text || docs.map((d) => d.name).join(", ") || notes.map((n) => n.name).join(", ") || used.map((g) => `/${g.trigger}`).join(" ")).slice(0, 48) });
    addMessage(conv.id, u);
    run(msgs, u, used, rect);
  };
  const resendFrom = (idx, content) => {
    const u = { ...msgs[idx], content };
    patchConversation(conv.id, { messages: [...msgs.slice(0, idx), u] });
    run(msgs.slice(0, idx), u, liveGems(u.gems));
  };
  const branch = (idx) => {
    const c = createConversation({ type: "chat", agentId: agent.id, title: `↳ ${conv.title}`, messages: msgs.slice(0, idx + 1).map((m) => ({ ...m, streaming: false })) });
    nav(`/agent/${agent.id}/chat/${c.id}`);
  };

  // Stable wrappers so memoized messages/composer don't re-render on every store update
  const sendStable = useLatest(send);
  const stopStable = useLatest(() => ctrl?.abort());
  const branchStable = useLatest((i) => branch(i));
  const editStable = useLatest((msgId, v) => {
    const i = msgsRef.current.findIndex((m) => m.id === msgId);
    if (i >= 0) resendFrom(i, v);
  });
  const regenerateStable = useLatest(() => {
    const ms = msgsRef.current;
    const ui = ms.map((m) => m.role).lastIndexOf("user");
    if (ui >= 0) resendFrom(ui, ms[ui].content);
  });

  return (
    <motion.div className="relative flex h-full flex-col" data-testid="chat-room" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
      {confetti && <Confetti key={confetti} colors={[agent.color, ...(msgs[0]?.gems || []).map((g) => g.color), "#ffffff"]} />}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        <div className="mx-auto max-w-3xl space-y-7 px-6 py-8">
          {!msgs.length && (
            <div className="rise py-16 text-center" data-testid="chat-empty">
              <p className="font-display text-xl text-fg">Say something to {agent.name}</p>
              <p className="mt-1 text-sm text-dim">Type <span className="font-mono text-fg">/</span> to throw a gem into the planet.</p>
              {anytypeReady(anytypeFor(state.settings.anytype, agent)) && (
                <p className="mt-1 text-sm text-dim" data-testid="chat-empty-anytype-hint">
                  Type <span className="font-mono text-fg">\</span> to attach one of your Anytype notes.
                </p>
              )}
            </div>
          )}
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <UserMessage key={m.id} msg={m} index={i} canEdit={!ctrl} onEdit={editStable} onBranch={branchStable} />
            ) : (
              <AgentMessage
                key={m.id}
                msg={m}
                agent={agent}
                wps={wps}
                index={i}
                live={m.id === activeId && liveAnim}
                onRevealDone={revealDone}
                shimmer={m.id === activeId ? fx.impact : null}
                gemPulse={m.id === activeId && liveAnim && fx.pulse.length ? fx.pulse : null}
                onBranch={branchStable}
                onRegenerate={regenerateStable}
                showRegenerate={!ctrl && i === msgs.length - 1 && lastUserIdx >= 0}
              />
            )
          )}
        </div>
      </div>
      <AnimatePresence>
        {!atBottom && (
          <motion.button initial={{ opacity: 0, y: 10, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: 10, x: "-50%" }} onClick={toBottom} data-testid="scroll-bottom" className="glass-strong btn-icon absolute bottom-32 left-1/2 z-10 h-10 w-10 text-fg">
            <ArrowDown className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
      <div ref={composerRef}>
        <Composer onSend={sendStable} running={!!ctrl} live={activeReveal} color={agent.color} gemColor={fx.pulse.length ? fx.pulse[fx.pulse.length - 1] : null} onStop={stopStable} noKey={!apiKey} gems={gems} templates={msgs.length ? EMPTY_TEMPLATES : agent.templates} draftKey={conv.id} placeholder={`Message ${agent.name}…`} testid="chat-composer" anytype={anytypeFor(state.settings.anytype, agent)} />
      </div>
    </motion.div>
  );
};

const EmptySpace = ({ agent, onNewChat }) => {
  const { state } = useStore();
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center" data-testid="agent-space-empty">
      <div className="rise mb-10"><AgentAvatar agent={agent} size={120} /></div>
      <p className="rise font-display text-2xl text-fg" style={{ animationDelay: "80ms" }}>Open a channel to {agent.name}</p>
      <p className="rise mt-2 max-w-md text-sm text-dim" style={{ animationDelay: "140ms" }}>{agent.persona}</p>
      <button onClick={onNewChat} className="rise btn-solid btn-accent mt-6" style={{ animationDelay: "200ms" }} data-testid="empty-new-chat"><Plus className="h-4 w-4" /> New chat</button>
      <div className="rise mt-8 flex flex-wrap justify-center gap-1.5" style={{ animationDelay: "260ms" }}>
        {resolveGems(state.gems, agent.id).map((g) => <GemChip key={g.id} gem={g} />)}
      </div>
    </div>
  );
};

const ModelSwitch = ({ agent }) => {
  const { state, upsertAgent } = useStore();
  const models = Array.from(new Set([...(state.settings.models || []), agent.model]));
  return (
    <Select value={agent.model} onValueChange={(v) => upsertAgent({ ...agent, model: v })}>
      <SelectTrigger className="hidden h-8 w-auto gap-2 rounded-full border-[color:var(--line)] bg-transparent px-3 font-mono text-[11px] text-dim sm:flex" data-testid="space-model-select"><SelectValue /></SelectTrigger>
      <SelectContent className="glass-menu max-h-72">
        {models.map((m) => <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

export default function AgentSpace() {
  const { agentId, convId } = useParams();
  const nav = useNavigate();
  const { state, setSettings, createConversation } = useStore();
  const planetRef = useRef(null);
  const fx = useGemThrow(planetRef);
  const [running, setRunning] = useState(false);
  const agent = state.agents.find((a) => a.id === agentId);
  const conv = state.conversations.find((c) => c.id === convId && c.agentId === agentId);
  const { lastChat = {} } = state.settings;
  useEffect(() => {
    if (conv && lastChat[agentId] !== conv.id) setSettings({ lastChat: { ...lastChat, [agentId]: conv.id } });
  }, [conv?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Full screen is just that: the browser fills the display. Nothing is hidden —
  // the sidebar, chat list and header all stay exactly where they are.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {} // the browser can refuse (needs a user gesture, or is already fullscreen)
  };
  if (!agent) return <Navigate to="/agents" replace />;
  if (convId && !conv) return <Navigate to={`/agent/${agentId}`} replace />;
  const last = !convId && state.conversations.find((c) => c.id === lastChat[agentId]);
  if (last) return <Navigate to={`/agent/${agentId}/chat/${last.id}`} replace />;
  const panelOpen = state.settings.chatPanel !== false;
  const newChat = () => {
    const c = createConversation({ type: "chat", agentId: agent.id, title: "New chat" });
    nav(`/agent/${agent.id}/chat/${c.id}`);
  };
  return (
    <div className="flex h-full flex-col" data-testid="agent-space">
      <header className="flex items-center gap-5 border-b border-[color:var(--line)] px-5 py-3 sm:px-7">
        <button onClick={() => setSettings({ chatPanel: !panelOpen })} data-click className="btn-icon hidden h-9 w-9 text-dim hover:text-fg md:grid" data-testid="toggle-chat-panel" title="Toggle chat list">
          {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <div ref={planetRef} className="p-3" data-testid="space-planet">
          <AgentAvatar agent={agent} size={56} pulse={running} gemPulse={fx.pulse.length ? fx.pulse : null} impact={fx.impact} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: agent.color }}>{agent.role}</div>
          <div className="font-display text-2xl font-semibold tracking-tight text-fg" data-testid="space-agent-name">{agent.name}</div>
          <div className="flex items-center gap-2 truncate text-xs text-dim" data-testid="agent-status">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? "status-live" : ""}`} style={{ background: agent.color }} />
            {running ? "thinking…" : agent.status || "ready"}
            {conv && <span className="truncate opacity-70" data-testid="chat-title">· {conv.title}</span>}
          </div>
        </div>
        <ModelSwitch agent={agent} />
      </header>
      <div className="flex min-h-0 flex-1">
        <AnimatePresence initial={false}>
          {panelOpen && (
            <motion.div key="panel" initial={{ width: 0, opacity: 0 }} animate={{ width: 288, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }} className="hidden shrink-0 overflow-hidden border-r border-[color:var(--line)] md:block">
              <ChatPanel agent={agent} activeId={convId} onNewChat={newChat} />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="min-w-0 flex-1">
          {conv ? <ChatRoom key={conv.id} conv={conv} agent={agent} fx={fx} setRunning={setRunning} /> : <EmptySpace agent={agent} onNewChat={newChat} />}
        </div>
      </div>
      <GemThrows throws={fx.throws} onImpact={fx.onImpact} />
    </div>
  );
}
