import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Square, Mic, Star, FileText, Loader2, X, Globe, Paperclip, Plus } from "lucide-react";
import { extractGems } from "../lib/gems";
import { click } from "../lib/sound";
import { anytypeReady, brief, getObject, listObjects, searchObjects } from "../lib/anytype";
import { DOC_CHARS, DOC_MAX_FILES, DOC_TOTAL_CHARS, readDoc } from "../lib/docs";
import { useActions, useSettings } from "../lib/store";
import { GemChip, GemShape } from "./Gem";
import { AgentAvatar } from "./AgentAvatar";

const GemMenu = ({ options, hi, onPick, onHover }) => (
  <div className="glass-menu absolute bottom-full left-0 mb-2 w-[min(360px,100%)] rounded-2xl p-1.5" data-testid="gem-menu">
    <div className="px-3 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Gems</div>
    {options.map((g, i) => (
      <button
        key={g.id}
        data-testid={`gem-option-${g.trigger}`}
        onMouseDown={(e) => {
          e.preventDefault();
          onPick(g);
        }}
        onMouseEnter={() => onHover(i)}
        style={{ animationDelay: `${i * 35}ms` }}
        className={`spring-in flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${i === hi ? "bg-[color:var(--hover)]" : ""}`}
      >
        <GemShape color={g.color} size={14} />
        <span className="font-mono text-sm text-fg">/{g.trigger}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-dim">{g.instruction}</span>
        {g.agentId && <span className="font-mono text-[9px] uppercase tracking-wider text-accent">agent</span>}
      </button>
    ))}
  </div>
);

