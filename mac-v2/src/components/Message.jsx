import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Copy, AlertTriangle, RotateCcw, Pencil, GitBranch, Volume2, Square, FileText, Paperclip, FastForward, Send, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { AgentAvatar, useCycle } from "./AgentAvatar";
import { Markdown } from "./Markdown";
import { GemChip, GemShape } from "./Gem";
import { estimate } from "../lib/cost";

const wordEnds = (s) => [...(s || "").matchAll(/\S+/g)].map((m) => m.index + m[0].length);
// Per-word fade length follows the Reply speed setting (Instant mode passes wps=0)
const fwSeconds = (wps) => Math.min(1.2, Math.max(0.35, 4 / wps));
// Replies longer than this start clamped with a "Show more" toggle.
const LONG_REPLY = 2000;

const fmtTime = (t) => {
  try {
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

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
  <button onClick={onClick} data-testid={testid} title={title} aria-label={title} className={`msg-act transition-colors hover:text-fg ${active ? "text-accent" : ""}`}>
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

// Attachments on a user message: images get thumbnails + a lightbox, text
// attachments expand inline so "what did I send?" is one click away.
const Attachments = ({ msg }) => {
  const [expanded, setExpanded] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const docs = msg.docs || [];
  const notes = msg.notes || [];
  if (!docs.length && !notes.length) return null;
  const open = [...docs, ...notes.map((n) => ({ ...n, kind: "note", text: n.markdown, chars: (n.markdown || "").length }))].find((a) => a.id === expanded);
  return (
    <>
      <div className="flex flex-wrap justify-end gap-1.5">
        {docs.map((d) =>
          d.kind === "image" && d.dataUrl ? (
            <button
              key={d.id}
              onClick={() => setLightbox(d)}
              data-testid={`message-doc-${msg.id}-${d.id}`}
              title={`${d.name} — click to view`}
              className="spring-in flex items-center gap-2 rounded-2xl border border-[color:var(--line)] p-1 pr-2.5 text-[11px] text-dim transition-colors hover:text-fg"
            >
              <img src={d.dataUrl} alt={d.name} className="h-9 w-9 rounded-xl object-cover" />
              <span className="max-w-[140px] truncate">{d.name}</span>
            </button>
          ) : (
            <button
              key={d.id}
              onClick={() => setExpanded(expanded === d.id ? null : d.id)}
              data-testid={`message-doc-${msg.id}-${d.id}`}
              title={`${(d.text || "").slice(0, 600)}${d.truncated ? "\n… (truncated)" : ""}`}
              aria-expanded={expanded === d.id}
              className="flex items-center gap-1.5 rounded-full border border-[color:var(--line)] px-2.5 py-0.5 text-[11px] text-dim transition-colors hover:text-fg"
            >
              <Paperclip className="h-3 w-3 text-accent" />
              <span className="max-w-[180px] truncate">{d.name}</span>
              {d.kind && <span className="font-mono text-[9px] uppercase tracking-wider">{d.kind}</span>}
            </button>
          )
        )}
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={() => setExpanded(expanded === n.id ? null : n.id)}
            data-testid={`message-note-${msg.id}-${n.id}`}
            title={(n.markdown || "").slice(0, 600)}
            aria-expanded={expanded === n.id}
            className="flex items-center gap-1.5 rounded-full border border-[color:var(--line)] px-2.5 py-0.5 text-[11px] text-dim transition-colors hover:text-fg"
          >
            <FileText className="h-3 w-3 text-accent" />
            <span className="max-w-[180px] truncate">{n.name}</span>
          </button>
        ))}
      </div>
      {open && open.kind !== "image" && (
        <div className="glass-pill max-h-56 w-full max-w-[78%] overflow-y-auto scroll-thin rounded-2xl p-4 text-left" data-testid={`message-attach-preview-${msg.id}`}>
          <div className="mb-2 truncate font-mono text-[10px] uppercase tracking-wider text-dim">{open.name}</div>
          <pre className="font-mono text-[11px] leading-relaxed text-fg whitespace-pre-wrap">{open.text}</pre>
        </div>
      )}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6"
          data-testid={`message-lightbox-${msg.id}`}
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label={lightbox.name}
        >
          <img src={lightbox.dataUrl} alt={lightbox.name} className="max-h-full max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} aria-label="Close" className="btn-icon absolute right-4 top-4 bg-black/50 text-white hover:bg-black/70">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
};

