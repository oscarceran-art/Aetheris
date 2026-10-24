import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../lib/store";
import { anytypeReady, listSpaces } from "../lib/anytype";
import { COLORS, uid } from "../lib/defaults";
import { AgentAvatar } from "../components/AgentAvatar";
import { PageHeader } from "../components/PageHeader";
import { GemChip } from "../components/Gem";
import { GemDialog, newGem } from "../components/GemDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

const Label = ({ children }) => <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{children}</div>;

const AgentGems = ({ agent }) => {
  const { state } = useStore();
  const [editing, setEditing] = useState(null);
  const own = state.gems.filter((g) => g.agentId === agent.id);
  return (
    <div>
      <Label>Agent gems · only for {agent.name || "this agent"}</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        {own.map((g) => (
          <button key={g.id} onClick={() => setEditing(g)} data-testid={`agent-gem-${g.trigger}`}><GemChip gem={g} /></button>
        ))}
        <button onClick={() => setEditing(newGem(agent.id))} data-testid="agent-add-gem-button" className="flex items-center gap-1 rounded-full border border-dashed border-[color:var(--line)] px-3 py-0.5 text-xs text-dim hover:text-fg">
          <Plus className="h-3 w-3" /> Add gem
        </button>
      </div>
      {editing && <GemDialog gem={editing} lockScope extraAgents={[agent]} onClose={() => setEditing(null)} />}
    </div>
  );
};

