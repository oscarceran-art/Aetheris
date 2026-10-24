import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Copy, AlertTriangle, RotateCcw, Pencil, GitBranch, Volume2, Square, FileText, Paperclip, FastForward } from "lucide-react";
import { toast } from "sonner";
import { AgentAvatar, useCycle } from "./AgentAvatar";
import { Markdown } from "./Markdown";
import { GemChip, GemShape } from "./Gem";
import { estimate } from "../lib/cost";

const wordEnds = (s) => [...(s || "").matchAll(/\S+/g)].map((m) => m.index + m[0].length);
// Per-word fade length follows the Reply speed setting (Instant mode passes wps=0)
const fwSeconds = (wps) => Math.min(1.2, Math.max(0.35, 4 / wps));

const useReveal = (content, streaming, wps) => {
  const animate = useRef(streaming);
  const [n, setN] = useState(0);
  const [tailDone, setTailDone] = useState(false);
  const ends = useMemo(() => wordEnds(content), [content]);
  useEffect(() => {
    if (!animate.current || !wps || n >= ends.length) return;
    const t = setTimeout(() => setN((x) => x + 1), 1000 / wps);
    return () => clearTimeout(t);
  }, [n, ends.length, wps]);
  // Once the last word lands, keep the fade alive for one word-length so it
  // fades in like the rest instead of popping to full opacity.
  useEffect(() => {
    if (!animate.current || !wps || streaming || tailDone || !ends.length || n < ends.length) return;
    const t = setTimeout(() => setTailDone(true), fwSeconds(wps) * 1000 + 60);
    return () => clearTimeout(t);
  }, [streaming, n, ends.length, wps, tailDone]);
  if (!animate.current || !wps) return { text: content, revealing: streaming };
  const caught = n >= ends.length;
  const tailing = ends.length > 0 && caught && !tailDone;
  return { text: caught ? content : content.slice(0, ends[n - 1] || 0), revealing: streaming || !caught || tailing };
};

const Act = ({ icon: Icon, onClick, testid, title, active }) => (
  <button onClick={onClick} data-testid={testid} title={title} className={`transition-colors hover:text-fg ${active ? "text-accent" : ""}`}>
    <Icon className="h-3.5 w-3.5" />
  </button>
);

const Edit = ({ msg, onSave, onCancel }) => {
  const [v, setV] = useState(msg.content);
  return (
    <div className="glass-pill w-full max-w-[78%] rounded-3xl p-3">
      <textarea autoFocus value={v} onChange={(e) => setV(e.target.value)} rows={3} className="w-full resize-none bg-transparent px-2 text-[15px] text-fg outline-none" data-testid={`edit-input-${msg.id}`} />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost py-1.5 text-xs" data-testid={`edit-cancel-${msg.id}`}>Cancel</button>
        <button onClick={() => v.trim() && onSave(v.trim())} className="btn-solid btn-accent py-1.5 text-xs" data-testid={`edit-save-${msg.id}`}>Save & resend</button>
      </div>
    </div>
  );
};

export const UserMessage = memo(({ msg, index, canEdit, onEdit, onBranch }) => {
  const [editing, setEditing] = useState(false);
  return (
    <div className="group flex flex-col items-end gap-2 msg-in" data-testid={`message-user-${msg.id}`}>
      {(msg.gems?.length > 0 || msg.notes?.length > 0 || msg.docs?.length > 0) && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {msg.gems?.map((g) => <GemChip key={g.id} gem={g} testid={`message-gem-${msg.id}-${g.trigger}`} />)}
          {msg.docs?.map((d) => (
            <span
              key={d.id}
              data-testid={`message-doc-${msg.id}-${d.id}`}
              title={`${(d.text || "").slice(0, 600)}${d.truncated ? "\n… (truncated)" : ""}`}
              className="flex items-center gap-1.5 rounded-full border border-[color:var(--line)] px-2.5 py-0.5 text-[11px] text-dim"
            >
              <Paperclip className="h-3 w-3 text-accent" />
              <span className="max-w-[180px] truncate">{d.name}</span>
              {d.kind && <span className="font-mono text-[9px] uppercase tracking-wider">{d.kind}</span>}
            </span>
          ))}
          {msg.notes?.map((n) => (
            <span
              key={n.id}
              data-testid={`message-note-${msg.id}-${n.id}`}
              title={(n.markdown || "").slice(0, 600)}
              className="flex items-center gap-1.5 rounded-full border border-[color:var(--line)] px-2.5 py-0.5 text-[11px] text-dim"
            >
              <FileText className="h-3 w-3 text-accent" />
              <span className="max-w-[180px] truncate">{n.name}</span>
            </span>
          ))}
        </div>
      )}
      {editing ? (
        <Edit msg={msg} onCancel={() => setEditing(false)} onSave={(v) => { setEditing(false); onEdit(msg.id, v); }} />
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-dim opacity-0 transition-opacity group-hover:opacity-100">
            {canEdit && <Act icon={Pencil} onClick={() => setEditing(true)} testid={`edit-message-${msg.id}`} title="Edit & resend" />}
            <Act icon={GitBranch} onClick={() => onBranch(index)} testid={`branch-message-${msg.id}`} title="Branch from here" />
          </div>
          {msg.content && <div className="glass-pill max-w-[78vw] rounded-3xl rounded-br-lg px-5 py-3 text-[15px] leading-relaxed whitespace-pre-wrap sm:max-w-xl">{msg.content}</div>}
        </div>
      )}
    </div>
  );
});