// The `\` picker: search the agent's Anytype space (its own space if it has one)
// and attach a note to the message.
const NoteMenu = ({ status, error, rows, hi, onPick, onHover, query, spaceName }) => (
  <div className="glass-menu absolute bottom-full left-0 mb-2 w-[min(460px,100%)] rounded-2xl p-1.5" data-testid="note-menu">
    <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Anytype{spaceName ? ` · ${spaceName}` : ""}</span>
      {status === "loading" && <Loader2 className="h-3 w-3 animate-spin text-dim" />}
    </div>
    {error && <p className="px-3 py-2 text-xs text-red-400" data-testid="note-menu-error">{error}</p>}
    {!error && status === "done" && !rows.length && (
      <p className="px-3 py-2 text-xs text-dim" data-testid="note-menu-empty">
        {query ? `No notes match “${query}”.` : "No notes in this space yet."}
      </p>
    )}
    {rows.map((r, i) => (
      <button
        key={r.id}
        data-testid={`note-option-${i}`}
        onMouseDown={(e) => {
          e.preventDefault();
          onPick(r);
        }}
        onMouseEnter={() => onHover(i)}
        style={{ animationDelay: `${i * 30}ms` }}
        className={`spring-in flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors ${i === hi ? "bg-[color:var(--hover)]" : ""}`}
      >
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{r.name}</span>
          {r.snippet && <span className="block truncate text-[11px] text-dim">{r.snippet}</span>}
        </span>
        {r.type && <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-dim">{r.type}</span>}
      </button>
    ))}
  </div>
);

// The `@` picker: mention another agent to draft this message to them as well.
const MentionMenu = ({ options, hi, onPick, onHover }) => (
  <div className="glass-menu absolute bottom-full left-0 mb-2 w-[min(320px,100%)] rounded-2xl p-1.5" data-testid="mention-menu">
    <div className="px-3 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Mention · also drafts to them</div>
    {options.map((a, i) => (
      <button
        key={a.id}
        data-testid={`mention-option-${a.id}`}
        onMouseDown={(e) => {
          e.preventDefault();
          onPick(a);
        }}
        onMouseEnter={() => onHover(i)}
        style={{ animationDelay: `${i * 35}ms` }}
        className={`spring-in flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${i === hi ? "bg-[color:var(--hover)]" : ""}`}
      >
        <AgentAvatar agent={a} size={22} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">@{a.name}</span>
          <span className="block truncate text-[11px] text-dim">{a.role}</span>
        </span>
      </button>
    ))}
  </div>
);

const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
const draftOf = (k) => (k && localStorage.getItem(`aetheris.draft.${k}`)) || "";

// How much of an attached note is handed to the model (and kept in the message).
const NOTE_CHARS = 4000;

// Recently sent prompts, newest first (shared across chats, capped).
const HISTORY_KEY = "aetheris.history.v2";
const loadHistory = () => {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(h) ? h.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

export const Composer = memo(({ onSend, onStop, running, live = false, noKey = false, color, gemColor, placeholder = "Message…", gems = [], templates = [], draftKey, testid = "composer", anytype = null, meter = null, agents = [] }) => {
  const [text, setTextRaw] = useState(() => draftOf(draftKey));
  const [listening, setListening] = useState(false);
  const setText = (v) => {
    setTextRaw(v);
    if (draftKey) v ? localStorage.setItem(`aetheris.draft.${draftKey}`, v) : localStorage.removeItem(`aetheris.draft.${draftKey}`);
  };
  const dictate = () => {
    const r = new SR();
    r.interimResults = false;
    r.onresult = (e) => setText(`${ta.current.value} ${[...e.results].map((x) => x[0].transcript).join(" ")}`.trim());
    r.onend = () => setListening(false);
    setListening(true);
    r.start();
  };
  const insertGem = (g) => {
    click();
    setText(`/${g.trigger} ${text}`);
    ta.current?.focus();
  };
  const [menu, setMenu] = useState(null);
  const [hi, setHi] = useState(0);
  const [notes, setNotes] = useState([]);
  const [noteMenu, setNoteMenu] = useState(null);
  const [rows, setRows] = useState([]);
  const [noteState, setNoteState] = useState("idle"); // idle | loading | done | error
  const [noteError, setNoteError] = useState("");
  const [noteHi, setNoteHi] = useState(0);
  const [noteFail, setNoteFail] = useState("");
  const [mentionMenu, setMentionMenu] = useState(null);
  const [mentionHi, setMentionHi] = useState(0);
  const [docs, setDocs] = useState([]);
  const [docBusy, setDocBusy] = useState(false);
  const [docFail, setDocFail] = useState("");
  const [chipOpen, setChipOpen] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const fileRef = useRef(null);
  const settings = useSettings();
  const { setSettings } = useActions();
  const webOn = !!settings.web?.enabled;
  const toggleWeb = () => {
    click();
    setSettings({ web: { ...(settings.web || {}), enabled: !webOn } });
  };
  const ta = useRef(null);
  const box = useRef(null);
  const anytypeOk = anytypeReady(anytype);
  const byTrigger = useMemo(() => Object.fromEntries(gems.map((g) => [g.trigger, g])), [gems]);
  const parsed = extractGems(text, byTrigger);
  const options = menu ? gems.filter((g) => g.trigger.startsWith(menu.query)).slice(0, 8) : [];
  const mentionOptions = mentionMenu ? agents.filter((a) => a.name.toLowerCase().includes(mentionMenu.query.toLowerCase())).slice(0, 6) : [];

  // Debounced lookup behind the `\` picker. An empty query lists the most recently
  // modified objects, so `\` on its own already shows something useful.
  useEffect(() => {
    if (!noteMenu || !anytypeOk) {
      setNoteState("idle");
      return;
    }
    const query = noteMenu.query.trim();
    const ctrl = new AbortController();
    setNoteState("loading");
    setNoteError("");
    const t = setTimeout(async () => {
      try {
        const data = query ? await searchObjects(anytype, { query, limit: 8 }, ctrl.signal) : await listObjects(anytype, { limit: 8 }, ctrl.signal);
        setRows(data.map(brief));
        setNoteHi(0);
        setNoteState("done");
      } catch (e) {
        if (e.name === "AbortError") return;
        setRows([]);
        setNoteError(e.message);
        setNoteState("error");
      }
    }, query ? 250 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [noteMenu?.query, noteMenu != null, anytypeOk, anytype?.spaceId, anytype?.apiKey]);

  useEffect(() => {
    const focus = () => ta.current?.focus();
    window.addEventListener("aetheris:focus-composer", focus);
    return () => window.removeEventListener("aetheris:focus-composer", focus);
  }, []);

  const sync = (value, caret) => {
    const head = value.slice(0, caret);
    const g = head.match(/(^|\s)\/([\w-]*)$/);
    if (g) {
      setNoteMenu(null);
      setMentionMenu(null);
      setMenu({ query: g[2].toLowerCase(), start: caret - g[2].length - 1 });
      setHi(0);
      return;
    }
    // A backslash opens the Anytype picker. It only listens when Anytype is
    // connected, so a stray \ in pasted text can't pop a dead menu.
    const n = anytypeOk ? head.match(/(^|\s)\\([^\n]*)$/) : null;
    if (n) {
      setMenu(null);
      setMentionMenu(null);
      setNoteMenu({ query: n[2], start: caret - n[2].length - 1 });
      setNoteHi(0);
      return;
    }
    // @ opens the agent-mention picker (requires a boundary so emails don't match).
    const at = agents.length ? head.match(/(^|\s)@([\p{L}\p{N} .'-]*)$/u) : null;
    if (at) {
      setMenu(null);
      setNoteMenu(null);
      setMentionMenu({ query: at[2], start: caret - at[2].length - 1 });
      setMentionHi(0);
      return;
    }
    setMenu(null);
    setNoteMenu(null);
    setMentionMenu(null);
  };
  const pick = (g) => {
    const el = ta.current;
    const v = text.slice(0, menu.start) + `/${g.trigger} ` + text.slice(el.selectionStart);
    const pos = menu.start + g.trigger.length + 2;
    click();
    setText(v);
    setMenu(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };
  const pickMention = (a) => {
    const el = ta.current;
    const v = text.slice(0, mentionMenu.start) + `@${a.name} ` + text.slice(el.selectionStart);
    const pos = mentionMenu.start + a.name.length + 2;
    click();
    setText(v);
    setMentionMenu(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };
  // Attach the chosen note: the "\query" token is removed from the draft, the note
  // body is fetched now and travels with the message (see AgentSpace.withContext).
  const pickNote = async (r) => {
    if (!r) return;
    const el = ta.current;
    const start = noteMenu?.start ?? 0;
    const v = text.slice(0, start) + text.slice(el?.selectionStart ?? text.length);
    click();
    setText(v);
    setNoteMenu(null);
    setRows([]);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start, start);
    });
    try {
      const o = await getObject(anytype, r.id);
      const md = String(o?.markdown || "").trim();
      if (!o || !md) throw new Error(`“${r.name}” is empty.`);
      setNotes((ns) => [
        ...ns.filter((x) => x.id !== r.id),
        { id: o.id || r.id, name: o.name || r.name, markdown: md.slice(0, NOTE_CHARS), truncated: md.length > NOTE_CHARS },
      ]);
      setNoteFail("");
    } catch (e) {
      setNoteFail(e.message || "Could not read that note.");
      setTimeout(() => setNoteFail(""), 6000);
    }
  };
  // Read the picked files right away so the chips show exactly what will be
  // sent. Parsing happens in the browser (see lib/docs.js) — nothing is uploaded.
  const pickDocs = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    click();
    setDocBusy(true);
    setDocFail("");
    const added = [];
    let total = docs.reduce((s, d) => s + d.text.length, 0);
    for (const file of files) {
      if (docs.length + added.length >= DOC_MAX_FILES) {
        setDocFail(`Up to ${DOC_MAX_FILES} documents per message.`);
        break;
      }
      try {
        const d = await readDoc(file);
        if (d.kind !== "image" && total + d.text.length > DOC_TOTAL_CHARS) {
          setDocFail(`Documents are limited to ${DOC_TOTAL_CHARS.toLocaleString()} characters per message — remove one first.`);
          continue;
        }
        total += d.text.length;
        added.push(d);
      } catch (err) {
        setDocFail(err.message || `Could not read “${file.name}”.`);
      }
    }
    if (added.length) setDocs((ds) => [...ds, ...added]);
    setDocBusy(false);
  };
  const submit = () => {
    if ((!parsed.clean && !parsed.gems.length && !notes.length && !docs.length) || running || noKey) return;
    const attached = notes;
    const documents = docs;
    const sent = text;
    // @mentions become handoff drafts to the named agents (resolved case-insensitively).
    const mentions = agents.filter((a) => new RegExp(`(^|\\s)@${a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu").test(sent));
    pushHistory(sent);
    setText("");
    setMenu(null);
    setNoteMenu(null);
    setMentionMenu(null);
    setChipOpen(null);
    setNotes([]);
    setDocs([]);
    setDocFail("");
    onSend(parsed.clean, parsed.gems, box.current.getBoundingClientRect(), attached, documents, mentions);
  };
  // Prompt history: ↑/↓ on an empty box recalls recently sent prompts.
  const histRef = useRef(null);
  const histIdx = useRef(-1);
  const history = () => (histRef.current ??= loadHistory());
  const pushHistory = (sent) => {
    const t = sent.trim();
    if (!t) return;
    histIdx.current = -1;
    const h = history().filter((x) => x !== t);
    h.unshift(t.slice(0, 2000));
    histRef.current = h.slice(0, 30);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(histRef.current));
    } catch {}
  };
  const onKeyDown = (e) => {
    if (mentionMenu && mentionOptions.length) {
      if (e.key === "ArrowDown") return e.preventDefault() || setMentionHi((mentionHi + 1) % mentionOptions.length);
      if (e.key === "ArrowUp") return e.preventDefault() || setMentionHi((mentionHi - 1 + mentionOptions.length) % mentionOptions.length);
      if (e.key === "Enter" || e.key === "Tab") return e.preventDefault() || pickMention(mentionOptions[mentionHi]);
      if (e.key === "Escape") return setMentionMenu(null);
    }
    if (noteMenu && rows.length) {
      if (e.key === "ArrowDown") return e.preventDefault() || setNoteHi((noteHi + 1) % rows.length);
      if (e.key === "ArrowUp") return e.preventDefault() || setNoteHi((noteHi - 1 + rows.length) % rows.length);
      if (e.key === "Enter" || e.key === "Tab") return e.preventDefault() || pickNote(rows[noteHi]);
      if (e.key === "Escape") return setNoteMenu(null);
    }
    if (options.length) {
      if (e.key === "ArrowDown") return e.preventDefault() || setHi((hi + 1) % options.length);
      if (e.key === "ArrowUp") return e.preventDefault() || setHi((hi - 1 + options.length) % options.length);
      if (e.key === "Enter" || e.key === "Tab") return e.preventDefault() || pick(options[hi]);
      if (e.key === "Escape") return setMenu(null);
    }
    if (!text && !running && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const h = history();
      if (!h.length) return;
      e.preventDefault();
      if (e.key === "ArrowUp") histIdx.current = Math.min(histIdx.current + 1, h.length - 1);
      else histIdx.current = Math.max(histIdx.current - 1, -1);
      setText(histIdx.current >= 0 ? h[histIdx.current] : "");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const draftTokens = Math.ceil(
    (text.length + docs.reduce((s, d) => s + (d.text?.length || 0), 0) + notes.reduce((s, n) => s + (n.markdown?.length || 0), 0)) / 4
  );
  const openChip = [...docs, ...notes.map((n) => ({ ...n, kind: "note", text: n.markdown }))].find((c) => c.id === chipOpen);

  // Attach / web / dictate — rendered inline on desktop, inside the + popover on mobile.
  const toolButtons = (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.mdx,.csv,.tsv,.json,.jsonl,.ndjson,.yaml,.yml,.toml,.ini,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.hpp,.cs,.php,.sh,.bash,.zsh,.sql,.log,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp,text/*,image/*"
        className="hidden"
        data-testid={`${testid}-file`}
        onChange={pickDocs}
      />
      <button
        type="button"
        data-testid={`${testid}-attach`}
        onClick={() => fileRef.current?.click()}
        disabled={docBusy || running}
        aria-label="Attach a document"
        title={docBusy ? "Reading document…" : "Attach a document or image (PDF, Word, PowerPoint, text, images)"}
        className={`btn-icon h-10 w-10 disabled:opacity-50 ${docs.length ? "text-accent" : "text-dim hover:text-fg"}`}
      >
        {docBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      </button>
      <button
        type="button"
        data-testid={`${testid}-web`}
        onClick={toggleWeb}
        aria-pressed={webOn}
        aria-label={webOn ? "Turn web search off" : "Turn web search on"}
        title={webOn ? "Web search is on — click to turn off" : "Web search is off — click to turn on"}
        className={`btn-icon h-10 w-10 ${webOn ? "bg-[color:var(--hover)] text-accent" : "text-dim hover:text-fg"}`}
      >
        <Globe className="h-4 w-4" />
      </button>
      {SR && !running && (
        <button data-testid={`${testid}-mic`} onClick={dictate} aria-label="Dictate" className={`btn-icon h-10 w-10 ${listening ? "mic-on text-red-400" : "text-dim hover:text-fg"}`} title="Dictate">
          <Mic className="h-4 w-4" />
        </button>
      )}
    </>
  );

  return (
    <div className="composer-safe px-4 sm:px-8">
      <div className="relative mx-auto max-w-3xl">
        {options.length > 0 && <GemMenu options={options} hi={hi} onPick={pick} onHover={setHi} />}
        {mentionMenu && mentionOptions.length > 0 && <MentionMenu options={mentionOptions} hi={mentionHi} onPick={pickMention} onHover={setMentionHi} />}
        {noteMenu && (
          <NoteMenu
            status={noteState}
            error={noteError}
            rows={rows}
            hi={noteHi}
            onPick={pickNote}
            onHover={setNoteHi}
            query={noteMenu.query.trim()}
            spaceName={anytype?.spaceName}
          />
        )}
        {(templates?.length > 0 || gems.some((g) => g.fav)) && !text && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 px-2" data-testid={`${testid}-shelf`}>
            {gems.filter((g) => g.fav).map((g) => (
              <button key={g.id} onClick={() => insertGem(g)} data-testid={`${testid}-fav-${g.trigger}`} title="Favourite gem"><GemChip gem={g} /></button>
            ))}
            {gems.some((g) => g.fav) && templates?.length > 0 && <Star className="mx-1 h-3 w-3 text-dim" />}
            {templates?.slice(0, 4).map((t, i) => (
              <button key={i} onClick={() => { click(); setText(t); ta.current?.focus(); }} data-testid={`${testid}-template-${i}`} className="spring-in max-w-[240px] truncate rounded-full border border-[color:var(--line)] px-3 py-1 text-xs text-dim transition-colors hover:text-fg" style={{ animationDelay: `${i * 50}ms` }}>
                {t}
              </button>
            ))}
          </div>
        )}
        <div
          ref={box}
          className={`glass-strong rounded-[26px] p-2 pl-5 ${running || live ? "composer-live" : ""} ${live && gemColor ? "composer-gem" : ""}`}
          style={{ "--comp-a": color || undefined, "--comp-b": (live && gemColor) || undefined }}
        >
          {parsed.gems.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2" data-testid={`${testid}-gem-chips`}>
              {parsed.gems.map((g) => <GemChip key={g.id} gem={g} testid={`${testid}-chip-${g.trigger}`} />)}
            </div>
          )}
          {notes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2" data-testid={`${testid}-note-chips`}>
              {notes.map((n) => (
                <span
                  key={n.id}
                  data-testid={`${testid}-note-chip-${n.id}`}
                  title={n.truncated ? "Only the first part of this note is attached — click to preview" : "Attached to this message — click to preview"}
                  className="spring-in flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--hover)] py-0.5 pl-2.5 pr-1.5 text-xs text-fg"
                >
                  <button onClick={() => setChipOpen(chipOpen === n.id ? null : n.id)} aria-expanded={chipOpen === n.id} className="flex min-w-0 items-center gap-1.5">
                    <FileText className="h-3 w-3 shrink-0 text-accent" />
                    <span className="max-w-[200px] truncate">{n.name}</span>
                  </button>
                  <button onClick={() => setNotes((ns) => ns.filter((x) => x.id !== n.id))} data-testid={`${testid}-note-remove-${n.id}`} className="rounded-full p-0.5 text-dim transition-colors hover:text-fg" title="Remove note" aria-label={`Remove ${n.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {docs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2" data-testid={`${testid}-doc-chips`}>
              {docs.map((d) => (
                <span
                  key={d.id}
                  data-testid={`${testid}-doc-chip-${d.id}`}
                  title={d.kind === "image" ? `${d.name} — sent as vision input` : `${d.chars.toLocaleString()} characters${d.truncated ? ` — only the first ${DOC_CHARS.toLocaleString()} are sent` : ""} — click to preview`}
                  className="spring-in flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--hover)] py-0.5 pl-1.5 pr-1.5 text-xs text-fg"
                >
                  <button onClick={() => d.kind !== "image" && setChipOpen(chipOpen === d.id ? null : d.id)} aria-expanded={chipOpen === d.id} className="flex min-w-0 items-center gap-1.5" aria-label={d.kind === "image" ? undefined : `Preview ${d.name}`}>
                    {d.kind === "image" && d.dataUrl ? (
                      <img src={d.dataUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <Paperclip className="h-3 w-3 shrink-0 text-accent" />
                    )}
                    <span className="max-w-[200px] truncate">{d.name}</span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-dim">{d.kind}</span>
                  </button>
                  <button onClick={() => setDocs((ds) => ds.filter((x) => x.id !== d.id))} data-testid={`${testid}-doc-remove-${d.id}`} className="rounded-full p-0.5 text-dim transition-colors hover:text-fg" title="Remove document" aria-label={`Remove ${d.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {openChip && openChip.kind !== "image" && (
            <div className="mx-1 mb-1 mt-2 max-h-40 overflow-y-auto scroll-thin rounded-2xl border border-[color:var(--line)] p-3" data-testid={`${testid}-chip-preview`}>
              <div className="mb-1.5 truncate font-mono text-[10px] uppercase tracking-wider text-dim">{openChip.name} · what will be sent</div>
              <pre className="font-mono text-[11px] leading-relaxed text-fg whitespace-pre-wrap">{openChip.text}</pre>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={ta}
              data-testid={`${testid}-input`}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                sync(e.target.value, e.target.selectionStart);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => { setMenu(null); setNoteMenu(null); setMentionMenu(null); }}
              placeholder={noKey ? "Add your OpenAI key in Settings to start" : placeholder}
              className="max-h-48 min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[15px] text-fg outline-none placeholder:text-dim field-sizing"
            />
            <div className="hidden gap-2 md:flex">{toolButtons}</div>
            <div className="relative md:hidden">
              <button
                type="button"
                data-testid={`${testid}-more`}
                onClick={() => setMoreOpen(!moreOpen)}
                aria-label="More options"
                aria-expanded={moreOpen}
                className={`btn-icon h-10 w-10 ${moreOpen ? "bg-[color:var(--hover)] text-accent" : "text-dim hover:text-fg"}`}
              >
                <Plus className="h-4 w-4" />
              </button>
              {moreOpen && (
                <div className="glass-menu absolute bottom-full right-0 mb-2 flex gap-1 rounded-2xl p-1.5" data-testid={`${testid}-more-menu`}>
                  {toolButtons}
                </div>
              )}
            </div>
            {running ? (
              <button data-testid={`${testid}-stop`} onClick={onStop} aria-label="Stop generating" className="btn-icon bg-red-500/90 text-white hover:bg-red-500">
                <Square className="h-4 w-4 fill-current" />
              </button>
            ) : (
              <button data-testid={`${testid}-send`} onClick={submit} aria-label="Send message" disabled={(!text.trim() && !notes.length && !docs.length) || noKey} className={`btn-icon btn-accent disabled:opacity-30 ${text.trim() || notes.length || docs.length ? "send-ready" : ""}`}>
                <ArrowUp className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
        {noteFail && <div className="mt-2 px-5 text-[11px] text-red-400" data-testid={`${testid}-note-error`}>{noteFail}</div>}
        {docFail && <div className="mt-2 px-5 text-[11px] text-red-400" data-testid={`${testid}-doc-error`}>{docFail}</div>}
        <div className="mt-2 px-5 text-[11px] text-dim">
          Type <span className="font-mono text-fg">/</span> to throw a gem
          {anytypeOk && (
            <>
              {" · "}
              <span className="font-mono text-fg">\</span> to add an Anytype note
            </>
          )}
          {agents.length > 1 && (
            <>
              {" · "}
              <span className="font-mono text-fg">@</span> to mention an agent
            </>
          )}
          {" · "}
          the paperclip attaches a document
          {(text.trim() || docs.length > 0 || notes.length > 0) && (
            <span className="font-mono"> · draft ≈{draftTokens >= 1000 ? `${(draftTokens / 1000).toFixed(1)}k` : draftTokens} tok</span>
          )}
        </div>
        {meter && (
          <div className="mt-1.5 px-5 font-mono text-[10px] text-dim" data-testid={`${testid}-meter`}>
            ≈{meter.tokens >= 1000 ? `${(meter.tokens / 1000).toFixed(1)}k` : meter.tokens} tok · {meter.budget}
            {meter.cost > 0 && <> · chat ~${meter.cost < 0.01 ? meter.cost.toFixed(4) : meter.cost.toFixed(2)}</>}
            {meter.omitted > 0 && <> · {meter.omitted} older attachment{meter.omitted === 1 ? "" : "s"} folded away</>}
          </div>
        )}
      </div>
    </div>
  );
});