export const UserMessage = memo(({ msg, index, canEdit, onEdit, onBranch, onHandoff }) => {
  const [editing, setEditing] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(msg.content || "");
    toast.success("Copied");
  };
  return (
    <div className="group flex flex-col items-end gap-2 msg-in" data-testid={`message-user-${msg.id}`}>
      {(msg.gems?.length > 0 || msg.notes?.length > 0 || msg.docs?.length > 0) && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {msg.gems?.map((g) => <GemChip key={g.id} gem={g} testid={`message-gem-${msg.id}-${g.trigger}`} />)}
        </div>
      )}
      <Attachments msg={msg} />
      {editing ? (
        <Edit msg={msg} onCancel={() => setEditing(false)} onSave={(v) => { setEditing(false); onEdit(msg.id, v); }} />
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100">
            {msg.createdAt && <span className="mr-1 font-mono text-[10px]">{fmtTime(msg.createdAt)}</span>}
            {msg.content && <Act icon={Copy} onClick={copy} testid={`copy-user-message-${msg.id}`} title="Copy" />}
            {canEdit && <Act icon={Pencil} onClick={() => setEditing(true)} testid={`edit-message-${msg.id}`} title="Edit & resend" />}
            <Act icon={GitBranch} onClick={() => onBranch(index)} testid={`branch-message-${msg.id}`} title="Branch from here" />
            {onHandoff && <Act icon={Send} onClick={() => onHandoff(msg)} testid={`handoff-message-${msg.id}`} title="Send to another agent" />}
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

// "What the agent did": every tool call behind a reply, expandable.
const ToolCalls = ({ calls, msgId }) => {
  const [open, setOpen] = useState(false);
  const failed = calls.filter((c) => !c.ok).length;
  return (
    <div className="mt-2" data-testid={`toolcalls-${msgId}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 font-mono text-[11px] text-dim transition-colors hover:text-fg"
        data-testid={`toolcalls-toggle-${msgId}`}
        aria-expanded={open}
      >
        <Wrench className="h-3 w-3" />
        {calls.length} tool call{calls.length === 1 ? "" : "s"}
        {failed > 0 && <span className="text-red-400">· {failed} failed</span>}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {calls.map((c, i) => (
            <div key={i} className="rounded-xl border border-[color:var(--line)] bg-[color:var(--sunk)] px-3 py-2" data-testid={`toolcall-${msgId}-${i}`}>
              <div className="flex items-center gap-2 text-xs">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.ok ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="min-w-0 flex-1 truncate text-fg">{c.label || c.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-dim">{c.ms}ms</span>
              </div>
              {c.args && c.args !== "{}" && (
                <div className="mt-1 truncate font-mono text-[10px] text-dim" title={c.args}>
                  {c.args}
                </div>
              )}
              {c.result && <div className="mt-1 line-clamp-3 font-mono text-[10px] leading-relaxed text-dim">{c.result}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AgentMessage = memo(({ msg, agent, shimmer, gemPulse, wps = 10, live = false, onSkipReveal, onRevealDone, index, onRegenerate, showRegenerate, onBranch, onHandoff, onVariant }) => {
  const revealSpeed = msg.revealInstant ? 0 : wps;
  const { text, revealing } = useReveal(msg.content, msg.streaming, revealSpeed);
  // Word fade length follows the Reply speed setting; Instant mode (wps=0) = no fade
  const fwDur = revealSpeed ? `${fwSeconds(revealSpeed).toFixed(2)}s` : "0s";
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
  const [expanded, setExpanded] = useState(false);
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
  const est = msg.usage && !msg.streaming && msg.content ? estimate(msg.usage.model, msg.usage.inChars, msg.content, msg.usage.actual) : null;
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const clippable = !msg.streaming && (msg.content?.length || 0) > LONG_REPLY;
  const variants = msg.variants?.length > 1 ? msg.variants : null;
  const variantIdx = variants ? Math.min(Math.max(msg.variantIdx ?? variants.length - 1, 0), variants.length - 1) : 0;
  const model = msg.usage?.model || agent?.model;
  return (
    <div className="group flex gap-4 msg-in" data-testid={`message-agent-${msg.id}`}>
      <AgentAvatar agent={agent} size={34} pulse={msg.streaming || live} gemPulse={gemPulse} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-xs">
          <span className="font-display font-semibold text-fg">{agent?.name || "Agent"}</span>
          <span className="text-dim">{agent?.role}</span>
          {model && (
            <span className="hidden rounded-full border border-[color:var(--line)] px-2 py-px font-mono text-[10px] text-dim sm:inline" title="Model that wrote this reply" data-testid={`model-tag-${msg.id}`}>
              {model}
            </span>
          )}
          {msg.gems?.map((g) => (
            <span key={g.id} title={`/${g.trigger}`} data-testid={`reply-gem-marker-${msg.id}-${g.trigger}`}><GemShape color={g.color} size={9} /></span>
          ))}
          {!msg.streaming && (
            <div className="ml-auto flex items-center gap-1 text-dim opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100">
              {msg.createdAt && <span className="mr-1 font-mono text-[10px]">{fmtTime(msg.createdAt)}</span>}
              {msg.content && <Act icon={Copy} onClick={copy} testid={`copy-message-${msg.id}`} title="Copy" />}
              {msg.content && canSpeak && <Act icon={speaking ? Square : Volume2} active={speaking} onClick={() => (speaking ? (window.speechSynthesis.cancel(), setSpeaking(false)) : speak(msg.content, setSpeaking))} testid={`speak-message-${msg.id}`} title="Read aloud" />}
              <Act icon={GitBranch} onClick={() => onBranch(index)} testid={`branch-reply-${msg.id}`} title="Branch from here" />}
              {msg.content && onHandoff && <Act icon={Send} onClick={() => onHandoff(msg)} testid={`handoff-reply-${msg.id}`} title="Send to another agent" />}
              {showRegenerate && <Act icon={RotateCcw} onClick={onRegenerate} testid={`regenerate-message-${msg.id}`} title="Regenerate" />}
            </div>
          )}
          {live && revealSpeed > 0 && (
            <button
              onClick={() => onSkipReveal?.(msg.id)}
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
          <div className={`clamp-fade ${clippable && !expanded ? "clamped" : ""}`}>
            {text ? <Markdown fade={revealing}>{text}</Markdown> : revealing && <Skeleton />}
          </div>
          {clippable && (
            <button
              onClick={() => setExpanded(!expanded)}
              data-testid={`expand-reply-${msg.id}`}
              aria-expanded={expanded}
              className="mt-1.5 flex items-center gap-1 font-mono text-[11px] text-dim transition-colors hover:text-fg"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? "Show less" : `Show more · ${(msg.content.length / 1000).toFixed(1)}k chars`}
            </button>
          )}
          {msg.error && (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400" data-testid="message-error">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {msg.error}
            </div>
          )}
        </div>
        {msg.toolCalls?.length > 0 && !msg.streaming && <ToolCalls calls={msg.toolCalls} msgId={msg.id} />}
        {msg.sources?.length > 0 && !msg.streaming && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid={`sources-${msg.id}`}>
            <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Sources</span>
            {msg.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                title={s.url}
                className="flex max-w-[220px] items-center gap-1 rounded-full border border-[color:var(--line)] px-2.5 py-0.5 text-[11px] text-dim transition-colors hover:text-fg"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{s.title || s.url}</span>
              </a>
            ))}
          </div>
        )}
        {variants && !msg.streaming && (
          <div className="mt-2 flex items-center gap-1 text-dim" data-testid={`variants-${msg.id}`}>
            <button
              onClick={() => onVariant?.(msg.id, (variantIdx - 1 + variants.length) % variants.length)}
              disabled={variants.length < 2}
              aria-label="Previous version"
              className="msg-act transition-colors hover:text-fg disabled:opacity-30"
              data-testid={`variant-prev-${msg.id}`}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono text-[10px]" data-testid={`variant-pos-${msg.id}`}>{variantIdx + 1}/{variants.length}</span>
            <button
              onClick={() => onVariant?.(msg.id, (variantIdx + 1) % variants.length)}
              disabled={variants.length < 2}
              aria-label="Next version"
              className="msg-act transition-colors hover:text-fg disabled:opacity-30"
              data-testid={`variant-next-${msg.id}`}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {!msg.streaming && msg.content && est && (
          <span className="mt-2 block font-mono text-[10px] text-dim opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" title={msg.usage.actual ? "Calculated from token usage reported by the OpenAI API; price uses standard rates." : "Approximate token count from characters; price uses standard rates."} data-testid={`cost-${msg.id}`}>{est.ti + est.to} tok · ~${est.cost.toFixed(4)}</span>
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