const speak = (text, setSpeaking) => {
  const u = new SpeechSynthesisUtterance(text.replace(/[#*_`>[\]()-]/g, " "));
  u.onend = u.onerror = () => setSpeaking(false);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  setSpeaking(true);
};

export const AgentMessage = memo(({ msg, agent, shimmer, gemPulse, wps = 10, live = false, onSkipReveal, onRevealDone, index, onRegenerate, showRegenerate, onBranch }) => {
  const { text, revealing } = useReveal(msg.content, msg.streaming, wps);
  // Word fade length follows the Reply speed setting; Instant mode (wps=0) = no fade
  const fwDur = wps ? `${fwSeconds(wps).toFixed(2)}s` : "0s";
  const everRevealed = useRef(false);
  const notified = useRef(false);
  if (revealing) everRevealed.current = true;
  // Tell the room when this reply has fully appeared on screen so the pulsing
  // "live" sequence runs until the text is done fading in, not just until the
  // model stops streaming. Fires once, 500ms after the reveal settles.
  useEffect(() => {
    if (revealing || !everRevealed.current || notified.current) return;
    const t = setTimeout(() => {
      if (notified.current) return;
      notified.current = true;
      onRevealDone?.(msg.id);
    }, 500);
    return () => clearTimeout(t);
  }, [revealing]); // eslint-disable-line react-hooks/exhaustive-deps
  const [speaking, setSpeaking] = useState(false);
  const replyRef = useRef(null);
  const firstShimmer = useRef(shimmer?.key);
  const tint = useCycle(gemPulse);
  useEffect(() => {
    if (!shimmer || shimmer.key === firstShimmer.current || !replyRef.current) return;
    replyRef.current.animate([{ filter: `drop-shadow(0 0 10px ${shimmer.color})` }, { filter: "drop-shadow(0 0 0 transparent)" }], { duration: 900, easing: "ease-out" });
  }, [shimmer]);
  const copy = () => {
    navigator.clipboard.writeText(msg.content);
    toast.success("Copied");
  };
  const est = msg.usage && !msg.streaming && msg.content ? estimate(msg.usage.model, msg.usage.inChars, msg.content) : null;
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  return (
    <div className="group flex gap-4 msg-in" data-testid={`message-agent-${msg.id}`}>
      <AgentAvatar agent={agent} size={34} pulse={msg.streaming || live} gemPulse={gemPulse} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-xs">
          <span className="font-display font-semibold text-fg">{agent?.name || "Agent"}</span>
          <span className="text-dim">{agent?.role}</span>
          {msg.gems?.map((g) => (
            <span key={g.id} title={`/${g.trigger}`} data-testid={`reply-gem-marker-${msg.id}-${g.trigger}`}><GemShape color={g.color} size={9} /></span>
          ))}
          {!msg.streaming && (
            <div className="ml-auto flex gap-2.5 text-dim opacity-0 transition-opacity group-hover:opacity-100">
              {msg.content && <Act icon={Copy} onClick={copy} testid={`copy-message-${msg.id}`} title="Copy" />}
              {msg.content && canSpeak && <Act icon={speaking ? Square : Volume2} active={speaking} onClick={() => (speaking ? (window.speechSynthesis.cancel(), setSpeaking(false)) : speak(msg.content, setSpeaking))} testid={`speak-message-${msg.id}`} title="Read aloud" />}
              <Act icon={GitBranch} onClick={() => onBranch(index)} testid={`branch-reply-${msg.id}`} title="Branch from here" />
              {showRegenerate && <Act icon={RotateCcw} onClick={onRegenerate} testid={`regenerate-message-${msg.id}`} title="Regenerate" />}
            </div>
          )}
          {live && wps > 0 && (
            <button
              onClick={onSkipReveal}
              data-click
              data-testid={`skip-reveal-${msg.id}`}
              title="Show this reply instantly"
              aria-label="Show this reply instantly"
              className={`${msg.streaming ? "ml-auto" : ""} inline-flex items-center gap-1 rounded-full border border-[color:var(--line)] px-2 py-1 text-[11px] text-dim transition-colors hover:text-fg`}
            >
              <FastForward className="h-3 w-3" /> Show instantly
            </button>
          )}
        </div>
        <div ref={replyRef} className={`reply text-[15px] leading-relaxed ${tint ? "gem-pulse" : ""}`} style={{ "--fw-dur": fwDur, ...(tint ? { "--tint": tint } : {}) }} data-testid={`reply-text-${msg.id}`}>
          {msg.toolStatus && msg.streaming && (
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] text-dim" data-testid={`tool-status-${msg.id}`}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {msg.toolStatus}…
            </div>
          )}
          {text ? <Markdown fade={revealing}>{text}</Markdown> : revealing && <Skeleton />}
          {msg.error && (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400" data-testid="message-error">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {msg.error}
            </div>
          )}
        </div>
        {!msg.streaming && msg.content && est && (
          <span className="mt-2 block font-mono text-[10px] text-dim opacity-0 transition-opacity group-hover:opacity-100" data-testid={`cost-${msg.id}`}>~{est.ti + est.to} tok · ${est.cost.toFixed(4)}</span>
        )}
      </div>
    </div>
  );
});

export const Skeleton = () => (
  <div className="space-y-2 py-1" data-testid="thinking-indicator">
    {[88, 72, 54].map((w) => <div key={w} className="skeleton h-3 rounded-full" style={{ width: `${w}%` }} />)}
  </div>
);
