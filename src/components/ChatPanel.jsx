import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Pin, PinOff, Pencil, Download, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import { resolveGems } from "../lib/gems";
import { GemChip } from "./Gem";

export const exportChat = (conv, agent) => {
  const md = [`# ${conv.title}`, `_${agent.name} · ${agent.role} · ${agent.model}_`, ""]
    .concat(conv.messages.map((m) => `**${m.role === "user" ? "You" : agent.name}**${m.gems?.length ? ` ${m.gems.map((g) => `/${g.trigger}`).join(" ")}` : ""}\n\n${m.content}\n`))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  a.download = `${conv.title.replace(/[^\w-]+/g, "-").slice(0, 40) || "chat"}.md`;
  a.click();
  toast.success("Chat exported");
};

const ChatItem = ({ c, agent, active, i }) => {
  const { patchConversation, deleteConversation, restoreConversation } = useStore();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  const save = () => {
    setEditing(false);
    if (title.trim()) patchConversation(c.id, { title: title.trim() });
  };
  const act = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      onClick={() => !editing && nav(`/agent/${agent.id}/chat/${c.id}`)}
      data-testid={`chat-item-${c.id}`}
      className={`rise group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[13px] transition-colors ${active ? "nav-active" : "text-dim hover:bg-[color:var(--hover)] hover:text-fg"}`}
      style={{ animationDelay: `${i * 30}ms` }}
    >
      {c.pinned ? <Pin className="h-3 w-3 shrink-0 text-accent" /> : <MessageSquare className="h-3 w-3 shrink-0 opacity-60" />}
      {editing ? (
        <input
          autoFocus
          value={title}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => (e.key === "Enter" ? save() : e.key === "Escape" && setEditing(false))}
          className="field min-w-0 flex-1 rounded-lg px-2 py-0.5 text-[13px]"
          data-testid={`rename-input-${c.id}`}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{c.title}</span>
      )}
      {!editing && (
        <div className="hidden shrink-0 gap-1.5 group-hover:flex">
          <button onClick={act(() => patchConversation(c.id, { pinned: !c.pinned }))} data-testid={`pin-chat-${c.id}`} title={c.pinned ? "Unpin" : "Pin"} className="hover:text-fg">
            {c.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button onClick={act(() => setEditing(true))} data-testid={`rename-chat-${c.id}`} title="Rename" className="hover:text-fg"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={act(() => exportChat(c, agent))} data-testid={`export-chat-${c.id}`} title="Export Markdown" className="hover:text-fg"><Download className="h-3.5 w-3.5" /></button>
          <button
            onClick={act(() => {
              deleteConversation(c.id);
              toast("Chat deleted", { action: { label: "Undo", onClick: () => restoreConversation(c) } });
              if (active) nav(`/agent/${agent.id}`);
            })}
            data-testid={`delete-chat-${c.id}`}
            title="Delete"
            className="hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
};

const Group = ({ label, list, agent, activeId }) =>
  list.length > 0 && (
    <div className="space-y-0.5">
      <div className="px-3 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{label}</div>
      {list.map((c, i) => <ChatItem key={c.id} c={c} agent={agent} active={c.id === activeId} i={i} />)}
    </div>
  );

export const ChatPanel = ({ agent, activeId, onNewChat }) => {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const all = state.conversations.filter((c) => c.agentId === agent.id).sort((a, b) => b.updatedAt - a.updatedAt);
  const list = ql ? all.filter((c) => c.title.toLowerCase().includes(ql) || c.messages.some((m) => m.content?.toLowerCase().includes(ql))) : all;
  const gems = resolveGems(state.gems, agent.id);
  return (
    <div className="flex h-full w-72 flex-col p-3" data-testid="chat-panel">
      <button onClick={onNewChat} className="btn-solid btn-accent justify-center" data-testid="panel-new-chat"><Plus className="h-4 w-4" /> New chat</button>
      <div className="field mt-3 flex items-center gap-2 rounded-xl px-3">
        <Search className="h-3.5 w-3.5 text-dim" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${agent.name}'s chats`} className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none" data-testid="panel-search-input" />
      </div>
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto scroll-thin">
        <Group label="Pinned" list={list.filter((c) => c.pinned)} agent={agent} activeId={activeId} />
        <Group label="Chats" list={list.filter((c) => !c.pinned)} agent={agent} activeId={activeId} />
        {!list.length && <p className="px-3 pt-4 text-xs text-dim">{ql ? "No matching chats." : "No chats yet."}</p>}
      </div>
      <div className="border-t border-[color:var(--line)] pt-3">
        <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">Gems</div>
        <div className="flex flex-wrap gap-1.5" data-testid="panel-gems">
          {gems.map((g) => <GemChip key={g.id} gem={g} testid={`panel-gem-${g.trigger}`} />)}
        </div>
      </div>
    </div>
  );
};