const AgentSpaceField = ({ a, set }) => {
  const { state } = useStore();
  const at = state.settings.anytype;
  const [spaces, setSpaces] = useState([]);
  const ready = anytypeReady(at);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    listSpaces(at)
      .then((s) => live && setSpaces(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ready, at.apiKey, at.base]);
  if (!ready) return null;
  return (
    <div>
      <Label>Anytype space</Label>
      <Select
        value={a.anytypeSpace || "__default"}
        onValueChange={(v) => {
          const s = spaces.find((x) => x.id === v);
          set({ anytypeSpace: v === "__default" ? "" : v, anytypeSpaceName: s?.name || "" });
        }}
      >
        <SelectTrigger className="field rounded-xl text-xs" data-testid="agent-space-select"><SelectValue /></SelectTrigger>
        <SelectContent className="glass-menu max-h-72">
          <SelectItem value="__default">Default{at.spaceName ? ` · ${at.spaceName}` : ""}</SelectItem>
          {spaces.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <p className="mt-2 text-[11px] text-dim">
        Which Anytype space this agent reads and writes. Leave it on “Default” to follow Settings → Anytype.
      </p>
    </div>
  );
};

const AgentDialog = ({ agent, onClose }) => {
  const { state, upsertAgent } = useStore();
  const [a, setA] = useState(agent);
  const set = (p) => setA((x) => ({ ...x, ...p }));
  const models = Array.from(new Set([...(state.settings.models || []), a.model]));
  const save = () => {
    if (!a.name.trim()) return toast.error("Name your agent");
    upsertAgent({ ...a, templates: (a.templates || []).map((t) => t.trim()).filter(Boolean) });
    toast.success(`${a.name} saved`);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-menu max-h-[90vh] overflow-y-auto rounded-3xl border-0 sm:max-w-lg" data-testid="agent-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-5 py-2 pl-2 font-display text-fg">
            <AgentAvatar agent={a} size={52} /> {agent.name ? "Edit agent" : "New agent"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><input className="field w-full rounded-xl px-3 py-2 text-sm" value={a.name} onChange={(e) => set({ name: e.target.value })} data-testid="agent-name-input" /></div>
            <div><Label>Role</Label><input className="field w-full rounded-xl px-3 py-2 text-sm" value={a.role} onChange={(e) => set({ role: e.target.value })} data-testid="agent-role-input" /></div>
          </div>
          <div>
            <Label>Status line</Label>
            <input className="field w-full rounded-xl px-3 py-2 text-sm" placeholder="e.g. curious, digging into sources" value={a.status || ""} onChange={(e) => set({ status: e.target.value })} data-testid="agent-status-input" />
          </div>
          <div>
            <Label>Persona · system prompt</Label>
            <textarea rows={4} className="field w-full resize-none rounded-xl px-3 py-2 text-sm" value={a.persona} onChange={(e) => set({ persona: e.target.value })} data-testid="agent-persona-input" />
          </div>
          <div className="grid gap-3">
            <div>
              <Label>Model</Label>
              <Select value={a.model} onValueChange={(v) => set({ model: v })}>
                <SelectTrigger className="field rounded-xl font-mono text-xs" data-testid="agent-model-select"><SelectValue /></SelectTrigger>
                <SelectContent className="glass-menu max-h-72">
                  {models.map((m) => <SelectItem key={m} value={m} className="font-mono text-xs">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AgentSpaceField a={a} set={set} />
          <div>
            <Label>Planet color</Label>
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => set({ color: c })} data-testid={`agent-color-${c.slice(1)}`} className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${a.color === c ? "ring-2 ring-offset-2 ring-offset-transparent" : ""}`} style={{ background: c, "--tw-ring-color": c }} />
              ))}
              <label
                className={`relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full transition-transform hover:scale-110 ${!COLORS.includes(a.color) ? "ring-2 ring-offset-2 ring-offset-transparent" : ""}`}
                style={{ background: COLORS.includes(a.color) ? "conic-gradient(from 200deg, #f43f5e, #f59e0b, #84cc16, #06b6d4, #8b5cf6, #f43f5e)" : a.color, "--tw-ring-color": COLORS.includes(a.color) ? "#cbd5e1" : a.color }}
                title="Custom colour"
                data-testid="agent-color-custom"
              >
                <input type="color" value={COLORS.includes(a.color) ? "#22d3ee" : a.color} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" data-testid="agent-color-custom-input" />
              </label>
              {!COLORS.includes(a.color) && (
                <span className="font-mono text-[11px] uppercase text-dim" data-testid="agent-color-custom-value">{a.color}</span>
              )}
            </div>
            <p className="mt-2 text-[11px] text-dim">Presets, or tap the rainbow swatch for any colour — the planet derives a matching second tone.</p>
          </div>
          <div>
            <Label>Prompt templates · one per line</Label>
            <textarea rows={3} className="field w-full resize-none rounded-xl px-3 py-2 text-sm" value={(a.templates || []).join("\n")} onChange={(e) => set({ templates: e.target.value.split("\n") })} data-testid="agent-templates-input" />
          </div>
          <AgentGems agent={a} />
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn-ghost" data-testid="agent-cancel-button">Cancel</button>
            <button onClick={save} className="btn-solid btn-accent" data-testid="agent-save-button">Save agent</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AgentCard = ({ agent, i, onEdit }) => {
  const { state, deleteAgent, createConversation } = useStore();
  const nav = useNavigate();
  const remove = () => {
    if (!window.confirm(`Delete ${agent.name}, its chats and its gems?`)) return;
    deleteAgent(agent.id);
    toast(`${agent.name} removed`);
  };
  return (
    <div className="glass-card rise group flex flex-col rounded-3xl p-6" style={{ animationDelay: `${i * 50}ms`, "--glow": agent.color }} data-testid={`agent-card-${agent.id}`}>
      <div className="flex items-center gap-6 pl-2">
        <AgentAvatar agent={agent} size={56} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold text-fg">{agent.name}</div>
          <div className="text-xs text-dim">{agent.role}{agent.status ? ` · ${agent.status}` : ""}</div>
        </div>
      </div>
      <p className="mt-5 line-clamp-3 flex-1 text-sm leading-relaxed text-dim">{agent.persona}</p>
      <div className="mt-5 flex items-center gap-2">
        <span className="rounded-full border border-[color:var(--line)] px-2.5 py-0.5 font-mono text-[11px] text-dim">{agent.model}</span>
        {agent.anytypeSpaceName && (
          <span className="rounded-full border border-[color:var(--line)] px-2.5 py-0.5 font-mono text-[11px] text-dim" data-testid={`agent-space-chip-${agent.id}`}>anytype · {agent.anytypeSpaceName}</span>
        )}
        <div className="ml-auto flex gap-1">
          <button onClick={() => { const c = createConversation({ type: "chat", agentId: agent.id, title: "New chat" }); nav(`/agent/${agent.id}/chat/${c.id}`); }} className="btn-icon h-8 w-8 text-dim hover:text-fg" data-testid={`agent-chat-${agent.id}`}><MessageSquare className="h-4 w-4" /></button>
          <button onClick={onEdit} className="btn-icon h-8 w-8 text-dim hover:text-fg" data-testid={`agent-edit-${agent.id}`}><Pencil className="h-4 w-4" /></button>
          <button disabled={state.agents.length <= 1} onClick={remove} className="btn-icon h-8 w-8 text-dim hover:text-red-400 disabled:opacity-30" data-testid={`agent-delete-${agent.id}`}><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
};

export default function AgentsPage() {
  const { state } = useStore();
  const [editing, setEditing] = useState(null);
  const blank = () => ({ id: uid(), name: "", role: "Specialist", persona: "You are a helpful specialist.", model: state.settings.models?.[0] || "gpt-6-luna", temperature: 0.7, color: COLORS[5], anytypeSpace: "", anytypeSpaceName: "" });
  return (
    <div className="h-full overflow-y-auto scroll-thin" data-testid="agents-page">
      <PageHeader eyebrow="Agent studio" title="Your crew of planets.">
        <button onClick={() => setEditing(blank())} className="btn-solid btn-accent" data-testid="create-agent-button"><Plus className="h-4 w-4" /> New agent</button>
      </PageHeader>
      <div className="grid gap-4 px-6 pb-12 sm:grid-cols-2 sm:px-10 xl:grid-cols-3">
        {state.agents.map((a, i) => <AgentCard key={a.id} agent={a} i={i} onEdit={() => setEditing(a)} />)}
      </div>
      {editing && <AgentDialog agent={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
